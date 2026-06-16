import Foundation

public enum DemoData {
    public static let currentMemberID = UUID(uuidString: "4D99EF67-4E8F-4BA6-9E96-1E62E7680010")!
    public static let groupID = UUID(uuidString: "D54C3FB6-11E8-447D-A2BB-EF9505087101")!

    public static let members: [Member] = [
        Member(
            id: currentMemberID,
            displayName: "我",
            avatarSymbol: "person.crop.circle.fill",
            role: .owner,
            joinedAt: Date(timeIntervalSince1970: 1_720_000_000)
        ),
        Member(
            id: UUID(uuidString: "3B958ED1-1FC0-4EBA-877D-97CFE89B3DA6")!,
            displayName: "Alice",
            avatarSymbol: "chart.line.uptrend.xyaxis.circle.fill",
            joinedAt: Date(timeIntervalSince1970: 1_720_003_600)
        ),
        Member(
            id: UUID(uuidString: "0426A6E2-A743-47BA-83F8-951702236762")!,
            displayName: "Ben",
            avatarSymbol: "wallet.pass.fill",
            joinedAt: Date(timeIntervalSince1970: 1_720_007_200)
        )
    ]

    public static let groups: [InvestmentGroup] = [
        InvestmentGroup(
            id: groupID,
            name: "长期主义小组",
            subtitle: "互相同步仓位、理由和风险",
            inviteCode: "LONG-2026",
            members: members,
            defaultVisibility: .full,
            createdAt: Date(timeIntervalSince1970: 1_720_000_000)
        )
    ]

    public static let holdings: [Holding] = [
        Holding(
            groupID: groupID,
            ownerID: currentMemberID,
            symbol: "VOO",
            assetName: "Vanguard S&P 500 ETF",
            market: .fund,
            quantity: 12,
            averageCost: 438,
            lastPrice: 486,
            currency: .usd,
            visibility: .full,
            note: "核心仓位，按月定投",
            updatedAt: Date(timeIntervalSince1970: 1_750_000_000)
        ),
        Holding(
            groupID: groupID,
            ownerID: currentMemberID,
            symbol: "MSFT",
            assetName: "Microsoft",
            market: .usStock,
            quantity: 8,
            averageCost: 392,
            lastPrice: 445,
            currency: .usd,
            visibility: .amountOnly,
            note: "AI 与云业务继续观察",
            updatedAt: Date(timeIntervalSince1970: 1_750_030_000)
        ),
        Holding(
            groupID: groupID,
            ownerID: members[1].id,
            symbol: "VOO",
            assetName: "Vanguard S&P 500 ETF",
            market: .fund,
            quantity: 18,
            averageCost: 421,
            lastPrice: 486,
            currency: .usd,
            visibility: .full,
            note: "组合底仓",
            updatedAt: Date(timeIntervalSince1970: 1_750_050_000)
        ),
        Holding(
            groupID: groupID,
            ownerID: members[1].id,
            symbol: "0700",
            assetName: "Tencent Holdings",
            market: .hkStock,
            quantity: 100,
            averageCost: 310,
            lastPrice: 386,
            currency: .hkd,
            visibility: .full,
            note: "港股弹性仓位",
            updatedAt: Date(timeIntervalSince1970: 1_750_080_000)
        ),
        Holding(
            groupID: groupID,
            ownerID: members[2].id,
            symbol: "BTC",
            assetName: "Bitcoin",
            market: .crypto,
            quantity: 0.16,
            averageCost: 61_000,
            lastPrice: 68_000,
            currency: .usd,
            visibility: .symbolOnly,
            note: "小比例配置",
            updatedAt: Date(timeIntervalSince1970: 1_750_090_000)
        )
    ]

    public static let holdingEvents: [HoldingEvent] = [
        HoldingEvent(
            groupID: groupID,
            holdingID: holdings[1].id,
            ownerID: currentMemberID,
            type: .updated,
            symbol: "MSFT",
            assetName: "Microsoft",
            market: .usStock,
            quantity: 8,
            averageCost: 392,
            lastPrice: 445,
            currency: .usd,
            visibility: .amountOnly,
            note: "AI 与云业务继续观察",
            previousQuantity: 6,
            previousAverageCost: 388,
            previousLastPrice: 430,
            previousVisibility: .amountOnly,
            createdAt: Date(timeIntervalSince1970: 1_750_030_000)
        ),
        HoldingEvent(
            groupID: groupID,
            holdingID: holdings[0].id,
            ownerID: currentMemberID,
            type: .created,
            symbol: "VOO",
            assetName: "Vanguard S&P 500 ETF",
            market: .fund,
            quantity: 12,
            averageCost: 438,
            lastPrice: 486,
            currency: .usd,
            visibility: .full,
            note: "核心仓位，按月定投",
            createdAt: Date(timeIntervalSince1970: 1_750_000_000)
        )
    ]
}
