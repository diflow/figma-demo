figma.showUI(__html__, { width: 500, height: 570 });

const COLLECTION_NAME = "Demo Tokens";
const DEMO = {
  format: "figma-free-sync-demo@1",
  collection: COLLECTION_NAME,
  modes: ["Default"],
  tokens: [
    { name: "color/background", type: "COLOR", values: { Default: "#F8FAFC" } },
    { name: "color/surface", type: "COLOR", values: { Default: "#FFFFFF" } },
    { name: "color/text", type: "COLOR", values: { Default: "#0F172A" } },
    { name: "color/action", type: "COLOR", values: { Default: "#4F46E5" } },
    { name: "spacing/card", type: "FLOAT", values: { Default: 24 } },
    { name: "radius/card", type: "FLOAT", values: { Default: 16 } }
  ]
};

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "create-demo") {
      const result = await importTokens(DEMO);
      await createPreview(result.variables);
      figma.ui.postMessage({ type: "json", data: DEMO, message: "Демо создано" });
    }
    if (message.type === "export") {
      const data = await exportTokens();
      figma.ui.postMessage({ type: "json", data, message: "Variables экспортированы" });
    }
    if (message.type === "import") {
      const data = JSON.parse(message.json);
      await importTokens(data);
      figma.ui.postMessage({ type: "json", data: await exportTokens(), message: "Variables обновлены" });
    }
  } catch (error) {
    figma.ui.postMessage({ error: true, message: error instanceof Error ? error.message : String(error) });
  }
};

async function findCollection(name) {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.find((item) => item.name === name);
}

async function importTokens(data) {
  validate(data);
  let collection = await findCollection(data.collection);
  if (!collection) collection = figma.variables.createVariableCollection(data.collection);

  const modeIds = {};
  const existingModes = new Map(collection.modes.map((mode) => [mode.name, mode.modeId]));
  const firstMode = collection.modes[0];
  if (!existingModes.has(data.modes[0])) {
    collection.renameMode(firstMode.modeId, data.modes[0]);
    modeIds[data.modes[0]] = firstMode.modeId;
  }
  for (const modeName of data.modes) {
    modeIds[modeName] = modeIds[modeName] || existingModes.get(modeName) || collection.addMode(modeName);
  }

  const existingVariables = await figma.variables.getLocalVariablesAsync();
  const byName = new Map(existingVariables.filter((item) => item.variableCollectionId === collection.id).map((item) => [item.name, item]));
  const variables = {};
  for (const token of data.tokens) {
    let variable = byName.get(token.name);
    if (variable && variable.resolvedType !== token.type) throw new Error(`Тип ${token.name} уже отличается в Figma`);
    if (!variable) variable = figma.variables.createVariable(token.name, collection, token.type);
    for (const modeName of data.modes) variable.setValueForMode(modeIds[modeName], decodeValue(token.type, token.values[modeName]));
    variables[token.name] = variable;
  }
  return { collection, variables };
}

async function exportTokens() {
  const collection = await findCollection(COLLECTION_NAME);
  if (!collection) throw new Error(`Коллекция ${COLLECTION_NAME} не найдена`);
  const variables = await figma.variables.getLocalVariablesAsync();
  const local = variables.filter((item) => item.variableCollectionId === collection.id);
  return {
    format: "figma-free-sync-demo@1",
    collection: collection.name,
    modes: collection.modes.map((mode) => mode.name),
    tokens: local.map((variable) => ({
      name: variable.name,
      type: variable.resolvedType,
      values: Object.fromEntries(collection.modes.map((mode) => [mode.name, encodeValue(variable.resolvedType, variable.valuesByMode[mode.modeId])]))
    }))
  };
}

async function createPreview(variables) {
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Semi Bold" })
  ]);
  const page = figma.currentPage;
  const old = page.findOne((node) => node.name === "Token Sync Demo Preview");
  if (old) old.remove();

  const frame = figma.createFrame();
  frame.name = "Token Sync Demo Preview";
  frame.resize(720, 460);
  frame.x = figma.viewport.center.x - 360;
  frame.y = figma.viewport.center.y - 230;
  frame.layoutMode = "VERTICAL";
  frame.paddingTop = 48;
  frame.paddingRight = 48;
  frame.paddingBottom = 48;
  frame.paddingLeft = 48;
  frame.itemSpacing = 24;
  frame.fills = [boundPaint("#F8FAFC", variables["color/background"])];

  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Semi Bold" };
  title.fontSize = 32;
  title.characters = "Figma ↔ Git tokens";
  title.fills = [boundPaint("#0F172A", variables["color/text"])];
  frame.appendChild(title);

  const card = figma.createFrame();
  card.name = "Card";
  card.resize(624, 260);
  card.layoutMode = "VERTICAL";
  card.paddingTop = 24;
  card.paddingRight = 24;
  card.paddingBottom = 24;
  card.paddingLeft = 24;
  card.itemSpacing = 18;
  card.cornerRadius = 16;
  card.fills = [boundPaint("#FFFFFF", variables["color/surface"])];
  frame.appendChild(card);

  const description = figma.createText();
  description.fontName = { family: "Inter", style: "Regular" };
  description.fontSize = 18;
  description.characters = "Измените color/action в Variables, экспортируйте JSON и запустите генерацию в репозитории.";
  description.resize(560, 52);
  description.textAutoResize = "HEIGHT";
  description.fills = [boundPaint("#0F172A", variables["color/text"])];
  card.appendChild(description);

  const button = figma.createFrame();
  button.name = "Primary button";
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisSizingMode = "AUTO";
  button.counterAxisSizingMode = "AUTO";
  button.paddingTop = 12;
  button.paddingRight = 18;
  button.paddingBottom = 12;
  button.paddingLeft = 18;
  button.cornerRadius = 10;
  button.fills = [boundPaint("#4F46E5", variables["color/action"])];
  const buttonText = figma.createText();
  buttonText.fontName = { family: "Inter", style: "Semi Bold" };
  buttonText.fontSize = 15;
  buttonText.characters = "Test token sync";
  buttonText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  button.appendChild(buttonText);
  card.appendChild(button);

  page.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

function boundPaint(fallbackHex, variable) {
  return figma.variables.setBoundVariableForPaint({ type: "SOLID", color: hexToRgb(fallbackHex) }, "color", variable);
}

function decodeValue(type, value) {
  if (type === "COLOR") return hexToRgb(value);
  return value;
}

function encodeValue(type, value) {
  if (value && value.type === "VARIABLE_ALIAS") return { alias: value.id };
  if (type === "COLOR") return rgbToHex(value);
  return value;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Некорректный цвет: ${hex}`);
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255
  };
}

function rgbToHex(color) {
  const channel = (value) => Math.round(value * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function validate(data) {
  if (data?.format !== "figma-free-sync-demo@1") throw new Error("Неподдерживаемый формат JSON");
  if (!data.collection || !Array.isArray(data.modes) || data.modes.length === 0) throw new Error("Не указаны collection или modes");
  if (!Array.isArray(data.tokens)) throw new Error("tokens должен быть массивом");
  for (const token of data.tokens) {
    if (!token.name || !["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(token.type)) throw new Error(`Некорректный токен: ${token.name || "без имени"}`);
    for (const mode of data.modes) if (!(mode in token.values)) throw new Error(`Нет значения ${mode} для ${token.name}`);
  }
}
