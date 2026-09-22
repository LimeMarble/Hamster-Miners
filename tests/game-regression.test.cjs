const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

global.window = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};

const game = require("../game.js");

function machine(id, instanceId, column, row, orientation = "right") {
  return {
    ...game.MACHINE_LAYOUT[id],
    id,
    instanceId,
    column,
    row,
    orientation,
  };
}

function freshState(overrides = {}) {
  const state = game.createInitialState();
  Object.assign(state, overrides);
  game.__setState(state);
  return state;
}

test("Hamster Cloners notation rules remain stable", () => {
  assert.equal(game.formatNumber(999), "999");
  assert.equal(game.formatNumber(1000), "1.00k");
  assert.equal(game.formatNumber(1.234e4), "12.3k");
  assert.equal(game.formatNumber(1e303), "1.00e303");
  assert.equal(game.formatCash(1.25e3), "$1.25k");
});

test("main and beta deployments use isolated browser save keys", () => {
  const originalLocation = global.window.location;
  try {
    global.window.location = { pathname: "/hamster-miners/" };
    assert.equal(game.getActiveSaveKey(), "hamster-miners-save");

    global.window.location = { pathname: "/hamster-miners/beta/" };
    assert.equal(game.getActiveSaveKey(), "hamster-miners-save-beta");
    assert.equal(game.getSaveKeyForPath("/hamster-miners/beta/index.html"), "hamster-miners-save-beta");

    global.window.location = { pathname: "/hamster-miners/beta-preview/" };
    assert.equal(game.getActiveSaveKey(), "hamster-miners-save");
  } finally {
    global.window.location = originalLocation;
  }
});

test("GitHub Pages deploy workflow publishes main at root and beta below /beta", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "deploy-pages.yml"),
    "utf8",
  );
  assert.match(workflow, /- main\s+- beta/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /ref: beta/);
  assert.match(workflow, /source\/main\/ _site\//);
  assert.match(workflow, /source\/beta\/ _site\/beta\//);
});

test("simulation keeps its deliberate 10 FPS cadence", () => {
  assert.equal(game.CONFIG.simulationFramesPerSecond, 10);
  assert.equal(game.CONFIG.factoryRenderFramesPerSecond, 10);
});

test("unchanged status text does not trigger another DOM text replacement", () => {
  let currentText = "stable status";
  let writes = 0;
  const element = Object.defineProperty({}, "textContent", {
    get: () => currentText,
    set: (value) => {
      writes += 1;
      currentText = value;
    },
  });

  assert.equal(game.setTextContentIfChanged(element, "stable status"), false);
  assert.equal(writes, 0);
  assert.equal(game.setTextContentIfChanged(element, "changed status"), true);
  assert.equal(currentText, "changed status");
  assert.equal(writes, 1);
});

test("fractional cargo labels hide binary floating-point tails without mutating quantity", () => {
  const fractionalStack = { quantity: 1.20000000000002 };
  assert.equal(game.formatQuantity(fractionalStack.quantity), "1.2");
  assert.equal(game.formatQuantity(1.23456789), "1.23456789");
  assert.equal(game.formatQuantity(0.4), "0.4");
  assert.equal(fractionalStack.quantity, 1.20000000000002);
});

test("machine categories cover the catalogue and preserve dual-purpose machines", () => {
  for (const machineId of Object.keys(game.MACHINE_PURCHASES)) {
    const categories = game.getMachineCategories(machineId);
    assert.ok(categories.length > 0, `${machineId} should have a category`);
    assert.ok(
      categories.every((category) => game.MACHINE_CATEGORY_ORDER.includes(category)),
      `${machineId} should only use known categories`,
    );
  }

  assert.deepEqual(game.getMachineCategories("contactMaker"), ["material", "cash"]);
  assert.deepEqual(game.getMachineCategories("graphiteCopperAnnealer"), ["ammo", "cash"]);
  assert.equal(game.machineBelongsToCategory("contactMaker", "material"), true);
  assert.equal(game.machineBelongsToCategory("contactMaker", "cash"), true);
  assert.equal(game.machineBelongsToCategory("graphiteCopperAnnealer", "ammo"), true);
  assert.equal(game.machineBelongsToCategory("graphiteCopperAnnealer", "cash"), true);
});

test("hidden shop cards stay hidden despite the construction card display rule", () => {
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(styles, /\.construction-card\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test("inventory detail placement keeps the conveyor tutorial selection flow", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(
    source,
    /function selectInventoryMachineForPlacement\(machineId\)\s*\{\s*if \(machineId === "conveyor"\)\s*\{\s*selectConveyorForPlacement\(\);/s,
  );
  assert.match(
    source,
    /elements\.inventoryDetailPlaceButton\.addEventListener\("click", \(\) => \{\s*if \(selectedInventoryMachineId\) \{\s*selectInventoryMachineForPlacement\(selectedInventoryMachineId\);/s,
  );
});

test("crew hiring uses the agreed escalating cash price", () => {
  const state = freshState({ cash: 5e3 });
  assert.equal(game.getHiredCrewCount(), 0);
  assert.equal(game.getCrewHireCost(), 5e3);
  assert.equal(game.canAffordCrewHire(), true);
  assert.equal(game.hireCrew(), true);
  assert.equal(state.crew.total, 11);
  assert.equal(state.cash, 0);
  assert.equal(game.getHiredCrewCount(), 1);
  assert.equal(game.getCrewHireCost(), 6e3);
  assert.equal(game.canAffordCrewHire(), false);
});

test("expanded factory keeps the starter layout upper-center and migrates old saves", () => {
  assert.equal(game.FACTORY_COLUMNS, 50);
  assert.equal(game.FACTORY_ROWS, 30);
  assert.equal(game.FACTORY_STARTER_COLUMN_OFFSET, 17);
  const fresh = game.createInitialState();
  assert.equal(fresh.machines.find(({ id }) => id === "planter").column, 23);

  const old = game.createInitialState();
  delete old.factoryLayoutVersion;
  old.machines = [machine("planter", "legacy-planter", 6, 10)];
  const migrated = game.hydrateSavedState(old);
  assert.equal(migrated.machines[0].column, 23);
  assert.equal(migrated.factoryLayoutVersion, 2);
});

test("factory conveyor topology is reused until the layout changes", () => {
  const state = freshState();
  const firstTopology = game.getFactoryConveyors();
  assert.strictEqual(game.getFactoryConveyors(), firstTopology);

  state.placedConveyors.push({ column: 0, row: 3, direction: "right" });
  game.__setState(state);
  const changedTopology = game.getFactoryConveyors();
  assert.notStrictEqual(changedTopology, firstTopology);
  assert.equal(changedTopology.length, firstTopology.length + 1);
  assert.strictEqual(game.getConveyorAt(0, 3), state.placedConveyors.at(-1));
});

test("stacker and splitter ghost ports sit below real belts and cargo", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  const floorBody = source.match(/function drawMachineFloor\(scene\) \{([\s\S]*?)\n\}\n\nfunction/);
  const liquidPortBody = source.match(/function drawMachineLiquidPorts\(graphics\) \{([\s\S]*?)\n\}\n\nfunction/);
  assert.ok(floorBody, "machine floor renderer should exist");
  assert.ok(liquidPortBody, "liquid port renderer should exist");

  const floor = floorBody[1];
  const stackerGhost = floor.indexOf('drawStackerPorts(floor, stacker)');
  const splitterGhost = floor.indexOf('drawSplitterPorts(floor, splitter)');
  const placedBelts = floor.indexOf("state.placedConveyors.forEach");
  const fixedBelts = floor.indexOf("getActiveFixedConveyors().forEach");
  assert.ok(stackerGhost >= 0 && splitterGhost >= 0, "both machines should draw faint port guides");
  assert.ok(stackerGhost < placedBelts && splitterGhost < placedBelts);
  assert.ok(stackerGhost < fixedBelts && splitterGhost < fixedBelts);
  assert.match(source, /function drawStackerPorts\(graphics, stacker, options = \{\}\)[\s\S]*?opacity = 0\.24/);
  assert.match(source, /function drawSplitterPorts\(graphics, splitter, options = \{\}\)[\s\S]*?opacity = 0\.24/);
  assert.doesNotMatch(liquidPortBody[1], /draw(?:Stacker|Splitter)Ports/);
});

test("factory machine-control signatures ignore process countdown ticks", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-controls", 5, 5);
  const state = freshState({
    machines: [furnace],
    arcFurnaceJobs: [{ furnaceInstanceId: furnace.instanceId, secondsRemaining: 12 }],
  });
  const initialSignature = game.getFactoryMachineProgressState(furnace);

  state.arcFurnaceJobs[0].secondsRemaining = 11.9;
  assert.equal(game.getFactoryMachineProgressState(furnace), initialSignature);
  state.arcFurnaceJobs = [];
  assert.notEqual(game.getFactoryMachineProgressState(furnace), initialSignature);

  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(
    source,
    /if \(signature === lastFactoryControlsSignature\) \{\s*updateMachineActionProgressNote\(machine\);\s*return;/,
  );
});

test("factory marquee selection moves a group without changing relative positions", () => {
  const planter = machine("planter", "group-planter", 10, 5);
  const duster = machine("leekDuster", "group-duster", 13, 6);
  const state = freshState({ machines: [planter, duster] });

  game.selectFactoryEntitiesInRectangle({ column: 9, row: 4 }, { column: 14, row: 8 });
  assert.equal(game.__getFactorySelection().length, 2);
  assert.equal(game.beginGroupMove(), true);
  assert.equal(game.completeGroupMove(20, 10), true);
  assert.deepEqual(
    state.machines.map(({ id, column, row }) => ({ id, column, row })),
    [
      { id: "planter", column: 20, row: 10 },
      { id: "leekDuster", column: 23, row: 11 },
    ],
  );
});

test("factory multi-pickup returns selected conveyors and recovers their cargo", () => {
  const first = {
    column: 10,
    row: 5,
    direction: "right",
    item: { kind: "material", material: "copper", quantity: 2 },
  };
  const second = {
    column: 11,
    row: 5,
    direction: "right",
    item: { kind: "material", material: "clay", quantity: 1 },
  };
  const state = freshState({ placedConveyors: [first, second] });
  const copperBefore = state.stockpile.copper;
  const clayBefore = state.stockpile.clay;

  game.__setFactorySelection([
    { type: "conveyor", column: first.column, row: first.row },
    { type: "conveyor", column: second.column, row: second.row },
  ]);
  game.pickUpSelectedFactoryEntities();

  assert.equal(state.placedConveyors.length, 0);
  assert.equal(state.machineInventory.conveyor, 22);
  assert.equal(state.stockpile.copper, copperBefore + 2);
  assert.equal(state.stockpile.clay, clayBefore + 1);
});

test("loaded saves receive Cast Iron Drill and preserve it in tunnel snapshots", () => {
  const saved = game.createInitialState();
  saved.drill.upgradeId = "basic";
  saved.mine.tunnelProgress = {
    2: {
      currentLayer: 1,
      drill: { upgradeId: "basic" },
    },
  };
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.drill.upgradeId, "castIron");
  assert.equal(hydrated.mine.tunnelProgress[2].drill.upgradeId, "castIron");
});

test("old saves migrate monetary state to the reduced cash scale once", () => {
  const saved = game.createInitialState();
  delete saved.cashEconomyVersion;
  saved.cash = 1e3;
  saved.internalConveyorItems = {
    "test:0": { kind: "material", material: "copperIngot", saleValueBase: 20 },
  };
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.cash, 100);
  assert.equal(hydrated.internalConveyorItems["test:0"].saleValueBase, 2);
  assert.equal(game.hydrateSavedState(hydrated).cash, 100);
});

test("mining definitions preserve the agreed deposit durability and yields", () => {
  assert.deepEqual(game.RESOURCE_DEFINITIONS.copper, {
    label: "Malachite ore",
    shortLabel: "Cu",
    segments: 3,
    hitPointsPerSegment: 5,
    yield: 2,
    stockpileKey: "copper",
  });
  assert.equal(game.RESOURCE_DEFINITIONS.nativeCopper.hitPointsPerSegment, 15);
  assert.equal(game.RESOURCE_DEFINITIONS.nativeCopper.segments, 3);
  assert.equal(game.RESOURCE_DEFINITIONS.clay.yield, 3);
  assert.equal(game.RESOURCE_DEFINITIONS.lead.segments, 5);
  assert.equal(game.RESOURCE_DEFINITIONS.lead.hitPointsPerSegment, 10);
  assert.equal(game.RESOURCE_DEFINITIONS.graphite.segments, 6);
  assert.equal(game.RESOURCE_DEFINITIONS.graphite.hitPointsPerSegment, 8);
  assert.equal(game.RESOURCE_DEFINITIONS.graphite.yield, 2);
  assert.deepEqual(game.RESOURCE_DEFINITIONS.tin, {
    label: "Tin ore",
    shortLabel: "Sn",
    segments: 3,
    hitPointsPerSegment: 100,
    yield: 3,
    stockpileKey: "tin",
  });
  assert.deepEqual(game.LOW_MELTING_METAL_ORES, ["copper", "nativeCopper", "lead", "silver", "tin", "zinc"]);
});

test("deposits receive their material-specific segment health", () => {
  const nativeCopper = game.createDeposit({ cell: 0, type: "nativeCopper" }, 0);
  assert.equal(nativeCopper.segmentsRemaining, 3);
  assert.equal(nativeCopper.currentSegmentHitPoints, 15);
  assert.equal(nativeCopper.hitPointsPerSegment, 15);
});

test("mine layers, host rocks, and yield growth match the current tunnel rules", () => {
  assert.deepEqual(game.getLayerStats(1, 1), {
    band: 1,
    layerInBand: 1,
    hitPoints: 100,
    yieldMultiplier: 1,
  });
  assert.equal(game.getLayerStats(1, 2).hitPoints, 250);
  assert.equal(game.getHostRockMaterial(1), "limestone");
  assert.equal(game.getHostRockMaterial(2), "granite");
  assert.equal(game.getLayerStats(51, 1).yieldMultiplier, 1.25 ** 4 * 1.1);
});

test("Tunnel 3 uses alternating Hematite and Chert bands with a Kimberlite cap band", () => {
  const state = freshState();
  state.mine.currentTunnel = 3;
  state.mine.currentLayer = 1;
  assert.deepEqual(game.CONFIG.tunnelRealityCaps, { 1: 30, 2: 30, 3: 20 });
  assert.equal(game.getTunnelLayerFormation(1, 3), "hematite");
  assert.equal(game.getTunnelLayerFormation(2, 3), "hematite");
  assert.equal(game.getTunnelLayerFormation(11, 3), "chert");
  assert.equal(game.getHostRockMaterial(3, 1, 1), "hematite");
  assert.equal(game.getHostRockMaterial(3, 2, 11), "chert");
  assert.equal(game.getHostRockMaterial(3, 20, 191), "kimberlite");
  assert.equal(game.getHostRockMaterial(3, 21, 201), "kimberlite");
  assert.equal(game.getLayerStats(1, 3).hitPoints, 1e5);
  assert.equal(game.getLayerStats(2, 3).hitPoints, 1.05e5);
  assert.equal(game.getLayerStats(191, 3).band, 20);
  assert.equal(game.getLayerStats(191, 3).hitPoints, Math.ceil(1e5 * (1.32 ** 19)));
  assert.equal(game.getLayerStats(191, 3).yieldMultiplier, 1);
  assert.equal(game.getSpawnPoolForBand(1, 3).length, 0);
  const firstChertBand = game.getSpawnPoolForBand(2, 3);
  assert.equal(firstChertBand.length, 10);
  assert.equal(firstChertBand.filter(({ type }) => type === "quartz").length, 10);
  assert.equal(new Set(firstChertBand.map(({ cell }) => cell)).size, 10);
  assert.deepEqual(game.RESOURCE_DEFINITIONS.quartz, {
    label: "Quartz",
    shortLabel: "Qz",
    segments: 7,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "quartz",
  });
  assert.equal(game.getDepositYieldMultiplier("quartz", 2, 3), 1);
  assert.equal(game.getSpawnPoolForBand(3, 3).length, 0);
  assert.equal(game.getSpawnPoolForBand(20, 3).length, 0);
  assert.equal(game.getHostRockYield(3, 1), 20);
  assert.equal(game.getHostRockYield(3, 2), 0);
  assert.equal(game.getHostRockYield(3, 3), 24);
  assert.equal(game.getHostRockYield(3, 20), 0);
  state.mine.unlockedTunnels = [1, 2];
  state.mine.tunnelThreeRightsPurchased = false;
  state.cash = 7.99999e5;
  assert.equal(game.canBuyTunnelThreeRights(), false);
  state.cash = 8e5;
  assert.equal(game.canBuyTunnelThreeRights(), true);
});

test("host-rock digging yield increases additively by tunnel and band", () => {
  assert.equal(game.getHostRockYield(1, 1), 30);
  assert.equal(game.getHostRockYield(1, 5), 50);
  assert.equal(game.getHostRockYield(1, 30), 175);
  assert.equal(game.getHostRockYield(2, 1), 40);
  assert.equal(game.getHostRockYield(2, 5), 72);
  assert.equal(game.getHostRockYield(2, 30), 272);
});

test("spawn pools change only at the specified band threshold", () => {
  const firstBand = game.getSpawnPoolForBand(1, 1);
  assert.deepEqual(new Set(firstBand.map(({ type }) => type)), new Set(["copper", "clay"]));
  assert.equal(firstBand.length, 24);

  const bandFive = game.getSpawnPoolForBand(5, 1);
  assert.equal(bandFive.filter(({ type }) => type === "clay").length, 10);
  assert.equal(bandFive.filter(({ type }) => type === "copper").length, 8);
  assert.equal(bandFive.filter(({ type }) => type === "lead").length, 6);

  const bandTen = game.getSpawnPoolForBand(10, 1);
  assert.equal(bandTen.filter(({ type }) => type === "clay").length, 10);
  assert.equal(bandTen.filter(({ type }) => type === "copper").length, 8);
  assert.equal(bandTen.filter(({ type }) => type === "lead").length, 6);
  assert.equal(bandTen.filter(({ type }) => type === "silver").length, 0);

  const bandTwelve = game.getSpawnPoolForBand(12, 1);
  assert.equal(bandTwelve.filter(({ type }) => type === "clay").length, 6);
  assert.equal(bandTwelve.filter(({ type }) => type === "copper").length, 8);
  assert.equal(bandTwelve.filter(({ type }) => type === "lead").length, 8);
  assert.equal(bandTwelve.filter(({ type }) => type === "silver").length, 4);
  assert.deepEqual(game.RESOURCE_DEFINITIONS.silver, {
    label: "Silver ore",
    shortLabel: "Ag",
    segments: 4,
    hitPointsPerSegment: 50,
    yield: 2,
    stockpileKey: "silver",
  });

  const bandSixteen = game.getSpawnPoolForBand(16, 1);
  assert.equal(bandSixteen.filter(({ type }) => type === "clay").length, 2);
  assert.equal(bandSixteen.filter(({ type }) => type === "copper").length, 8);
  assert.equal(bandSixteen.filter(({ type }) => type === "lead").length, 6);
  assert.equal(bandSixteen.filter(({ type }) => type === "silver").length, 6);

  const bandTwenty = game.getSpawnPoolForBand(20, 1);
  assert.equal(bandTwenty.filter(({ type }) => type === "clay").length, 0);
  assert.equal(bandTwenty.filter(({ type }) => type === "copper").length, 8);
  assert.equal(bandTwenty.filter(({ type }) => type === "lead").length, 6);
  assert.equal(bandTwenty.filter(({ type }) => type === "silver").length, 8);

  const bandTwentyFour = game.getSpawnPoolForBand(24, 1);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "copper").length, 4);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "lead").length, 4);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "silver").length, 6);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "beryl").length, 0);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "rawAquamarine").length, 0);
  assert.equal(bandTwentyFour.filter(({ type }) => type === "rawEmerald").length, 0);
  assert.equal(new Set(bandTwentyFour.map(({ cell }) => cell)).size, bandTwentyFour.length);
  const bandTwentyFive = game.getSpawnPoolForBand(25, 1);
  assert.equal(bandTwentyFive.filter(({ type }) => type === "zinc").length, 4);
  assert.equal(bandTwentyFive.filter(({ type }) => type === "beryl").length, 0);
  assert.equal(game.RESOURCE_DEFINITIONS.beryl.yield, 2);
  assert.equal(game.RESOURCE_DEFINITIONS.rawAquamarine.yield, 1);
  assert.equal(game.RESOURCE_DEFINITIONS.rawEmerald.yield, 1);
  assert.equal(game.getDepositYieldMultiplier("silver", 11, 1), 1);
  assert.equal(game.getDepositYieldMultiplier("silver", 12, 1), 1);
  assert.equal(game.getDepositYieldMultiplier("silver", 13, 1), 1.1);
  assert.equal(game.getDepositYieldMultiplier("graphite", 4, 2), 1);
  assert.equal(game.getDepositYieldMultiplier("beryl", 24, 1), 1);
  assert.equal(game.getSaleValue("silver"), 8.5);

  const tunnelTwo = game.getSpawnPoolForBand(1, 2);
  assert.equal(tunnelTwo.filter(({ type }) => type === "nativeCopper").length, 10);
  assert.equal(tunnelTwo.filter(({ type }) => type === "clay").length, 10);

  const tunnelTwoBandFour = game.getSpawnPoolForBand(4, 2);
  assert.equal(tunnelTwoBandFour.filter(({ type }) => type === "clay").length, 8);
  assert.equal(tunnelTwoBandFour.filter(({ type }) => type === "nativeCopper").length, 8);
  assert.equal(tunnelTwoBandFour.filter(({ type }) => type === "graphite").length, 4);

  const tunnelTwoBandTen = game.getSpawnPoolForBand(10, 2);
  assert.equal(tunnelTwoBandTen.filter(({ type }) => type === "clay").length, 4);
  assert.equal(tunnelTwoBandTen.filter(({ type }) => type === "nativeCopper").length, 8);
  assert.equal(tunnelTwoBandTen.filter(({ type }) => type === "graphite").length, 6);
  assert.equal(tunnelTwoBandTen.filter(({ type }) => type === "tin").length, 4);

  const tunnelTwoBandFifteen = game.getSpawnPoolForBand(15, 2);
  assert.equal(tunnelTwoBandFifteen.filter(({ type }) => type === "nativeCopper").length, 8);
  assert.equal(tunnelTwoBandFifteen.filter(({ type }) => type === "graphite").length, 6);
  assert.equal(tunnelTwoBandFifteen.filter(({ type }) => type === "tin").length, 8);
  assert.equal(game.getDepositYieldMultiplier("tin", 10, 2), 1);

  const tunnelTwoBandTwentyFour = game.getSpawnPoolForBand(24, 2);
  assert.equal(tunnelTwoBandTwentyFour.filter(({ type }) => type === "beryl").length, 0);
  const tunnelTwoBandTwentyFive = game.getSpawnPoolForBand(25, 2);
  assert.equal(tunnelTwoBandTwentyFive.filter(({ type }) => type === "beryl").length, 6);
  assert.equal(tunnelTwoBandTwentyFive.filter(({ type }) => type === "rawAquamarine").length, 1);
  assert.equal(tunnelTwoBandTwentyFive.find(({ type }) => type === "rawAquamarine").chance, 1);
  assert.equal(tunnelTwoBandTwentyFive.find(({ type }) => type === "rawEmerald").chance, 0.2);
});

