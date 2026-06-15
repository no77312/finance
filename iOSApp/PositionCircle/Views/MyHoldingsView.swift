import SwiftUI

struct MyHoldingsView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    var onEditHolding: (Holding) -> Void

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
                    SectionTitle(title: "我的持仓", systemImage: "person.crop.circle.fill")
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
}
