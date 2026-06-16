import Foundation
import SwiftUI

@MainActor
final class PortfolioStore: ObservableObject {
    @Published var groups: [InvestmentGroup]
    @Published var holdings: [Holding]
    @Published var selectedGroupID: UUID?
    @Published var backendStatus: String = "本地演示数据"
    @Published var isSyncing: Bool = false

    let currentMemberID: UUID
    private let apiClient: PositionCircleAPIClient

    init(
        groups: [InvestmentGroup] = DemoData.groups,
        holdings: [Holding] = DemoData.holdings,
        currentMemberID: UUID = DemoData.currentMemberID,
        apiClient: PositionCircleAPIClient = PositionCircleAPIClient()
    ) {
        self.groups = groups
        self.holdings = holdings
        self.currentMemberID = currentMemberID
        self.apiClient = apiClient
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

    func refreshPrices(in group: InvestmentGroup) async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response = try await apiClient.refreshPrices(in: group)
            for remoteHolding in response.holdings {
                if let index = holdings.firstIndex(where: { $0.id == remoteHolding.id }) {
                    holdings[index] = remoteHolding
                }
            }

            if response.failed.isEmpty {
                backendStatus = "已刷新 \(response.updatedCount) 个收盘价"
            } else {
                backendStatus = "已刷新 \(response.updatedCount) 个，\(response.failed.count) 个未更新"
            }
        } catch {
            backendStatus = "收盘价刷新失败"
        }
    }

    func createGroup(name: String, subtitle: String) {
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

    func loadFromBackend() async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let response = try await apiClient.bootstrap()
            groups = response.groups
            holdings = response.holdings
            selectedGroupID = response.groups.first?.id
            backendStatus = "已连接后端"
        } catch {
            backendStatus = "后端未连接，使用本地数据"
        }
    }

    private static func generateInviteCode() -> String {
        let letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        let token = String((0..<4).compactMap { _ in letters.randomElement() })
        return "PC-\(token)"
    }

    private func syncHolding(_ holding: Holding, isExisting: Bool) async {
        isSyncing = true
        defer { isSyncing = false }

        do {
            let remoteHolding: Holding
            if isExisting {
                remoteHolding = try await apiClient.updateHolding(holding)
            } else {
                remoteHolding = try await apiClient.createHolding(holding)
            }
            if let index = holdings.firstIndex(where: { $0.id == remoteHolding.id }) {
                holdings[index] = remoteHolding
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
            try await apiClient.deleteHolding(holding)
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
}
