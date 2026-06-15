import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var store: WorkstationStore
  @State private var showLogs = true

  var body: some View {
    NavigationSplitView {
      SidebarView()
        .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 380)
    } detail: {
      VStack(spacing: 0) {
        HeaderBar(showLogs: $showLogs)

        WebDashboardView(url: store.config.dashboardURL)
          .overlay(alignment: .center) {
            if dashboardIsStopped {
              VStack(spacing: 12) {
                Image(systemName: "display")
                  .font(.system(size: 42))
                  .foregroundStyle(.secondary)
                Text("Dashboard is not running")
                  .font(.title3.weight(.semibold))
                Text("Start the production console to launch the local Newsroom UI against production Convex.")
                  .foregroundStyle(.secondary)
                  .multilineTextAlignment(.center)
                  .frame(maxWidth: 420)
                Button {
                  Task { await store.startWorkstation() }
                } label: {
                  Label("Start production console", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(store.isBusy)
              }
              .padding(24)
              .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
          }

        if showLogs {
          Divider()
          LogView(lines: store.logLines)
            .frame(height: 150)
        }
      }
      .toolbar {
        ToolbarItemGroup {
          Button {
            Task { await store.refresh() }
          } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
          }
          .disabled(store.isBusy)

          Button {
            store.openDashboardInBrowser()
          } label: {
            Label("Open in Browser", systemImage: "safari")
          }

          Button {
            showLogs.toggle()
          } label: {
            Label("Logs", systemImage: showLogs ? "rectangle.bottomthird.inset.filled" : "rectangle")
          }
        }
      }
    }
  }

  private var dashboardIsStopped: Bool {
    store.services.first(where: { $0.id == "dashboard" })?.state == .stopped
  }
}

private struct HeaderBar: View {
  @EnvironmentObject private var store: WorkstationStore
  @Binding var showLogs: Bool

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Production Workstation")
          .font(.headline)
        Text(store.config.dashboardURL.absoluteString)
          .font(.caption)
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
      }

      Spacer()

      if let lastRefresh = store.lastRefresh {
        Text("Checked \(lastRefresh.formatted(date: .omitted, time: .shortened))")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      ProgressView()
        .controlSize(.small)
        .opacity(store.isBusy ? 1 : 0)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .background(.bar)
  }
}

private struct LogView: View {
  let lines: [String]

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 3) {
          ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
            Text(line)
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(.secondary)
              .textSelection(.enabled)
              .frame(maxWidth: .infinity, alignment: .leading)
              .id(index)
          }
        }
        .padding(10)
      }
      .background(.thinMaterial)
      .onChange(of: lines.count) { _, newCount in
        if newCount > 0 {
          proxy.scrollTo(newCount - 1, anchor: .bottom)
        }
      }
    }
  }
}
