import AppKit
import Foundation

@MainActor
final class WorkstationStore: ObservableObject {
  @Published var config = WorkstationConfig.production
  @Published var services: [ServiceStatus] = [
    ServiceStatus(id: "dashboard", name: "Dashboard", detail: "Not checked yet", state: .checking),
    ServiceStatus(id: "staff", name: "Staff workers", detail: "Not checked yet", state: .checking),
    ServiceStatus(id: "claude", name: "Claude SDK", detail: "Not checked yet", state: .checking),
    ServiceStatus(id: "convex", name: "Production Convex", detail: "Not checked yet", state: .checking),
    ServiceStatus(id: "tips", name: "Rejected tips", detail: "Not checked yet", state: .checking)
  ]
  @Published var isBusy = false
  @Published var logLines: [String] = []
  @Published var lastRefresh: Date?

  private let supervisor = ProcessSupervisor()

  init() {
    supervisor.onLog = { [weak self] message in
      self?.appendLog(message)
    }
  }

  func startWorkstation() async {
    isBusy = true
    appendLog("Starting Newsroom production workstation against \(config.productionConvexURL)...")
    await supervisor.stopAll(config: config)
    try? await Task.sleep(nanoseconds: 800_000_000)
    supervisor.startDashboard(config: config)
    supervisor.startStaff(config: config)
    try? await Task.sleep(nanoseconds: 2_000_000_000)
    await refresh()
    isBusy = false
  }

  func stopWorkstation() async {
    isBusy = true
    await supervisor.stopAll(config: config)
    try? await Task.sleep(nanoseconds: 800_000_000)
    await refresh()
    isBusy = false
  }

  func refresh() async {
    isBusy = true
    update(id: "dashboard", detail: "Checking...", state: .checking)
    update(id: "staff", detail: "Checking...", state: .checking)
    update(id: "claude", detail: "Checking...", state: .checking)
    update(id: "convex", detail: "Checking...", state: .checking)
    update(id: "tips", detail: "Checking...", state: .checking)

    async let dashboard = dashboardStatus()
    async let staff = staffStatus()
    async let claude = claudeStatus()
    async let convex = convexStatus()
    async let tips = tipsStatus()

    update(dashboard: await dashboard)
    update(staff: await staff)
    update(claude: await claude)
    update(convex: await convex)
    update(tips: await tips)
    lastRefresh = Date()
    isBusy = false
  }

  func openDashboardInBrowser() {
    NSWorkspace.shared.open(config.dashboardURL)
  }

  func openMediaVault() {
    NSWorkspace.shared.open(URL(fileURLWithPath: config.mediaVaultPath, isDirectory: true))
  }

  func openRecordingsInbox() {
    NSWorkspace.shared.open(URL(fileURLWithPath: config.recordingsInboxPath, isDirectory: true))
  }

  private func dashboardStatus() async -> ServiceStatus {
    if await isDashboardRunning() {
      return ServiceStatus(id: "dashboard", name: "Dashboard", detail: "\(config.dashboardURL.absoluteString) responding", state: .running)
    }
    return ServiceStatus(id: "dashboard", name: "Dashboard", detail: "Port 5180 is not responding", state: .stopped)
  }

  private func staffStatus() async -> ServiceStatus {
    if await isStaffRunning() {
      return ServiceStatus(id: "staff", name: "Staff workers", detail: "desks/gates/inbox process tree detected", state: .running)
    }
    return ServiceStatus(id: "staff", name: "Staff workers", detail: "Not running", state: .stopped)
  }

  private func claudeStatus() async -> ServiceStatus {
    let result = await Shell.run("npm run check:claude", cwd: config.repoPath)
    if result.status == 0 {
      return ServiceStatus(id: "claude", name: "Claude SDK", detail: "Auth and model OK", state: .running)
    }
    let detail = result.output.split(separator: "\n").last.map(String.init) ?? "Check failed"
    return ServiceStatus(id: "claude", name: "Claude SDK", detail: detail, state: .warning)
  }

  private func convexStatus() async -> ServiceStatus {
    let result = await Shell.run(
      "npx convex run --prod design:postStudioList | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d);process.stdin.on(\"end\",()=>{const rows=JSON.parse(s||\"[]\"); console.log(rows.length);})'",
      cwd: config.repoPath
    )
    if result.status == 0 {
      return ServiceStatus(id: "convex", name: "Production Convex", detail: "\(result.output) posts in production", state: .running)
    }
    return ServiceStatus(id: "convex", name: "Production Convex", detail: "Production query failed", state: .warning)
  }

  private func tipsStatus() async -> ServiceStatus {
    let result = await Shell.run(
      "npx convex run --prod pipeline:tipsList | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d);process.stdin.on(\"end\",()=>{const rows=JSON.parse(s||\"[]\"); console.log(rows.filter(r=>r.status===\"rejected\").length);})'",
      cwd: config.repoPath
    )
    if result.status == 0 {
      let count = Int(result.output.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
      return ServiceStatus(
        id: "tips",
        name: "Rejected tips",
        detail: count == 0 ? "None" : "\(count) need reset/re-file",
        state: count == 0 ? .running : .warning
      )
    }
    return ServiceStatus(id: "tips", name: "Rejected tips", detail: "Tip query failed", state: .warning)
  }

  private func isDashboardRunning() async -> Bool {
    let result = await Shell.run("curl -fsS http://127.0.0.1:5180 >/dev/null 2>&1", cwd: config.repoPath)
    return result.status == 0
  }

  private func isStaffRunning() async -> Bool {
    let result = await Shell.run("pgrep -f 'node agents/staff.mjs' >/dev/null 2>&1", cwd: config.repoPath)
    return result.status == 0
  }

  private func update(dashboard status: ServiceStatus) { update(status) }
  private func update(staff status: ServiceStatus) { update(status) }
  private func update(claude status: ServiceStatus) { update(status) }
  private func update(convex status: ServiceStatus) { update(status) }
  private func update(tips status: ServiceStatus) { update(status) }

  private func update(id: String, detail: String, state: ServiceState) {
    if let index = services.firstIndex(where: { $0.id == id }) {
      services[index].detail = detail
      services[index].state = state
    }
  }

  private func update(_ status: ServiceStatus) {
    if let index = services.firstIndex(where: { $0.id == status.id }) {
      services[index] = status
    }
  }

  private func appendLog(_ message: String) {
    let stamp = Date.now.formatted(date: .omitted, time: .standard)
    logLines.append("[\(stamp)] \(message)")
    if logLines.count > 200 {
      logLines.removeFirst(logLines.count - 200)
    }
  }
}
