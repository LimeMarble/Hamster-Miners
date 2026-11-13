const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const R = require("../noammo-renderer.js");
const { DATA: D, Factory, createState, cargo, cells, ports } = A;

function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, result.error);
  return result.machine;
}
function feed(factory, kiln, material, quantity = 1, value = D.materials[material].value, inputIndex = undefined, consume = true) {
  const point = inputIndex === undefined ? ports(kiln).find(entry => entry.channel === (D.materials[material].heat ? 'fuel' : 'material'))
    : ports(kiln).filter((entry) => entry.role === "input")[inputIndex];
  return factory.receive(kiln, cargo(material, quantity, value), point.x, point.y, point.direction, consume);
}
function advance(factory, seconds) {
  while (seconds > 1e-8) { const step = Math.min(30, seconds); factory.update(step); seconds -= step; }
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`); }
function setup() {
  const factory = new Factory(createState(1)), kiln = place(factory, "kiln", 40, 40);
  return { factory, kiln };
}

test("Kiln is a plain labelled machine box, without crew tiles or labels, in every rotation", () => {
  for (const facing of D.directions) {
    const factory = new Factory(createState(1)), kiln = place(factory, "kiln", 40, 40, facing);
    const labels = [], fills = [];
    const context = new Proxy({}, { get: (object, name) => object[name] ?? ((...args) => {
      if (name === "fillText") labels.push(args[0]);
      if (name === "fillRect") fills.push({ color: object.fillStyle, args });
    }) });
    R.drawFloor(context, factory, { x: 38, y: 38, zoom: 1 }, { width: 400, height: 400 });
    assert.equal(labels.filter((label) => label === "Clay Kiln").length, 1);
    assert.equal(labels.includes("Crew"), false);
    assert.equal(fills.filter((entry) => entry.color === D.machines.kiln.color).length, 1);
    assert.equal(cells(kiln).length, 6); assert.equal(factory.availableCrew(), 18);
  }
});

test("Minor Transmutation unlocks the Kiln and grants one, with the construction price for additional copies", () => {
  assert.deepEqual(D.machines.kiln.cost, { cash: 3000, materials: { unfiredBrick: 50, clay: 10, leekFiber: 15 } });
  assert.equal(createState().stock.kiln, 0);
  const factory = new Factory(createState(1));
  factory.state.cash = 3000;
  Object.assign(factory.state.inventory, { unfiredBrick: 50, clay: 10, leekFiber: 14 });
  assert.ok(factory.buy("kiln").error); assert.equal(factory.state.cash, 3000);
  const pedestal = place(factory, "minorRunePedestal", 45, 40);
  Object.assign(factory.state.inventory, { chert: 75, clay: 25 });
  assert.equal(factory.redeemRune(pedestal.id, "transmutation").offering.machine, "primitiveOven");
  const before = factory.exportSave();
  assert.ok(factory.redeemRune(pedestal.id, "transmutation").error);
  assert.equal(factory.exportSave(), before);
  factory.state.inventory.clay = 50;
  assert.equal(factory.redeemRune(pedestal.id, "transmutation").offering.machine, "kiln");
  assert.equal(factory.state.stock.kiln, 1);
  assert.equal(factory.state.inventory.unfiredBrick, 0);
  assert.equal(factory.state.inventory.clay, 0);
  assert.equal(factory.nextRune("minor", "transmutation").machine, "primitiveFurnace");
  assert.ok(factory.redeemRune(pedestal.id, "transmutation").error);
  Object.assign(factory.state.inventory, { unfiredBrick: 50, clay: 10 });
  assert.ok(factory.buy("kiln").error);
  factory.state.inventory.leekFiber = 15;
  assert.equal(factory.buy("kiln").amount, 1);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.unfiredBrick, 0);
  assert.equal(factory.state.inventory.clay, 0); assert.equal(factory.state.inventory.leekFiber, 0);
  const kiln = factory.place("kiln", 40, 40).machine;
  assert.deepEqual(A.size(kiln), { width: 2, height: 3 }); assert.equal(cells(kiln).length, 6);
  assert.deepEqual(ports(kiln), [
    { x: 40, y: 42, direction: "left", role: "input", channel: "fuel", label: "Fuel" },
    { x: 40, y: 41, direction: "left", role: "input", channel: "material" },
    { x: 41, y: 41, direction: "right", role: "output" },
    { x: 41, y: 42, direction: "right", role: "input", channel: "fuel", label: "Fuel" },
  ]);
  assert.equal(factory.availableCrew(), 18); factory.pickup(kiln.id); assert.equal(factory.availableCrew(), 20);
  for (let index = 0; index < 19; index++) place(factory, "fiber", 50 + index * 2, 50);
  assert.match(factory.place("kiln", 40, 40).error, /hamsters/);
});

test("Both fuel tiles burn Wood into a shared 250ku buffer; material and output ports reject fuel", () => {
  for (const index of [0, 2]) {
    const { factory, kiln } = setup();
    assert.equal(D.materials.wood.heat, 30000);
    const before = factory.exportSave();
    assert.equal(feed(factory, kiln, "wood", 100, 0.1, index, false), 8);
    assert.equal(factory.exportSave(), before, "intake previews do not burn fuel");
    assert.equal(feed(factory, kiln, "wood", 100, 0.1, index), 8);
    assert.equal(kiln.heat, 240000); assert.deepEqual(kiln.input, []);
    assert.equal(feed(factory, kiln, "wood", 1, 0.1, index), 0);
    assert.equal(feed(factory, kiln, "wood", 1, 0.1, index === 0 ? 2 : 0), 0);
    kiln.heat = 220000;
    assert.equal(feed(factory, kiln, "wood", 1, 0.1, index), 1); assert.equal(kiln.heat, 250000);
    kiln.heat = 221000;
    assert.equal(feed(factory, kiln, "wood", 1, 0.1, index), 0); assert.equal(kiln.heat, 221000);
    kiln.heat = 0;
    assert.equal(factory.receive(kiln, cargo("wood"), 40, 40, "left", true), 0);
    assert.equal(factory.receive(kiln, cargo("wood"), 40, 42, "down", true), 0);
    assert.equal(feed(factory, kiln, "wood", 0.5, 0.1, index), 0);
    assert.equal(feed(factory, kiln, "clay", 1, 0.25, index), 0);
    assert.equal(feed(factory, kiln, "wood", 1, 0.1, 1), 0);
    assert.equal(feed(factory, kiln, "unfiredBrick", 4, 0.25, index), 0);
    const output = ports(kiln).find((entry) => entry.role === "output");
    assert.equal(factory.receive(kiln, cargo("wood"), output.x, output.y, "right", true), 0);
  }
});

test("Cold firing requires full batches and 96ku, consuming heat at the start of a twelve-second cycle", () => {
  for (const [material, recipe] of Object.entries(D.machines.kiln.recipes)) {
    const { factory, kiln } = setup();
    feed(factory, kiln, material, recipe.input - 1); feed(factory, kiln, "wood", 2);
    advance(factory, 60);
    assert.equal(kiln.job, null); assert.equal(kiln.heat, 60000); assert.equal(factory.total(kiln, "input"), recipe.input - 1);
    feed(factory, kiln, material); factory.update(0.1);
    assert.equal(kiln.job, null, 'two Wood supply only 60ku, below the 96ku requirement');
    assert.match(factory.status(kiln), /96k/);
    feed(factory, kiln, 'wood'); factory.update(0.1);
    assert.equal(kiln.job, null); feed(factory, kiln, 'wood'); factory.update(0.1);
    assert.equal(kiln.job.remaining, 12); assert.equal(kiln.heat, 24000); assert.equal(kiln.input.length, 0);
    factory.update(11.9); assert.equal(kiln.output.length, 0); assert.equal(kiln.heat, 24000);
    factory.update(0.1);
    assert.equal(kiln.job, null); assert.equal(factory.total(kiln, "output"), recipe.input);
    assert.equal(kiln.output[0].material, recipe.output);
    assert.equal(kiln.output[0].value, D.materials[material].value * 4);
    assert.equal(D.materials[recipe.output].value, D.materials[material].value * 4);
    feed(factory, kiln, material, recipe.input); factory.update(0.1);
    assert.equal(kiln.job, null, "24ku cannot start a second firing");
    assert.match(factory.status(kiln), /Waiting for heat/);
  }
});

test("Firing retains each upgraded input's own value, not an average or a base-value reset", () => {
  const { factory, kiln } = setup(), input = ports(kiln).find(p => p.channel === 'material');
  const upgraded = cargo("unfiredBrick", 1, 4.2); upgraded.upgrades.primitive = 4;
  factory.receive(kiln, upgraded, input.x, input.y, input.direction, true);
  feed(factory, kiln, "unfiredBrick", 3, 1.05, 1); feed(factory, kiln, "wood", 4);
  factory.update(0.1); factory.update(12);
  assert.equal(kiln.output.length, 2);
  near(kiln.output[0].value, 16.8); assert.equal(kiln.output[0].quantity, 1);
  near(kiln.output[1].value, 4.2); assert.equal(kiln.output[1].quantity, 3);
  for (const item of kiln.output) assert.deepEqual(A.gradeProbabilities(item), A.gradeProbabilities(upgraded));
  assert.deepEqual(kiln.output[0].upgrades, {}, "a new material has fresh cash eligibility");
  near(kiln.output.reduce((sum, item) => sum + item.value * item.quantity, 0), (4.2 + 3 * 1.05) * 4);
});

test("Material intake stops at one pending batch, rejects incompatible/fractional ingredients, and reopens after consumption", () => {
  const { factory, kiln } = setup();
  assert.equal(feed(factory, kiln, "unfiredBrick", 3), 3);
  assert.equal(feed(factory, kiln, "unfiredPot", 2, 1, 1), 0);
  assert.equal(feed(factory, kiln, "unfiredBrick", 100, 0.25, 1), 1);
  assert.equal(feed(factory, kiln, "unfiredBrick", 100), 0);
  assert.equal(feed(factory, kiln, "wood", 4, 0.1), 4);
  factory.update(0.1);
  assert.equal(feed(factory, kiln, "unfiredPot", 100, 4.2, 1), 2);
  assert.equal(feed(factory, kiln, "unfiredPot", 1), 0);
  assert.equal(factory.total(kiln, "input"), 2);
});

test("Blocked output retains a finished batch, one in-process batch and one waiting batch without draining more inputs or fuel", () => {
  const { factory, kiln } = setup();
  feed(factory, kiln, "wood", 8); feed(factory, kiln, "unfiredBrick", 4);
  factory.update(0.1); feed(factory, kiln, "unfiredBrick", 4, 1.05);
  factory.update(12);
  assert.equal(kiln.job.remaining, 12, "the next batch fires while the previous output waits");
  feed(factory, kiln, "unfiredBrick", 100, 2);
  advance(factory, 120);
  assert.equal(kiln.job.remaining, 0); assert.equal(kiln.heat, 48000);
  assert.equal(factory.total(kiln, "input"), 4); assert.equal(factory.total(kiln, "output"), 4);
  assert.equal(kiln.job.inputs.reduce((sum, item) => sum + item.quantity, 0), 4);
  assert.equal(feed(factory, kiln, "unfiredBrick", 100), 0);
  assert.equal(factory.status(kiln), "Output blocked");
  const other = place(factory, "kiln", 50, 40), basket = place(factory, "basket", 52, 41);
  feed(factory, other, "wood", 4); feed(factory, other, "unfiredPot", 2, 4.2);
  factory.update(0.1); factory.update(14);
  assert.equal(factory.total(basket, "contents"), 2); near(basket.contents[0].value, 16.8);
  assert.equal(kiln.job.remaining, 0, "one blocked kiln cannot stall a separate instance");
});

test("One finished Kiln batch does not prevent starting or obscure missing material and heat", () => {
  for (const [material, output, quantity] of [['unfiredBrick', 'brick', 4], ['unfiredPot', 'pot', 2]]) {
    const { factory, kiln } = setup();
    kiln.output = [cargo(output, quantity)];
    assert.equal(factory.status(kiln), 'Waiting for material');
    feed(factory, kiln, material, 1);
    assert.match(factory.status(kiln), /Waiting for a full batch/);
    feed(factory, kiln, material, quantity - 1);
    assert.match(factory.status(kiln), /Waiting for heat/);
    kiln.heat = 96000; factory.update(0.1);
    assert.equal(kiln.job.remaining, 12);
    assert.equal(factory.total(kiln, 'output'), quantity);
    assert.match(factory.status(kiln), /^Firing/);
    factory.update(12);
    assert.equal(factory.status(kiln), 'Output blocked');
    assert.equal(factory.total(kiln, 'output'), quantity);
    assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
  }
});

test("Preheated Kiln firing continues through a working Primitive Conveyor without output warnings", () => {
  for (const [material, quantity] of [['unfiredBrick', 4], ['unfiredPot', 2]]) {
    const { factory, kiln } = setup();
    place(factory, 'wheel', 38, 44); place(factory, 'drive', 39, 42, 'down');
    place(factory, 'belt', 42, 41); const basket = place(factory, 'basket', 43, 41);
    const input = ports(kiln).find(point => point.channel === 'material');
    for (let tick = 0; tick < 400; tick++) {
      kiln.heat = 250000;
      factory.receive(kiln, { ...cargo(material, quantity), preheated: true }, input.x, input.y, input.direction, true);
      factory.update(0.1);
      assert.doesNotMatch(factory.status(kiln), /Output waiting|Output blocked/);
    }
    assert.ok(factory.total(basket, 'contents') >= quantity * 5);
    assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
  }
});

test("Kiln unloads finished stacks directly into storage without an intake delay", () => {
  const { factory, kiln } = setup();
  feed(factory, kiln, "wood", 4);
  feed(factory, kiln, "unfiredBrick", 1, 2); feed(factory, kiln, "unfiredBrick", 3, 1.05);
  factory.update(0.1); factory.update(12);
  const storage = place(factory, "brickStorage", 42, 40);
  kiln.outputCooldown = 2; // An existing save may have a cooldown in progress.
  const loaded = Factory.importSave(factory.exportSave());
  loaded.update(0.1);
  const result = loaded.byId.get(storage.id);
  assert.equal(loaded.total(result, "contents"), 4);
  assert.deepEqual(result.contents.map(item => [item.quantity, item.value]), [[1, 8], [3, 4.2]]);
  assert.equal(loaded.byId.get(kiln.id).output.length, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("Resource Storage accepts full stacks immediately, limited only by its remaining capacity", () => {
  const { factory } = setup();
  const storage = place(factory, "brickStorage", 50, 40);
  const input = ports(storage).find(point => point.role === "input");
  const receive = item => factory.receive(storage, item, input.x, input.y, input.direction, true);
  assert.equal(receive(cargo("brick", 350)), 350);
  assert.equal(receive(cargo("clay", 300)), 250);
  assert.equal(receive(cargo("brick", 1)), 0);
  assert.equal(factory.total(storage, "contents"), 600);
});

test("Kiln sustains cold firing through an actual powered belt, regardless of machine order", () => {
  for (const reversed of [false, true]) {
    const { factory, kiln } = setup();
    place(factory, "wheel", 38, 44);
    const drive = place(factory, "drive", 39, 42, "down"); assert.equal(factory.driveHasWheel(drive), true);
    const belt = place(factory, "belt", 42, 41), basket = place(factory, "basket", 43, 41);
    feed(factory, kiln, "wood", 8); feed(factory, kiln, "unfiredBrick", 4);
    factory.update(0.1);
    if (reversed) { factory.state.machines.reverse(); factory.rebuild(); }
    for (let cycle = 0; cycle < 3; cycle++) {
      assert.equal(feed(factory, kiln, "unfiredBrick", 4), 4);
      factory.update(12);
      if (cycle === 0) assert.equal(feed(factory, kiln, 'wood', 3), 3);
      if (cycle === 1) assert.equal(feed(factory, kiln, 'wood', 3), 3);
      assert.ok(kiln.job, "firing continues while the last batch unloads");
    }
    factory.update(12);
    assert.equal(factory.total(basket, "contents"), 12);
    assert.equal(belt.lanes[0].material, "brick");
    near(kiln.outputCooldown, 2);
  }
});

test("Actual Clay Pit → shaping → firing → collection works through the material intake in every rotation", () => {
  for (const facing of D.directions) {
    const factory = new Factory(createState(1)), kiln = place(factory, "kiln", 40, 40, facing);
    const input = ports(kiln).find(p => p.channel === 'material'), v = D.vectors[facing];
    const benchOffset = ports({ type: "clayShaper", x: 0, y: 0, facing }).find((point) => point.role === "output");
    const bench = place(factory, "clayShaper", input.x - v.x - benchOffset.x, input.y - v.y - benchOffset.y, facing);
    const benchInput = ports(bench)[0];
    require('./helpers/noammo-centered.cjs').attachPitFeed(factory, benchInput, facing);
    const output = ports(kiln).find((point) => point.role === "output");
    const basket = place(factory, "basket", output.x + v.x, output.y + v.y);
    feed(factory, kiln, "wood", 7, 0.1);
    advance(factory, 123);
    assert.equal(factory.total(basket, "contents"), 8);
    assert.equal(basket.contents[0].material, "brick"); assert.equal(basket.contents[0].value, 1);
    assert.equal(kiln.heat, 18000);
    factory.collect(basket.id); assert.equal(factory.state.inventory.brick, 8);
    assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
  }
});

test("Heat, cooldown, mixed-value job and buffers follow their kiln through single/bulk moves and saves", () => {
  let { factory, kiln } = setup();
  feed(factory, kiln, "wood", 8); feed(factory, kiln, "unfiredBrick", 1, 2);
  feed(factory, kiln, "unfiredBrick", 3, 1.05); factory.update(0.1); factory.update(3);
  feed(factory, kiln, "unfiredPot", 2, 4.2);
  const snapshot = A.copy({ heat: kiln.heat, job: kiln.job, input: kiln.input, cooldown: kiln.outputCooldown });
  assert.equal(factory.move(kiln.id, 50, 40, "down").error, undefined);
  const other = place(factory, "basket", 55, 40);
  assert.equal(factory.moveGroup([kiln.id, other.id], 80, 80, 1).error, undefined);
  factory = Factory.importSave(factory.exportSave()); kiln = factory.byId.get(kiln.id);
  assert.deepEqual({ heat: kiln.heat, job: kiln.job, input: kiln.input, cooldown: kiln.outputCooldown }, snapshot);
  factory.update(9);
  near(kiln.output[0].value, 8); near(kiln.output[1].value, 4.2);
  assert.equal(kiln.job.recipe, "unfiredPot"); assert.equal(kiln.heat, 48000);
});

test("Pickup recovers solid ingredients/products once and resets furnace heat, buffers and timers", () => {
  let { factory, kiln } = setup();
  feed(factory, kiln, "wood", 4); feed(factory, kiln, "unfiredBrick", 4);
  factory.update(0.1); feed(factory, kiln, "unfiredPot", 2, 4.2);
  factory.pickup(kiln.id);
  assert.equal(factory.state.inventory.unfiredBrick, 4); assert.equal(factory.state.inventory.unfiredPot, 2);
  assert.equal(factory.state.inventory.wood, 0, "heat is not duplicated as Wood on pickup");
  const id = kiln.id; kiln = factory.place("kiln", 50, 40).machine;
  assert.equal(kiln.id, id); assert.equal(kiln.heat, 0); assert.equal(kiln.job, null);
  assert.equal(kiln.outputCooldown, 0); assert.equal(kiln.input.length, 0); assert.equal(kiln.output.length, 0);
  factory.state.stock.kiln++;
  const replacement = factory.place("kiln", 40, 40).machine;
  assert.equal(replacement.heat, 0); assert.equal(replacement.input.length, 0);
  feed(factory, kiln, "wood", 4); feed(factory, kiln, "unfiredPot", 2); factory.update(0.1); factory.update(12);
  factory.pickup(kiln.id); assert.equal(factory.state.inventory.pot, 2);
  factory = Factory.importSave(factory.exportSave());
  assert.equal(factory.state.inventory.pot, 2); assert.equal(factory.state.inventory.unfiredBrick, 4);
  assert.equal(factory.state.storedMachines.find((machine) => machine.id === id).heat, 0);
});

test("Kiln save migration adds zero stock/materials only, and corrupt heat, fractional batches or overfull buffers are rejected", () => {
  const { factory, kiln } = setup(), old = new Factory(createState(1));
  const payload = JSON.parse(old.exportSave());
  delete payload.state.kilnVersion; delete payload.state.inventory.pot; delete payload.state.stock.kiln;
  const loaded = Factory.importSave(JSON.stringify(payload));
  assert.equal(loaded.state.stock.kiln, 0); assert.equal(loaded.state.inventory.pot, 0);
  assert.equal(loaded.state.cash, 0);
  const before = factory.exportSave();
  for (const mutate of [
    (state) => { delete state.inventory.pot; },
    (state) => { state.machines[0].heat = 250001; },
    (state) => { state.machines[0].heat = -1; },
    (state) => { state.machines[0].outputCooldown = 3; },
    (state) => { state.machines[0].input = [cargo("unfiredBrick", 5)]; },
    (state) => { state.machines[0].input = [cargo("unfiredPot", 0.5)]; },
    (state) => { state.machines[0].input = [cargo("unfiredBrick"), cargo("unfiredPot")]; },
    (state) => { state.machines[0].output = [cargo("pot", 3)]; },
    (state) => { state.machines[0].job = { recipe: "unfiredBrick", inputs: [cargo("unfiredBrick", 3)], remaining: 8 }; },
    (state) => { state.machines[0].job = { recipe: "unfiredPot", inputs: [cargo("wood", 2)], remaining: 8 }; },
  ]) {
    const bad = JSON.parse(before); mutate(bad.state);
    assert.throws(() => Factory.importSave(JSON.stringify(bad)), /Invalid/);
  }
  assert.equal(factory.exportSave(), before); assert.equal(kiln.heat, 0);
});

test("Terrain migration recovers a kiln's multi-input job once and clears heat without refunding fuel", () => {
  const { factory, kiln } = setup();
  feed(factory, kiln, "wood", 4); feed(factory, kiln, "unfiredBrick", 1, 2);
  feed(factory, kiln, "unfiredBrick", 3, 1.05); factory.update(0.1);
  feed(factory, kiln, "unfiredPot", 2, 4.2);
  factory.state.terrainVersion = 0;
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.terrainUpdated, true); assert.equal(loaded.state.machines.length, 0);
  assert.equal(loaded.state.inventory.unfiredBrick, 4); assert.equal(loaded.state.inventory.unfiredPot, 2);
  assert.equal(loaded.state.inventory.wood, 0);
  assert.equal(loaded.state.storedMachines[0].heat, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("Fired products sell at actual process value, collectors reset only on withdrawal, and Bricks remain construction materials", () => {
  const { factory, kiln } = setup(), tube = place(factory, "sellTube", 42, 41);
  feed(factory, kiln, "wood", 6); feed(factory, kiln, "unfiredPot", 2, 4.2);
  factory.update(0.1); factory.update(14);
  near(factory.state.cash, 33.6);
  assert.equal(factory.state.soldItems, 2);
  factory.pickup(tube.id); feed(factory, kiln, "unfiredBrick", 4, 1.05);
  feed(factory, kiln, "wood", 1); factory.update(0.1); factory.update(12); factory.pickup(kiln.id);
  assert.equal(factory.state.inventory.brick, 4);
  near(factory.state.cash, 33.6, "recovering finished Bricks does not sell them");
  factory.state.cash = 750; factory.state.inventory.brick = 200;
  assert.equal(factory.buy("sellTube").amount, 1); assert.equal(factory.state.inventory.brick, 0);
});

test("Primitive conveyors and both Upgrader lanes use speed 5, with no change to source or shaping timers", () => {
  assert.equal(D.config.beltSeconds, 2);
  assert.equal(D.machines.clayPit.cycle, 12); assert.equal(D.machines.planter.cycle, 8);
  assert.equal(D.machines.clayShaper.recipes.brick.seconds, 2);
  assert.equal(D.machines.clayShaper.recipes.pot.seconds, 4);
});
