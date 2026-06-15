// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PositionCircle",
    defaultLocalization: "zh-Hans",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "PositionCircleCore",
            targets: ["PositionCircleCore"]
        ),
        .executable(
            name: "PositionCircleChecks",
            targets: ["PositionCircleChecks"]
        )
    ],
    targets: [
        .target(name: "PositionCircleCore"),
        .executableTarget(
            name: "PositionCircleChecks",
            dependencies: ["PositionCircleCore"]
        )
    ]
)
