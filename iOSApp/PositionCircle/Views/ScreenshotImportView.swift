import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import Vision

struct ScreenshotImportView: View {
    @ObservedObject var store: PortfolioStore
    let group: InvestmentGroup

    @Environment(\.dismiss) private var dismiss

    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var ocrText = ""
    @State private var drafts: [EditableImportDraft] = []
    @State private var warnings: [String] = []
    @State private var parseSource: String?
    @State private var errorMessage: String?
    @State private var isRecognizing = false
    @State private var isParsing = false
    @State private var isImporting = false

    private var importableCount: Int {
        drafts.filter { $0.isSelected && $0.canImport }.count
    }

    var body: some View {
        Form {
            Section("截图") {
                PhotosPicker(selection: $selectedItem, matching: .images) {
                    Label("选择券商持仓截图", systemImage: "photo.on.rectangle.angled")
                }

                if let selectedImage {
                    Image(uiImage: selectedImage)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                if isRecognizing || isParsing {
                    ProgressView(isRecognizing ? "识别截图中" : "解析持仓中")
                }

                if let sourceText {
                    Label(sourceText, systemImage: parseSource == "model" ? "sparkles" : "wand.and.stars")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if let errorMessage {
                Section("错误") {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            if !warnings.isEmpty {
                Section("提示") {
                    ForEach(warnings, id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !drafts.isEmpty {
                Section("待确认") {
                    ForEach($drafts) { $draft in
                        ImportDraftEditor(draft: $draft)
                    }
                }
            }

            if !ocrText.isEmpty {
                Section {
                    DisclosureGroup("OCR 文字") {
                        Text(ocrText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
            }
        }
        .navigationTitle("截图导入")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("取消") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("导入 \(importableCount) 个") {
                    importDrafts()
                }
                .disabled(importableCount == 0 || isImporting || isRecognizing || isParsing)
            }
        }
        .onChange(of: selectedItem) { _, item in
            Task {
                await loadAndParse(item)
            }
        }
    }

    private var sourceText: String? {
        switch parseSource {
        case "model":
            return "大模型解析完成"
        case "fallback":
            return "基础解析完成"
        default:
            return nil
        }
    }

    @MainActor
    private func loadAndParse(_ item: PhotosPickerItem?) async {
        guard let item else { return }

        resetResult()
        isRecognizing = true
        defer { isRecognizing = false }

        do {
            guard
                let data = try await item.loadTransferable(type: Data.self),
                let image = UIImage(data: data)
            else {
                errorMessage = "无法读取这张图片。"
                return
            }

            selectedImage = image
            let text = try recognizeText(in: image)
            ocrText = text

            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                warnings = ["没有识别到文字，请换一张更清晰的持仓截图。"]
                return
            }

            await parseRecognizedText(text)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func parseRecognizedText(_ text: String) async {
        isParsing = true
        defer { isParsing = false }

        do {
            let response = try await store.parseScreenshotImport(
                ocrText: text,
                defaultVisibility: group.defaultVisibility
            )
            parseSource = response.source
            warnings = response.warnings
            drafts = response.holdings.map(EditableImportDraft.init)

            if drafts.isEmpty && warnings.isEmpty {
                warnings = ["没有找到可导入的持仓。"]
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func importDrafts() {
        isImporting = true
        for draft in drafts where draft.isSelected {
            guard let holding = draft.holding(group: group, ownerID: store.currentMemberID) else {
                continue
            }
            store.upsert(holding)
        }
        dismiss()
    }

    private func resetResult() {
        selectedImage = nil
        ocrText = ""
        drafts = []
        warnings = []
        parseSource = nil
        errorMessage = nil
    }

    private func recognizeText(in image: UIImage) throws -> String {
        guard let cgImage = image.cgImage else {
            return ""
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(
            cgImage: cgImage,
            orientation: CGImagePropertyOrientation(image.imageOrientation)
        )
        try handler.perform([request])

        return request.results?
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n") ?? ""
    }
}

private struct ImportDraftEditor: View {
    @Binding var draft: EditableImportDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Toggle("", isOn: $draft.isSelected)
                    .labelsHidden()

                VStack(alignment: .leading, spacing: 3) {
                    Text(draft.symbol.isEmpty ? "未识别代码" : draft.symbol.uppercased())
                        .font(.headline)
                    Text(draft.assetName.isEmpty ? "未识别名称" : draft.assetName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                ConfidenceBadge(confidence: draft.confidence)
            }

            if draft.isSelected && !draft.canImport {
                Label("补全代码、数量、成本和现价后可导入", systemImage: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            DisclosureGroup("编辑") {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("代码", text: $draft.symbol)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()

                    TextField("名称", text: $draft.assetName)

                    Picker("市场", selection: $draft.market) {
                        ForEach(AssetMarket.allCases) { market in
                            Text(market.displayName).tag(market)
                        }
                    }

                    TextField("数量", text: $draft.quantity)
                        .keyboardType(.decimalPad)

                    TextField("平均成本", text: $draft.averageCost)
                        .keyboardType(.decimalPad)

                    TextField("现价", text: $draft.lastPrice)
                        .keyboardType(.decimalPad)

                    Picker("币种", selection: $draft.currency) {
                        ForEach(HoldingCurrency.allCases) { currency in
                            Text(currency.rawValue).tag(currency)
                        }
                    }

                    Picker("可见性", selection: $draft.visibility) {
                        ForEach(PositionVisibility.allCases) { visibility in
                            Text(visibility.displayName).tag(visibility)
                        }
                    }

                    TextField("备注", text: $draft.note, axis: .vertical)
                        .lineLimit(2...4)

                    if !draft.rawText.isEmpty {
                        Text(draft.rawText)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 8)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct ConfidenceBadge: View {
    let confidence: Double

    var body: some View {
        Text("\(Int(confidence * 100))%")
            .font(.caption.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(tint.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var tint: Color {
        if confidence >= 0.8 {
            return .green
        }
        if confidence >= 0.55 {
            return .orange
        }
        return .red
    }
}

private struct EditableImportDraft: Identifiable {
    var id = UUID()
    var isSelected = true
    var symbol: String
    var assetName: String
    var market: AssetMarket
    var quantity: String
    var averageCost: String
    var lastPrice: String
    var currency: HoldingCurrency
    var visibility: PositionVisibility
    var confidence: Double
    var note: String
    var rawText: String

    init(draft: ScreenshotImportDraft) {
        symbol = draft.symbol
        assetName = draft.assetName
        market = draft.market
        quantity = Self.string(from: draft.quantity)
        averageCost = Self.string(from: draft.averageCost)
        lastPrice = Self.string(from: draft.lastPrice)
        currency = draft.currency
        visibility = draft.visibility
        confidence = draft.confidence
        note = draft.note
        rawText = draft.rawText
    }

    var canImport: Bool {
        !cleaned(symbol).isEmpty
            && parsedPositive(quantity) != nil
            && parsed(averageCost) != nil
            && parsed(lastPrice) != nil
    }

    func holding(group: InvestmentGroup, ownerID: UUID) -> Holding? {
        guard
            let quantityValue = parsedPositive(quantity),
            let costValue = parsed(averageCost),
            let priceValue = parsed(lastPrice)
        else {
            return nil
        }

        let cleanSymbol = cleaned(symbol).uppercased()
        guard !cleanSymbol.isEmpty else {
            return nil
        }

        let cleanName = cleaned(assetName)
        return Holding(
            groupID: group.id,
            ownerID: ownerID,
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
    }

    private func parsed(_ text: String) -> Double? {
        let value = Double(text.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines))
        guard let value, value >= 0 else {
            return nil
        }
        return value
    }

    private func parsedPositive(_ text: String) -> Double? {
        guard let value = parsed(text), value > 0 else {
            return nil
        }
        return value
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func string(from value: Double?) -> String {
        guard let value else {
            return ""
        }
        return String(format: "%.6g", value)
    }
}

private extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up:
            self = .up
        case .upMirrored:
            self = .upMirrored
        case .down:
            self = .down
        case .downMirrored:
            self = .downMirrored
        case .left:
            self = .left
        case .leftMirrored:
            self = .leftMirrored
        case .right:
            self = .right
        case .rightMirrored:
            self = .rightMirrored
        @unknown default:
            self = .up
        }
    }
}
