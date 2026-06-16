import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @ObservedObject var store: PortfolioStore
    @State private var displayName = ""

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "chart.line.uptrend.xyaxis.circle.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(.blue)
                Text("持仓圈")
                    .font(.largeTitle.weight(.bold))
                Text("登录到你的持仓圈")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            VStack(spacing: 14) {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    handleAppleResult(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(spacing: 10) {
                    TextField("本机账号昵称", text: $displayName)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)

                    Button {
                        Task {
                            await store.signInWithDevice(
                                displayName: cleaned(displayName).isEmpty ? "我" : cleaned(displayName)
                            )
                        }
                    } label: {
                        Label("用本机账号继续", systemImage: "person.crop.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(.horizontal, 28)
            .disabled(store.isAuthenticating)

            if store.isAuthenticating {
                ProgressView()
            }

            if !store.authStatus.isEmpty {
                Text(store.authStatus)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }

            Spacer()
        }
        .background(Color(.systemGroupedBackground))
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                store.authStatus = "Apple 登录凭证无效"
                return
            }

            let token = credential.identityToken.flatMap { String(data: $0, encoding: .utf8) }
            let name = [
                credential.fullName?.givenName,
                credential.fullName?.familyName
            ]
                .compactMap { $0 }
                .joined(separator: " ")

            Task {
                await store.signInWithApple(
                    appleUserID: credential.user,
                    identityToken: token,
                    email: credential.email,
                    fullName: name.isEmpty ? nil : name
                )
            }
        case let .failure(error):
            store.authStatus = error.localizedDescription
        }
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