test("tunnel and automation unlocks hydrate from their intended progress", () => {
  const saved = game.createInitialState();
  saved.mine.miningRightsPurchased = true;
  saved.mine.completedBandsByTunnel = { 1: 1, 2: 5 };
  saved.mine.selectedAmmoMaterial = "copper";
  const hydrated = game.hydrateSavedState(saved);

  assert.ok(hydrated.mine.unlockedTunnels.includes(2));
  assert.equal(hydrated.mine.autoDrillUnlocked, true);
  assert.equal(hydrated.mine.autoRemineUnlocked, true);
  assert.equal(hydrated.mine.autoProgressionUnlocked, true);
  assert.equal(hydrated.mine.autoContinueEnabled, false);
  assert.equal(hydrated.mine.selectedAmmoMaterial, "copper");
});

test("both tunnels switch to ×1.32 band HP growth after Band 5", () => {
  assert.equal(game.getLayerStats(51, 1).hitPoints, Math.ceil(100 * (2 ** 4) * 1.32));
  assert.equal(game.getLayerStats(51, 2).hitPoints, Math.ceil(250 * (2.5 ** 4) * 1.32));
  assert.equal(game.getLayerStats(61, 2).hitPoints, Math.ceil(250 * (2.5 ** 4) * (1.32 ** 2)));
  assert.equal(game.CONFIG.remineHitPointDivisor, 5);
});

test("Clay Kilns accept Lead ore as a low-melting metal", () => {
  const kiln = machine("clayKiln", "kiln-lead", 2, 2);
  freshState({ machines: [kiln], kilnInputs: [] });
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "lead", quantity: 1 }, 2, 3), true);
});

test("Mini Electric Arc Furnace has the specified cost, footprint, and crew requirement", () => {
  const furnace = game.MACHINE_LAYOUT.miniElectricArcFurnace;
  assert.deepEqual(furnace.internalConveyors, [
    { column: 0, row: 1, direction: "right", arcFurnaceSlot: "primary" },
    { column: 1, row: 0, direction: "down", arcFurnaceSlot: "secondary" },
    { column: 1, row: 2, direction: "up", arcFurnaceSlot: "tertiary" },
  ]);
  assert.deepEqual(furnace.liquidOutput, { column: 2, row: 1, direction: "right" });
  assert.equal(furnace.mode, "smelting");
  const state = freshState({ cash: 1e5 });
  state.stockpile.graphite = 30;
  state.stockpile.copperIngot = 15;
  state.stockpile.wire = 100;
  state.stockpile.contact = 50;
  assert.equal(game.canAffordMachinePurchase("miniElectricArcFurnace"), true);
  assert.equal(game.getBusyCrew(), 0);
  state.arcFurnaceJobs = [{ furnaceInstanceId: "eaf", secondsRemaining: 2 }];
  assert.equal(game.getBusyCrew(), 1);
});

test("Mini Electric Arc Furnace makes six liquid Bronze from five copper and one tin in twelve seconds", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-bronze", 2, 2);
  furnace.mode = "alloy2";
  const molder = machine("ingotMolder", "molder-bronze", 5, 2);
  const state = freshState({
    machines: [furnace, molder],
    crew: { total: 2 },
    arcFurnaceInputs: {
      [furnace.instanceId]: {
        primary: [{ kind: "material", material: "copperIngot", quantity: 5, saleValueBase: 20 }],
        secondary: [{ kind: "material", material: "tinIngot", quantity: 1, saleValueBase: 30 }],
        tertiary: [],
      },
    },
    arcFurnaceJobs: [],
    molderJobs: [],
    moltenCopper: [],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.length, 1);
  assert.equal(state.arcFurnaceJobs[0].secondsRemaining, 12);
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary.length, 0);
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].secondary.length, 0);

  game.updateCrewOperatedMachines(12);
  assert.equal(state.arcFurnaceJobs.length, 0);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.molderJobs[0].material, "bronze");
  assert.equal(state.molderJobs[0].quantity, 1);
  assert.equal(state.moltenCopper[0].quantity, 5);

  game.updateCrewOperatedMachines(1);
  const output = state.internalConveyorItems[`${molder.instanceId}:0`];
  assert.equal(output.material, "bronzeIngot");
  assert.equal(output.quantity, 1);
  assert.equal(output.saleValueBase, 65 / 3);
});

test("Mini Electric Arc Furnace buffers two cycles of liquid output before pausing", () => {
  const bronzeFurnace = machine("miniElectricArcFurnace", "eaf-bronze-cap", 2, 2);
  bronzeFurnace.mode = "alloy2";
  const bronzeState = freshState({
    machines: [bronzeFurnace],
    crew: { total: 1 },
    arcFurnaceInputs: {
      [bronzeFurnace.instanceId]: {
        primary: [{ kind: "material", material: "copperIngot", quantity: 10 }],
        secondary: [{ kind: "material", material: "tinIngot", quantity: 2 }],
        tertiary: [],
      },
    },
    moltenCopper: [{
      kilnInstanceId: bronzeFurnace.instanceId,
      smelterInstanceId: bronzeFurnace.instanceId,
      material: "bronze",
      quantity: 6,
      sourceValue: 1,
      sourceValueIsEffective: true,
    }],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(bronzeState.arcFurnaceJobs[0].secondsRemaining, 12);
  game.updateCrewOperatedMachines(12);
  assert.equal(bronzeState.moltenCopper.reduce((sum, item) => sum + item.quantity, 0), 12);
  assert.equal(bronzeState.arcFurnaceJobs.length, 0);
  assert.equal(bronzeState.arcFurnaceInputs[bronzeFurnace.instanceId].primary[0].quantity, 5);

  const ironFurnace = machine("miniElectricArcFurnace", "eaf-iron-cap", 2, 2);
  const ironState = freshState({
    machines: [ironFurnace],
    crew: { total: 1 },
    arcFurnaceInputs: {
      [ironFurnace.instanceId]: {
        primary: [{ kind: "material", material: "hematite", quantity: 4 }],
        secondary: [],
        tertiary: [],
      },
    },
    moltenCopper: [{
      kilnInstanceId: ironFurnace.instanceId,
      smelterInstanceId: ironFurnace.instanceId,
      material: "iron",
      quantity: 1,
      sourceValue: 1,
      sourceValueIsEffective: true,
    }],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(ironState.arcFurnaceJobs[0].secondsRemaining, 4);
  game.updateCrewOperatedMachines(4);
  assert.equal(ironState.moltenCopper.reduce((sum, item) => sum + item.quantity, 0), 2);
  assert.equal(ironState.arcFurnaceJobs.length, 0);
  assert.equal(ironState.arcFurnaceInputs[ironFurnace.instanceId].primary[0].quantity, 2);
});

test("Ingot Molder uses its internal lane as a buffer instead of waiting for the next belt", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-molder-rate", 2, 2);
  const molder = machine("ingotMolder", "molder-rate", 5, 2);
  const sellTube = machine("sellTube", "sell-molder-rate", 7, 2);
  const state = freshState({
    machines: [furnace, molder, sellTube],
    placedConveyors: [{ column: 6, row: 3, direction: "right" }],
    crew: { total: 1 },
    molderJobs: [],
    moltenCopper: [{
      kilnInstanceId: furnace.instanceId,
      smelterInstanceId: furnace.instanceId,
      material: "bronze",
      quantity: 2,
      sourceValue: 65 / 3,
      sourceValueIsEffective: true,
    }],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.moltenCopper[0].quantity, 1);

  game.updateCrewOperatedMachines(1);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.moltenCopper.length, 0);
  assert.equal(state.internalConveyorItems[`${molder.instanceId}:0`].quantity, 1);

  game.updateFactory(1);
  assert.equal(state.internalConveyorItems[`${molder.instanceId}:0`], null);
  assert.equal(state.placedConveyors[0].item.quantity, 1);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.moltenCopper.length, 0);

  game.updateCrewOperatedMachines(1);
  assert.equal(state.placedConveyors[0].item.quantity, 1);
  assert.equal(state.internalConveyorItems[`${molder.instanceId}:0`].material, "bronzeIngot");
  assert.equal(state.molderJobs.length, 0);
});

test("Ingot Molder queues one ingot while blocked and pauses when that queue is full", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-molder-blocked", 2, 2);
  const molder = machine("ingotMolder", "molder-blocked", 5, 2);
  const state = freshState({
    machines: [furnace, molder],
    crew: { total: 2 },
    molderJobs: [],
    moltenCopper: [{
      kilnInstanceId: furnace.instanceId,
      smelterInstanceId: furnace.instanceId,
      material: "silver",
      quantity: 2,
      sourceValue: 8.5,
      sourceValueIsEffective: true,
    }],
    internalConveyorItems: {
      [`${molder.instanceId}:0`]: {
        kind: "material",
        material: "silverIngot",
        quantity: 1,
      },
    },
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.moltenCopper[0].quantity, 1);

  game.updateCrewOperatedMachines(1);
  assert.equal(state.molderJobs.length, 0);
  assert.equal(state.internalConveyorItems[`${molder.instanceId}:0`].material, "silverIngot");
  assert.equal(state.molderOutputBuffers[molder.instanceId].material, "silverIngot");

  game.updateCrewOperatedMachines(0);
  assert.equal(state.molderJobs.length, 0);
  assert.equal(state.moltenCopper[0].quantity, 1);
});

test("Ingot Molder preserves fractional liquid and consumes exactly one whole unit", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-fractional", 2, 2);
  const molder = machine("ingotMolder", "molder-fractional", 5, 2);
  const liquid = {
    kilnInstanceId: furnace.instanceId,
    smelterInstanceId: furnace.instanceId,
    material: "bronze",
    quantity: 0.4,
    sourceValue: 65 / 3,
    sourceValueIsEffective: true,
  };
  const state = freshState({
    machines: [furnace, molder],
    crew: { total: 1 },
    molderJobs: [],
    moltenCopper: [liquid],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.molderJobs.length, 0);
  assert.equal(liquid.quantity, 0.4);

  liquid.quantity = 1.4;
  game.updateCrewOperatedMachines(0);
  assert.equal(state.molderJobs.length, 1);
  assert.ok(Math.abs(liquid.quantity - 0.4) < 1e-12);
});

test("Mini Electric Arc Furnace alloy inputs accept full recipe quantities across ore and ingot forms", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-alloy", 0, 0);
  furnace.mode = "alloy2";
  const state = freshState({ machines: [furnace] });

  assert.equal(game.receiveConveyorItem({ kind: "material", material: "copper", quantity: 3 }, 0, 1), true);
  assert.equal(game.receiveConveyorItem({ kind: "material", material: "copperIngot", quantity: 2 }, 0, 1), true);
  assert.equal(game.receiveConveyorItem({ kind: "material", material: "tin", quantity: 1 }, 1, 0), true);

  const inputs = state.arcFurnaceInputs[furnace.instanceId];
  assert.equal(inputs.primary.length, 1);
  assert.equal(inputs.primary.reduce((sum, item) => sum + item.quantity, 0), 5);
  assert.equal(inputs.secondary.reduce((sum, item) => sum + item.quantity, 0), 1);
  assert.equal(inputs.tertiary.reduce((sum, item) => sum + item.quantity, 0), 0);
});

test("Mini Electric Arc Furnace keeps the empty 3-input mode separate from Bronze", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-alloy3", 0, 0);
  furnace.mode = "alloy3";
  freshState({ machines: [furnace] });

  assert.equal(game.receiveConveyorItem({ kind: "material", material: "copper", quantity: 5 }, 0, 1), false);
  assert.equal(game.receiveConveyorItem({ kind: "material", material: "tin", quantity: 1 }, 1, 0), false);
});

