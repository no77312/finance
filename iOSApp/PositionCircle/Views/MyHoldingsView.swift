import SwiftUI

struct MyHoldingsView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    var onEditHolding: (Holding) -> Void

    @State private var isRefreshingPrices = false

    private var myHoldings: [Holding] {
        store.currentMemberHoldings(in: group)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if myHoldings.isEmpty {
                    EmptyStateView(
                        systemImage: "plus.app",
                        title: "还没有提交",
                        subtitle: "点击右上角加号添加你的第一笔持仓"
                    )
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "person.crop.circle.fill")
                            .foregroundStyle(.blue)
                        Text("我的持仓")
                            .font(.headline)
                        Spacer()
                        Button {
                            refreshPrices()
                        } label: {
                            Label("刷新收盘价", systemImage: "arrow.clockwise")
                                .labelStyle(.iconOnly)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isRefreshingPrices || store.isSyncing)
                    }
                    VStack(spacing: 10) {
                        ForEach(myHoldings) { holding in
                            HoldingRow(
                                holding: holding,
                                owner: store.currentMember,
                                ownerName: store.currentMember.displayName,
                                isCurrentUser: true,
                                onEdit: { onEditHolding(holding) },
                                onDelete: { store.delete(holding) }
                            )
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
    }

    private func refreshPrices() {
        isRefreshingPrices = true
        Task {
            await store.refreshPrices(in: group)
            isRefreshingPrices = false
        }
    }
}
