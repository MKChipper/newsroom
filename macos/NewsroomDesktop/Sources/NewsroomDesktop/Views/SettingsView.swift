import SwiftUI

struct SettingsView: View {
  @EnvironmentObject private var store: WorkstationStore

  var body: some View {
    Form {
      Section("Runtime") {
        LabeledContent("Repository") {
          Text(store.config.repoPath)
            .textSelection(.enabled)
        }
        LabeledContent("Dashboard") {
          Text(store.config.dashboardURL.absoluteString)
            .textSelection(.enabled)
        }
        LabeledContent("Production Convex") {
          Text(store.config.productionConvexURL)
            .textSelection(.enabled)
        }
      }

      Section("Local files") {
        HStack {
          LabeledContent("Media vault") {
            Text(store.config.mediaVaultPath)
              .textSelection(.enabled)
          }
          Button("Open") {
            store.openMediaVault()
          }
        }

        HStack {
          LabeledContent("Recordings inbox") {
            Text(store.config.recordingsInboxPath)
              .textSelection(.enabled)
          }
          Button("Open") {
            store.openRecordingsInbox()
          }
        }
      }

      Section("Model") {
        Text("The desk model is read from NEWSROOM_CLAUDE_MODEL in .env.local. The current repo default is sonnet.")
          .foregroundStyle(.secondary)
      }
    }
    .formStyle(.grouped)
    .padding(20)
  }
}