test("Bronze recipe waits for the alternate alloy inlet and consumes exact mixed inputs", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-alloy-exact", 0, 0);
  furnace.mode = "alloy2";
  const state = freshState({ machines: [furnace], crew: { total: 1 } });

  assert.equal(game.receiveConveyorItem({
    kind: "material", material: "copper", quantity: 3, saleValueBase: 2,
  }, 0, 1), true);
  assert.equal(game.receiveConveyorItem({
    kind: "material", material: "copperIngot", quantity: 2, saleValueBase: 8,
  }, 0, 1), true);
  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.length, 0, "copper alone must not start an alloy job");
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].quantity, 5);

  assert.equal(game.receiveConveyorItem({
    kind: "material", material: "tinIngot", quantity: 1, saleValueBase: 12,
  }, 1, 2), true);
  const inputsBeforeInspection = structuredClone(state.arcFurnaceInputs[furnace.instanceId]);
  const recipe = game.getArcFurnaceRecipe(furnace);
  assert.equal(recipe.outputMaterial, "bronze");
  assert.equal(recipe.outputQuantity, 6);
  assert.deepEqual(state.arcFurnaceInputs[furnace.instanceId], inputsBeforeInspection);

  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.length, 1);
  assert.equal(state.arcFurnaceJobs[0].secondsRemaining, 12);
  assert.equal(state.arcFurnaceJobs[0].quantity, 6);
  assert.deepEqual(state.arcFurnaceInputs[furnace.instanceId], {
    primary: [], secondary: [], tertiary: [],
  });
});

test("moving and saving a furnace preserves its mode, orientation, and instance", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-move-mode", 10, 10, "up");
  furnace.mode = "alloy3";
  const state = freshState({ machines: [furnace] });
  const selection = {
    type: "machine",
    id: furnace.id,
    instanceId: furnace.instanceId,
    column: furnace.column,
    row: furnace.row,
  };

  game.pickUpSelectedFactoryEntity(selection, true);
  assert.equal(state.machineInventory.miniElectricArcFurnace, 1);
  assert.equal(state.machineInventoryInstances[0].mode, "alloy3");

  const reloaded = game.hydrateSavedState(state);
  assert.equal(reloaded.machineInventoryInstances[0].mode, "alloy3");
  game.__setState(reloaded);
  game.placeMachine("miniElectricArcFurnace", 30, 15);

  const restoredFurnace = reloaded.machines.find(({ id }) => id === "miniElectricArcFurnace");
  assert.equal(restoredFurnace.instanceId, furnace.instanceId);
  assert.equal(restoredFurnace.mode, "alloy3");
  assert.equal(restoredFurnace.orientation, "up");
  assert.equal(reloaded.machineInventoryInstances.length, 0);
});

test("Recipes catalogue includes every implemented production branch", () => {
  const recipes = new Map(game.CRAFTING_RECIPES.map((recipe) => [recipe.name, recipe]));
  [
    "Leek Fiber",
    "Copper Wire",
    "Silver-Copper Contacts",
    "Leek Rapidfire Rounds",
    "Mineral-Coated Rapidfire Rounds",
    "Copper-Jacketed Rounds",
    "Liquid Metal",
    "Liquid Iron",
    "Ceramic",
    "Bronze",
    "Metal Ingots",
    "Metal Plates",
  ].forEach((name) => assert.equal(recipes.has(name), true));
  assert.match(recipes.get("Ceramic").input, /2 Clay/);
  assert.match(recipes.get("Bronze").output, /6 liquid Bronze/);
});

test("Mini Electric Arc Furnace preserves its selected mode when saves are hydrated", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-mode", 2, 3);
  furnace.mode = "alloy";
  const hydrated = game.hydrateSavedState({
    ...game.createInitialState(),
    machines: [furnace],
  });

  assert.equal(hydrated.machines[0].mode, "alloy2");
});

test("Mini Electric Arc Furnace mode switching is always enabled and discards only its own unfinished contents", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-switch", 2, 2);
  furnace.mode = "alloy2";
  const otherFurnace = machine("miniElectricArcFurnace", "arc-switch-other", 10, 2);
  const ceramicOutput = { kind: "material", material: "ceramic", quantity: 1 };
  const state = freshState({
    machines: [furnace, otherFurnace],
    arcFurnaceInputs: {
      [furnace.instanceId]: {
        primary: [{ kind: "material", material: "copperIngot", quantity: 5 }],
        secondary: [{ kind: "material", material: "tinIngot", quantity: 1 }],
        tertiary: [],
      },
      [otherFurnace.instanceId]: {
        primary: [{ kind: "material", material: "hematite", quantity: 2 }],
        secondary: [],
        tertiary: [],
      },
    },
    arcFurnaceJobs: [
      { furnaceInstanceId: furnace.instanceId, material: "bronze", quantity: 6, secondsRemaining: 3 },
      { furnaceInstanceId: otherFurnace.instanceId, material: "iron", quantity: 1, secondsRemaining: 2 },
    ],
    moltenCopper: [
      {
        kilnInstanceId: furnace.instanceId,
        smelterInstanceId: furnace.instanceId,
        material: "bronze",
        quantity: 6,
      },
      {
        kilnInstanceId: otherFurnace.instanceId,
        smelterInstanceId: otherFurnace.instanceId,
        material: "iron",
        quantity: 1,
      },
    ],
    arcFurnaceOutputBuffers: { [furnace.instanceId]: ceramicOutput },
  });

  assert.equal(game.switchArcFurnaceMode(furnace, "alloy3"), true);
  assert.equal(furnace.mode, "alloy3");
  assert.deepEqual(state.arcFurnaceInputs[furnace.instanceId], {
    primary: [], secondary: [], tertiary: [],
  });
  assert.deepEqual(state.arcFurnaceJobs.map((job) => job.furnaceInstanceId), [otherFurnace.instanceId]);
  assert.deepEqual(state.moltenCopper.map((item) => item.smelterInstanceId), [otherFurnace.instanceId]);
  assert.strictEqual(state.arcFurnaceOutputBuffers[furnace.instanceId], ceramicOutput);
  assert.equal(game.switchArcFurnaceMode(furnace, "alloy3"), false);

  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  const controls = source.match(/if \(machine\.id === "miniElectricArcFurnace"\) \{([\s\S]*?)\n  \}\n\n  if \(machine\.id === "metalPress"\)/);
  assert.ok(controls, "arc furnace controls should exist");
  assert.match(controls[1], /switchArcFurnaceMode\(machine, value\)/);
  assert.match(controls[1], /\n\s+selected,\n\s+\);/);
  assert.doesNotMatch(controls[1], /\boccupied\b/);
});

test("Mini Electric Arc Furnace single smelting accepts a stack and processes one unit", () => {
  const furnace = machine("miniElectricArcFurnace", "arc-single", 2, 2);
  furnace.mode = "smelting";
  const state = freshState({ machines: [furnace], crew: { total: 1 } });

  assert.equal(game.receiveConveyorItem({
    kind: "material",
    material: "silverIngot",
    quantity: 5,
    saleValueBase: 34,
  }, 2, 3), true);
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].quantity, 5);

  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.length, 1);
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary[0].quantity, 4);
});

test("Mini Electric Arc Furnace smelts two Hematite into one Iron in four seconds", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-iron", 2, 2);
  const molder = machine("ingotMolder", "molder-iron", 5, 2);
  const state = freshState({
    machines: [furnace, molder],
    crew: { total: 1 },
    arcFurnaceInputs: {
      [furnace.instanceId]: {
        primary: [{ kind: "material", material: "hematite", quantity: 2 }],
        secondary: [],
        tertiary: [],
      },
    },
    arcFurnaceJobs: [],
    molderJobs: [],
    moltenCopper: [],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs.length, 1);
  assert.equal(state.arcFurnaceJobs[0].inputCount, 2);
  assert.equal(state.arcFurnaceJobs[0].secondsRemaining, 4);
  assert.equal(state.arcFurnaceInputs[furnace.instanceId].primary.length, 0);

  game.updateCrewOperatedMachines(4);
  assert.equal(state.molderJobs.length, 1);
  assert.equal(state.molderJobs[0].material, "iron");

  game.updateCrewOperatedMachines(1);
  assert.equal(state.internalConveyorItems[`${molder.instanceId}:0`].material, "ironIngot");
});

test("Mini Electric Arc Furnace fires two Clay into one standalone Ceramic output", () => {
  const furnace = machine("miniElectricArcFurnace", "eaf-ceramic", 2, 2);
  const outputConveyor = { column: 5, row: 3, direction: "right", item: null };
  const state = freshState({
    machines: [furnace],
    crew: { total: 1 },
    placedConveyors: [outputConveyor],
    arcFurnaceInputs: {
      [furnace.instanceId]: {
        primary: [{ kind: "material", material: "clay", quantity: 2 }],
        secondary: [],
        tertiary: [],
      },
    },
    arcFurnaceJobs: [],
    moltenCopper: [],
  });

  game.updateCrewOperatedMachines(0);
  assert.equal(state.arcFurnaceJobs[0].secondsRemaining, 4);
  game.updateCrewOperatedMachines(4);
  assert.equal(state.arcFurnaceJobs.length, 0);
  assert.equal(state.moltenCopper.length, 0);
  assert.equal(outputConveyor.item.material, "ceramic");
  assert.equal(outputConveyor.item.quantity, 1);
});

test("Clay Kilns can re-smelt Bronze Ingots without applying the ore multiplier", () => {
  const kiln = machine("clayKiln", "kiln-bronze", 2, 2);
  const state = freshState({ machines: [kiln], crew: { total: 2 }, kilnInputs: [] });
  assert.equal(game.canReceiveConveyorItem({
    kind: "material",
    material: "bronzeIngot",
    quantity: 1,
    saleValueBase: 25,
  }, 2, 3), true);
  game.receiveConveyorItem({
    kind: "material",
    material: "bronzeIngot",
    quantity: 1,
    saleValueBase: 25,
  }, 2, 3);
  game.updateCrewOperatedMachines(0);
  assert.equal(state.kilnJobs.length, 1);
  game.updateCrewOperatedMachines(5);
  assert.equal(state.moltenCopper[0].material, "bronze");
  assert.equal(state.moltenCopper[0].sourceValueIsEffective, true);
  assert.equal(state.moltenCopper[0].sourceValue, 25);
});

test("Clay Kilns and Ingot Molders support Silver", () => {
  const kiln = machine("clayKiln", "kiln-silver", 2, 2);
  const molder = machine("ingotMolder", "molder-silver", 2, 4);
  const state = freshState({ machines: [kiln, molder], kilnInputs: [] });
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "silver", quantity: 1 }, 2, 3), true);

  game.completeMolderJob({
    molderInstanceId: molder.instanceId,
    material: "silver",
    sourceValue: 8.5,
  });
  const output = state.internalConveyorItems[`${molder.instanceId}:0`];
  assert.equal(output.material, "silverIngot");
  assert.equal(output.saleValueBase, 34);
});

test("Granite-Copper Annealer accepts fresh Silver Ingots", () => {
  const annealer = machine("graphiteCopperAnnealer", "annealer-silver", 4, 4);
  freshState({ machines: [annealer] });
  const processConveyor = {
    ...game.getInternalConveyorTiles(annealer)[2],
    internalMachineId: "graphiteCopperAnnealer",
    internalMachineInstanceId: annealer.instanceId,
    internalIndex: 2,
  };
  const ingot = {
    kind: "material",
    material: "silverIngot",
    quantity: 1,
    saleValueBase: 34,
    freshMoldedAt: Date.now(),
  };
  assert.equal(game.canItemLeaveConveyor(processConveyor, ingot), true);
  game.transformItemLeavingConveyor(processConveyor, ingot);
  assert.equal(ingot.annealedValueMultiplier, game.ANNEALER_MULTIPLIER);
});

test("Sell Tubes accept every sellable material, including Silver", () => {
  const sellTube = machine("sellTube", "sell-all", 2, 2);
  freshState({ machines: [sellTube] });
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "silver", quantity: 1 }, 2, 2), true);
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "lead", quantity: 1 }, 2, 2), false);
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "futureContact", quantity: 1, saleValueBase: 8.8 }, 2, 2), true);
});

test("machine instance ids are repaired uniquely on load", () => {
  const saved = game.createInitialState();
  saved.machines = [
    machine("clayKiln", "duplicate", 0, 0),
    machine("clayKiln", "duplicate", 3, 0),
  ];
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(new Set(hydrated.machines.map(({ instanceId }) => instanceId)).size, 2);
});

