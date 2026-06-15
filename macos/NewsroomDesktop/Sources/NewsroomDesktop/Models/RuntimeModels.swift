import Foundation

enum ServiceState: String {
  case running = "Running"
  case stopped = "Stopped"
  case warning = "Needs attention"
  case checking = "Checking"
}

struct ServiceStatus: Identifiable, Equatable {
  let id: String
  var name: String
  var detail: String
  var state: ServiceState

  var isHealthy: Bool {
    state == .running
  }
}

struct WorkstationConfig: Equatable {
  var repoPath: String
  var dashboardURL: URL
  var productionConvexURL: String
  var mediaVaultPath: String
  var recordingsInboxPath: String

  static let production = WorkstationConfig(
    repoPath: "/Users/lizw/Developer/newsroom",
    dashboardURL: URL(string: "http://localhost:5180")!,
    productionConvexURL: "https://utmost-chipmunk-181.convex.cloud",
    mediaVaultPath: "/Users/lizw/Developer/newsroom/media-vault",
    recordingsInboxPath: "/Users/lizw/Developer/newsroom/recordings-inbox"
  )
}
