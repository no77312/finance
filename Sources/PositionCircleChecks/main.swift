import Foundation
import PositionCircleCore

@main
struct PositionCircleChecks {
    static func main() {
        checkPortfolioSummary()
        checkSymbolExposure()
        checkMemberSummaries()
        print("PositionCircleCore checks passed")
    }

    private static func checkPortfolioSummary() {
        let groupID = UUID()
        let memberID = UUID()
        let holdings = [
            Holding(
                groupID: groupID,
                ownerID: memberID,
                symbol: "AAA",
                assetName: "Alpha",
                market: .usStock,
                quantity: 10,
                averageCost: 8,
                lastPrice: 12,
                currency: .usd
            ),
            Holding(
                groupID: groupID,
                ownerID: memberID,
                symbol: "BBB",
                assetName: "Beta",
                market: .fund,
                quantity: 5,
                averageCost: 20,
                lastPrice: 18,
                currency: .usd
            )
        ]

        let summary = PortfolioAnalytics.summary(for: holdings)
        expectClose(summary.totalMarketValue, 210, "summary market value")
        expectClose(summary.totalCostBasis, 180, "summary cost basis")
        expectClose(summary.totalUnrealizedPnL, 30, "summary PnL")
        expect(summary.holdingCount == 2, "summary holding count")
        expect(summary.holderCount == 1, "summary holder count")
        expectClose(summary.totalUnrealizedPnLPercent, 0.1666, "summary PnL percent", accuracy: 0.001)
    }

    private static func checkSymbolExposure() {
        let groupID = UUID()
        let firstMemberID = UUID()
        let secondMemberID = UUID()
        let holdings = [
            Holding(
                groupID: groupID,
                ownerID: firstMemberID,
                symbol: "voo",
                assetName: "ETF",
                market: .fund,
                quantity: 2,
                averageCost: 400,
                lastPrice: 500,
                currency: .usd
            ),
            Holding(
                groupID: groupID,
                ownerID: secondMemberID,
                symbol: "VOO",
                assetName: "ETF",
                market: .fund,
                quantity: 3,
                averageCost: 450,
                lastPrice: 500,
                currency: .usd
            )
        ]

        let exposure = PortfolioAnalytics.exposures(for: holdings)
        expect(exposure.count == 1, "exposure count")
        expect(exposure[0].symbol == "VOO", "exposure symbol normalization")
        expect(exposure[0].holderCount == 2, "exposure holder count")
        expectClose(exposure[0].totalQuantity, 5, "exposure quantity")
        expectClose(exposure[0].totalMarketValue, 2_500, "exposure market value")
    }

    private static func checkMemberSummaries() {
        let groupID = UUID()
        let activeMember = Member(displayName: "Active", avatarSymbol: "person.fill")
        let emptyMember = Member(displayName: "Empty", avatarSymbol: "person")
        let holdings = [
            Holding(
                groupID: groupID,
                ownerID: activeMember.id,
                symbol: "AAA",
                assetName: "Alpha",
                market: .usStock,
                quantity: 1,
                averageCost: 10,
                lastPrice: 12,
                currency: .usd
            )
        ]

        let summaries = PortfolioAnalytics.memberSummaries(
            holdings: holdings,
            members: [activeMember, emptyMember]
        )
        expect(summaries.count == 2, "member summary count")
        expect(summaries.first { $0.member.id == activeMember.id }?.hasHoldings == true, "active member holdings")
        expect(summaries.first { $0.member.id == emptyMember.id }?.hasHoldings == false, "empty member holdings")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            fatalError("Check failed: \(message)")
        }
    }

    private static func expectClose(
        _ actual: Double,
        _ expected: Double,
        _ message: String,
        accuracy: Double = 0.001
    ) {
        expect(abs(actual - expected) <= accuracy, "\(message): expected \(expected), got \(actual)")
    }
}
