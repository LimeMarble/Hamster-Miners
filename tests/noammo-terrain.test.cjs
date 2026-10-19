const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const { Factory, createState, cargo, DATA: D } = A;

// Independent transcription of the revised workbook's green center cells.
const centers = [
  [110,41],[128,42],[162,44],[59,49],[119,55],[181,55],[69,60],[63,64],[158,68],[67,75],
  [130,105],[137,108],[118,112],[133,116],[184,121],[129,130],[136,132],[97,133],[167,134],[76,136],
  [131,139],[124,141],[135,149],[113,155],[128,160],[74,169],[68,183],[71,192],[147,202],[166,205],
  [99,211],[68,213],[142,216],[147,216],[164,226],[142,227],
];
function legacyFactory() {
  const state = createState(924);
  delete state.terrainVersion;
  state.trees = Array.from({ length: 30 }, (_, i) => ({
    id: `tree-${i + 1}`, x: 3 + (i % 10) * 20, y: 160 + Math.floor(i / 10) * 20,
  }));
  return new Factory(state);
}
function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, `${type}: ${result.error}`);
  return result.machine;
}

test("all fresh saves use the exact revised 36-tree map, independent of seed and object mutations", () => {
  const first = createState(1), other = createState(4294967295);
  assert.equal(D.config.treeCount, 36);
  assert.deepEqual(first.trees.map(({ x, y }) => [x + 2, y + 2]), centers);
  assert.deepEqual(other.trees, first.trees);
  assert.equal(first.terrainVersion, D.startingTerrain.version);
  first.trees[0].x = 0; first.trees.pop();
  assert.deepEqual(createState(1).trees, other.trees);
  assert.equal(other.random, 4294967295, "terrain does not consume the Wood harvest RNG");
});

test("fixed trees fit inside the grid without overlap or obstructed Logger outputs", () => {
  const factory = new Factory();
  const occupied = new Set();
  for (const tree of factory.state.trees) {
    assert.ok(tree.x >= 0 && tree.y >= 0 && tree.x + 3 <= 250 && tree.y + 3 <= 250);
    for (let y = tree.y; y < tree.y + 3; y++) for (let x = tree.x; x < tree.x + 3; x++) {
      assert.equal(occupied.has(A.key(x, y)), false); occupied.add(A.key(x, y));
    }
  }
  for (const tree of factory.state.trees) {
    for (const [x, y, facing, outX, outY] of [
      [tree.x, tree.y + 1, "left", tree.x - 1, tree.y + 1],
      [tree.x + 2, tree.y + 1, "right", tree.x + 3, tree.y + 1],
      [tree.x + 1, tree.y, "up", tree.x + 1, tree.y - 1],
      [tree.x + 1, tree.y + 2, "down", tree.x + 1, tree.y + 3],
    ]) {
      assert.equal(factory.placement("logger", x, y, facing), null);
      assert.equal(occupied.has(A.key(outX, outY)), false);
    }
  }
});

