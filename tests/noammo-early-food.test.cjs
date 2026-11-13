const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const { attachKineticWheel } = require("./helpers/noammo-centered.cjs");

function place(factory, type, x, y, facing) {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined);
  return result.machine;
}

function feed(factory, machine, item, material = item.material) {
  const port = A.ports(machine).find(point => point.role === "input" && (machine.type === "platingBench"
    ? point.channel === (material === "woodenPlate" ? "plate" : "dish") : !point.material || point.material === material));
  return factory.receive(machine, item, port.x, port.y, port.direction, true);
}

test("Wood Carving and Plating produce the salads for Minor Harvest I", () => {
  const factory = new A.Factory(A.createState(1));
  const carver = place(factory, "crudeGearBench", 40, 40);
  const bench = place(factory, "platingBench", 50, 40);
  const basket = place(factory, "basket", 50, 39);
  const pedestal = place(factory, "minorRunePedestal", 60, 40);
  assert.equal(factory.setShapingMode(carver.id, "plate").error, undefined);
  assert.equal(feed(factory, carver, A.cargo("wood", 2)), 2);
  factory.update(0.1); factory.update(6);
  assert.equal(carver.output[0].quantity, 3);
  assert.ok(Math.abs(carver.output[0].value - 0.05) < 1e-8);
  assert.deepEqual(A.ports(bench).map(({ x, y, direction }) => [x, y, direction]), [[50, 40, "up"], [50, 41, "down"], [51, 41, "down"], [51, 41, "right"]]);
  assert.equal(feed(factory, bench, A.cargo("choppedLeek"), "woodenPlate"), 0);
  for (let index = 0; index < 5; index++) {
    if (!carver.output.length) factory.update(6);
    assert.equal(feed(factory, bench, A.cargo("choppedLeek")), 1);
    assert.equal(feed(factory, bench, { ...carver.output[0], value: 50 }), 1);
    if (--carver.output[0].quantity === 0) carver.output.shift();
    factory.update(0.1);
  }
  assert.equal(factory.total(basket, "contents"), 5);
  assert.equal(basket.contents[0].value, 1);
  factory.collect(basket.id);
  Object.assign(factory.state.inventory, { wood: 100, leekFiber: 50 });
  assert.equal(factory.redeemRune(pedestal.id, "harvest").offering.machine, "wheatPlanter");
  assert.equal(factory.state.stock.wheatPlanter, 1);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});

test("A scheduled Well supplies Wheat, which can feed the kinetic Grain Mill directly", () => {
  const factory = new A.Factory(A.createState(1));
  const wheat = place(factory, "wheatPlanter", 40, 40);
  const mill = place(factory, "grainMill", 40, 38);
  const basket = place(factory, "basket", 41, 37);
  attachKineticWheel(factory, mill);
  const well = place(factory, "well", 42, 43);
  factory.update(10);
  assert.equal(wheat.timer, 0);
  assert.equal(wheat.output.length, 0);
  assert.equal(factory.addWaterDelivery(well.id, wheat.id, 2).error, undefined);
  factory.update(5);
  assert.equal(wheat.water, 0.5);
  factory.removeWaterDelivery(well.id, 0);
  factory.update(11);
  assert.equal(wheat.water, 0.25);
  assert.equal(factory.total(basket, "contents"), 2);
  assert.equal(factory.total(mill, "input"), 1);
  assert.equal(basket.contents[0].material, "flour");
  assert.equal(basket.contents[0].value, 0.3);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Rinse Bench schedules water, treats raw crops once and carries quality through milling", () => {
  const factory = new A.Factory(A.createState(1));
  const rinse = place(factory, "rinseBench", 40, 40);
  const well = place(factory, "well", 43, 40);
  const mill = place(factory, "grainMill", 40, 38);
  attachKineticWheel(factory, mill);
  assert.deepEqual(A.ports(rinse), A.ports({ ...rinse, type: "doughShaper" }));
  assert.equal(A.DATA.machines.well.cost.cash, 25);
  assert.deepEqual(A.DATA.machines.rinseBench.cost, { cash: 15, materials: { wood: 60, leekFiber: 10, chert: 20 } });
  for (const material of ["choppedLeek", "flour", "clay"]) assert.equal(feed(factory, rinse, A.cargo(material)), 0);
  assert.equal(feed(factory, rinse, A.cargo("wheat")), 1);
  factory.update(0.1);
  assert.equal(factory.status(rinse), "Waiting for Water");
  assert.equal(factory.addWaterDelivery(well.id, rinse.id, 0).error, undefined);
  factory.update(5);
  assert.equal(rinse.water, 0.4);
  const treated = mill.input[0];
  assert.equal(treated.value, 0.65);
  assert.deepEqual(A.gradeProbabilities(treated).map(chance => Number(chance.toFixed(3))), [0.2, 0.6, 0.2, 0, 0, 0]);
  assert.equal(feed(factory, rinse, treated), 0);
  assert.equal(feed(factory, rinse, A.cargo("wheat")), 1);
  factory.update(0.5);
  assert.equal(mill.output[0].value, 1.3);
  assert.deepEqual(A.gradeProbabilities(mill.output[0]).map(chance => Number(chance.toFixed(3))), [0.2, 0.6, 0.2, 0, 0, 0]);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
  const old = JSON.parse(factory.exportSave());
  delete old.state.rinseBenchVersion;
  delete old.state.stock.rinseBench;
  old.state.machines = [];
  assert.equal(A.Factory.importSave(JSON.stringify(old)).state.stock.rinseBench, 0);
});