test("shop affordability requires both cash and every listed material", () => {
  const state = freshState({ cash: 70 });
  state.stockpile.granite = 150;
  state.stockpile.copperIngot = 19;
  assert.equal(game.canAffordMachinePurchase("graphiteCopperAnnealer"), false);
  state.stockpile.copperIngot = 20;
  assert.equal(game.canAffordMachinePurchase("graphiteCopperAnnealer"), true);
  state.cash = 69;
  assert.equal(game.canAffordMachinePurchase("graphiteCopperAnnealer"), false);

  state.cash = 100;
  state.stockpile.limestone = 20;
  state.stockpile.graphite = 1;
  state.stockpile.wire = 9;
  assert.equal(game.canAffordMachinePurchase("conveyor"), false);
  state.stockpile.wire = 10;
  assert.equal(game.canAffordMachinePurchase("conveyor"), true);
});

test("shop quantity is limited to whole numbers from 1 through 9,999", () => {
  assert.equal(game.getValidShopPurchaseQuantity("1"), 1);
  assert.equal(game.getValidShopPurchaseQuantity(9999), 9999);
  for (const quantity of [0, -1, 10000, 1.5, "", "1.5", "not a number"]) {
    assert.equal(game.getValidShopPurchaseQuantity(quantity), null, `${quantity} should be rejected`);
  }

  assert.deepEqual(game.getMachinePurchaseCost("conveyor", 3), {
    cash: 300,
    materials: { limestone: 60, graphite: 3, wire: 30 },
  });
  assert.equal(game.getMachinePurchaseCost("conveyor", 10000), null);
});

test("bulk shop purchase deducts scaled costs and credits the matching item count", () => {
  const state = freshState({ cash: 300 });
  state.stockpile.limestone = 60;
  state.stockpile.graphite = 3;
  state.stockpile.wire = 30;
  const startingConveyorCount = state.machineInventory.conveyor;

  assert.equal(game.canAffordMachinePurchase("conveyor", 3), true);
  assert.equal(game.canAffordMachinePurchase("conveyor", 4), false);
  assert.equal(game.purchaseMachine("conveyor", 10000), false);
  assert.equal(state.cash, 300);
  assert.equal(state.machineInventory.conveyor, startingConveyorCount);

  assert.equal(game.purchaseMachine("conveyor", 3), true);
  assert.equal(state.cash, 0);
  assert.equal(state.stockpile.limestone, 0);
  assert.equal(state.stockpile.graphite, 0);
  assert.equal(state.stockpile.wire, 0);
  assert.equal(state.machineInventory.conveyor, startingConveyorCount + 3);
});

test("shop detail exposes a bounded purchase quantity and material stock totals", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /id="shopDetailQuantity"[^>]*min="1"[^>]*max="9999"/);
  assert.match(html, /Purchase quantity/);
  assert.match(styles, /\.shop-detail-cost-row\.is-insufficient strong\s*\{/);
});

test("Casing Machine is a shop machine with the agreed buckshot cost and Jacket Former-sized layout", () => {
  assert.deepEqual(game.MACHINE_PURCHASES.casingMachine, {
    cash: 4.5e5,
    materials: { ceramic: 40, bronzePlate: 20, wire: 100 },
  });
  assert.deepEqual(game.MACHINE_LAYOUT.casingMachine.internalConveyors, [
    { column: 0, row: 1, direction: "right", casingMachineSlot: "input" },
    { column: 1, row: 1, direction: "right" },
    { column: 2, row: 1, direction: "right", casingMachineSlot: "process" },
  ]);
  assert.equal(game.MACHINE_LAYOUT.casingMachine.processLaneIndex, 2);
  assert.deepEqual(game.MACHINE_LAYOUT.casingMachine.liquidInputs, [
    { column: 1, row: 0, direction: "down" },
    { column: 1, row: 2, direction: "up" },
  ]);
  assert.equal(game.MACHINE_LAYOUT.casingMachine.width, 3);
  assert.equal(game.MACHINE_LAYOUT.casingMachine.height, 3);
  assert.equal(game.BUCKSHOT_INPUT_ROUNDS, 25);
  assert.equal(game.BUCKSHOT_OUTPUT_ROUNDS, 5);
  assert.equal(game.BUCKSHOT_FIRE_PER_SECOND, 1);
  assert.equal(game.BUCKSHOT_SEGMENTS_PER_SHOT, 10);
  assert.deepEqual(game.CASING_MATERIALS, ["bronzeIngot", "brassIngot", "steelIngot"]);
});

test("Casing Machine turns jacketed ammunition and liquid Bronze into Buckshot", () => {
  const casingMachine = machine("casingMachine", "casing-test", 5, 5, "up");
  const kiln = machine("clayKiln", "casing-kiln", 4, 5);
  const state = freshState({ machines: [casingMachine, kiln] });
  const jacketedAmmo = {
    kind: "ammo",
    type: "rapidfire",
    material: "lead",
    quantity: 25,
    damage: 17,
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    jacketed: true,
    annealed: true,
  };
  assert.equal(game.canCasingMachineAcceptItem(casingMachine, jacketedAmmo), true);
  assert.equal(game.receiveCasingMachineItem(casingMachine, jacketedAmmo), true);
  assert.equal(game.getCasingMachineSmelterLink(casingMachine)?.smelter.instanceId, kiln.instanceId);
  assert.equal(game.canCasingMachineAcceptItem(casingMachine, {
    kind: "material",
    material: "bronzeIngot",
    quantity: 1,
  }), false);
  state.moltenCopper.push({
    kilnInstanceId: kiln.instanceId,
    smelterInstanceId: kiln.instanceId,
    material: "bronze",
    quantity: 1,
  });
  assert.equal(game.startCasingMachineLiquid(), true);
  game.emitCasingMachineOutputs();

  const output = state.internalConveyorItems[`${casingMachine.instanceId}:2`];
  assert.equal(output.type, "buckshot");
  assert.equal(output.quantity, 5);
  assert.equal(output.damage, 25.5);
  assert.equal(output.casingMaterial, "bronze");
  assert.equal(output.annealed, true);
  assert.equal(game.getSelectedGun(), "rapidfire");
});

test("Casing Machine accepts legacy jacketed Rapidfire cargo without an explicit type", () => {
  const casingMachine = machine("casingMachine", "casing-legacy-type-test", 5, 5, "up");
  freshState({ machines: [casingMachine] });

  assert.equal(game.canCasingMachineAcceptItem(casingMachine, {
    kind: "ammo",
    material: "lead",
    quantity: 25,
    damage: 17,
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    jacketed: true,
  }), true);
});

test("Casing Machine penetrating rapidfire mode keeps the stack and triples Bronze-cased damage", () => {
  const casingMachine = machine("casingMachine", "casing-penetrating-test", 5, 5, "up");
  const kiln = machine("clayKiln", "casing-penetrating-kiln", 4, 5);
  casingMachine.mode = "penetratingRapidfire";
  const state = freshState({ machines: [casingMachine, kiln] });
  const rapidfireAmmo = {
    kind: "ammo",
    type: "rapidfire",
    material: "lead",
    quantity: 25,
    damage: 17,
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    jacketed: true,
    annealed: true,
  };
  assert.equal(game.canCasingMachineAcceptItem(casingMachine, rapidfireAmmo), true);
  assert.equal(game.receiveCasingMachineItem(casingMachine, rapidfireAmmo), true);
  state.moltenCopper.push({
    kilnInstanceId: kiln.instanceId,
    smelterInstanceId: kiln.instanceId,
    material: "bronze",
    quantity: 1,
  });
  assert.equal(game.startCasingMachineLiquid(), true);
  game.emitCasingMachineOutputs();

  const output = state.internalConveyorItems[`${casingMachine.instanceId}:2`];
  assert.equal(output.type, "rapidfire");
  assert.equal(output.quantity, 25);
  assert.equal(output.damage, 51);
  assert.equal(output.casingMaterial, "bronze");
  assert.equal(output.annealed, true);

  game.addAmmo(output.quantity, output.material, output.type, output.damage, output.annealed, {
    casingMaterial: output.casingMaterial,
    jacketMaterial: output.jacketMaterial,
    coreMaterial: output.coreMaterial,
  });
  state.mine.rapidfireGunMk1Purchased = true;
  state.mine.selectedGun = "rapidfire";
  state.mine.selectedAmmoGunType = "rapidfire";
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoCasingMaterial = "bronze";
  state.mine.selectedAmmoJacketMaterial = "nativeCopper";
  state.mine.selectedAmmoDamage = state.ammoStacks[0].damage;
  state.mine.selectedAmmoAnnealed = true;
  assert.equal(game.getSelectedAmmoStack()?.count, 25);

  const saved = game.createInitialState();
  saved.machines.push(casingMachine);
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.machines.find(({ instanceId }) => instanceId === casingMachine.instanceId).mode, "penetratingRapidfire");
});

test("Tunnel 1 Band 20 unlocks Rapidfire Gun Mk. 1 and makes it a Buckshot prerequisite", () => {
  const state = freshState({ cash: game.RAPIDFIRE_MK1_COST });
  state.mine.rapidfireGunMk1Unlocked = true;
  state.mine.buckshotGunUnlocked = true;
  assert.equal(game.canBuyRapidfireGunMk1(), true);
  assert.equal(game.buyRapidfireGunMk1(), true);
  assert.equal(state.cash, 0);
  assert.equal(state.mine.rapidfireGunMk1Purchased, true);
  assert.equal(game.getGunDisplayName(), "Rapidfire Gun Mk. 1");
  assert.equal(game.getFactoryGunDisplayLabel(), "RAPIDFIRE\nGUN MK. 1");

  state.cash = game.BUCKSHOT_GUN_COST;
  assert.equal(game.canBuyBuckshotGun(), true);
  assert.equal(game.buyBuckshotGun(), true);
  assert.equal(state.cash, 0);
  assert.equal(state.mine.buckshotGunPurchased, true);
  assert.equal(game.selectGun("buckshot"), true);
  assert.equal(game.getSelectedGun(), "buckshot");
  assert.equal(game.getSelectedGunAmmoType(), "buckshot");
  assert.equal(game.getSelectedGunFireRate(), 1);
});

test("existing Buckshot saves receive Rapidfire Gun Mk. 1 during hydration", () => {
  const saved = game.createInitialState();
  saved.mine.buckshotGunPurchased = true;
  saved.mine.rapidfireGunMk1Purchased = false;

  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.mine.rapidfireGunMk1Purchased, true);
  assert.equal(hydrated.mine.rapidfireGunMk1Unlocked, true);
});

test("Buckshot cannot be purchased before Rapidfire Gun Mk. 1", () => {
  const state = freshState({ cash: game.BUCKSHOT_GUN_COST });
  state.mine.buckshotGunUnlocked = true;
  assert.equal(game.canBuyBuckshotGun(), false);
  assert.equal(game.buyBuckshotGun(), false);
  assert.equal(state.mine.buckshotGunPurchased, false);
});

test("Rapidfire Gun Mk. 1 enables firing cased Rapidfire ammunition", () => {
  const state = freshState({
    machines: [],
    deposits: [game.createDeposit({ cell: 0, type: "copper" }, 0)],
  });
  state.mine.rapidfireGunMk1Purchased = false;
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoJacketMaterial = "nativeCopper";
  state.mine.selectedAmmoCasingMaterial = "bronze";
  state.mine.selectedAmmoDamage = 51;
  state.ammoStacks = [{
    type: "rapidfire",
    material: "lead",
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    casingMaterial: "bronze",
    damage: 51,
    count: 25,
    annealed: false,
  }];

  assert.equal(game.canFireAmmoStack(state.ammoStacks[0]), false);
  assert.equal(game.getSelectedAmmoStack(), null);

  state.mine.rapidfireGunMk1Purchased = true;
  assert.equal(game.canFireAmmoStack(state.ammoStacks[0]), true);
  assert.equal(game.getSelectedAmmoStack()?.count, 25);
  game.fireLeek("manual");
  assert.equal(state.ammoStacks[0].count, 24);
});

test("Buckshot limits a single ore to two landed pellets per shot", () => {
  const deposit = game.createDeposit({ cell: 0, type: "copper" }, 0);
  const state = freshState({ machines: [], deposits: [deposit] });
  state.mine.buckshotGunPurchased = true;
  state.mine.rapidfireGunMk1Purchased = true;
  state.mine.selectedGun = "buckshot";
  state.mine.selectedAmmoGunType = "buckshot";
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoCasingMaterial = null;
  state.mine.selectedAmmoJacketMaterial = null;
  state.mine.selectedAmmoDamage = 2;
  state.mine.selectedAmmoAnnealed = false;
  state.ammoStacks = [{
    type: "buckshot",
    material: "lead",
    coreMaterial: "lead",
    damage: 2,
    count: 1,
    annealed: false,
  }];

  game.fireLeek("manual");

  assert.equal(game.BUCKSHOT_MAX_HITS_PER_DEPOSIT, 2);
  assert.equal(deposit.currentSegmentHitPoints, 1);
  assert.equal(state.ammoStacks.length, 0);
  assert.equal(state.shotsFired, 1);
});

test("factory gun visual follows the active gun selection", () => {
  const state = freshState();
  assert.equal(game.getFactoryGunDisplayLabel(), "RAPIDFIRE\nGUN MK. 0");

  state.mine.buckshotGunPurchased = true;
  state.mine.rapidfireGunMk1Purchased = true;
  assert.equal(game.selectGun("buckshot"), true);
  assert.equal(game.getFactoryGunDisplayLabel(), "BUCKSHOT\nGUN");

  state.mine.gunSchedulingUnlocked = true;
  state.mine.gunScheduleEnabledByTunnel[1] = true;
  state.mine.gunSchedulesByTunnel[1] = [{ gun: "rapidfire", shots: 1 }];
  assert.equal(game.getFactoryGunDisplayLabel(), "RAPIDFIRE\nGUN MK. 1");
});

test("factory ammo visual only shows the selected amount as ready", () => {
  const state = freshState();
  assert.equal(game.getFactoryAmmoReadyLabel(), "0 ready");

  state.ammoStacks = [{
    type: "rapidfire",
    material: "leek",
    count: 25,
    damage: 1,
    annealed: false,
  }];
  assert.equal(game.getFactoryAmmoReadyLabel(), "25 ready");
});

test("gun schedules are independent per tunnel and resume when returning", () => {
  const state = freshState({
    machines: [],
    deposits: [game.createDeposit({ cell: 0, type: "copper" }, 0)],
  });
  state.mine.unlockedTunnels = [1, 2];
  state.mine.gunSchedulingUnlocked = true;
  state.mine.rapidfireGunMk1Purchased = true;
  state.mine.buckshotGunPurchased = true;
  state.mine.gunScheduleEnabledByTunnel = { 1: true, 2: true, 3: false };
  state.mine.gunSchedulesByTunnel = {
    1: [{ gun: "buckshot", shots: 2 }, { gun: "rapidfire", shots: 1 }],
    2: [{ gun: "rapidfire", shots: 3 }],
    3: [],
  };
  state.mine.gunScheduleRuntimeByTunnel = {
    1: { stepIndex: 0, shotsFired: 1 },
    2: { stepIndex: 0, shotsFired: 0 },
    3: { stepIndex: 0, shotsFired: 0 },
  };

  assert.equal(game.getSelectedGun(), "buckshot");
  game.switchTunnel(2);
  assert.equal(game.getSelectedGun(), "rapidfire");
  state.mine.gunScheduleRuntimeByTunnel[2].shotsFired = 2;
  game.switchTunnel(1);
  assert.equal(game.getSelectedGun(), "buckshot");
  assert.deepEqual(state.mine.gunScheduleRuntimeByTunnel[1], { stepIndex: 0, shotsFired: 1 });
  assert.deepEqual(state.mine.gunScheduleRuntimeByTunnel[2], { stepIndex: 0, shotsFired: 2 });
});

