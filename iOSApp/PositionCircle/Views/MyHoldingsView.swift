import SwiftUI

struct MyHoldingsView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    var onEditHolding: (Holding) -> Void

    private var myHoldings: [Holding] {
        store.currentMemberHoldings(in: group)
    }

    private var myEvents: [HoldingEvent] {
        Array(store.currentMemberEvents(in: group).prefix(8))
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

                if !myEvents.isEmpty {
                    HoldingEventTimeline(events: myEvents)
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
    }
}

private struct HoldingEventTimeline: View {
    let events: [HoldingEvent]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(.blue)
                Text("最近变动")
                    .font(.headline)
                Spacer()
            }

            VStack(spacing: 10) {
                ForEach(events) { event in
                    HoldingEventRow(event: event)
                }
            }
        }
    }
}

private struct HoldingEventRow: View {
    let event: HoldingEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName)
                .font(.title3)
                .foregroundStyle(iconColor)
                .frame(width: 30, height: 30)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(event.type.displayName) \(event.symbol)")
                        .font(.subheadline.weight(.semibold))
                    Text(event.market.displayName)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    Spacer()
                }

                Text(event.assetName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Text(summary)
                    .font(.caption)
                    .foregroundStyle(.primary)
                    .lineLimit(3)

                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                    Text(DisplayFormat.shortDateTime(event.createdAt))
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var iconName: String {
        switch event.type {
        case .created: "plus.circle.fill"
        case .updated: "pencil.circle.fill"
        case .deleted: "trash.circle.fill"
        }
    }

    private var iconColor: Color {
        switch event.type {
        case .created: .green
        case .updated: .blue
        case .deleted: .red
        }
    }

    private var summary: String {
        switch event.type {
        case .created:
            return [
                "数量 \(DisplayFormat.quantity(event.quantity))",
                "成本 \(DisplayFormat.money(event.averageCost, currency: event.currency))",
                "价格 \(DisplayFormat.money(event.lastPrice, currency: event.currency))"
            ].joined(separator: " · ")
        case .deleted:
            return [
                "删除前数量 \(DisplayFormat.quantity(event.quantity))",
                "成本 \(DisplayFormat.money(event.averageCost, currency: event.currency))",
                "价格 \(DisplayFormat.money(event.lastPrice, currency: event.currency))"
            ].joined(separator: " · ")
        case .updated:
            let parts = changedParts
            if parts.isEmpty {
                return "提交了持仓信息"
            }
            return parts.joined(separator: " · ")
        }
    }

    private var changedParts: [String] {
        var parts: [String] = []
        if let previousSymbol = event.previousSymbol, previousSymbol != event.symbol {
            parts.append("\(previousSymbol) -> \(event.symbol)")
        }
        if let previousQuantity = event.previousQuantity, previousQuantity != event.quantity {
            parts.append("数量 \(DisplayFormat.quantity(previousQuantity)) -> \(DisplayFormat.quantity(event.quantity))")
        }
        if let previousAverageCost = event.previousAverageCost, previousAverageCost != event.averageCost {
            parts.append(
                "成本 \(DisplayFormat.money(previousAverageCost, currency: event.currency)) -> \(DisplayFormat.money(event.averageCost, currency: event.currency))"
            )
        }
        if let previousLastPrice = event.previousLastPrice, previousLastPrice != event.lastPrice {
            parts.append(
                "价格 \(DisplayFormat.money(previousLastPrice, currency: event.currency)) -> \(DisplayFormat.money(event.lastPrice, currency: event.currency))"
            )
        }
        if let previousVisibility = event.previousVisibility, previousVisibility != event.visibility {
            parts.append("可见性 \(previousVisibility.displayName) -> \(event.visibility.displayName)")
        }
        return parts
    }
}
