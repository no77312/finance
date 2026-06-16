import Foundation

public enum AssetMarket: String, CaseIterable, Codable, Identifiable, Sendable {
    case usStock
    case hkStock
    case cnStock
    case fund
    case crypto
    case cash

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .usStock: "美股"
        case .hkStock: "港股"
        case .cnStock: "A 股"
        case .fund: "基金"
        case .crypto: "加密"
        case .cash: "现金"
        }
    }
}

public enum HoldingCurrency: String, CaseIterable, Codable, Identifiable, Sendable {
    case usd = "USD"
    case hkd = "HKD"
    case cny = "CNY"
    case sgd = "SGD"

    public var id: String { rawValue }
}

public enum PositionVisibility: String, CaseIterable, Codable, Identifiable, Sendable {
    case full
    case amountOnly
    case symbolOnly

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .full: "完整可见"
        case .amountOnly: "隐藏成本"
        case .symbolOnly: "仅标的"
        }
    }

    public var description: String {
        switch self {
        case .full: "成员可看到数量、成本、市值和盈亏"
        case .amountOnly: "成员可看到标的和市值，不展示成本"
        case .symbolOnly: "成员只看到你持有哪些标的"
        }
    }
}

public enum MemberRole: String, Codable, Sendable {
    case owner
    case member
}

public struct Member: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var displayName: String
    public var avatarSymbol: String
    public var role: MemberRole
    public var joinedAt: Date

    public init(
        id: UUID = UUID(),
        displayName: String,
        avatarSymbol: String,
        role: MemberRole = .member,
        joinedAt: Date = Date()
    ) {
        self.id = id
        self.displayName = displayName
        self.avatarSymbol = avatarSymbol
        self.role = role
        self.joinedAt = joinedAt
    }
}

public struct InvestmentGroup: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var subtitle: String
    public var inviteCode: String
    public var members: [Member]
    public var defaultVisibility: PositionVisibility
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        subtitle: String,
        inviteCode: String,
        members: [Member],
        defaultVisibility: PositionVisibility = .full,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.subtitle = subtitle
        self.inviteCode = inviteCode
        self.members = members
        self.defaultVisibility = defaultVisibility
        self.createdAt = createdAt
    }
}

public struct Holding: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var groupID: UUID
    public var ownerID: UUID
    public var symbol: String
    public var assetName: String
    public var market: AssetMarket
    public var quantity: Double
    public var averageCost: Double
    public var lastPrice: Double
    public var currency: HoldingCurrency
    public var visibility: PositionVisibility
    public var note: String
    public var priceDate: String?
    public var priceSource: String?
    public var priceUpdatedAt: Date?
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        groupID: UUID,
        ownerID: UUID,
        symbol: String,
        assetName: String,
        market: AssetMarket,
        quantity: Double,
        averageCost: Double,
        lastPrice: Double,
        currency: HoldingCurrency,
        visibility: PositionVisibility = .full,
        note: String = "",
        priceDate: String? = nil,
        priceSource: String? = nil,
        priceUpdatedAt: Date? = nil,
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.groupID = groupID
        self.ownerID = ownerID
        self.symbol = symbol.uppercased()
        self.assetName = assetName
        self.market = market
        self.quantity = quantity
        self.averageCost = averageCost
        self.lastPrice = lastPrice
        self.currency = currency
        self.visibility = visibility
        self.note = note
        self.priceDate = priceDate
        self.priceSource = priceSource
        self.priceUpdatedAt = priceUpdatedAt
        self.updatedAt = updatedAt
    }
}

public enum HoldingEventType: String, Codable, Sendable {
    case created
    case updated
    case deleted

    public var displayName: String {
        switch self {
        case .created: "新增"
        case .updated: "更新"
        case .deleted: "删除"
        }
    }
}

public struct HoldingEvent: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var groupID: UUID
    public var holdingID: UUID
    public var ownerID: UUID
    public var type: HoldingEventType
    public var symbol: String
    public var assetName: String
    public var market: AssetMarket
    public var quantity: Double
    public var averageCost: Double
    public var lastPrice: Double
    public var currency: HoldingCurrency
    public var visibility: PositionVisibility
    public var note: String
    public var previousSymbol: String?
    public var previousAssetName: String?
    public var previousQuantity: Double?
    public var previousAverageCost: Double?
    public var previousLastPrice: Double?
    public var previousVisibility: PositionVisibility?
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        groupID: UUID,
        holdingID: UUID,
        ownerID: UUID,
        type: HoldingEventType,
        symbol: String,
        assetName: String,
        market: AssetMarket,
        quantity: Double,
        averageCost: Double,
        lastPrice: Double,
        currency: HoldingCurrency,
        visibility: PositionVisibility,
        note: String = "",
        previousSymbol: String? = nil,
        previousAssetName: String? = nil,
        previousQuantity: Double? = nil,
        previousAverageCost: Double? = nil,
        previousLastPrice: Double? = nil,
        previousVisibility: PositionVisibility? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.groupID = groupID
        self.holdingID = holdingID
        self.ownerID = ownerID
        self.type = type
        self.symbol = symbol.uppercased()
        self.assetName = assetName
        self.market = market
        self.quantity = quantity
        self.averageCost = averageCost
        self.lastPrice = lastPrice
        self.currency = currency
        self.visibility = visibility
        self.note = note
        self.previousSymbol = previousSymbol?.uppercased()
        self.previousAssetName = previousAssetName
        self.previousQuantity = previousQuantity
        self.previousAverageCost = previousAverageCost
        self.previousLastPrice = previousLastPrice
        self.previousVisibility = previousVisibility
        self.createdAt = createdAt
    }
}

public extension Holding {
    var marketValue: Double {
        quantity * lastPrice
    }

    var costBasis: Double {
        quantity * averageCost
    }

    var unrealizedPnL: Double {
        marketValue - costBasis
    }

    var unrealizedPnLPercent: Double {
        guard costBasis != 0 else { return 0 }
        return unrealizedPnL / costBasis
    }
}
