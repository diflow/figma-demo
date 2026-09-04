import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const inputIndex = args.indexOf("--input");
const sourcePath = inputIndex >= 0
  ? path.resolve(process.cwd(), args[inputIndex + 1] ?? fail("--input requires a file path"))
  : path.join(root, "tokens", "tokens.json");
const outputDir = path.join(root, "generated");

const source = normalize(JSON.parse(await readFile(sourcePath, "utf8")));
validate(source);
const outputs = new Map([...generateWeb(source), ...generateIos(source), ...generateAndroid(source)]);
if (!checkOnly) {
  for (const platform of ["web", "ios", "android"]) await rm(path.join(outputDir, platform), { recursive: true, force: true });
}
for (const [relativePath, contents] of outputs) await emit(path.join(outputDir, relativePath), contents);
console.log(`${checkOnly ? "Checked" : "Generated"} ${outputs.size} files from ${path.relative(root, sourcePath)}`);

function generateWeb(data) {
  const cssBlocks = data.modes.map((mode, index) => {
    const selector = index === 0 ? ":root" : `[data-theme="${kebab(mode)}"]`;
    const body = data.tokens.map((token) => `  --${kebab(token.name)}: ${webValue(token, mode)};`).join("\n");
    return `${selector} {\n${body}\n}`;
  });
  const tsModes = data.modes.map((mode) => {
    const entries = data.tokens.map((token) => `    ${JSON.stringify(camel(token.name))}: ${JSON.stringify(webValue(token, mode))},`).join("\n");
    return `  ${JSON.stringify(camel(mode))}: {\n${entries}\n  },`;
  }).join("\n");
  return new Map([
    ["web/tokens.css", banner("css") + cssBlocks.join("\n\n") + "\n"],
    ["web/tokens.ts", banner("ts") + `export const designTokens = {\n${tsModes}\n} as const;\n\nexport type DesignTokenMode = keyof typeof designTokens;\nexport type DesignTokenName = keyof (typeof designTokens)[DesignTokenMode];\n`],
    ["web/tokens.json", JSON.stringify(toPortableJson(data), null, 2) + "\n"],
  ]);
}

function generateIos(data) {
  const files = new Map();
  const colors = data.tokens.filter((token) => token.type === "COLOR");
  const values = data.tokens.filter((token) => token.type !== "COLOR");
  files.set("../Package.swift", `// swift-tools-version: 5.9\nimport PackageDescription\n\nlet package = Package(\n    name: "DesignTokens",\n    platforms: [.iOS(.v13)],\n    products: [.library(name: "DesignTokens", targets: ["DesignTokens"])],\n    targets: [\n        .target(\n            name: "DesignTokens",\n            path: "generated/ios/Sources/DesignTokens",\n            resources: [.process("Resources")]\n        )\n    ]\n)\n`);
  files.set("ios/Sources/DesignTokens/Resources/DesignTokens.xcassets/Contents.json", JSON.stringify({ info: { author: "figma-token-generator", version: 1 } }, null, 2) + "\n");
  for (const token of colors) {
    files.set(`ios/Sources/DesignTokens/Resources/DesignTokens.xcassets/${pascal(token.name)}.colorset/Contents.json`, colorSetJson(token, data.modes));
  }
  const modeEnum = data.modes.length > 1
    ? `public enum DesignTokenMode: String, CaseIterable {\n${data.modes.map((mode) => `    case ${safeName(camel(mode))} = ${JSON.stringify(mode)}`).join("\n")}\n}\n\n`
    : "";
  const members = [...colors.map((token) => iosColorMember(token, data.modes)), ...values.map((token) => iosValueMember(token, data.modes))].join("\n\n");
  files.set("ios/Sources/DesignTokens/DesignTokens.swift", banner("swift") + `import UIKit\n\n${modeEnum}public enum DesignTokens {\n${indent(members, 4)}\n}\n`);
  return files;
}

function generateAndroid(data) {
  const files = new Map();
  files.set("android/src/main/AndroidManifest.xml", `<manifest xmlns:android="http://schemas.android.com/apk/res/android" />\n`);
  setAndroidMode(files, "android/src/main/res/values", data, data.modes[0]);
  const darkMode = data.modes.slice(1).find((mode) => /dark|night/i.test(mode));
  if (darkMode) setAndroidMode(files, "android/src/main/res/values-night", data, darkMode);
  return files;
}

