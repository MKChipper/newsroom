import Foundation

enum Shell {
  struct Result {
    let output: String
    let status: Int32
  }

  static func run(_ command: String, cwd: String? = nil) async -> Result {
    await withCheckedContinuation { continuation in
      DispatchQueue.global(qos: .utility).async {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", command]
        process.standardOutput = pipe
        process.standardError = pipe
        if let cwd {
          process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        }

        do {
          try process.run()
          process.waitUntilExit()
          let data = pipe.fileHandleForReading.readDataToEndOfFile()
          let output = String(data: data, encoding: .utf8) ?? ""
          continuation.resume(returning: Result(output: output.trimmingCharacters(in: .whitespacesAndNewlines), status: process.terminationStatus))
        } catch {
          continuation.resume(returning: Result(output: error.localizedDescription, status: 1))
        }
      }
    }
  }
}
