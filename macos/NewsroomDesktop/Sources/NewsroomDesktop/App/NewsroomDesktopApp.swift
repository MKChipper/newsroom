import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }
}

@main
struct NewsroomDesktopApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var store = WorkstationStore()

  var body: some Scene {
    WindowGroup("Newsroom", id: "main") {
      ContentView()
        .environmentObject(store)
        .frame(minWidth: 1180, minHeight: 760)
        .task {
          await store.refresh()
        }
    }
    .commands {
      CommandGroup(after: .appInfo) {
        Button("Refresh Status") {
          Task { await store.refresh() }
        }
        .keyboardShortcut("r", modifiers: [.command])

        Button("Open Media Vault") {
          store.openMediaVault()
        }
        .keyboardShortcut("m", modifiers: [.command, .shift])
      }
    }

    Settings {
      SettingsView()
        .environmentObject(store)
        .frame(width: 560)
    }
  }
}
