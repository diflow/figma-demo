// Generated from tokens/tokens.json. Do not edit directly.
import UIKit

public enum DesignTokens {
    public static var colorBackground: UIColor {
        guard let color = UIColor(named: "ColorBackground", in: .module, compatibleWith: nil) else {
            assertionFailure("Missing ColorBackground in DesignTokens.xcassets")
            return .clear
        }
        return color
    }
    
    public static var colorSurface: UIColor {
        guard let color = UIColor(named: "ColorSurface", in: .module, compatibleWith: nil) else {
            assertionFailure("Missing ColorSurface in DesignTokens.xcassets")
            return .clear
        }
        return color
    }
    
    public static var colorAction: UIColor {
        guard let color = UIColor(named: "ColorAction", in: .module, compatibleWith: nil) else {
            assertionFailure("Missing ColorAction in DesignTokens.xcassets")
            return .clear
        }
        return color
    }
    
    public static var colorText: UIColor {
        guard let color = UIColor(named: "ColorText", in: .module, compatibleWith: nil) else {
            assertionFailure("Missing ColorText in DesignTokens.xcassets")
            return .clear
        }
        return color
    }
    
    public static let spacingCard: CGFloat = 24
    
    public static let radiusCard: CGFloat = 16
}
