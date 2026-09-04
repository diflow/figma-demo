// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DesignTokens",
    platforms: [.iOS(.v13)],
    products: [.library(name: "DesignTokens", targets: ["DesignTokens"])],
    targets: [
        .target(
            name: "DesignTokens",
            path: "generated/ios/Sources/DesignTokens",
            resources: [.process("Resources")]
        )
    ]
)
