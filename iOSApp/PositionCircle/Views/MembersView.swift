import SwiftUI

struct MembersView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup

    private var memberSummaries: [MemberPortfolioSummary] {
        PortfolioAnalytics.memberSummaries(
            holdings: store.holdings(for: group),
            members: group.members
        )
    }

    private func memberHoldings(for member: Member) -> [Holding] {
        PortfolioAnalytics.holdings(
            for: member.id,
            in: store.holdings(for: group)
        )
    }

    private func visibleMarketValueLine(for summary: MemberPortfolioSummary) -> String {
        let holdings = memberHoldings(for: summary.member)
        if holdings.isEmpty {
            return "暂无持仓"
        }

        let canSeeAll = summary.member.id == store.currentMemberID
        let visibleHoldings = canSeeAll ? holdings : holdings.filter { $0.visibility != .symbolOnly }

        if visibleHoldings.isEmpty {
            return "仅展示标的"
        }

        return Dictionary(grouping: visibleHoldings, by: \.currency)
            .mapValues { currencyHoldings in
                currencyHoldings.reduce(0) { $0 + $1.marketValue }
            }
            .sorted { $0.key.rawValue < $1.key.rawValue }
            .map { currency, value in DisplayFormat.compactMoney(value, currency: currency) }
            .joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionTitle(title: "成员", systemImage: "person.2.fill")
                VStack(spacing: 10) {
                    ForEach(memberSummaries) { summary in
                        NavigationLink {
                            MemberDetailView(
                                store: store,
                                group: group,
                                summary: summary
                            )
                        } label: {
                            MemberSummaryRow(
                                summary: summary,
                                currencyLine: visibleMarketValueLine(for: summary)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }

                SectionTitle(title: "邀请码", systemImage: "link")
                HStack {
                    Text(group.inviteCode)
                        .font(.title3.weight(.bold))
                    Spacer()
                    Image(systemName: "doc.on.doc")
                        .foregroundStyle(.blue)
                }
                .padding(14)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
    }
}

private struct MemberSummaryRow: View {
    let summary: MemberPortfolioSummary
    let currencyLine: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: summary.member.avatarSymbol)
                .font(.title3)
                .foregroundStyle(summary.hasHoldings ? .blue : .secondary)
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 4) {
                Text(summary.member.displayName)
                    .font(.headline)
                Text(currencyLine)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            HStack(spacing: 8) {
                Text("\(summary.holdingCount) 个")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color(.tertiarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct MemberDetailView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    let summary: MemberPortfolioSummary

    private var member: Member {
        summary.member
    }

    private var isCurrentUser: Bool {
        member.id == store.currentMemberID
    }

    private var memberHoldings: [Holding] {
        PortfolioAnalytics.holdings(
            for: member.id,
            in: store.holdings(for: group)
        )
    }

    private var marketValueVisibleHoldings: [Holding] {
        if isCurrentUser {
            return memberHoldings
        }
        return memberHoldings.filter { $0.visibility != .symbolOnly }
    }

    private var pnlVisibleHoldings: [Holding] {
        if isCurrentUser {
            return memberHoldings
        }
        return memberHoldings.filter { $0.visibility == .full }
    }

    private var marketValueSummaries: [CurrencyPortfolioSummary] {
        PortfolioAnalytics.summariesByCurrency(for: marketValueVisibleHoldings)
    }

    private var pnlSummariesByCurrency: [HoldingCurrency: CurrencyPortfolioSummary] {
        Dictionary(
            uniqueKeysWithValues: PortfolioAnalytics
                .summariesByCurrency(for: pnlVisibleHoldings)
                .map { ($0.currency, $0) }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                profileSection

                if memberHoldings.isEmpty {
                    EmptyStateView(
                        systemImage: "tray",
                        title: "暂无持仓",
                        subtitle: "这个成员还没有提交持仓"
                    )
                } else {
                    if !marketValueSummaries.isEmpty {
                        visibleSummarySection
                    }

                    SectionTitle(title: "持仓明细", systemImage: "list.bullet.rectangle.fill")
                    VStack(spacing: 10) {
                        ForEach(memberHoldings) { holding in
                            HoldingRow(
                                holding: holding,
                                owner: member,
                                ownerName: member.displayName,
                                isCurrentUser: isCurrentUser,
                                showsActions: false
                            )
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(member.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var profileSection: some View {
        HStack(spacing: 14) {
            Image(systemName: member.avatarSymbol)
                .font(.title2)
                .foregroundStyle(summary.hasHoldings ? .blue : .secondary)
                .frame(width: 42, height: 42)
                .background(Color(.tertiarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(member.displayName)
                    .font(.headline)
                Text(member.role == .owner ? "群主" : "成员")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("\(memberHoldings.count)")
                    .font(.title3.weight(.bold))
                Text("持仓")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var visibleSummarySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "可见资产", systemImage: "chart.pie.fill")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(marketValueSummaries) { item in
                    MetricCard(
                        title: "\(item.currency.rawValue) 市值",
                        value: DisplayFormat.compactMoney(item.summary.totalMarketValue, currency: item.currency),
                        detail: "\(item.summary.holdingCount) 个可见标的",
                        systemImage: "sum",
                        tint: .blue
                    )

                    if let pnlItem = pnlSummariesByCurrency[item.currency] {
                        MetricCard(
                            title: "\(item.currency.rawValue) 浮盈亏",
                            value: DisplayFormat.compactMoney(pnlItem.summary.totalUnrealizedPnL, currency: item.currency),
                            detail: DisplayFormat.percent(pnlItem.summary.totalUnrealizedPnLPercent),
                            systemImage: pnlItem.summary.totalUnrealizedPnL >= 0 ? "arrow.up.right" : "arrow.down.right",
                            tint: Color.pnl(pnlItem.summary.totalUnrealizedPnL)
                        )
                    }
                }
            }
        }
    }
}
