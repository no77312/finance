import SwiftUI

private enum GroupTab: String, CaseIterable, Identifiable {
    case overview = "总览"
    case mine = "我的"
    case members = "成员"

    var id: String { rawValue }
}

struct RootView: View {
    @StateObject private var store = PortfolioStore()
    @State private var selectedTab: GroupTab = .overview
    @State private var isShowingPositionForm = false
    @State private var isShowingNewGroup = false
    @State private var editingHolding: Holding?

    var body: some View {
        NavigationStack {
            Group {
                if let group = store.selectedGroup {
                    VStack(spacing: 0) {
                        GroupHeaderView(
                            group: group,
                            backendStatus: store.backendStatus,
                            isSyncing: store.isSyncing
                        )
                            .padding(.horizontal, 16)
                            .padding(.bottom, 12)

                        Picker("视图", selection: $selectedTab) {
                            ForEach(GroupTab.allCases) { tab in
                                Text(tab.rawValue).tag(tab)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)

                        tabContent(for: group)
                    }
                    .background(Color(.systemGroupedBackground))
                } else {
                    EmptyGroupsView {
                        isShowingNewGroup = true
                    }
                }
            }
            .navigationTitle("持仓圈")
            .toolbar {
                if store.selectedGroup != nil {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button {
                            editingHolding = nil
                            isShowingPositionForm = true
                        } label: {
                            Label("提交持仓", systemImage: "plus.circle.fill")
                        }

                        Menu {
                            ForEach(store.groups) { group in
                                Button {
                                    store.selectedGroupID = group.id
                                    selectedTab = .overview
                                } label: {
                                    Label(group.name, systemImage: group.id == store.selectedGroupID ? "checkmark.circle.fill" : "circle")
                                }
                            }
                            Divider()
                            Button {
                                isShowingNewGroup = true
                            } label: {
                                Label("新建群组", systemImage: "person.3.sequence.fill")
                            }
                        } label: {
                            Image(systemName: "person.3.fill")
                        }
                    }
                }
            }
            .sheet(isPresented: $isShowingPositionForm, onDismiss: {
                editingHolding = nil
            }) {
                if let group = store.selectedGroup {
                    NavigationStack {
                        PositionFormView(
                            store: store,
                            group: group,
                            existingHolding: editingHolding
                        )
                    }
                }
            }
            .sheet(isPresented: $isShowingNewGroup) {
                NavigationStack {
                    NewGroupView(store: store)
                }
            }
            .task {
                await store.loadFromBackend()
            }
        }
    }

    @ViewBuilder
    private func tabContent(for group: InvestmentGroup) -> some View {
        switch selectedTab {
        case .overview:
            GroupDashboardView(store: store, group: group) { holding in
                editingHolding = holding
                isShowingPositionForm = true
            }
        case .mine:
            MyHoldingsView(store: store, group: group) { holding in
                editingHolding = holding
                isShowingPositionForm = true
            }
        case .members:
            MembersView(store: store, group: group)
        }
    }
}

private struct GroupHeaderView: View {
    let group: InvestmentGroup
    let backendStatus: String
    let isSyncing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(group.name)
                        .font(.title2.weight(.bold))
                    Text(group.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(group.inviteCode)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color.blue.opacity(0.12))
                        .foregroundStyle(.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    Text("\(group.members.count) 人")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 6) {
                Image(systemName: isSyncing ? "arrow.triangle.2.circlepath" : "circle.fill")
                    .font(.caption2)
                    .foregroundStyle(isSyncing ? .orange : .green)
                Text(backendStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct EmptyGroupsView: View {
    var onCreate: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "person.3.sequence.fill")
                .font(.system(size: 44))
                .foregroundStyle(.blue)
            Text("还没有群组")
                .font(.title3.weight(.semibold))
            Button(action: onCreate) {
                Label("新建群组", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
