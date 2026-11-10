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
  assert.deepEqual(A.ports(bench).map(({ x, y, direction }) => [x, y, direction]), [[50, 40, "up"], [50, 41, "down"], [51, 41, "down"]]);
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
  factory.update(10.1);
  assert.equal(wheat.water, 0.4);
  assert.equal(factory.total(basket, "contents"), 5);
  assert.equal(basket.contents[0].material, "flour");
  assert.equal(basket.contents[0].value, 0.03);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
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

test("Minor Transmutation II grants the instant Oven and unlocks the next offering", () => {
  const factory = new A.Factory(A.createState(1));
  const pedestal = place(factory, "minorRunePedestal", 60, 40);
  Object.assign(factory.state.inventory, { unfiredBrick: 50, clay: 50, brick: 100, woodenPlate: 5 });
  assert.equal(factory.redeemRune(pedestal.id, "transmutation").offering.machine, "kiln");
  assert.equal(factory.redeemRune(pedestal.id, "transmutation").offering.machine, "primitiveOven");
  assert.equal(factory.state.stock.primitiveOven, 1);
  assert.equal(factory.nextRune("minor", "transmutation").machine, "primitiveFurnace");
  assert.ok(factory.buy("preheater").error);
  const oven = factory.place("primitiveOven", 50, 40).machine;
  const input = A.ports(oven).find(point => point.channel === "ingredient1");
  oven.heat = 6000;
  assert.equal(factory.receive(oven, A.cargo("unfiredBrick", 2), input.x, input.y, input.direction, true), 2);
  factory.update(0.1);
  assert.equal(oven.heat, 0);
  assert.equal(oven.output[0].preheated, true);
  assert.equal(oven.output[0].quantity, 2);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Shaped pasta cooks instantly, waits at a powered belt and serves through an adjacent Plating Bench", () => {
  const factory = new A.Factory(A.createState(1));
  const shaper = place(factory, "doughShaper", 40, 40);
  assert.equal(A.cells(shaper).length, 3);
  assert.equal(feed(factory, shaper, A.cargo("flour", 5)), 5);
  factory.update(0.1);
  assert.deepEqual(shaper.output, [A.cargo("dough")]);
  const dough = shaper.output.shift();
  assert.equal(feed(factory, shaper, dough), 1);
  factory.update(0.1);
  assert.deepEqual(shaper.output, [A.cargo("rawPasta", 1, 0.6)]);

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
  assert.equal(sendToOven(A.cargo("rawPasta", 2, 0.6), "ingredient1"), 2);
  assert.equal(sendToOven(A.cargo("choppedLeek"), "ingredient2"), 1);
  factory.update(0.1);
  assert.equal(oven.heat, 24000);
  assert.equal(oven.output[0].quantity, 2);
  assert.equal(oven.output[0].value, 2.9);
  assert.deepEqual(belt.lanes, {});
  factory.pickup(belt.id);
  const bench = place(factory, "platingBench", 51, 40);
  const basket = place(factory, "basket", 51, 39);
  for (let index = 0; index < 2; index++) {
    assert.equal(feed(factory, bench, A.cargo("woodenPlate", 1, 50)), 1);
    factory.update(0.2);
  }
  assert.deepEqual(oven.output, []);
  assert.deepEqual(basket.contents, [A.cargo("leekPasta", 2, 2.9)]);
  assert.deepEqual(A.Factory.importSave(factory.exportSave()).state, factory.state);
});
