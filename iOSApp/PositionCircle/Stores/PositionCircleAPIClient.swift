import Foundation

struct PositionCircleAPIClient {
    var baseURL: URL
    var currentMemberID: UUID

    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(
        baseURL: URL = URL(string: "https://position-circle-api.onrender.com")!,
        currentMemberID: UUID = DemoData.currentMemberID
    ) {
        self.baseURL = baseURL
        self.currentMemberID = currentMemberID

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = Self.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(value)"
            )
        }
        self.decoder = decoder

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(Self.string(from: date))
        }
        self.encoder = encoder
    }

    func bootstrap() async throws -> BootstrapResponse {
        try await request(path: "/api/bootstrap")
    }

    func createGroup(name: String, subtitle: String) async throws -> InvestmentGroup {
        let response: GroupResponse = try await request(
            path: "/api/groups",
            method: "POST",
            body: NewGroupRequest(name: name, subtitle: subtitle)
        )
        return response.group
    }

    func createHolding(_ holding: Holding) async throws -> Holding {
        let response: HoldingResponse = try await request(
            path: "/api/groups/\(holding.groupID.uuidString)/holdings",
            method: "POST",
            body: holding
        )
        return response.holding
    }

    func updateHolding(_ holding: Holding) async throws -> Holding {
        let response: HoldingResponse = try await request(
            path: "/api/groups/\(holding.groupID.uuidString)/holdings/\(holding.id.uuidString)",
            method: "PUT",
            body: holding
        )
        return response.holding
    }

    func deleteHolding(_ holding: Holding) async throws {
        let _: EmptyResponse = try await request(
            path: "/api/groups/\(holding.groupID.uuidString)/holdings/\(holding.id.uuidString)",
            method: "DELETE"
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String = "GET",
        body: Body?
    ) async throws -> Response {
        var request = URLRequest(url: URL(string: path, relativeTo: baseURL)!)
        request.httpMethod = method
        request.setValue(currentMemberID.uuidString, forHTTPHeaderField: "X-Member-ID")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 204 {
            return EmptyResponse() as! Response
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let serverError = try? decoder.decode(ServerErrorResponse.self, from: data)
            throw APIError.server(
                statusCode: httpResponse.statusCode,
                message: serverError?.error.message ?? "Server request failed."
            )
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func request<Response: Decodable>(
        path: String,
        method: String = "GET"
    ) async throws -> Response {
        let emptyBody: EmptyRequest? = nil
        return try await request(path: path, method: method, body: emptyBody)
    }

    private static func date(from value: String) -> Date? {
        iso8601WithFractionalSeconds().date(from: value) ?? iso8601().date(from: value)
    }

    private static func string(from date: Date) -> String {
        iso8601WithFractionalSeconds().string(from: date)
    }

    private static func iso8601WithFractionalSeconds() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    private static func iso8601() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }
}

struct BootstrapResponse: Decodable {
    var currentMemberID: UUID
    var groups: [InvestmentGroup]
    var holdings: [Holding]
}

private struct GroupResponse: Decodable {
    var group: InvestmentGroup
}

private struct HoldingResponse: Decodable {
    var holding: Holding
}

private struct ServerErrorResponse: Decodable {
    struct ErrorPayload: Decodable {
        var code: String
        var message: String
    }

    var error: ErrorPayload
}

private struct NewGroupRequest: Encodable {
    var name: String
    var subtitle: String
}

private struct EmptyRequest: Encodable {}

private struct EmptyResponse: Decodable {}

enum APIError: LocalizedError {
    case invalidResponse
    case server(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response."
        case let .server(statusCode, message):
            return "Server returned \(statusCode): \(message)"
        }
    }
}
