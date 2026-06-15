import SwiftUI

struct PositionFormView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup
    let existingHolding: Holding?

    @Environment(\.dismiss) private var dismiss

    @State private var symbol: String
    @State private var assetName: String
    @State private var market: AssetMarket
    @State private var quantity: String
    @State private var averageCost: String
    @State private var lastPrice: String
    @State private var currency: HoldingCurrency
    @State private var visibility: PositionVisibility
    @State private var note: String

    init(
        store: PortfolioStore,
        group: InvestmentGroup,
        existingHolding: Holding? = nil
    ) {
        self.store = store
        self.group = group
        self.existingHolding = existingHolding
        _symbol = State(initialValue: existingHolding?.symbol ?? "")
        _assetName = State(initialValue: existingHolding?.assetName ?? "")
        _market = State(initialValue: existingHolding?.market ?? .usStock)
        _quantity = State(initialValue: existingHolding.map { DisplayFormat.quantity($0.quantity) } ?? "")
        _averageCost = State(initialValue: existingHolding.map { String($0.averageCost) } ?? "")
        _lastPrice = State(initialValue: existingHolding.map { String($0.lastPrice) } ?? "")
        _currency = State(initialValue: existingHolding?.currency ?? .usd)
        _visibility = State(initialValue: existingHolding?.visibility ?? group.defaultVisibility)
        _note = State(initialValue: existingHolding?.note ?? "")
    }

    var body: some View {
        Form {
            Section("标的") {
                TextField("代码", text: $symbol)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                TextField("名称", text: $assetName)
                Picker("市场", selection: $market) {
                    ForEach(AssetMarket.allCases) { market in
                        Text(market.displayName).tag(market)
                    }
                }
            }

            Section("持仓") {
                TextField("数量", text: $quantity)
                    .keyboardType(.decimalPad)
                TextField("平均成本", text: $averageCost)
                    .keyboardType(.decimalPad)
                TextField("现价", text: $lastPrice)
                    .keyboardType(.decimalPad)
                Picker("币种", selection: $currency) {
                    ForEach(HoldingCurrency.allCases) { currency in
                        Text(currency.rawValue).tag(currency)
                    }
                }
            }

            Section("可见性") {
                Picker("范围", selection: $visibility) {
                    ForEach(PositionVisibility.allCases) { visibility in
                        Text(visibility.displayName).tag(visibility)
                    }
                }
                Text(visibility.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("备注") {
                TextField("理由、风险或计划", text: $note, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
        .navigationTitle(existingHolding == nil ? "提交持仓" : "编辑持仓")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("取消") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("保存") {
                    save()
                }
                .disabled(!canSave)
            }
        }
    }

    private var canSave: Bool {
        !cleaned(symbol).isEmpty
            && parsed(quantity) != nil
            && parsed(averageCost) != nil
            && parsed(lastPrice) != nil
    }

    private func save() {
        guard
            let quantityValue = parsed(quantity),
            let costValue = parsed(averageCost),
            let priceValue = parsed(lastPrice)
        else {
            return
        }

        let cleanSymbol = cleaned(symbol).uppercased()
        let cleanName = cleaned(assetName)
        let holding = Holding(
            id: existingHolding?.id ?? UUID(),
            groupID: group.id,
            ownerID: existingHolding?.ownerID ?? store.currentMemberID,
            symbol: cleanSymbol,
            assetName: cleanName.isEmpty ? cleanSymbol : cleanName,
            market: market,
            quantity: quantityValue,
            averageCost: costValue,
            lastPrice: priceValue,
            currency: currency,
            visibility: visibility,
            note: cleaned(note),
            updatedAt: Date()
        )

        store.upsert(holding)
        dismiss()
    }

    private func parsed(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
