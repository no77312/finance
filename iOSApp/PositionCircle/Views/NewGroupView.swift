import SwiftUI

struct NewGroupView: View {
    @ObservedObject var store: PortfolioStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var subtitle = ""

    var body: some View {
        Form {
            Section("群组") {
                TextField("名称", text: $name)
                TextField("副标题", text: $subtitle)
            }
        }
        .navigationTitle("新建群组")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("取消") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("创建") {
                    store.createGroup(
                        name: cleaned(name),
                        subtitle: cleaned(subtitle).isEmpty ? "共享持仓与观点" : cleaned(subtitle)
                    )
                    dismiss()
                }
                .disabled(cleaned(name).isEmpty)
            }
        }
    }

    private func cleaned(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
