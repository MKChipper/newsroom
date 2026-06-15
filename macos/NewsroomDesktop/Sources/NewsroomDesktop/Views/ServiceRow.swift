import SwiftUI

struct ServiceRow: View {
  let status: ServiceStatus

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: iconName)
        .foregroundStyle(iconColor)
        .frame(width: 18)

      VStack(alignment: .leading, spacing: 2) {
        Text(status.name)
          .font(.callout.weight(.medium))
        Text(status.detail)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      Spacer(minLength: 8)
    }
    .padding(.vertical, 6)
  }

  private var iconName: String {
    switch status.state {
    case .running:
      return "checkmark.circle.fill"
    case .stopped:
      return "pause.circle"
    case .warning:
      return "exclamationmark.triangle.fill"
    case .checking:
      return "clock"
    }
  }

  private var iconColor: Color {
    switch status.state {
    case .running:
      return .green
    case .stopped:
      return .secondary
    case .warning:
      return .orange
    case .checking:
      return .blue
    }
  }
}
