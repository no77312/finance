import SwiftUI

private enum GroupAccessMode: String, CaseIterable, Identifiable {
    case create = "创建群组"
    case join = "加入群组"

    var id: String { rawValue }
}

struct NewGroupView: View {
    @ObservedObject var store: PortfolioStore
    @Environment(\.dismiss) private var dismiss

    @State private var mode: GroupAccessMode = .create
    @State private var name = ""
    @State private var subtitle = ""
    @State private var inviteCode = ""
    @State private var isSubmitting = false
    @State private var errorMessage = ""

    var body: some View {
        Form {
            Section {
                Picker("方式", selection: $mode) {
                    ForEach(GroupAccessMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            if mode == .create {
                Section("群组") {
                    TextField("名称", text: $name)
                    TextField("副标题", text: $subtitle)
                }
            } else {
                Section("邀请码") {
                    TextField("例如 LONG-2026", text: $inviteCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
            }

            if isSubmitting {
                Section {
                    ProgressView()
                }
            }

            if !errorMessage.isEmpty {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("群组")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("取消") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(mode == .create ? "创建" : "加入") {
                    submit()
                }
                .disabled(isSubmitDisabled)
            }
        }
    }

    private var isSubmitDisabled: Bool {
        isSubmitting || (mode == .create ? cleaned(name).isEmpty : cleaned(inviteCode).isEmpty)
    }

    private func submit() {
        errorMessage = ""

        switch mode {
        case .create:
            store.createGroup(
                name: cleaned(name),
                subtitle: cleaned(subtitle).isEmpty ? "共享持仓与观点" : cleaned(subtitle)
            )
            dismiss()
        case .join:
            isSubmitting = true
            Task {
                do {
                    try await store.joinGroup(inviteCode: cleaned(inviteCode))
                    dismiss()
                } catch {
                    errorMessage = error.localizedDescription
                }
                isSubmitting = false
            }
        }
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
