import Foundation
import SwiftUI

@MainActor
final class PortfolioStore: ObservableObject {
    @Published var session: AccountSession?
    @Published var groups: [InvestmentGroup]
    @Published var holdings: [Holding]
    @Published var holdingEvents: [HoldingEvent]
    @Published var selectedGroupID: UUID?
    @Published var backendStatus: String = "本地演示数据"
    @Published var authStatus: String = ""
    @Published var isSyncing: Bool = false
    @Published var isAuthenticating: Bool = false

    var isSignedIn: Bool {
        session != nil
    }

    var currentMemberID: UUID {
        session?.currentMemberID ?? DemoData.currentMemberID
    }

    private var apiClient: PositionCircleAPIClient {
        PositionCircleAPIClient(
            currentMemberID: session?.currentMemberID,
            sessionToken: session?.sessionToken
        )
    }

    init(
        groups: [InvestmentGroup] = DemoData.groups,
        holdings: [Holding] = DemoData.holdings,
        holdingEvents: [HoldingEvent] = DemoData.holdingEvents,
        currentMemberID: UUID = DemoData.currentMemberID,
        apiClient: PositionCircleAPIClient = PositionCircleAPIClient()
    ) {
        self.session = Self.loadSession()
        self.groups = groups
        self.holdings = holdings
        self.holdingEvents = holdingEvents
        _ = currentMemberID
        _ = apiClient
        self.selectedGroupID = groups.first?.id
    }

    var selectedGroup: InvestmentGroup? {
        groups.first { $0.id == selectedGroupID }
    }

    var currentMember: Member {
        groups
            .flatMap(\.members)
            .first { $0.id == currentMemberID }
        ?? Member(id: currentMemberID, displayName: "我", avatarSymbol: "person.crop.circle.fill")
    }