function setAndroidMode(files, directory, data, mode) {
  const colors = data.tokens.filter((token) => token.type === "COLOR").map((token) => `    <color name="${snake(token.name)}">${androidColor(token.values[mode])}</color>`).join("\n");
  const dimens = data.tokens.filter((token) => token.type === "FLOAT").map((token) => `    <dimen name="${snake(token.name)}">${number(token.values[mode])}${mobileUnit(token.name)}</dimen>`).join("\n");
  const values = data.tokens.filter((token) => ["STRING", "BOOLEAN"].includes(token.type)).map((token) => token.type === "BOOLEAN"
    ? `    <bool name="${snake(token.name)}">${token.values[mode]}</bool>`
    : `    <string name="${snake(token.name)}">${escapeXml(token.values[mode])}</string>`).join("\n");
  files.set(`${directory}/colors.xml`, xmlResources(colors));
  files.set(`${directory}/dimens.xml`, xmlResources(dimens));
  files.set(`${directory}/values.xml`, xmlResources(values));
}

function iosColorMember(token, modes) {
  const name = safeName(camel(token.name));
  const assetName = pascal(token.name);
  if (modes.length === 1 || (modes.length === 2 && /dark|night/i.test(modes[1]))) {
    return `public static var ${name}: UIColor {\n    guard let color = UIColor(named: ${JSON.stringify(assetName)}, in: .module, compatibleWith: nil) else {\n        assertionFailure("Missing ${assetName} in DesignTokens.xcassets")\n        return .clear\n    }\n    return color\n}`;
  }
  const cases = modes.map((mode) => `case .${safeName(camel(mode))}: return ${swiftColor(token.values[mode])}`).join("\n");
  return `public static func ${name}(_ mode: DesignTokenMode = .${safeName(camel(modes[0]))}) -> UIColor {\n    switch mode {\n${indent(cases, 4)}\n    }\n}`;
}

function iosValueMember(token, modes) {
  const name = safeName(camel(token.name));
  const type = token.type === "FLOAT" ? "CGFloat" : token.type === "BOOLEAN" ? "Bool" : "String";
  if (modes.length === 1) return `public static let ${name}: ${type} = ${swiftLiteral(token, token.values[modes[0]])}`;
  const cases = modes.map((mode) => `case .${safeName(camel(mode))}: return ${swiftLiteral(token, token.values[mode])}`).join("\n");
  return `public static func ${name}(_ mode: DesignTokenMode = .${safeName(camel(modes[0]))}) -> ${type} {\n    switch mode {\n${indent(cases, 4)}\n    }\n}`;
}

function colorSetJson(token, modes) {
  const variants = [{ value: token.values[modes[0]], dark: false }];
  const darkMode = modes.slice(1).find((mode) => /dark|night/i.test(mode));
  if (darkMode) variants.push({ value: token.values[darkMode], dark: true });
  return JSON.stringify({
    colors: variants.map(({ value, dark }) => ({
      ...(dark ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {}),
      color: { "color-space": "srgb", components: iosComponents(value) },
      idiom: "universal",
    })),
    info: { author: "figma-token-generator", version: 1 },
  }, null, 2) + "\n";
}

