import Foundation

enum ManagedProcess: String, CaseIterable {
  case dashboard = "Dashboard"
  case staff = "Staff"
}

@MainActor
final class ProcessSupervisor {
  var onLog: ((String) -> Void)?
  private var processes: [ManagedProcess: Process] = [:]

  func startDashboard(config: WorkstationConfig) {
    start(
      .dashboard,
      command: "VITE_CONVEX_URL=\(config.productionConvexURL) npm run dev -- --host 127.0.0.1 --port 5180",
      cwd: config.repoPath
    )
  }

  func startStaff(config: WorkstationConfig) {
    start(
      .staff,
      command: "VITE_CONVEX_URL=\(config.productionConvexURL) npm run staff",
      cwd: config.repoPath
    )
  }

  func stopAll(config: WorkstationConfig) async {
    for process in processes.values where process.isRunning {
      process.terminate()
    }
    processes.removeAll()

    let patterns = [
      "npm run dev -- --host 127.0.0.1 --port 5180",
      "vite.*5180",
      "node agents/staff.mjs",
      "agents/runner.mjs",
      "agents/telegram-gates.mjs",
      "agents/inbox-watcher.mjs",
      "agents/tips-inbox.mjs"
    ]
    for pattern in patterns {
      _ = await Shell.run("pkill -f '\(pattern)' >/dev/null 2>&1 || true", cwd: config.repoPath)
    }
    log("Stopped managed Newsroom processes.")
  }

  private func start(_ kind: ManagedProcess, command: String, cwd: String) {
    if let current = processes[kind], current.isRunning {
      log("\(kind.rawValue) already started by this app.")
      return
    }

    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", command]
    process.currentDirectoryURL = URL(fileURLWithPath: cwd)
    process.standardOutput = pipe
    process.standardError = pipe

    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
      Task { @MainActor in
        for line in text.split(separator: "\n") {
          self?.log("[\(kind.rawValue)] \(line)")
        }
      }
    }

    process.terminationHandler = { [weak self] _ in
      Task { @MainActor in
        self?.processes[kind] = nil
        self?.log("\(kind.rawValue) exited.")
      }
    }

    do {
      try process.run()
      processes[kind] = process
      log("Started \(kind.rawValue).")
    } catch {
      log("Failed to start \(kind.rawValue): \(error.localizedDescription)")
    }
  }

  private func log(_ message: String) {
    onLog?(message)
  }
}