test("gun schedule advances once per fired gun shot", () => {
  const state = freshState({
    machines: [],
    deposits: [game.createDeposit({ cell: 0, type: "copper" }, 0)],
  });
  state.mine.gunSchedulingUnlocked = true;
  state.mine.rapidfireGunMk1Purchased = true;
  state.mine.buckshotGunPurchased = true;
  state.mine.gunScheduleEnabledByTunnel[1] = true;
  state.mine.gunSchedulesByTunnel[1] = [
    { gun: "buckshot", shots: 2 },
    { gun: "rapidfire", shots: 1 },
  ];
  state.ammoStacks = [{
    type: "buckshot",
    material: "copper",
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    casingMaterial: "bronze",
    damage: 17,
    count: 2,
    annealed: false,
  }];
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoJacketMaterial = "nativeCopper";
  state.mine.selectedAmmoCasingMaterial = "bronze";
  state.mine.selectedAmmoDamage = 17;

  game.fireLeek("manual");
  assert.deepEqual(state.mine.gunScheduleRuntimeByTunnel[1], { stepIndex: 0, shotsFired: 1 });
  game.fireLeek("manual");
  assert.deepEqual(state.mine.gunScheduleRuntimeByTunnel[1], { stepIndex: 1, shotsFired: 0 });
  assert.equal(game.getSelectedGun(), "rapidfire");
});

test("Graphite-Laced Sell Tube and renewable Material Storage have the specified costs", () => {
  assert.deepEqual(game.MACHINE_LAYOUT.graphiteLacedSellTube, game.MACHINE_LAYOUT.sellTube);
  assert.deepEqual(game.MACHINE_PURCHASES.graphiteLacedSellTube, {
    cash: 2e3,
    materials: { graphite: 20, leekFiber: 50, copperIngot: 10 },
  });
  assert.deepEqual(game.MACHINE_PURCHASES.materialStorage, {
    cash: 5e3,
    materials: { limestone: 500, leek: 100, leekFiber: 100, copperIngot: 50 },
  });
});

test("Graphite-Laced Sell Tube multiplies direct sale value by 25%", () => {
  const graphiteSellTube = machine("graphiteLacedSellTube", "graphite-sell", 4, 4);
  const state = freshState({ machines: [graphiteSellTube] });
  assert.equal(game.canReceiveConveyorItem({
    kind: "material",
    material: "silver",
    quantity: 1,
    saleValueBase: 10,
  }, 4, 4), true);
  assert.equal(game.receiveConveyorItem({
    kind: "material",
    material: "silver",
    quantity: 1,
    saleValueBase: 10,
  }, 4, 4), true);
  assert.equal(state.cash, 12.5);
});

test("Granite Processor has the specified cost and two no-crew lanes", () => {
  const processor = game.MACHINE_LAYOUT.graniteProcessor;
  assert.deepEqual(processor.internalConveyors, [
    { column: 0, row: 0, direction: "right" },
    { column: 0, row: 1, direction: "right" },
  ]);
  const state = freshState({ cash: 150 });
  state.stockpile.granite = 80;
  state.stockpile.limestone = 120;
  assert.equal(game.canAffordMachinePurchase("graniteProcessor"), true);
  state.stockpile.limestone = 119;
  assert.equal(game.canAffordMachinePurchase("graniteProcessor"), false);
  assert.equal(game.getBusyCrew(), 0);
});

test("Extruder has the specified cost, footprint, and no crew requirement", () => {
  const extruder = game.MACHINE_LAYOUT.extruder;
  assert.equal(extruder.width, 3);
  assert.equal(extruder.height, 1);
  assert.deepEqual(extruder.internalConveyors, [
    { column: 0, row: 0, direction: "right" },
    { column: 1, row: 0, direction: "right" },
    { column: 2, row: 0, direction: "right" },
  ]);
  const state = freshState({ cash: 1.25e3 });
  state.stockpile.granite = 100;
  state.stockpile.copperIngot = 15;
  state.stockpile.graphite = 10;
  assert.equal(game.canAffordMachinePurchase("extruder"), true);
  assert.equal(game.getBusyCrew(), 0);
});

test("Extruder wire mode converts copper ingots into five individually valued wires", () => {
  const extruder = machine("extruder", "extruder-wire", 4, 4);
  freshState({ machines: [extruder] });
  const processConveyor = {
    ...game.getInternalConveyorTiles(extruder)[1],
    internalMachineId: "extruder",
    internalMachineInstanceId: extruder.instanceId,
    internalIndex: 1,
  };
  const ingot = {
    kind: "material",
    material: "copperIngot",
    quantity: 1,
    saleValueBase: 20,
    freshMoldedAt: Date.now(),
  };

  game.transformItemLeavingConveyor(processConveyor, ingot);

  assert.equal(ingot.material, "wire");
  assert.equal(ingot.quantity, 5);
  assert.equal(ingot.saleValueBase, 10);
  assert.equal(game.getItemSaleValue(ingot), 10);
});

test("Leek Fiber Extractor has the specified cost and footprint", () => {
  const extractor = game.MACHINE_LAYOUT.leekFiberExtractor;
  assert.equal(extractor.width, 2);
  assert.equal(extractor.height, 2);
  assert.deepEqual(extractor.internalConveyors, [
    { column: 0, row: 1, direction: "right" },
    { column: 1, row: 1, direction: "right" },
  ]);
  const state = freshState({ cash: 2.5e3 });
  state.stockpile.limestone = 50;
  state.stockpile.copperIngot = 5;
  state.stockpile.wire = 10;
  assert.equal(game.canAffordMachinePurchase("leekFiberExtractor"), true);
  state.stockpile.wire = 9;
  assert.equal(game.canAffordMachinePurchase("leekFiberExtractor"), false);
  assert.equal(game.getBusyCrew(), 0);
});

test("Contact Maker has the specified cost, footprint, and labeled inputs", () => {
  const maker = game.MACHINE_LAYOUT.contactMaker;
  assert.equal(maker.width, 4);
  assert.equal(maker.height, 3);
  assert.deepEqual(maker.internalConveyors, [
    { column: 0, row: 1, direction: "right", speed: 5 },
    { column: 1, row: 1, direction: "right", speed: 5 },
    { column: 2, row: 1, direction: "right", speed: 5 },
    { column: 3, row: 1, direction: "right", speed: 5 },
  ]);
  assert.deepEqual(maker.fiberInput, { column: 1, row: 0, direction: "down" });
  assert.deepEqual(maker.silverInput, { column: 1, row: 2, direction: "up" });
  const state = freshState({ cash: 1.8e4 });
  state.stockpile.granite = 80;
  state.stockpile.leekFiber = 100;
  state.stockpile.copperIngot = 20;
  state.stockpile.graphite = 25;
  state.stockpile.wire = 100;
  assert.equal(game.canAffordMachinePurchase("contactMaker"), true);
  state.stockpile.leekFiber = 99;
  assert.equal(game.canAffordMachinePurchase("contactMaker"), false);
  assert.equal(game.getBusyCrew(), 0);
});

test("Leek Fiber Extractor and Contact Maker process their specified recipes", () => {
  const extractor = machine("leekFiberExtractor", "fiber-process", 2, 2);
  freshState({ machines: [extractor] });
  const fiberConveyor = {
    ...game.getInternalConveyorTiles(extractor)[1],
    internalMachineId: "leekFiberExtractor",
    internalMachineInstanceId: extractor.instanceId,
    internalIndex: 1,
  };
  const fiber = game.transformItemLeavingConveyor(fiberConveyor, {
    kind: "material",
    material: "leek",
    quantity: 1,
  });
  assert.equal(fiber.material, "leekFiber");
  assert.equal(fiber.quantity, 1);

  const maker = machine("contactMaker", "contact-process", 8, 2);
  freshState({
    machines: [maker],
    contactMakerInputs: {
      [maker.instanceId]: { fiber: 1, silver: 1, silverValue: 350 },
    },
  });
  const contactConveyor = {
    ...game.getInternalConveyorTiles(maker)[1],
    internalMachineId: "contactMaker",
    internalMachineInstanceId: maker.instanceId,
    internalIndex: 1,
  };
  const contacts = game.transformItemLeavingConveyor(contactConveyor, {
    kind: "material",
    material: "wire",
    quantity: 5,
    saleValueBase: 52,
  });
  assert.equal(contacts.material, "contact");
  assert.equal(contacts.quantity, 5);
  assert.equal(contacts.saleValueBase, 174);
  assert.equal(contacts.baseValue, 8.8);
  assert.deepEqual(game.__getState().contactMakerInputs[maker.instanceId], {
    fiber: 0,
    silver: 0.5,
    silverValue: 175,
  });
  const thirdConveyor = {
    ...game.getInternalConveyorTiles(maker)[2],
    internalMachineId: "contactMaker",
    internalMachineInstanceId: maker.instanceId,
    internalIndex: 2,
  };
  assert.equal(game.canItemLeaveConveyor(thirdConveyor, contacts), true);
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "leekFiber", quantity: 1 }, 9, 2), true);
  assert.equal(game.receiveConveyorItem({ kind: "material", material: "leekFiber", quantity: 1 }, 9, 2), true);
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "leekFiber", quantity: 1 }, 9, 2), false);
  assert.equal(game.canReceiveConveyorItem({ kind: "material", material: "silverIngot", quantity: 1 }, 9, 4), false);
});

test("Contact Maker scales fiber, silver, value, and output for stacked wires", () => {
  const maker = machine("contactMaker", "contact-stack-process", 8, 2);
  const state = freshState({
    machines: [maker],
    contactMakerInputs: {
      [maker.instanceId]: { fiber: 3, silver: 2, silverValue: 700 },
    },
  });
  const contactConveyor = {
    ...game.getInternalConveyorTiles(maker)[1],
    internalMachineId: "contactMaker",
    internalMachineInstanceId: maker.instanceId,
    internalIndex: 1,
  };
  const wires = {
    kind: "material",
    material: "wire",
    quantity: 15,
    saleValueBase: 52,
  };

  assert.equal(game.canItemLeaveConveyor(contactConveyor, wires), true);
  const contacts = game.transformItemLeavingConveyor(contactConveyor, wires);
  assert.equal(contacts.material, "contact");
  assert.equal(contacts.quantity, 15);
  assert.equal(contacts.saleValueBase, 174);
  assert.equal(contacts.baseValue, 8.8);
  assert.deepEqual(state.contactMakerInputs[maker.instanceId], {
    fiber: 0,
    silver: 0.5,
    silverValue: 175,
  });
});

test("Jacket Former holds mineral cores for liquid Native copper and applies jacket damage", () => {
  const jacketFormer = machine("jacketFormer", "jacket-former-a", 5, 5, "up");
  const kiln = machine("clayKiln", "native-copper-kiln", 4, 5, "right");
  const core = {
    kind: "ammo",
    material: "lead",
    quantity: 25,
    damage: 5,
    casterFinishedAt: Date.now(),
  };
  const state = freshState({
    machines: [jacketFormer, kiln],
    internalConveyorItems: { "jacket-former-a:1": core },
    moltenCopper: [],
  });

  assert.equal(game.startJacketFormerCoating(), false);
  state.moltenCopper.push({ kilnInstanceId: kiln.instanceId, material: "nativeCopper", sourceValue: 5 });
  assert.equal(game.getJacketFormerKilnLink(jacketFormer)?.kiln.instanceId, kiln.instanceId);
  assert.equal(game.startJacketFormerCoating(), true);
  assert.equal(core.jacketMaterial, "nativeCopper");
  assert.equal(state.moltenCopper.length, 0);

  const processConveyor = {
    ...game.getInternalConveyorTiles(jacketFormer)[1],
    internalMachineId: "jacketFormer",
    internalMachineInstanceId: jacketFormer.instanceId,
    internalIndex: 1,
  };
  game.transformItemLeavingConveyor(processConveyor, core);
  assert.equal(core.coreMaterial, "lead");
  assert.equal(core.jacketed, true);
  assert.equal(core.damage, (5 * 3) ** 0.85);
});

test("jacketed ammunition can still be annealed after jacketing", () => {
  const jacketFormer = machine("jacketFormer", "jacket-former-b", 5, 5, "up");
  const annealer = machine("graphiteCopperAnnealer", "annealer-b", 10, 5, "right");
  const core = {
    kind: "ammo",
    material: "lead",
    quantity: 25,
    damage: 5,
    jacketMaterial: "nativeCopper",
    casterFinishedAt: Date.now(),
  };
  freshState({ machines: [jacketFormer, annealer], internalConveyorItems: {} });

  const jacketConveyor = {
    ...game.getInternalConveyorTiles(jacketFormer)[1],
    internalMachineId: "jacketFormer",
    internalMachineInstanceId: jacketFormer.instanceId,
    internalIndex: 1,
  };
  game.transformItemLeavingConveyor(jacketConveyor, core);

  const annealerConveyor = {
    ...game.getInternalConveyorTiles(annealer)[2],
    internalMachineId: "graphiteCopperAnnealer",
    internalMachineInstanceId: annealer.instanceId,
    internalIndex: 2,
  };
  game.transformItemLeavingConveyor(annealerConveyor, core);

  assert.equal(core.annealed, true);
  assert.ok(Math.abs(core.damage - ((5 * 3) ** 0.85 * 1.7)) < 1e-9);
  game.addAmmo(core.quantity, core.material, "rapidfire", core.damage, core.annealed, {
    jacketMaterial: core.jacketMaterial,
    coreMaterial: core.coreMaterial,
  });
  assert.equal(game.getAmmoSelectorOptions().find((option) => (
    option.material === "lead" && option.annealed === true
  ))?.annealed, true);
});

test("Annealer repairs jacketed ammo missing the old caster marker", () => {
  const annealer = machine("graphiteCopperAnnealer", "annealer-c", 10, 5, "right");
  const core = {
    kind: "ammo",
    material: "lead",
    quantity: 25,
    damage: (5 * 3) ** 0.85,
    jacketMaterial: "nativeCopper",
    jacketed: true,
  };
  freshState({ machines: [annealer] });
  const annealerConveyor = {
    ...game.getInternalConveyorTiles(annealer)[2],
    internalMachineId: "graphiteCopperAnnealer",
    internalMachineInstanceId: annealer.instanceId,
    internalIndex: 2,
  };
  game.transformItemLeavingConveyor(annealerConveyor, core);

  assert.equal(core.annealed, true);
  assert.ok(Math.abs(core.damage - ((5 * 3) ** 0.85 * 1.7)) < 1e-9);
});

test("Granite Processor uses base-value eligibility and a sub-$50 input window", () => {
  const processor = machine("graniteProcessor", "processor-a", 3, 3);
  const lanes = game.getInternalConveyorTiles(processor);
  freshState({ machines: [processor] });
  const conveyor = {
    ...lanes[0],
    internalMachineId: "graniteProcessor",
    internalMachineInstanceId: "processor-a",
    internalIndex: 0,
  };

  const low = { kind: "material", material: "copperIngot", quantity: 1, saleValueBase: 9 };
  game.transformItemLeavingConveyor(conveyor, low);
  assert.equal(low.saleValueBase, 9);

  const ore = { kind: "material", material: "copper", quantity: 1, saleValueBase: 12 };
  game.transformItemLeavingConveyor(conveyor, ore);
  assert.equal(ore.saleValueBase, 12);

  const accepted = { kind: "material", material: "copperIngot", quantity: 1, saleValueBase: 12 };
  game.transformItemLeavingConveyor(conveyor, accepted);
  assert.ok(Math.abs(accepted.saleValueBase - 15.6) < 1e-9);
  assert.ok(Math.abs(game.getItemSaleValue(accepted) - 15.6) < 1e-9);

  const high = { kind: "material", material: "copperIngot", quantity: 1, saleValueBase: 48 };
  game.transformItemLeavingConveyor(conveyor, high);
  assert.ok(Math.abs(high.saleValueBase - 62.4) < 1e-9);

  const capped = { kind: "material", material: "copperIngot", quantity: 1, saleValueBase: 50 };
  game.transformItemLeavingConveyor(conveyor, capped);
  assert.equal(capped.saleValueBase, 50);

  const rejected = { kind: "material", material: "copper", quantity: 1, saleValueBase: 5 };
  game.transformItemLeavingConveyor(conveyor, rejected);
  assert.equal(rejected.saleValueBase, 5);
});

