import SwiftUI

struct SidebarView: View {
  @EnvironmentObject private var store: WorkstationStore

  var body: some View {
    List {
      Section("Workstation") {
        ForEach(store.services) { service in
          ServiceRow(status: service)
        }
      }

      Section("Actions") {
        Button {
          Task { await store.startWorkstation() }
        } label: {
          Label("Start production console", systemImage: "play.fill")
        }
        .disabled(store.isBusy)

        Button {
          Task { await store.stopWorkstation() }
        } label: {
          Label("Stop local workers", systemImage: "stop.fill")
        }
        .disabled(store.isBusy)

        Button {
          Task { await store.refresh() }
        } label: {
          Label("Refresh status", systemImage: "arrow.clockwise")
        }
        .disabled(store.isBusy)
      }

      Section("Folders") {
        Button {
          store.openMediaVault()
        } label: {
          Label("Media vault", systemImage: "folder")
        }

        Button {
          store.openRecordingsInbox()
        } label: {
          Label("Recordings inbox", systemImage: "waveform")
        }
      }

      Section("Target") {
        VStack(alignment: .leading, spacing: 4) {
          Text("Production Convex")
            .font(.caption.weight(.semibold))
          Text(store.config.productionConvexURL)
            .font(.caption)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
        }
        .padding(.vertical, 4)
      }
    }
    .listStyle(.sidebar)
    .navigationTitle("Newsroom")
  }
}
