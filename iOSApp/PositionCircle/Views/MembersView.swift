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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionTitle(title: "成员", systemImage: "person.2.fill")
                VStack(spacing: 10) {
                    ForEach(memberSummaries) { summary in
                        MemberSummaryRow(summary: summary)
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

    private var currencyLine: String {
        if summary.marketValueByCurrency.isEmpty {
            return "暂无持仓"
        }
        return summary.marketValueByCurrency
            .sorted { $0.key.rawValue < $1.key.rawValue }
            .map { currency, value in DisplayFormat.compactMoney(value, currency: currency) }
            .joined(separator: " · ")
    }

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
            Text("\(summary.holdingCount) 个")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color(.tertiarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