test("Bronze Stamp has six additive uses per item and no value ceiling", () => {
  assert.equal(game.BRONZE_STAMP_MAX_USES, 6);
  const layout = game.MACHINE_LAYOUT.bronzeStamp;
  assert.equal(layout.width, 1);
  assert.equal(layout.height, 3);
  assert.deepEqual(layout.internalConveyors, [
    { column: 0, row: 1, direction: "right", speed: 5 },
  ]);
  assert.equal(layout.processLaneIndex, 0);

  const stamp = machine("bronzeStamp", "bronze-stamp", 3, 3);
  const state = freshState({ cash: 2.5e4, machines: [stamp] });
  state.stockpile.bronzePlate = 4;
  state.stockpile.copperIngot = 20;
  state.stockpile.wire = 50;
  state.stockpile.contact = 20;
  assert.deepEqual(game.MACHINE_PURCHASES.bronzeStamp, {
    cash: 2.5e4,
    materials: { bronzePlate: 4, copperIngot: 20, wire: 50, contact: 20 },
  });
  assert.equal(game.canAffordMachinePurchase("bronzeStamp"), true);
  assert.equal(game.getBusyCrew(), 0);

  const processConveyor = {
    ...game.getInternalConveyorTiles(stamp)[0],
    internalMachineId: "bronzeStamp",
    internalMachineInstanceId: stamp.instanceId,
    internalIndex: 0,
  };
  const cutGem = {
    kind: "material",
    material: "cutMalachite",
    quantity: 0.4,
    saleValueBase: 468.75,
    baseValue: 125,
  };
  for (let use = 1; use <= 6; use += 1) {
    game.transformItemLeavingConveyor(processConveyor, cutGem);
    assert.equal(cutGem.saleValueBase, 468.75 + 100 * use);
    assert.equal(cutGem.bronzeStampUses, use);
  }
  game.transformItemLeavingConveyor(processConveyor, cutGem);
  assert.equal(cutGem.saleValueBase, 1068.75);
  assert.equal(cutGem.bronzeStampUses, 6);

  const moldedIngot = {
    kind: "material", material: "silverIngot", quantity: 1, saleValueBase: 200,
  };
  game.transformItemLeavingConveyor(processConveyor, moldedIngot);
  assert.equal(moldedIngot.saleValueBase, 300);
  assert.equal(moldedIngot.bronzeStampUses, 1);

  const lowBase = {
    kind: "material", material: "contact", quantity: 1, saleValueBase: 200, baseValue: 7.9,
  };
  game.transformItemLeavingConveyor(processConveyor, lowBase);
  assert.equal(lowBase.saleValueBase, 200);

  const lowValue = {
    kind: "material", material: "contact", quantity: 1, saleValueBase: 149, baseValue: 8,
  };
  game.transformItemLeavingConveyor(processConveyor, lowValue);
  assert.equal(lowValue.saleValueBase, 149);

  const formerlyCapped = {
    kind: "material", material: "contact", quantity: 1, saleValueBase: 750, baseValue: 8,
  };
  game.transformItemLeavingConveyor(processConveyor, formerlyCapped);
  assert.equal(formerlyCapped.saleValueBase, 850);
  assert.equal(formerlyCapped.bronzeStampUses, 1);
});

test("Quartz Wheel Cutter has two slow lines and converts Malachite with fractional yield and value", () => {
  const layout = game.MACHINE_LAYOUT.quartzWheelCutter;
  assert.equal(layout.width, 4);
  assert.equal(layout.height, 5);
  assert.deepEqual(layout.processLaneIndexes, [3, 7]);
  assert.deepEqual(layout.internalConveyors.map(({ column, row, direction, speed }) => (
    { column, row, direction, speed }
  )), [
    { column: 0, row: 1, direction: "right", speed: 1 },
    { column: 1, row: 1, direction: "right", speed: 1 },
    { column: 2, row: 1, direction: "right", speed: 1 },
    { column: 3, row: 1, direction: "right", speed: 1 },
    { column: 0, row: 3, direction: "right", speed: 1 },
    { column: 1, row: 3, direction: "right", speed: 1 },
    { column: 2, row: 3, direction: "right", speed: 1 },
    { column: 3, row: 3, direction: "right", speed: 1 },
  ]);
  assert.equal(game.QUARTZ_WHEEL_CUTTER_MULTIPLIER, 250);
  assert.equal(game.QUARTZ_WHEEL_CUTTER_YIELD, 0.4);
  assert.deepEqual(game.MACHINE_PURCHASES.quartzWheelCutter, {
    cash: 6e5,
    materials: { quartz: 200, ironIngot: 500, ironPlate: 300 },
  });
  assert.deepEqual(game.getMachineCategories("quartzWheelCutter"), ["material", "cash"]);

  const cutter = machine("quartzWheelCutter", "cutter-a", 10, 10);
  const state = freshState({ cash: 6e5, machines: [cutter] });
  state.stockpile.quartz = 200;
  state.stockpile.ironIngot = 500;
  state.stockpile.ironPlate = 300;
  assert.equal(game.canAffordMachinePurchase("quartzWheelCutter"), true);
  assert.equal(game.getBusyCrew(), 0);

  const lanes = game.getInternalConveyorTiles(cutter);
  for (const processLaneIndex of layout.processLaneIndexes) {
    const conveyor = {
      ...lanes[processLaneIndex],
      internalMachineId: "quartzWheelCutter",
      internalMachineInstanceId: cutter.instanceId,
      internalIndex: processLaneIndex,
    };
    const ore = {
      kind: "material",
      material: "copper",
      quantity: 1,
      saleValueBase: 1.875,
      baseValue: 0.5,
      saleValueBonus: 0,
      dusted: true,
    };
    game.transformItemLeavingConveyor(conveyor, ore);
    assert.equal(ore.material, "cutMalachite");
    assert.equal(ore.quantity, 0.4);
    assert.equal(ore.saleValueBase, 468.75);
    assert.equal(ore.baseValue, 125);
    assert.equal(ore.dusted, true);
    assert.equal(ore.dusterEligible, false);
  }

  const recipe = game.CRAFTING_RECIPES.find(({ name }) => name === "Cut Malachite");
  assert.equal(recipe.input, "1 Malachite Ore");
  assert.equal(recipe.output, "0.4 Cut Malachite");
});

test("Quartz Wheel Cutter rejects non-Malachite cargo and cut gems cannot be dusted", () => {
  const cutter = machine("quartzWheelCutter", "cutter-input", 10, 10);
  const duster = machine("leekDuster", "gem-duster", 20, 20);
  freshState({
    machines: [cutter, duster],
    crew: { total: 1 },
    placedConveyors: [{ column: 9, row: 11, direction: "right", item: null }],
  });
  const inputBelt = {
    ...game.getConveyorAt(9, 11),
  };
  assert.equal(game.getConveyorAdvanceDestination(inputBelt, {
    kind: "material", material: "rawEmerald", quantity: 1,
  }), null);
  assert.notEqual(game.getConveyorAdvanceDestination(inputBelt, {
    kind: "material", material: "copper", quantity: 1,
  }), null);

  const gem = {
    kind: "material",
    material: "cutMalachite",
    quantity: 0.4,
    saleValueBase: 468.75,
    baseValue: 125,
    dusted: false,
  };
  const upgradeTile = game.getMachineUpgradeTile(duster);
  game.markItemForDuster(gem, upgradeTile.column, upgradeTile.row);
  assert.equal(gem.dusted, false);
  assert.equal(gem.saleValueBase, 468.75);
});

test("Bronze Pillars has its stress-test cost, asymmetric footprint, and three capped multiplier uses", () => {
  const layout = game.MACHINE_LAYOUT.bronzePillars;
  assert.equal(layout.width, 3);
  assert.equal(layout.height, 3);
  assert.deepEqual(game.getMachineOccupiedTiles(machine("bronzePillars", "pillars-shape", 4, 5)), [
    { column: 6, row: 5 },
    { column: 5, row: 6 },
    { column: 4, row: 7 },
  ]);
  assert.deepEqual(game.MACHINE_PURCHASES.bronzePillars, {
    cash: 1e5,
    materials: { bronzePlate: 20, bronzeIngot: 80, limestone: 400 },
  });

  const pillars = machine("bronzePillars", "pillars-1", 4, 5);
  const state = freshState({ cash: 1e5, machines: [pillars] });
  state.stockpile.bronzePlate = 20;
  state.stockpile.bronzeIngot = 80;
  state.stockpile.limestone = 400;
  assert.equal(game.canAffordMachinePurchase("bronzePillars"), true);
  assert.equal(game.getBusyCrew(), 0);

  const processConveyor = {
    ...game.getInternalConveyorTiles(pillars)[0],
    internalMachineId: "bronzePillars",
    internalMachineInstanceId: pillars.instanceId,
    internalIndex: 0,
  };
  const item = {
    kind: "material",
    material: "bronzeIngot",
    quantity: 1,
    saleValueBase: 1e3,
  };
  game.transformItemLeavingConveyor(processConveyor, item);
  game.transformItemLeavingConveyor(processConveyor, item);
  game.transformItemLeavingConveyor(processConveyor, item);
  assert.ok(Math.abs(item.saleValueBase - 2744) < 1e-9);
  assert.equal(item.bronzePillarsUses, 3);
  game.transformItemLeavingConveyor(processConveyor, item);
  assert.ok(Math.abs(item.saleValueBase - 2744) < 1e-9);

  const belowCap = {
    kind: "material", material: "bronzeIngot", quantity: 1, saleValueBase: 49999, baseValue: 20,
  };
  game.transformItemLeavingConveyor(processConveyor, belowCap);
  assert.ok(Math.abs(belowCap.saleValueBase - 69998.6) < 1e-9);

  const atCap = {
    kind: "material", material: "bronzeIngot", quantity: 1, saleValueBase: 5e4, baseValue: 20,
  };
  game.transformItemLeavingConveyor(processConveyor, atCap);
  assert.equal(atCap.saleValueBase, 5e4);

  const lowBase = {
    kind: "material", material: "bronzeIngot", quantity: 1, saleValueBase: 1e3, baseValue: 19.9,
  };
  game.transformItemLeavingConveyor(processConveyor, lowBase);
  assert.equal(lowBase.saleValueBase, 1e3);
  assert.equal(state.machineInventory.bronzePillars, 0);
});

test("Cast Iron Drill Head costs $1k and raises drill output to 300 DPS", () => {
  const state = freshState({ cash: 999 });
  assert.equal(game.DRILL_UPGRADES.castIron.cash, 1e3);
  assert.equal(game.DRILL_UPGRADES.castIron.dps, 300);
  assert.equal(game.canAffordDrillUpgrade("castIron"), false);
  assert.equal(game.getDrillDps(), 50);

  state.cash = 1e3;
  assert.equal(game.canAffordDrillUpgrade("castIron"), true);
  assert.equal(game.purchaseDrillUpgrade("castIron"), true);
  assert.equal(state.cash, 0);
  assert.equal(state.drill.upgradeId, "castIron");
  assert.equal(game.getDrillDps(), 300);
  assert.equal(game.canAffordDrillUpgrade("castIron"), false);

  state.cash = 1.2e4;
  assert.equal(game.getNextDrillUpgrade().id, "wellOiledCrankshaft");
  assert.equal(game.canAffordDrillUpgrade("wellOiledCrankshaft"), true);
  assert.equal(game.purchaseDrillUpgrade("wellOiledCrankshaft"), true);
  assert.equal(state.cash, 0);
  assert.equal(state.drill.upgradeId, "wellOiledCrankshaft");
  assert.equal(game.getDrillDps(), 675);
  assert.equal(game.getNextDrillUpgrade().id, "steelDrillHead");
  assert.equal(game.DRILL_UPGRADES.steelDrillHead.cash, 1.2e5);
  assert.equal(game.DRILL_UPGRADES.steelDrillHead.dps, 2.5e3);
  assert.equal(
    game.DRILL_UPGRADES.steelDrillHead.description,
    "We'd prefer not to disclose who's making these drill parts. Better to not incite technological jealousy.",
  );
  state.cash = 1.2e5;
  assert.equal(game.purchaseDrillUpgrade("steelDrillHead"), true);
  assert.equal(state.drill.upgradeId, "steelDrillHead");
  assert.equal(game.getDrillDps(), 2.5e3);
  assert.equal(game.getNextDrillUpgrade().id, "gameController");
  assert.equal(game.DRILL_UPGRADES.gameController.cash, 1.337e6);
  assert.equal(game.DRILL_UPGRADES.gameController.dps, 9001);
  assert.equal(
    game.DRILL_UPGRADES.gameController.description,
    "Since when were gamer hamsters this good at operating drills?",
  );
  assert.equal(game.formatCash(1.337e6, 3, 4), "$1.337M");
  state.cash = 1.337e6;
  assert.equal(game.purchaseDrillUpgrade("gameController"), true);
  assert.equal(state.drill.upgradeId, "gameController");
  assert.equal(game.getDrillDps(), 9001);
  assert.equal(game.getNextDrillUpgrade().id, "diamondTipped");
  assert.equal(game.DRILL_UPGRADES.diamondTipped.cash, 1e12);
  assert.equal(game.DRILL_UPGRADES.diamondTipped.dps, 2e6);
  assert.equal(game.canAffordDrillUpgrade("diamondTipped"), false);
  state.cash = 1e12;
  assert.equal(game.canAffordDrillUpgrade("diamondTipped"), false);
  state.diamondFragments = 3;
  assert.equal(game.canAffordDrillUpgrade("diamondTipped"), true);
  assert.equal(game.purchaseDrillUpgrade("diamondTipped"), true);
  assert.equal(state.drill.upgradeId, "diamondTipped");
  assert.equal(game.getDrillDps(), 2e6);
  assert.equal(game.getNextDrillUpgrade(), null);
});

test("hydration preserves the Well-Oiled Crankshaft", () => {
  const saved = game.createInitialState();
  saved.drill.upgradeId = "wellOiledCrankshaft";
  saved.mine.tunnelProgress = {
    2: { drill: { upgradeId: "castIron" } },
  };
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.drill.upgradeId, "wellOiledCrankshaft");
  assert.equal(hydrated.mine.tunnelProgress[2].drill.upgradeId, "wellOiledCrankshaft");
});

test("Reality Shield challenge uses the diamond drill, 1B HP, and 30-second waves", () => {
  const state = freshState();
  state.drill.upgradeId = "diamondTipped";
  state.ammoStacks = [{ type: "rapidfire", material: "leek", damage: 1, count: 2, annealed: false }];
  assert.equal(game.REALITY_SHIELD_HP, 1e9);
  assert.equal(game.REALITY_SHIELD_DEFAULT_INTERVAL_SECONDS, 30);
  assert.equal(game.canStartRealityShield(), true);
  assert.equal(game.startRealityShield(), true);
  assert.equal(state.mine.realityShield.active, true);
  assert.equal(state.mine.realityShield.hitPointsRemaining, 1e9);

  game.updateRealityShield(30);
  assert.equal(state.mine.realityShield.ores.length, 20);
  assert.equal(game.CONFIG.realityShieldColumns, 16);
  assert.equal(game.CONFIG.realityShieldRows, 8);
  assert.deepEqual(game.RESOURCE_DEFINITIONS.realityShieldCrosshair, {
    label: "Reality shield crosshair",
    shortLabel: "",
    segments: 1,
    hitPointsPerSegment: 1,
    yield: 0,
    stockpileKey: null,
  });
  assert.ok(state.mine.realityShield.ores.every((ore) => {
    const column = ore.cell % game.CONFIG.realityShieldColumns;
    const row = Math.floor(ore.cell / game.CONFIG.realityShieldColumns);
    return column > 0
      && column < game.CONFIG.realityShieldColumns - 1
      && row > 0
      && row < game.CONFIG.realityShieldRows - 1;
  }));
  assert.ok(state.mine.realityShield.ores.every((ore) => (
    Number.isInteger(ore.rotation)
      && Math.abs(ore.deathRotation) >= 720
      && Math.abs(ore.deathRotation) <= 1440
  )));
  assert.equal(state.mine.realityShield.refreshIntervalSeconds, 30);
  state.selectedDepositId = state.mine.realityShield.ores[0].id;
  game.fireLeek("manual");
  assert.equal(state.ammoStacks[0].count, 2);
  assert.equal(state.mine.realityShield.ores.length, 19);
  assert.equal(state.mine.realityShield.hitPointsRemaining, 9.99e8);

  state.ammoStacks = [];
  state.selectedDepositId = state.mine.realityShield.ores[0].id;
  game.fireLeek("manual");
  assert.equal(state.mine.realityShield.ores.length, 18);
});

