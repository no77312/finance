import SwiftUI

struct HoldingRow: View {
    let holding: Holding
    let owner: Member?
    let ownerName: String
    let isCurrentUser: Bool
    var showsActions: Bool = true
    var onEdit: (() -> Void)?
    var onDelete: (() -> Void)?

    private var canSeeAmount: Bool {
        isCurrentUser || holding.visibility != .symbolOnly
    }

    private var canSeeCost: Bool {
        isCurrentUser || holding.visibility == .full
    }

    private var canSeeNote: Bool {
        isCurrentUser || holding.visibility == .full
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: owner?.avatarSymbol ?? "person.crop.circle")
                    .font(.title3)
                    .foregroundStyle(.blue)
                    .frame(width: 30, height: 30)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(holding.symbol)
                            .font(.headline)
                        Text(holding.market.displayName)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color(.tertiarySystemGroupedBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    }
                    Text(holding.assetName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(ownerName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    if canSeeAmount {
                        Text(DisplayFormat.compactMoney(holding.marketValue, currency: holding.currency))
                            .font(.headline)
                        if canSeeCost {
                            Text(DisplayFormat.percent(holding.unrealizedPnLPercent))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.pnl(holding.unrealizedPnL))
                        } else {
                            Text("成本隐藏")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("仅标的")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if canSeeAmount {
                HStack(spacing: 10) {
                    HoldingMetaItem(title: "数量", value: DisplayFormat.quantity(holding.quantity))
                    HoldingMetaItem(title: "现价", value: DisplayFormat.money(holding.lastPrice, currency: holding.currency))
                    if canSeeCost {
                        HoldingMetaItem(title: "成本", value: DisplayFormat.money(holding.averageCost, currency: holding.currency))
                    }
                }
            }

            if canSeeNote && !holding.note.isEmpty {
                Text(holding.note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if isCurrentUser && showsActions {
                HStack(spacing: 10) {
                    Button(action: { onEdit?() }) {
                        Label("编辑", systemImage: "pencil")
                    }
                    .buttonStyle(.bordered)
                    Button(role: .destructive, action: { onDelete?() }) {
                        Label("删除", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                }
                .font(.caption.weight(.semibold))
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct HoldingMetaItem: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.medium))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
