// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "NewsroomDesktop",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .executable(name: "NewsroomDesktop", targets: ["NewsroomDesktop"])
  ],
  targets: [
    .executableTarget(
      name: "NewsroomDesktop",
      path: "Sources/NewsroomDesktop"
    )
  ]
)
