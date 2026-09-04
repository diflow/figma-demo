// Generated from tokens/tokens.json. Do not edit directly.
export const designTokens = {
  "mode1": {
    "colorBackground": "#FFFFFF",
    "colorSurface": "#FFFFFF",
    "colorAction": "#4F46E5",
    "colorText": "#0F172A",
    "spacingCard": "24px",
    "radiusCard": "16px",
  },
} as const;

export type DesignTokenMode = keyof typeof designTokens;
export type DesignTokenName = keyof (typeof designTokens)[DesignTokenMode];
