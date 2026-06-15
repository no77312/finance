import SwiftUI

struct GroupDashboardView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    var onEditHolding: (Holding) -> Void

    private var groupHoldings: [Holding] {
        store.holdings(for: group)
    }

    private var currencySummaries: [CurrencyPortfolioSummary] {
        PortfolioAnalytics.summariesByCurrency(for: groupHoldings)
    }

    private var exposures: [SymbolExposure] {
        PortfolioAnalytics.exposures(for: groupHoldings)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if groupHoldings.isEmpty {
                    EmptyStateView(
                        systemImage: "tray",
                        title: "暂无持仓",
                        subtitle: "提交第一笔持仓后会生成群组看板"
                    )
                } else {
                    currencySummarySection
                    exposureSection
                    recentHoldingSection
                }
            }
            .padding(16)
        }
    }

    private var currencySummarySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "资产概览", systemImage: "chart.pie.fill")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(currencySummaries) { item in
                    MetricCard(
                        title: "\(item.currency.rawValue) 市值",
                        value: DisplayFormat.compactMoney(item.summary.totalMarketValue, currency: item.currency),
                        detail: "\(item.summary.holdingCount) 个标的 · \(item.summary.holderCount) 位成员",
                        systemImage: "sum",
                        tint: .blue
                    )
                    MetricCard(
                        title: "\(item.currency.rawValue) 浮盈亏",
                        value: DisplayFormat.compactMoney(item.summary.totalUnrealizedPnL, currency: item.currency),
                        detail: DisplayFormat.percent(item.summary.totalUnrealizedPnLPercent),
                        systemImage: item.summary.totalUnrealizedPnL >= 0 ? "arrow.up.right" : "arrow.down.right",
                        tint: Color.pnl(item.summary.totalUnrealizedPnL)
                    )
                }
            }
        }
    }

    private var exposureSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "共识标的", systemImage: "target")
            VStack(spacing: 10) {
                ForEach(exposures.prefix(6)) { exposure in
                    ExposureRow(exposure: exposure)
                }
            }
        }
    }

    private var recentHoldingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "最新提交", systemImage: "clock.fill")
            VStack(spacing: 10) {
                ForEach(groupHoldings.prefix(5)) { holding in
                    HoldingRow(
                        holding: holding,
                        owner: store.owner(for: holding, in: group),
                        ownerName: store.ownerName(for: holding, in: group),
                        isCurrentUser: holding.ownerID == store.currentMemberID,
                        onEdit: { onEditHolding(holding) },
                        onDelete: { store.delete(holding) }
                    )
                }
            }
        }
    }
}

private struct ExposureRow: View {
    let exposure: SymbolExposure

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(exposure.symbol)
                        .font(.headline)
                    Text(exposure.market.displayName)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(exposure.assetName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(DisplayFormat.compactMoney(exposure.totalMarketValue, currency: exposure.currency))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text("\(exposure.holderCount) 人 · \(DisplayFormat.percent(exposure.unrealizedPnLPercent))")
                    .font(.caption)
                    .foregroundStyle(Color.pnl(exposure.unrealizedPnL))
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