test("Wheat jobs in the Fiber Extractor survive reloads and yield five light Fiber per grain", () => {
  const factory = new A.Factory(A.createState(1));
  const extractor = place(factory, "fiber", 40, 40);
  assert.equal(A.DATA.materials.leekFiber.weight, 0.05);
  assert.equal(feed(factory, extractor, A.cargo("wheat", 1, 0.55)), 1);
  factory.update(1);
  const loaded = A.Factory.importSave(factory.exportSave()), machine = loaded.byId.get(extractor.id);
  const input = A.ports(machine).find(point => point.role === "input");
  assert.equal(loaded.receive(machine, A.cargo("leek"), input.x, input.y, input.direction, true), 1);
  loaded.update(2);
  assert.deepEqual(machine.output, [A.cargo("leekFiber", 5, 0.55)]);
  assert.equal(loaded.state.producedFiber, 5);
  assert.equal(machine.input[0].material, "leek");
  assert.deepEqual(A.Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("Queued Wheat batches fill the receiving conveyor and retain the remainder", () => {
  const factory = new A.Factory(A.createState(1));
  const wheat = place(factory, "wheatPlanter", 40, 40);
  wheat.water = 0.5;
  factory.update(20);
  assert.equal(factory.total(wheat, "output"), 10);
  const belt = place(factory, "belt", 41, 39, "up");
  const basket = place(factory, "basket", 41, 38);
  place(factory, "wheel", 44, 43, "right");
  place(factory, "drive", 45, 41, "down");
  factory.update(0.1);
  assert.equal(belt.lanes[0].quantity, 8);
  assert.equal(factory.total(wheat, "output"), 2);
  factory.update(4.5);
  assert.equal(factory.total(basket, "contents"), 10);
});

test("An old two-Wood gear job keeps its inputs and migrates its remaining time proportionally", () => {
  const factory = new A.Factory(A.createState(1));
  const carver = place(factory, "crudeGearBench", 40, 40);
  carver.job = { mode: "gear", input: A.cargo("wood", 2), remaining: 10 };
  const old = JSON.parse(factory.exportSave());
  delete old.state.foodVersion;
  for (const item of ["woodenPlate", "leekSalad", "wheat", "flour"]) delete old.state.inventory[item];
  for (const machine of ["platingBench", "wheatPlanter", "grainMill"]) delete old.state.stock[machine];
  const restored = A.Factory.importSave(JSON.stringify(old)), loadedCarver = restored.byId.get(carver.id);
  assert.equal(loadedCarver.job.remaining, 5);
  restored.update(4.9); assert.equal(loadedCarver.output.length, 0);
  restored.update(0.1);
  assert.equal(loadedCarver.output[0].value, 0.2);
  assert.equal(restored.craftRecipe(loadedCarver).input, 1);
  assert.equal(restored.state.stock.platingBench, 0);
});

test("Minor Transmutation I grants the Stone Oven before the Clay Kiln", () => {
  const factory = new A.Factory(A.createState(1));
  const pedestal = place(factory, "minorRunePedestal", 60, 40);
  assert.deepEqual(A.DATA.machines.primitiveOven.cost, { cash: 500, materials: { chert: 40, clay: 30 } });
  Object.assign(factory.state.inventory, { chert: 115, clay: 45 });
  factory.state.cash = 500;
  assert.ok(factory.shopUnlockError("primitiveOven"));
  assert.equal(factory.redeemRune(pedestal.id, "transmutation").offering.machine, "primitiveOven");
  assert.equal(factory.state.stock.primitiveOven, 1);
  assert.equal(factory.state.inventory.chert, 40);
  assert.equal(factory.state.inventory.clay, 30);
  assert.ok(factory.shopUnlockError("kiln"));
  assert.equal(factory.nextRune("minor", "transmutation").machine, "kiln");
  assert.equal(factory.buy("primitiveOven").amount, 1);
  assert.equal(factory.state.stock.primitiveOven, 2);
  assert.equal(factory.state.cash, 0);
  assert.equal(factory.state.inventory.chert, 0);
  assert.equal(factory.state.inventory.clay, 0);
  assert.ok(factory.buy("preheater").error);
  const oven = factory.place("primitiveOven", 50, 40).machine;
  assert.equal(factory.setOvenRecipe(oven.id, "unfiredBrick").error, undefined);
  const input = A.ports(oven).find(point => point.channel === "ingredient1");
  oven.heat = 6000;
  assert.equal(factory.receive(oven, A.cargo("unfiredBrick", 2), input.x, input.y, input.direction, true), 2);
  factory.update(0.1);
  assert.equal(oven.heat, 0);
  assert.equal(oven.output[0].preheated, true);
  assert.equal(oven.output[0].quantity, 2);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Old Transmutation tiers keep their unlocks and grant the newly skipped Oven once", () => {
  for (const tier of [0, 1, 2, 3]) {
    const factory = new A.Factory(A.createState(1));
    const old = JSON.parse(factory.exportSave());
    old.state.runeVersion = 3;
    old.state.minorRunes.transmutation = tier;
    old.state.stock.kiln = tier >= 1 ? 1 : 0;
    old.state.stock.primitiveOven = tier >= 2 ? 1 : 0;
    const migrated = A.Factory.importSave(JSON.stringify(old));
    assert.equal(migrated.state.minorRunes.transmutation, tier === 1 ? 2 : tier);
    assert.equal(migrated.state.stock.kiln, old.state.stock.kiln);
    assert.equal(migrated.state.stock.primitiveOven, tier >= 1 ? 1 : 0);
    assert.deepEqual(A.Factory.importSave(migrated.exportSave()).state, migrated.state);
  }
});

test("Stone Oven recipe selection preserves heat and finished output, and migrates old queued ingredients", () => {
  const factory = new A.Factory(A.createState(1));
  const oven = place(factory, "primitiveOven", 40, 40);
  const ingredients = machine => A.ports(machine).filter(point => point.channel?.startsWith("ingredient"));
  assert.deepEqual(ingredients(oven).map(point => point.label), ["Pasta", "Spinach"]);
  const input = ingredients(oven)[0];
  assert.equal(factory.receive(oven, A.cargo("unfiredBrick", 2), input.x, input.y, input.direction, true), 0);
  assert.equal(factory.receive(oven, A.cargo("rawPasta", 2), input.x, input.y, input.direction, true), 2);
  oven.heat = 12000;
  oven.output = [A.cargo("unplatedLeekPasta", 2)];
  assert.ok(factory.setOvenRecipe(oven.id, "applePie").error);
  assert.equal(factory.setOvenRecipe(oven.id, "unfiredPot").error, undefined);
  assert.deepEqual(ingredients(oven).map(point => point.label), ["Pot"]);
  assert.equal(factory.state.inventory.rawPasta, 2);
  assert.equal(oven.heat, 12000);
  assert.deepEqual(oven.output, [A.cargo("unplatedLeekPasta", 2)]);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
  const old = JSON.parse(factory.exportSave());
  delete old.state.machines[0].mode;
  old.state.machines[0].input = [A.cargo("unfiredPot")];
  const loaded = A.Factory.importSave(JSON.stringify(old));
  assert.equal(loaded.byId.get(oven.id).mode, "unfiredPot");
  assert.deepEqual(loaded.byId.get(oven.id).input, [A.cargo("unfiredPot")]);
});

test("Shaped pasta cooks instantly, waits at a powered belt and serves through an adjacent Plating Bench", () => {
  const factory = new A.Factory(A.createState(1));
  const shaper = place(factory, "doughShaper", 40, 40);
  const well = place(factory, "well", 42, 40);
  assert.equal(A.cells(shaper).length, 4);
  assert.deepEqual(A.ports(shaper).find(port => port.role === "waterDropoff"), { x: 40, y: 41, direction: "left", role: "waterDropoff" });
  assert.equal(feed(factory, shaper, A.cargo("flour", 2)), 1);
  shaper.water = 0.05;
  factory.update(0.1);
  assert.equal(factory.status(shaper), "Waiting for Water");
  assert.equal(shaper.water, 0.05);
  assert.equal(factory.addWaterDelivery(well.id, shaper.id, 0).error, undefined);
  factory.update(5);
  assert.equal(shaper.water, 0.4);
  assert.deepEqual(shaper.output, [A.cargo("dough")]);
  const dough = shaper.output.shift();
  shaper.water = 0;
  assert.equal(feed(factory, shaper, dough), 1);
  factory.update(0.1);
  assert.deepEqual(shaper.output, [A.cargo("rawPasta", 2)]);

  const oven = place(factory, "primitiveOven", 50, 42);
  const belt = place(factory, "belt", 51, 41, "up");
  place(factory, "wheel", 48, 46, "right");
  place(factory, "drive", 49, 44, "down");
  assert.equal(factory.conveyorPowered(belt, 51, 41), true);
  const sendToOven = (item, channel) => {
    const input = A.ports(oven).find(point => point.channel === channel);
    return factory.receive(oven, item, input.x, input.y, input.direction, true);
  };
  assert.equal(sendToOven(A.cargo("wood"), "fuel"), 1);
  assert.equal(sendToOven(shaper.output.shift(), "ingredient1"), 2);
  assert.equal(sendToOven(A.cargo("choppedLeek"), "ingredient2"), 1);
  factory.update(0.1);
  assert.equal(oven.heat, 24000);
  assert.equal(oven.output[0].quantity, 2);
  assert.equal(oven.output[0].value, 1.7);
  assert.equal(factory.status(oven), "2 Unplated Spinach Pasta waiting for Plating Bench");
  assert.deepEqual(belt.lanes, {});
  factory.pickup(belt.id);
  const bench = place(factory, "platingBench", 51, 40);
  const basket = place(factory, "basket", 51, 39);
  assert.equal(feed(factory, bench, A.cargo("woodenPlate", 1, 50)), 1);
  factory.update(0.5);
  assert.deepEqual(basket.contents, [A.cargo("leekPasta", 1, 1.7)]);
  assert.equal(factory.status(bench), "Waiting for Wooden Plate · 1 Unplated Spinach Pasta ready");
  assert.equal(feed(factory, bench, A.cargo("woodenPlate", 1, 50)), 1);
  factory.update(0.2);
  assert.deepEqual(oven.output, []);
  assert.deepEqual(basket.contents, [A.cargo("leekPasta", 2, 1.7)]);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Old milling and shaping jobs finish at their saved yields and buffered Flour drains with Water", () => {
  const factory = new A.Factory(A.createState(1));
  const mill = place(factory, "grainMill", 40, 40);
  const shaper = place(factory, "doughShaper", 44, 40);
  const old = JSON.parse(factory.exportSave());
  old.state.foodVersion = 3;
  const oldMill = old.state.machines.find(machine => machine.id === mill.id);
  oldMill.job = { mode: "mill", input: A.cargo("wheat"), remaining: 0 };
  oldMill.output = [A.cargo("flour", 5, 0.03)];
  const oldShaper = old.state.machines.find(machine => machine.id === shaper.id);
  delete oldShaper.water;
  oldShaper.job = { mode: "shape", input: A.cargo("flour", 5, 0.03), remaining: 0 };
  oldShaper.input = [A.cargo("flour", 5, 0.03)];
  const migrated = A.Factory.importSave(JSON.stringify(old));
  assert.deepEqual(A.Factory.importSave(migrated.exportSave()).state, migrated.state);
  const currentMill = migrated.state.machines.find(machine => machine.id === mill.id);
  const currentShaper = migrated.state.machines.find(machine => machine.id === shaper.id);
  assert.deepEqual(currentMill.output.shift(), A.cargo("flour", 5, 0.03));
  migrated.finishShaping(currentMill);
  assert.deepEqual(currentMill.output, [A.cargo("flour", 5, 0.03)]);
  migrated.finishShaping(currentShaper);
  assert.deepEqual(currentShaper.output.shift(), A.cargo("dough", 1, 0.3));
  assert.equal(currentShaper.water, 0);
  currentShaper.water = 0.1;
  migrated.startShaping(currentShaper);
  assert.equal(migrated.total(currentShaper, "input"), 4);
  assert.deepEqual(currentShaper.output, [A.cargo("dough", 1, 0.06)]);
});

test("A machine in the old Dough Shaper gap stays placed when the dropoff is added", () => {
  const factory = new A.Factory(A.createState(1));
  const shaper = place(factory, "doughShaper", 40, 40);
  const belt = place(factory, "belt", 40, 42);
  const old = JSON.parse(factory.exportSave());
  old.state.foodVersion = 5;
  old.state.machines.find(machine => machine.id === belt.id).y = 41;
  old.state.machines.find(machine => machine.id === shaper.id).input.push(A.cargo("flour"));
  const migrated = A.Factory.importSave(JSON.stringify(old));
  assert.equal(migrated.byId.get(belt.id).y, 41);
  assert.equal(migrated.byId.has(shaper.id), false);
  assert.equal(migrated.state.stock.doughShaper, 1);
  assert.equal(migrated.state.inventory.flour, 1);
  assert.deepEqual(A.Factory.importSave(migrated.exportSave()).state, migrated.state);
});