function webValue(token, mode) {
  return token.type === "FLOAT" ? `${number(token.values[mode])}${isUnitless(token.name) ? "" : "px"}` : String(token.values[mode]);
}
function mobileUnit(name) { return /font.?size|line.?height/i.test(name) ? "sp" : "dp"; }
function isUnitless(name) { return /opacity|z.?index|font.?weight|scale/i.test(name); }
function swiftLiteral(token, value) { return token.type === "FLOAT" ? number(value) : token.type === "BOOLEAN" ? String(value) : JSON.stringify(String(value)); }
function swiftColor(value) { const c = parseHex(value); return `UIColor(red: ${float01(c.red)}, green: ${float01(c.green)}, blue: ${float01(c.blue)}, alpha: ${float01(c.alpha)})`; }
function iosComponents(value) { const c = parseHex(value); return { alpha: float01(c.alpha), blue: float01(c.blue), green: float01(c.green), red: float01(c.red) }; }
function androidColor(value) { const c = parseHex(value); const rgb = [c.red, c.green, c.blue].map(hexByte).join(""); return c.alpha === 255 ? `#${rgb}` : `#${hexByte(c.alpha)}${rgb}`; }
function parseHex(value) {
  const hex = String(value).replace(/^#/, "");
  if (![6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) throw new Error(`Unsupported color: ${value}`);
  return { red: parseInt(hex.slice(0, 2), 16), green: parseInt(hex.slice(2, 4), 16), blue: parseInt(hex.slice(4, 6), 16), alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255 };
}
function xmlResources(body) { return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from tokens/tokens.json. Do not edit directly. -->\n<resources>${body ? `\n${body}\n` : ""}</resources>\n`; }
function float01(byte) { return (byte / 255).toFixed(3); }
function hexByte(byte) { return byte.toString(16).padStart(2, "0").toUpperCase(); }
function number(value) { return Number(value).toString(); }
function indent(value, spaces) { return value.split("\n").map((line) => " ".repeat(spaces) + line).join("\n"); }
function escapeXml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "\\'"); }
function banner(kind) { return kind === "css" ? "/* Generated from tokens/tokens.json. Do not edit directly. */\n" : "// Generated from tokens/tokens.json. Do not edit directly.\n"; }
function words(value) { return String(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean); }
function camel(value) { const parts = words(value); return (parts[0]?.toLowerCase() ?? "token") + parts.slice(1).map(capitalize).join(""); }
function pascal(value) { return words(value).map(capitalize).join(""); }
function kebab(value) { return words(value).map((part) => part.toLowerCase()).join("-"); }
function snake(value) { return words(value).map((part) => part.toLowerCase()).join("_"); }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(); }
function safeName(value) { return /^[0-9]/.test(value) ? `token${capitalize(value)}` : value; }

async function emit(file, expected) {
  if (!checkOnly) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, expected); return; }
  let actual = "";
  try { actual = await readFile(file, "utf8"); } catch { throw new Error(`Missing generated file: ${path.relative(root, file)}`); }
  if (actual !== expected) throw new Error(`Generated file is out of date: ${path.relative(root, file)}`);
}

function validate(data) {
  if (data?.format !== "figma-free-sync-demo@1") throw new Error("Unsupported token format");
  if (!data.collection || !Array.isArray(data.modes) || data.modes.length === 0) throw new Error("Collection and modes are required");
  if (!Array.isArray(data.tokens) || data.tokens.length === 0) throw new Error("Tokens must be a non-empty array");
  const names = new Set();
  for (const token of data.tokens) {
    if (!token.name || !["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(token.type)) throw new Error(`Invalid token: ${token.name ?? "unknown"}`);
    if (names.has(token.name)) throw new Error(`Duplicate token: ${token.name}`);
    names.add(token.name);
    for (const mode of data.modes) {
      if (!(mode in token.values)) throw new Error(`Missing ${mode} value for ${token.name}`);
      if (token.type === "COLOR") parseHex(token.values[mode]);
      if (token.type === "FLOAT" && !Number.isFinite(token.values[mode])) throw new Error(`Invalid number for ${token.name}`);
    }
  }
  validateNames(data.tokens, camel, "Swift/TypeScript");
  validateNames(data.tokens, snake, "Android");
}
function validateNames(tokens, transform, platform) {
  const names = new Map();
  for (const token of tokens) {
    const generated = transform(token.name);
    if (names.has(generated)) throw new Error(`${platform} name collision: ${names.get(generated)} and ${token.name}`);
    names.set(generated, token.name);
  }
}

function normalize(data) {
  if (data?.format === "figma-free-sync-demo@1") return data;
  const tokens = [];
  visitDtcg(data, [], undefined, tokens);
  if (tokens.length === 0) throw new Error("No supported DTCG tokens found");
  const mode = data?.$extensions?.["com.figma.modeName"] ?? "Default";
  for (const token of tokens) token.values = { [mode]: token.values.Default };
  return { format: "figma-free-sync-demo@1", collection: data?.$extensions?.["com.figma.collectionName"] ?? "Figma Tokens", modes: [mode], tokens };
}
function visitDtcg(node, pathParts, inheritedType, result) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const tokenType = node.$type || inheritedType;
  if ("$value" in node) {
    const converted = convertDtcgValue(tokenType, node.$value);
    if (converted) result.push({ name: pathParts.join("/"), type: converted.type, values: { Default: converted.value } });
    return;
  }
  for (const [key, value] of Object.entries(node)) if (!key.startsWith("$")) visitDtcg(value, [...pathParts, key], tokenType, result);
}
function convertDtcgValue(type, value) {
  if (type === "color") {
    if (typeof value === "string" && value.startsWith("#")) return { type: "COLOR", value: value.toUpperCase() };
    if (value?.hex) return { type: "COLOR", value: withAlpha(value.hex.toUpperCase(), value.alpha) };
    if (value?.colorSpace === "srgb" && Array.isArray(value.components)) {
      const rgb = value.components.slice(0, 3).map((component) => hexByte(Math.round(component * 255))).join("");
      return { type: "COLOR", value: withAlpha(`#${rgb}`, value.alpha) };
    }
  }
  if (type === "number") return { type: "FLOAT", value };
  if (type === "dimension" && value?.unit === "px") return { type: "FLOAT", value: value.value };
  if (type === "string" || type === "fontFamily") return { type: "STRING", value };
  if (type === "boolean") return { type: "BOOLEAN", value };
  return undefined;
}
function withAlpha(hex, alpha) { return alpha === undefined || alpha === 1 || hex.length === 9 ? hex : `${hex}${hexByte(Math.round(alpha * 255))}`; }
function toPortableJson(data) { return { collection: data.collection, modes: data.modes, tokens: Object.fromEntries(data.tokens.map((token) => [token.name, token.values])) }; }
function fail(message) { throw new Error(message); }
