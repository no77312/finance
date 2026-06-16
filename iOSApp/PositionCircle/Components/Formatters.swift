import Foundation
import SwiftUI

enum DisplayFormat {
    static func money(_ value: Double, currency: HoldingCurrency) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency.rawValue
        formatter.maximumFractionDigits = value >= 1_000 ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? "\(currency.rawValue) \(value)"
    }

    static func compactMoney(_ value: Double, currency: HoldingCurrency) -> String {
        let absolute = abs(value)
        if absolute >= 1_000_000 {
            return "\(currency.rawValue) \(compactNumber(value / 1_000_000))M"
        }
        if absolute >= 10_000 {
            return "\(currency.rawValue) \(compactNumber(value / 1_000))K"
        }
        return money(value, currency: currency)
    }

    static func quantity(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value < 1 ? 4 : 2
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func percent(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 1
        formatter.minimumFractionDigits = 1
        formatter.positivePrefix = "+"
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func shortDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日 HH:mm"
        return formatter.string(from: date)
    }

    private static func compactNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

extension Color {
    static func pnl(_ value: Double) -> Color {
        if value > 0 { return .green }
        if value < 0 { return .red }
        return .secondary
    }
}