test("old terrain picks up every machine and recovers all buffers, jobs, lanes and hauling cargo exactly once", () => {
  const factory = legacyFactory(), state = factory.state;
  state.cash = 88; state.earned = 120; state.seconds = 99; state.hiredCrew = 3;
  state.inventory = { leek: 11, leekFiber: 12, wood: 13, brick: 14 };
  state.harvestProgress = 3; state.harvestedWood = 7;
  const planter = place(factory, "planter", 40, 40); planter.output.push(cargo("leek", 2));
  const fiber = place(factory, "fiber", 45, 40);
  fiber.input.push(cargo("leek")); fiber.output.push(cargo("leekFiber", 2, 4));
  fiber.job = { input: cargo("leek"), remaining: 1 };
  const basket = place(factory, "basket", 48, 40);
  basket.contents.push(cargo("wood", 4), cargo("leek", 3));
  place(factory, "belt", 50, 40).lanes[0] = cargo("wood", 5);
  const primitive = place(factory, "primitive", 52, 40);
  primitive.lanes[0] = cargo("leek", 2); primitive.lanes[1] = cargo("leekFiber", 3);
  place(factory, "wheel", 55, 40); place(factory, "drive", 60, 40, "left");
  // Legal on the old map, directly underneath a tree on the replacement map.
  place(factory, "sellTube", 108, 39);
  place(factory, "logger", 3, 161, "left").output.push(cargo("wood"));
  assert.equal(factory.addRoute(basket.id, fiber.id, "any").error, undefined);
  Object.assign(state.routes[0], { phase: "loaded", item: cargo("wood"), remaining: 1, duration: 1 });
  const owned = state.machines.map(({ id, type, facing }) => ({ id, type, facing }));
  const originalStock = { ...state.stock };
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.terrainUpdated, true); assert.equal(loaded.pickedUpForTerrainReset, owned.length);
  assert.deepEqual(loaded.state.machines, []); assert.deepEqual(loaded.state.routes, []);
  assert.deepEqual(loaded.state.inventory, { leek: 20, leekFiber: 17, wood: 24, brick: 14 });
  assert.deepEqual(loaded.state.storedMachines.map(({ id, type, facing }) => ({ id, type, facing })), owned);
  for (const type of Object.keys(D.machines)) {
    assert.equal(loaded.state.stock[type], originalStock[type] + owned.filter((m) => m.type === type).length);
  }
  for (const machine of loaded.state.storedMachines) {
    assert.deepEqual([machine.input, machine.output, machine.contents, machine.lanes, machine.job, machine.timer], [[], [], [], {}, null, 0]);
  }
  for (const field of ["cash", "earned", "seconds", "hiredCrew", "random", "nextId", "harvestProgress", "harvestedWood"]) {
    assert.equal(loaded.state[field], state[field], field);
  }
  assert.equal(loaded.availableCrew(), 13);
  assert.deepEqual(loaded.state.trees, createState().trees);
  const again = Factory.importSave(loaded.exportSave());
  assert.equal(again.terrainUpdated, false); assert.equal(again.pickedUpForTerrainReset, 0);
  assert.deepEqual(again.state, loaded.state);
  const replaced = loaded.place("planter", 40, 40).machine;
  assert.equal(replaced.id, planter.id);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state, "replacement survives refresh");
});

test("a saved map cannot bypass enforcement by keeping the current terrain version", () => {
  for (const change of [(state) => state.trees[0].x++, (state) => state.trees.pop()]) {
    const factory = new Factory(); place(factory, "planter", 40, 40);
    change(factory.state);
    const loaded = Factory.importSave(factory.exportSave());
    assert.equal(loaded.terrainUpdated, true); assert.equal(loaded.state.machines.length, 0);
    assert.deepEqual(loaded.state.trees, createState().trees);
    assert.equal(loaded.state.stock.planter, 2);
  }
});

test("empty old factories migrate without granting resources or changing existing stored machines", () => {
  const factory = legacyFactory();
  const fiber = place(factory, "fiber", 40, 40, "up"); factory.pickup(fiber.id);
  const before = A.copy(factory.state), loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.pickedUpForTerrainReset, 0);
  for (const field of ["inventory", "stock", "storedMachines", "nextId", "cash"]) assert.deepEqual(loaded.state[field], before[field]);
  assert.deepEqual(loaded.state.trees, createState().trees);
});

test("terrain migration still rejects invalid cargo and hauling records without mutating the source", () => {
  for (const corrupt of [
    (factory) => { factory.state.machines[0].input.push(cargo("leek", 2)); },
    (factory) => { factory.state.machines[0].output.push({ material: "missing", quantity: 1, value: 0 }); },
    (factory) => { factory.state.routes.push({ id: "route-100", source: "missing", destination: "missing" }); },
  ]) {
    const factory = legacyFactory(); place(factory, "fiber", 40, 40); corrupt(factory);
    const raw = factory.exportSave(); assert.throws(() => Factory.importSave(raw));
    assert.equal(factory.exportSave(), raw);
  }
});
