import Foundation

public struct PortfolioSummary: Equatable, Sendable {
    public var totalMarketValue: Double
    public var totalCostBasis: Double
    public var totalUnrealizedPnL: Double
    public var holdingCount: Int
    public var holderCount: Int

    public var totalUnrealizedPnLPercent: Double {
        guard totalCostBasis != 0 else { return 0 }
        return totalUnrealizedPnL / totalCostBasis
    }
}

public struct CurrencyPortfolioSummary: Identifiable, Equatable, Sendable {
    public var id: HoldingCurrency { currency }
    public var currency: HoldingCurrency
    public var summary: PortfolioSummary
}

public struct SymbolExposure: Identifiable, Equatable, Sendable {
    public var id: String { "\(symbol)-\(currency.rawValue)" }
    public var symbol: String
    public var assetName: String
    public var market: AssetMarket
    public var currency: HoldingCurrency
    public var holderCount: Int
    public var totalQuantity: Double
    public var totalMarketValue: Double
    public var totalCostBasis: Double

    public var unrealizedPnL: Double {
        totalMarketValue - totalCostBasis
    }

    public var unrealizedPnLPercent: Double {
        guard totalCostBasis != 0 else { return 0 }
        return unrealizedPnL / totalCostBasis
    }
}

public struct MemberPortfolioSummary: Identifiable, Equatable, Sendable {
    public var id: UUID { member.id }
    public var member: Member
    public var totalMarketValue: Double
    public var totalUnrealizedPnL: Double
    public var marketValueByCurrency: [HoldingCurrency: Double]
    public var holdingCount: Int

    public var hasHoldings: Bool {
        holdingCount > 0
    }
}

public enum PortfolioAnalytics {
    public static func summary(for holdings: [Holding]) -> PortfolioSummary {
        let holderIDs = Set(holdings.map(\.ownerID))
        let marketValue = holdings.reduce(0) { $0 + $1.marketValue }
        let costBasis = holdings.reduce(0) { $0 + $1.costBasis }

        return PortfolioSummary(
            totalMarketValue: marketValue,
            totalCostBasis: costBasis,
            totalUnrealizedPnL: marketValue - costBasis,
            holdingCount: holdings.count,
            holderCount: holderIDs.count
        )
    }

    public static func summariesByCurrency(for holdings: [Holding]) -> [CurrencyPortfolioSummary] {
        Dictionary(grouping: holdings, by: \.currency)
            .map { currency, currencyHoldings in
                CurrencyPortfolioSummary(
                    currency: currency,
                    summary: summary(for: currencyHoldings)
                )
            }
            .sorted { $0.currency.rawValue < $1.currency.rawValue }
    }

    public static func exposures(for holdings: [Holding]) -> [SymbolExposure] {
        let grouped = Dictionary(grouping: holdings) { holding in
            "\(holding.symbol)|\(holding.currency.rawValue)"
        }

        return grouped.values.map { groupHoldings in
            let first = groupHoldings[0]
            let holders = Set(groupHoldings.map(\.ownerID))
            return SymbolExposure(
                symbol: first.symbol,
                assetName: first.assetName,
                market: first.market,
                currency: first.currency,
                holderCount: holders.count,
                totalQuantity: groupHoldings.reduce(0) { $0 + $1.quantity },
                totalMarketValue: groupHoldings.reduce(0) { $0 + $1.marketValue },
                totalCostBasis: groupHoldings.reduce(0) { $0 + $1.costBasis }
            )
        }
        .sorted {
            if $0.totalMarketValue == $1.totalMarketValue {
                return $0.symbol < $1.symbol
            }
            return $0.totalMarketValue > $1.totalMarketValue
        }
    }

    public static func memberSummaries(
        holdings: [Holding],
        members: [Member]
    ) -> [MemberPortfolioSummary] {
        let grouped = Dictionary(grouping: holdings, by: \.ownerID)

        return members.map { member in
            let memberHoldings = grouped[member.id] ?? []
            return MemberPortfolioSummary(
                member: member,
                totalMarketValue: memberHoldings.reduce(0) { $0 + $1.marketValue },
                totalUnrealizedPnL: memberHoldings.reduce(0) { $0 + $1.unrealizedPnL },
                marketValueByCurrency: Dictionary(grouping: memberHoldings, by: \.currency)
                    .mapValues { currencyHoldings in
                        currencyHoldings.reduce(0) { $0 + $1.marketValue }
                    },
                holdingCount: memberHoldings.count
            )
        }
        .sorted {
            if $0.holdingCount == $1.holdingCount {
                return $0.member.displayName < $1.member.displayName
            }
            return $0.holdingCount > $1.holdingCount
        }
    }

    public static func holdings(
        for memberID: UUID,
        in holdings: [Holding]
    ) -> [Holding] {
        holdings
            .filter { $0.ownerID == memberID }
            .sorted { $0.updatedAt > $1.updatedAt }
    }
}