    func holdings(for group: InvestmentGroup) -> [Holding] {
        holdings
            .filter { $0.groupID == group.id }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func currentMemberHoldings(in group: InvestmentGroup) -> [Holding] {
        PortfolioAnalytics.holdings(
            for: currentMemberID,
            in: holdings(for: group)
        )
    }

    func currentMemberEvents(in group: InvestmentGroup) -> [HoldingEvent] {
        holdingEvents
            .filter { $0.groupID == group.id && $0.ownerID == currentMemberID }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func ownerName(for holding: Holding, in group: InvestmentGroup) -> String {
        group.members.first { $0.id == holding.ownerID }?.displayName ?? "未知成员"
    }

    func owner(for holding: Holding, in group: InvestmentGroup) -> Member? {
        group.members.first { $0.id == holding.ownerID }
    }

    func upsert(_ holding: Holding) {
        let isExisting = holdings.contains { $0.id == holding.id }
        if let index = holdings.firstIndex(where: { $0.id == holding.id }) {
            holdings[index] = holding
        } else {
            holdings.append(holding)
        }

        Task {
            await syncHolding(holding, isExisting: isExisting)
        }
    }

    func delete(_ holding: Holding) {
        holdings.removeAll { $0.id == holding.id && $0.ownerID == currentMemberID }
        Task {
            await deleteHoldingFromBackend(holding)
        }
    }

    func parseScreenshotImport(
        ocrText: String,
        defaultVisibility: PositionVisibility
    ) async throws -> ScreenshotImportResponse {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response = try await apiClient.parseScreenshotImport(
                ocrText: ocrText,
                defaultVisibility: defaultVisibility
            )
            backendStatus = response.source == "model" ? "大模型解析完成" : "基础解析完成"
            return response
        } catch {
            backendStatus = "截图解析失败"
            throw error
        }
    }

    func createGroup(name: String, subtitle: String) {
        guard isSignedIn else {
            authStatus = "请先登录"
            return
        }

        let group = InvestmentGroup(
            name: name,
            subtitle: subtitle,
            inviteCode: Self.generateInviteCode(),
            members: [currentMember],
            defaultVisibility: .full
        )
        groups.append(group)
        selectedGroupID = group.id

        Task {
            await createGroupOnBackend(name: name, subtitle: subtitle)
        }
    }

    func joinGroup(inviteCode: String) async throws {
        guard isSignedIn else {
            authStatus = "请先登录"
            throw APIError.invalidResponse
        }

        isSyncing = true
        defer { isSyncing = false }

        let group = try await apiClient.joinGroup(inviteCode: inviteCode)
        if let index = groups.firstIndex(where: { $0.id == group.id }) {
            groups[index] = group
        } else {
            groups.append(group)
        }
        selectedGroupID = group.id
        backendStatus = "已加入群组"
        await loadFromBackend()
    }

    func loadFromBackend() async {
        guard isSignedIn else {
            backendStatus = "请先登录"
            return
        }

        isSyncing = true
        defer { isSyncing = false }

        do {
            let response = try await apiClient.bootstrap()
            applyBootstrap(response)
            backendStatus = "已连接后端"
        } catch {
            backendStatus = "后端未连接，使用本地数据"
        }
    }

    func signInWithApple(
        appleUserID: String,
        identityToken: String?,
        email: String?,
        fullName: String?
    ) async {
        isAuthenticating = true
        authStatus = ""
        defer { isAuthenticating = false }

        do {
            let response = try await PositionCircleAPIClient().signInWithApple(
                appleUserID: appleUserID,
                identityToken: identityToken,
                email: email,
                fullName: fullName
            )
            applyBootstrap(response)
            backendStatus = "已登录"
        } catch {
            authStatus = error.localizedDescription
        }
    }

    func signInWithDevice(displayName: String) async {
        isAuthenticating = true
        authStatus = ""
        defer { isAuthenticating = false }

        do {
            let response = try await PositionCircleAPIClient().signInWithDevice(
                deviceID: Self.deviceID(),
                displayName: displayName
            )
            applyBootstrap(response)
            backendStatus = "已登录"
        } catch {
            authStatus = error.localizedDescription
        }
    }

    func signOut() {
        session = nil
        groups = []
        holdings = []
        holdingEvents = []
        selectedGroupID = nil
        backendStatus = "请先登录"
        authStatus = ""
        UserDefaults.standard.removeObject(forKey: Self.sessionStorageKey)
    }

    private static func generateInviteCode() -> String {
        let letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        let token = String((0..<4).compactMap { _ in letters.randomElement() })
        return "PC-\(token)"
    }

    private func applyBootstrap(_ response: BootstrapResponse) {
        groups = response.groups
        holdings = response.holdings
        holdingEvents = response.holdingEvents ?? []
        selectedGroupID = response.groups.first?.id

        if let user = response.user {
            let nextSession = AccountSession(
                user: user,
                currentMemberID: response.currentMemberID,
                sessionToken: response.sessionToken ?? session?.sessionToken ?? ""
            )
            session = nextSession
            Self.saveSession(nextSession)
        }
    }

    private func syncHolding(_ holding: Holding, isExisting: Bool) async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response: HoldingMutationResponse
            if isExisting {
                response = try await apiClient.updateHolding(holding)
            } else {
                response = try await apiClient.createHolding(holding)
            }
            let remoteHolding = response.holding
            if let index = holdings.firstIndex(where: { $0.id == remoteHolding.id }) {
                holdings[index] = remoteHolding
            }
            if let event = response.event {
                record(event)
            }
            backendStatus = "已同步后端"
        } catch {
            backendStatus = "同步失败，已保留本地修改"
        }
    }

    private func deleteHoldingFromBackend(_ holding: Holding) async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            if let event = try await apiClient.deleteHolding(holding) {
                record(event)
            }
            backendStatus = "已同步后端"
        } catch {
            backendStatus = "删除同步失败"
        }
    }

    private func createGroupOnBackend(name: String, subtitle: String) async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let group = try await apiClient.createGroup(name: name, subtitle: subtitle)
            if !groups.contains(where: { $0.id == group.id }) {
                groups.append(group)
            }
            selectedGroupID = group.id
            backendStatus = "已同步后端"
        } catch {
            backendStatus = "新建群组同步失败"
        }
    }

    private func record(_ event: HoldingEvent) {
        holdingEvents.removeAll { $0.id == event.id }
        holdingEvents.append(event)
        holdingEvents.sort { $0.createdAt > $1.createdAt }
        if holdingEvents.count > 500 {
            holdingEvents = Array(holdingEvents.prefix(500))
        }
    }

    private static let sessionStorageKey = "position-circle.account-session"
    private static let deviceStorageKey = "position-circle.device-id"

    private static func loadSession() -> AccountSession? {
        guard let data = UserDefaults.standard.data(forKey: sessionStorageKey) else {
            return nil
        }
        return try? JSONDecoder().decode(AccountSession.self, from: data)
    }

    private static func saveSession(_ session: AccountSession) {
        guard let data = try? JSONEncoder().encode(session) else {
            return
        }
        UserDefaults.standard.set(data, forKey: sessionStorageKey)
    }

    private static func deviceID() -> String {
        if let existing = UserDefaults.standard.string(forKey: deviceStorageKey) {
            return existing
        }

        let next = UUID().uuidString
        UserDefaults.standard.set(next, forKey: deviceStorageKey)
        return next
    }
}