test("Reality Shield crosshairs remain internal and unobtainable", () => {
  const state = freshState();
  assert.equal(Object.hasOwn(state.stockpile, "realityShieldCrosshair"), false);
  assert.equal(game.isObtainableMaterial("realityShieldCrosshair"), false);
  assert.equal(game.canReceiveConveyorItem({
    kind: "material",
    material: "realityShieldCrosshair",
    quantity: 1,
  }, 0, 0), false);

  const hydrated = game.hydrateSavedState({
    ...state,
    stockpile: {
      ...state.stockpile,
      realityShieldCrosshair: 5,
    },
    deposits: [{
      id: "invalid-shield-crosshair",
      type: "realityShieldCrosshair",
      cell: 0,
      segmentsRemaining: 1,
    }],
  });
  assert.equal(Object.hasOwn(hydrated.stockpile, "realityShieldCrosshair"), false);
  assert.equal(hydrated.deposits.some(({ type }) => type === "realityShieldCrosshair"), false);
});

test("Reality Shield refreshes instead of stacking waves and doubles the next delay", () => {
  const state = freshState();
  state.drill.upgradeId = "diamondTipped";
  game.startRealityShield();
  game.updateRealityShield(30);
  assert.equal(state.mine.realityShield.ores.length, 20);

  game.updateRealityShield(30);
  assert.equal(state.mine.realityShield.ores.length, 20);
  assert.equal(state.mine.realityShield.refreshIntervalSeconds, 60);

  state.mine.realityShield.ores = [];
  game.updateRealityShield(60);
  assert.equal(state.mine.realityShield.ores.length, 20);
  assert.equal(state.mine.realityShield.refreshIntervalSeconds, 30);
});

test("Reality Shield wave clearing deals bonus damage and clamps the next timer", () => {
  const state = freshState();
  state.drill.upgradeId = "diamondTipped";
  game.startRealityShield();
  game.updateRealityShield(30);
  state.mine.realityShield.refreshTimer = 45;

  for (const ore of [...state.mine.realityShield.ores]) {
    state.selectedDepositId = ore.id;
    game.fireLeek("manual");
  }

  assert.equal(state.mine.realityShield.ores.length, 0);
  assert.equal(state.mine.realityShield.hitPointsRemaining, 8.8e8);
  assert.equal(state.mine.realityShield.refreshTimer, 30);
});

test("click-style shield crosshair kills bypass segment HP and count after one target", () => {
  const state = freshState();
  state.drill.upgradeId = "diamondTipped";
  game.startRealityShield();
  game.updateRealityShield(30);
  const target = state.mine.realityShield.ores[0];

  assert.equal(game.defeatRealityShieldOre(target.id), true);
  assert.equal(state.mine.realityShield.ores.length, 19);
  assert.equal(state.mine.realityShield.hitPointsRemaining, 9.99e8);
  assert.equal(state.selectedDepositId, null);
});

test("Icantake'em test battles borrow Diamond DPS without granting or erasing completion", () => {
  const state = freshState();
  state.drill.upgradeId = "steelDrillHead";
  state.mine.realityShield.completed = true;
  assert.equal(game.startRealityShield(true), true);
  assert.equal(state.drill.upgradeId, "steelDrillHead");
  assert.equal(state.mine.realityShield.temporaryBattle, true);

  state.mine.realityShield.ores = [];
  state.mine.realityShield.refreshTimer = 1e3;
  game.updateRealityShield(500);
  assert.equal(state.mine.realityShield.active, false);
  assert.equal(state.mine.realityShield.completed, true);
  assert.equal(state.mine.realityShield.temporaryBattle, false);
  assert.equal(state.drill.upgradeId, "steelDrillHead");

  const saved = game.createInitialState();
  saved.mine.realityShield.completed = true;
  saved.mine.realityShield.active = true;
  saved.mine.realityShield.temporaryBattle = true;
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.mine.realityShield.completed, true);
  assert.equal(hydrated.mine.realityShield.active, false);
  assert.equal(hydrated.mine.realityShield.temporaryBattle, false);
});

test("Icantake'em activates from the typed cheat code", () => {
  const state = freshState();
  state.drill.upgradeId = "steelDrillHead";
  for (const character of "Icantake'em") {
    game.registerRealityShieldCheatKey(character);
  }
  assert.equal(state.mine.realityShield.active, true);
  assert.equal(state.mine.realityShield.temporaryBattle, true);
  assert.equal(state.drill.upgradeId, "steelDrillHead");
});

test("Duster stamps raw ore value exactly once", () => {
  const duster = machine("leekDuster", "duster-a", 4, 4);
  freshState({ machines: [duster], crew: { total: 1 }, kilnJobs: [], molderJobs: [] });
  const upgradeTile = game.getMachineUpgradeTile(duster);
  const ore = { kind: "material", material: "copper", quantity: 1, dusted: false };

  game.markItemForDuster(ore, upgradeTile.column, upgradeTile.row);
  assert.equal(ore.dusted, true);
  assert.equal(game.getItemSaleValue(ore), 0.625);
  game.markItemForDuster(ore, upgradeTile.column, upgradeTile.row);
  assert.equal(game.getItemSaleValue(ore), 0.625);
});

test("both ingot types inherit input ore value times four", () => {
  const molder = machine("ingotMolder", "molder-a", 1, 0);
  const state = freshState({
    machines: [molder],
    internalConveyorItems: {},
    molderJobs: [],
  });

  const malachiteJob = {
    molderInstanceId: "molder-a",
    material: "copper",
    sourceValue: 0.625,
    secondsRemaining: 0,
  };
  state.molderJobs = [malachiteJob];
  game.completeMolderJob(malachiteJob);
  const malachiteIngot = state.internalConveyorItems["molder-a:0"];
  assert.equal(malachiteIngot.material, "brittleCopperIngot");
  assert.equal(malachiteIngot.saleValueBase, 2.5);
  assert.equal(game.getItemSaleValue(malachiteIngot), 2.5);

  state.internalConveyorItems = {};
  const nativeCopperJob = {
    molderInstanceId: "molder-a",
    material: "nativeCopper",
    sourceValue: 0.5,
    secondsRemaining: 0,
  };
  state.molderJobs = [nativeCopperJob];
  game.completeMolderJob(nativeCopperJob);
  const nativeCopperIngot = state.internalConveyorItems["molder-a:0"];
  assert.equal(nativeCopperIngot.material, "copperIngot");
  assert.equal(nativeCopperIngot.saleValueBase, 2);
  assert.equal(game.getItemSaleValue(nativeCopperIngot), 2);
});

test("storage has the intentional $2 ingot minimum", () => {
  assert.equal(game.getSaleValue("copperIngot"), 2);
  assert.equal(game.getSaleValue("brittleCopperIngot"), 2);
});

test("Annealer applies once to molded ingots and mineral bullet stacks after delays", () => {
  const annealer = machine("graphiteCopperAnnealer", "annealer-a", 5, 5);
  const state = freshState({ machines: [annealer], internalConveyorItems: {} });
  const output = {
    ...game.getInternalConveyorTiles(annealer)[2],
    internalMachineId: "graphiteCopperAnnealer",
    internalMachineInstanceId: "annealer-a",
    internalIndex: 2,
  };
  const ingot = {
    kind: "material",
    material: "brittleCopperIngot",
    quantity: 1,
    saleValueBase: 2,
    freshMoldedAt: Date.now() - 3.6e6,
  };
  game.transformItemLeavingConveyor(output, ingot);
  assert.equal(game.getItemSaleValue(ingot), 3.4);
  game.transformItemLeavingConveyor(output, ingot);
  assert.equal(game.getItemSaleValue(ingot), 3.4);

  const bullets = {
    kind: "ammo",
    material: "copper",
    quantity: 25,
    damage: 3,
    casterFinishedAt: Date.now() - 3.6e6,
  };
  game.transformItemLeavingConveyor(output, bullets);
  assert.equal(bullets.annealed, true);
  assert.equal(bullets.damage, 5.1);
  game.addAmmo(bullets.quantity, bullets.material, "rapidfire", bullets.damage, bullets.annealed);
  assert.deepEqual(state.ammoStacks, [{
    type: "rapidfire",
    damage: 5.1,
    material: "copper",
    count: 25,
    annealed: true,
  }]);
});

test("normal and annealed Malachite ammunition never merge", () => {
  const state = freshState({ ammoStacks: [] });
  game.addAmmo(25, "copper", "rapidfire", 3, false);
  game.addAmmo(25, "copper", "rapidfire", 3, true);

  assert.equal(state.ammoStacks.length, 2);
  assert.deepEqual(
    state.ammoStacks.map(({ count, damage, annealed }) => ({ count, damage, annealed })),
    [
      { count: 25, damage: 3, annealed: false },
      { count: 25, damage: 5.1, annealed: true },
    ],
  );
});

test("normal and annealed jacketed ammunition remain distinct variants", () => {
  const state = freshState({ ammoStacks: [] });
  const composition = { jacketMaterial: "nativeCopper", coreMaterial: "leek" };
  game.addAmmo(10, "copper", "rapidfire", 6.4, false, composition);
  game.addAmmo(10, "copper", "rapidfire", 6.4, true, composition);

  assert.equal(state.ammoStacks.length, 2);
  assert.deepEqual(
    state.ammoStacks.map(({ count, damage, annealed, jacketMaterial }) => ({
      count, damage, annealed, jacketMaterial,
    })),
    [
      { count: 10, damage: (1 * 3) ** 0.85, annealed: false, jacketMaterial: "nativeCopper" },
      { count: 10, damage: (1 * 3) ** 0.85 * 1.7, annealed: true, jacketMaterial: "nativeCopper" },
    ],
  );
});

test("adding new ammo repairs an already-open outdated annealed stack", () => {
  const state = freshState({
    ammoStacks: [{
      type: "rapidfire",
      material: "copper",
      count: 10,
      damage: 3,
      annealed: true,
    }],
  });
  game.addAmmo(25, "copper", "rapidfire", 3, true);

  assert.deepEqual(state.ammoStacks, [{
    type: "rapidfire",
    material: "copper",
    count: 35,
    damage: 5.1,
    annealed: true,
  }]);
});

test("hydration repairs annealed ammo without changing normal stacks", () => {
  const saved = game.createInitialState();
  saved.ammoStacks = [
    { type: "rapidfire", material: "copper", count: 10, damage: 3, annealed: false },
    { type: "rapidfire", material: "copper", count: 10, damage: 3, annealed: true },
  ];
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.ammoStacks[0].damage, 3);
  assert.equal(hydrated.ammoStacks[0].annealed, false);
  assert.equal(hydrated.ammoStacks[1].damage, 5.1);
  assert.equal(hydrated.ammoStacks[1].annealed, true);
});

test("hydration repairs legacy jacketed core damage", () => {
  const saved = game.createInitialState();
  saved.ammoStacks = [{
    type: "rapidfire",
    material: "lead",
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    count: 25,
    damage: 5,
    annealed: false,
  }];
  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.ammoStacks[0].count, 25);
  assert.ok(Math.abs(hydrated.ammoStacks[0].damage - ((5 * 3) ** 0.85)) < 1e-9);
});

test("hydration repairs and merges stale non-jacketed ammo stacks", () => {
  const saved = game.createInitialState();
  saved.ammoStacks = [
    { type: "rapidfire", material: "copper", count: 10, damage: 3, annealed: false },
    { type: "rapidfire", material: "copper", count: 20, damage: 5.1, annealed: false },
    { type: "rapidfire", material: "lead", count: 30, damage: 3, annealed: false },
    { type: "rapidfire", material: "lead", count: 40, damage: 5, annealed: false },
  ];
  const hydrated = game.hydrateSavedState(saved);

  assert.deepEqual(
    hydrated.ammoStacks.map(({ material, count, damage, annealed }) => ({
      material, count, damage, annealed,
    })),
      [
        { material: "copper", count: 30, damage: 3, annealed: false },
        { material: "lead", count: 70, damage: 5, annealed: false },
      ],
  );
});

test("ammo selector variants come from actual stacks and select the exact variant", () => {
  const state = freshState({
    ammoStacks: [
      { type: "rapidfire", material: "copper", count: 10, damage: 3, annealed: false },
      { type: "rapidfire", material: "copper", count: 25, damage: 5.1, annealed: true },
    ],
  });
  state.mine.selectedAmmoMaterial = "copper";
  state.mine.selectedAmmoAnnealed = true;

  assert.deepEqual(
    game.getAmmoSelectorOptions().filter(({ material }) => material === "copper"),
    [
      { material: "copper", annealed: false, damage: 3 },
      { material: "copper", annealed: true, damage: 5.1 },
    ],
  );
  assert.equal(game.getSelectedAmmoStack().damage, 5.1);
  assert.equal(game.getSelectedAmmoStack().count, 25);
});

test("switching between Buckshot and Rapidfire restores each gun's exact ammo composition", () => {
  const state = freshState({
    ammoStacks: [
      {
        type: "rapidfire",
        material: "lead",
        coreMaterial: "lead",
        jacketMaterial: "nativeCopper",
        casingMaterial: "bronze",
        count: 25,
        damage: (5 * 3) ** 0.85,
        annealed: false,
      },
      {
        type: "buckshot",
        material: "lead",
        coreMaterial: "lead",
        jacketMaterial: "nativeCopper",
        casingMaterial: "bronze",
        count: 5,
        damage: (5 * 3) ** 0.85 * 3 * 0.5,
        annealed: false,
      },
    ],
  });
  state.mine.rapidfireGunMk1Purchased = true;
  state.mine.buckshotGunPurchased = true;
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoCasingMaterial = "bronze";
  state.mine.selectedAmmoJacketMaterial = "nativeCopper";
  state.mine.selectedAmmoDamage = (5 * 3) ** 0.85;
  state.mine.selectedAmmoByGun.rapidfire = {
    material: "lead",
    coreMaterial: "lead",
    casingMaterial: "bronze",
    jacketMaterial: "nativeCopper",
    damage: (5 * 3) ** 0.85,
    annealed: false,
  };
  state.mine.selectedAmmoByGun.buckshot = {
    material: "lead",
    coreMaterial: "lead",
    casingMaterial: "bronze",
    jacketMaterial: "nativeCopper",
    damage: (5 * 3) ** 0.85 * 3 * 0.5,
    annealed: false,
  };

  assert.equal(game.selectGun("buckshot"), true);
  assert.equal(game.getSelectedAmmoStack()?.type, "buckshot");
  assert.equal(game.getSelectedAmmoStack()?.casingMaterial, "bronze");

  assert.equal(game.selectGun("rapidfire"), true);
  assert.equal(game.getSelectedAmmoStack()?.type, "rapidfire");
  assert.equal(game.getSelectedAmmoStack()?.casingMaterial, "bronze");
});

