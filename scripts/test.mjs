import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runGenerator(["--check"]);

const expectations = new Map([
  ["Package.swift", ["path: \"generated/ios/Sources/DesignTokens\"", "name: \"DesignTokens\""]],
  ["generated/web/tokens.css", ["--color-action: #4F46E5;", "--spacing-card: 24px;"]],
  ["generated/ios/Sources/DesignTokens/DesignTokens.swift", ["public static var colorAction: UIColor", "public static let spacingCard: CGFloat = 24"]],
  ["generated/android/src/main/res/values/colors.xml", ["<color name=\"color_action\">#4F46E5</color>"]],
  ["generated/android/src/main/res/values/dimens.xml", ["<dimen name=\"spacing_card\">24dp</dimen>"]],
]);
for (const [file, fragments] of expectations) {
  const contents = await readFile(path.join(root, file), "utf8");
  for (const fragment of fragments) if (!contents.includes(fragment)) throw new Error(`${file} does not contain ${fragment}`);
}

try {
  runGenerator(["--input", "tests/figma-export.tokens.json"]);
  const figmaCss = await readFile(path.join(root, "generated/web/tokens.css"), "utf8");
  if (!figmaCss.includes("--color-action: #4F46E5;")) throw new Error("Figma DTCG color was not generated");
  const figmaJson = JSON.parse(await readFile(path.join(root, "generated/web/tokens.json"), "utf8"));
  if (figmaJson.modes[0] !== "Mode 1") throw new Error("Figma mode name was not preserved");
} finally {
  runGenerator([]);
}

console.log(`Verified remote Swift Package, ${expectations.size - 1} platform outputs and Figma DTCG import`);

function runGenerator(args) {
  const result = spawnSync(process.execPath, ["scripts/generate.mjs", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
