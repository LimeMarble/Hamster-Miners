const fs = require("node:fs");
const path = require("node:path");
const SCRIPT_FILES = [
  "game-data.js",
  "game-state.js",
  "factory-logistics.js",
  "factory-building.js",
  "mining.js",
  "game-ui.js",
  "game.js",
];

module.exports = function loadGame() {
  const gameModule = { exports: {} };
  const source = SCRIPT_FILES.map((filename) => (
    fs.readFileSync(path.join(__dirname, "..", filename), "utf8")
  )).join("\n");
  const marker = "__HAMSTER_MINERS_VM_BOOT__";
  const hadMarker = Object.prototype.hasOwnProperty.call(global, marker);
  const oldMarker = global[marker];
  global[marker] = true;

  try {
    const executeGame = new Function(
      "module",
      "exports",
      "require",
      "__filename",
      "__dirname",
      source,
    );
    executeGame(
      gameModule,
      gameModule.exports,
      require,
      path.join(__dirname, "..", "game.js"),
      path.join(__dirname, ".."),
    );
  } finally {
    if (hadMarker) {
      global[marker] = oldMarker;
    } else {
      delete global[marker];
    }
  }

  return gameModule.exports;
};