test("legacy ammo without a type remains selectable as Rapidfire ammunition", () => {
  const saved = game.createInitialState();
  saved.mine.rapidfireGunMk1Purchased = true;
  saved.ammoStacks = [{
    material: "lead",
    coreMaterial: "lead",
    jacketMaterial: "nativeCopper",
    casingMaterial: "bronze",
    count: 25,
    damage: (5 * 3) ** 0.85,
    annealed: false,
  }];

  const hydrated = game.hydrateSavedState(saved);
  assert.equal(hydrated.ammoStacks[0].type, "rapidfire");
  assert.equal(hydrated.ammoStacks[0].casingMaterial, "bronze");

  const state = freshState({
    ammoStacks: [saved.ammoStacks[0]],
  });
  state.mine.rapidfireGunMk1Purchased = true;
  assert.equal(game.getSelectedAmmoStack(), null);
  state.mine.selectedAmmoMaterial = "lead";
  state.mine.selectedAmmoCoreMaterial = "lead";
  state.mine.selectedAmmoCasingMaterial = "bronze";
  state.mine.selectedAmmoJacketMaterial = "nativeCopper";
  state.mine.selectedAmmoDamage = (5 * 3) ** 0.85;
  assert.equal(game.getSelectedAmmoStack()?.casingMaterial, "bronze");
});

test("ammo compositions group by casing, jacket, and core without mixing damage stacks", () => {
  const stacks = [
    { type: "rapidfire", material: "leek", count: 10, damage: 1, annealed: false },
    { type: "rapidfire", material: "copper", count: 25, damage: 3, annealed: false, jacketMaterial: "copper", coreMaterial: "leek" },
    { type: "rapidfire", material: "copper", count: 10, damage: 5.1, annealed: true, jacketMaterial: "copper", coreMaterial: "leek" },
    { type: "rapidfire", material: "lead", count: 10, damage: 8, annealed: false, casingMaterial: "bronze", jacketMaterial: "copper", coreMaterial: "lead" },
  ];
  const groups = game.groupAmmoStacks(stacks);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0], {
    casingMaterial: null,
    jacketMaterial: null,
    coreMaterial: "leek",
    stacks: [stacks[0]],
  });
  assert.deepEqual(groups[1].stacks.map(({ damage }) => damage), [3, 5.1]);
  assert.equal(groups[1].jacketMaterial, "copper");
  assert.equal(groups[2].casingMaterial, "bronze");
  assert.equal(game.getAmmoCompositionKey(stacks[1]), game.getAmmoCompositionKey(stacks[2]));
});

test("ammo composition keys ignore damage so damage remains a separate selector level", () => {
  const normal = { material: "copper", coreMaterial: "leek", jacketMaterial: "copper", damage: 3 };
  const annealed = { ...normal, damage: 5.1, annealed: true };
  assert.equal(game.getAmmoCompositionKey(normal), game.getAmmoCompositionKey(annealed));
});

test("ammo composition grouping preserves exact damage variants for exact counts", () => {
  const stacks = [
    { type: "rapidfire", material: "copper", coreMaterial: "leek", jacketMaterial: "copper", count: 25, damage: 3 },
    { type: "rapidfire", material: "copper", coreMaterial: "leek", jacketMaterial: "copper", count: 10, damage: 5.1, annealed: true },
    { type: "rapidfire", material: "copper", coreMaterial: "leek", jacketMaterial: "copper", count: 4, damage: 3 },
  ];
  const group = game.groupAmmoStacks(stacks)[0];
  assert.deepEqual(group.stacks.filter(({ damage }) => damage === 3).map(({ count }) => count), [25, 4]);
  assert.equal(group.stacks.find(({ damage }) => damage === 5.1).count, 10);
});

test("the gun consumes the exact hierarchical damage selection", () => {
  const state = freshState({
    ammoStacks: [
      { type: "rapidfire", material: "copper", count: 25, damage: 3, annealed: false },
      { type: "rapidfire", material: "copper", count: 10, damage: 5.1, annealed: true },
    ],
  });
  state.mine.selectedAmmoMaterial = "copper";
  state.mine.selectedAmmoCoreMaterial = "copper";
  state.mine.selectedAmmoDamage = 5.1;
  state.mine.selectedAmmoAnnealed = true;

  const ammo = game.consumeAmmo();
  assert.equal(ammo.damage, 5.1);
  assert.equal(state.ammoStacks.find(({ damage }) => damage === 5.1).count, 9);
  assert.equal(state.ammoStacks.find(({ damage }) => damage === 3).count, 25);
});

test("Lead coated ammunition starts at 5 damage and anneals from the Lead baseline", () => {
  assert.equal(game.LEAD_AMMO_DAMAGE, 5);
  assert.equal(game.getBaseAmmoDamage("lead"), 5);
  const state = freshState({ ammoStacks: [] });
  game.addAmmo(25, "lead", "rapidfire", 5, false);
  game.addAmmo(25, "lead", "rapidfire", 5, true);
  assert.deepEqual(
    state.ammoStacks.map(({ damage, annealed }) => ({ damage, annealed })),
    [
      { damage: 5, annealed: false },
      { damage: 8.5, annealed: true },
    ],
  );
});

test("Lead is offered as a 5-damage ammo selection", () => {
  freshState({ ammoStacks: [] });
  const lead = game.getAmmoSelectorOptions().find(({ material }) => material === "lead");
  assert.deepEqual(lead, { material: "lead", annealed: false, damage: 5 });
});

test("multiple kilns run independently when four crew are available", () => {
  const kilnA = machine("clayKiln", "kiln-a", 0, 0);
  const kilnB = machine("clayKiln", "kiln-b", 3, 0);
  const state = freshState({
    machines: [kilnA, kilnB],
    crew: { total: 4 },
    kilnInputs: [
      { kilnInstanceId: "kiln-a", material: "copper", sourceValue: 5 },
      { kilnInstanceId: "kiln-b", material: "nativeCopper", sourceValue: 5 },
    ],
    kilnJobs: [],
    molderJobs: [],
    moltenCopper: [],
  });

  assert.equal(game.startKilnJobs(), 2);
  assert.equal(state.kilnJobs.length, 2);
  assert.equal(game.getBusyCrew(), 4);
  assert.equal(game.isMachineBusy(kilnA), true);
  assert.equal(game.isMachineBusy(kilnB), true);

  game.updateCrewOperatedMachines(5);
  assert.equal(state.kilnJobs.length, 0);
  assert.equal(state.moltenCopper.length, 2);
  assert.deepEqual(
    new Set(state.moltenCopper.map(({ kilnInstanceId }) => kilnInstanceId)),
    new Set(["kiln-a", "kiln-b"]),
  );
});

test("active buildings remain eligible for pickup and repositioning", () => {
  const kiln = machine("clayKiln", "kiln-active", 10, 10);
  const state = freshState({
    machines: [kiln],
    kilnJobs: [{ kilnInstanceId: kiln.instanceId, secondsRemaining: 2 }],
  });
  assert.equal(game.isMachineBusy(kiln), true);
  assert.equal(game.canPickUpMachine(kiln), true);
  assert.equal(state.machines.includes(kiln), true);
});

test("machine conveyor previews use the same rotated internal layout", () => {
  const right = game.getInternalConveyorTiles(machine("graphiteCopperAnnealer", "right", 4, 4, "right"));
  const up = game.getInternalConveyorTiles(machine("graphiteCopperAnnealer", "up", 4, 4, "up"));
  assert.equal(right.length, 3);
  assert.equal(up.length, 3);
  assert.deepEqual(right.map(({ direction }) => direction), ["right", "up", "up"]);
  assert.deepEqual(up.map(({ direction }) => direction), ["up", "left", "left"]);
});

test("Metal Press converts ingots into matching value-preserving plates", () => {
  const press = machine("metalPress", "press-1", 0, 0);
  const state = freshState({ machines: [press] });
  assert.equal(game.MACHINE_LAYOUT.metalPress.width, 2);
  assert.equal(game.MACHINE_LAYOUT.metalPress.height, 3);
  assert.equal(game.MACHINE_LAYOUT.metalPress.processLaneIndex, 1);
  assert.deepEqual(game.getInternalConveyorTiles(press).map(({ column, row }) => ({ column, row })), [
    { column: 0, row: 1 },
    { column: 1, row: 1 },
  ]);
  const conveyor = {
    internalMachineId: "metalPress",
    internalMachineInstanceId: "press-1",
    internalIndex: 1,
  };
  const item = {
    kind: "material",
    material: "bronzeIngot",
    quantity: 1,
    saleValueBase: 123,
    saleValueBonus: 4,
  };

  const result = game.transformItemLeavingConveyor(conveyor, item);

  assert.equal(result.material, "bronzePlate");
  assert.equal(result.saleValueBase, 123);
  assert.equal(result.saleValueBonus, 0);
  assert.equal(game.MACHINE_PURCHASES.metalPress.cash, 5e4);
  assert.equal(game.MACHINE_PURCHASES.metalPress.materials.bronzeIngot, 20);
  assert.equal(state.machineInventory.metalPress, 0);
});

test("factory cargo distinguishes all ingots from the older plate box shape", () => {
  assert.equal(game.getFactoryMaterialVisualKind("copperIngot"), "ingot");
  assert.equal(game.getFactoryMaterialVisualKind("silverIngot"), "ingot");
  assert.equal(game.getFactoryMaterialVisualKind("bronzeIngot"), "ingot");
  assert.equal(game.getFactoryMaterialVisualKind("silverPlate"), "plate");
  assert.equal(game.getFactoryMaterialVisualKind("bronzePlate"), "plate");
});

test("Stacker accepts three input directions and releases its configured batch size", () => {
  const stacker = machine("stacker", "stacker-1", 2, 5);
  stacker.stackSize = 3;
  const state = freshState({
    machines: [stacker],
    placedConveyors: [
      { column: 3, row: 5, direction: "right" },
    ],
  });

  assert.equal(game.MACHINE_LAYOUT.stacker.width, 1);
  assert.equal(game.MACHINE_LAYOUT.stacker.height, 1);
  assert.equal(game.MACHINE_PURCHASES.stacker.cash, 2e3);
  assert.deepEqual(game.MACHINE_PURCHASES.stacker.materials, {
    bronzePlate: 5,
    wire: 10,
    contact: 10,
  });

  const item = { kind: "material", material: "bronzePlate", quantity: 5, saleValueBase: 20 };
  assert.equal(game.canReceiveConveyorItem(item, 2, 5), true);
  assert.equal(game.receiveConveyorItem(item, 2, 5), true);
  assert.equal(state.stackerBuffers[stacker.instanceId].quantity, 5);

  game.emitStackerOutputs();
  const outputConveyor = state.placedConveyors.find(({ column, row }) => column === 3 && row === 5);
  const output = outputConveyor.item;
  assert.equal(output.material, "bronzePlate");
  assert.equal(output.quantity, 3);
  assert.equal(state.stackerBuffers[stacker.instanceId].quantity, 2);

  const topInput = { kind: "material", material: "bronzePlate", quantity: 1 };
  assert.equal(game.canStackerReceiveFromConveyor(stacker, { direction: "right" }), true);
  assert.equal(game.canStackerReceiveFromConveyor(stacker, { direction: "down" }), true);
  assert.equal(game.canStackerReceiveFromConveyor(stacker, { direction: "up" }), true);
  assert.equal(game.canStackerReceiveFromConveyor(stacker, { direction: "left" }), false);
  assert.equal(game.receiveConveyorItem(topInput, 2, 5), true);
  assert.equal(state.stackerBuffers[stacker.instanceId].quantity, 3);
  assert.equal(game.canReceiveConveyorItem(topInput, 2, 5), false);
  assert.equal(game.receiveConveyorItem(topInput, 2, 5), false);
  outputConveyor.item = null;
  assert.equal(game.canReceiveConveyorItem(topInput, 2, 5), true);
});

test("Splitter matches the Stacker's logistics cost and 1x1 footprint", () => {
  const splitter = machine("splitter", "splitter-cost", 2, 5);
  const state = freshState({ cash: 2e3, machines: [splitter] });
  state.stockpile.bronzePlate = 5;
  state.stockpile.wire = 10;
  state.stockpile.contact = 10;

  assert.equal(game.MACHINE_LAYOUT.splitter.width, 1);
  assert.equal(game.MACHINE_LAYOUT.splitter.height, 1);
  assert.deepEqual(game.MACHINE_PURCHASES.splitter, game.MACHINE_PURCHASES.stacker);
  assert.deepEqual(game.getMachineCategories("splitter"), ["logistics"]);
  assert.equal(game.canAffordMachinePurchase("splitter"), true);
  assert.equal(game.getBusyCrew(), 0);
  assert.equal(state.machineInventory.splitter, 0);
});

test("Splitter cycles whole stacks round-robin over its three free exits", () => {
  const splitter = machine("splitter", "splitter-cycle", 10, 10);
  const input = { column: 9, row: 10, direction: "right", item: null };
  const exits = [
    { column: 11, row: 10, direction: "right", item: null },
    { column: 10, row: 9, direction: "up", item: null },
    { column: 10, row: 11, direction: "down", item: null },
  ];
  const state = freshState({ machines: [splitter], placedConveyors: [input, ...exits] });
  const expected = [exits[0], exits[1], exits[2], exits[0]];

  expected.forEach((exit, index) => {
    input.item = { kind: "material", material: "copper", quantity: 25, tileProgress: 1 };
    game.advanceConveyorItems(0.1);
    assert.equal(exit.item?.quantity, 25);
    assert.equal(exit.item?.material, "copper");
    assert.equal(splitter.splitterNextOutputIndex, (index + 1) % 3);
    exit.item = null;
  });

  const hydrated = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(hydrated.machines[0].splitterNextOutputIndex, 1);
});

test("Splitter skips blocked and incompatible exits, and waits without consuming its turn if all are blocked", () => {
  const splitter = machine("splitter", "splitter-blocked", 10, 10);
  const input = {
    column: 9,
    row: 10,
    direction: "right",
    item: { kind: "material", material: "copper", quantity: 1, tileProgress: 1 },
  };
  const exits = [
    { column: 11, row: 10, direction: "right", item: { kind: "material", material: "clay", quantity: 1, tileProgress: 1 } },
    { column: 10, row: 9, direction: "up", item: null },
    { column: 10, row: 11, direction: "down", item: null },
  ];
  freshState({ machines: [splitter], placedConveyors: [input, ...exits] });
  game.advanceConveyorItems(0.1);
  assert.equal(exits[1].item?.material, "copper");
  assert.equal(splitter.splitterNextOutputIndex, 2);

  const fullyBlocked = machine("splitter", "splitter-no-exit", 10, 10);
  const blockedInput = {
    column: 9,
    row: 10,
    direction: "right",
    item: { kind: "material", material: "copper", quantity: 1, tileProgress: 1 },
  };
  const blockedExits = [
    { column: 11, row: 10, direction: "right", item: { kind: "material", material: "clay", quantity: 1, tileProgress: 1 } },
    { column: 10, row: 9, direction: "up", item: { kind: "material", material: "clay", quantity: 1, tileProgress: 1 } },
    { column: 10, row: 11, direction: "down", item: { kind: "material", material: "clay", quantity: 1, tileProgress: 1 } },
  ];
  freshState({ machines: [fullyBlocked], placedConveyors: [blockedInput, ...blockedExits] });
  game.advanceConveyorItems(0.1);
  assert.equal(blockedInput.item?.material, "copper");
  assert.equal(fullyBlocked.splitterNextOutputIndex, 0);

  const incompatible = machine("splitter", "splitter-incompatible", 10, 10);
  const jacketFormer = machine("jacketFormer", "splitter-jacket-former", 11, 9);
  const incompatibleInput = {
    column: 9,
    row: 10,
    direction: "right",
    item: { kind: "material", material: "copper", quantity: 1, tileProgress: 1 },
  };
  const otherExits = [
    { column: 10, row: 9, direction: "up", item: null },
    { column: 10, row: 11, direction: "down", item: null },
  ];
  freshState({
    machines: [incompatible, jacketFormer],
    placedConveyors: [incompatibleInput, ...otherExits],
  });
  game.advanceConveyorItems(0.1);
  assert.equal(otherExits[0].item?.material, "copper");
  assert.equal(incompatible.splitterNextOutputIndex, 2);
});
