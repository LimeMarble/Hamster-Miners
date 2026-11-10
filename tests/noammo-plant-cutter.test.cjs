const test = require("node:test");
const assert = require("node:assert/strict");
const { Factory, createState, cargo, ports } = require("../noammo-simulation.js");

test("Plant Cutters route two instant passes, applying each transformation's value once", () => {
  const factory = new Factory(createState(1));
  Object.assign(factory.state.inventory, { wood: 50, chert: 10 });
  assert.equal(factory.buy("plantCutter", 2).amount, 2);
  const peeler = factory.place("plantCutter", 40, 42).machine;
  const chopper = factory.place("plantCutter", 40, 40).machine;
  assert.equal(peeler.facing, "up");
  const intake = ports(peeler).find(point => point.role === "input");
  const feed = material => factory.receive(peeler, cargo(material, 1, 2.3), intake.x, intake.y, intake.direction, true);
  assert.equal(feed("choppedLeek"), 0);
  assert.equal(feed("leek"), 1);
  factory.update(0.1);
  assert.equal(chopper.job, null);
  assert.deepEqual(chopper.output, [cargo("choppedLeek", 2, 5.75)]);
  assert.equal(feed("leek"), 1);
  factory.update(0.2);
  assert.deepEqual(chopper.output, [cargo("choppedLeek", 2, 5.75)], "blocked output holds its batch");
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Saves predating the Plant Cutter gain empty cutter stock and ingredient counts", () => {
  const saved = JSON.parse(new Factory(createState(1)).exportSave());
  delete saved.state.plantCutterVersion;
  delete saved.state.stock.plantCutter;
  delete saved.state.inventory.peeledLeek;
  delete saved.state.inventory.choppedLeek;
  const { state } = Factory.importSave(JSON.stringify(saved));
  assert.equal(state.stock.plantCutter, 0);
  assert.equal(state.inventory.peeledLeek, 0);
  assert.equal(state.inventory.choppedLeek, 0);
});
