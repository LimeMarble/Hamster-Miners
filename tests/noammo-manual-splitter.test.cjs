const test = require("node:test");
const assert = require("node:assert/strict");
const { Factory, createState, cargo, ports, cells } = require("../noammo-simulation.js");

function place(factory, type, x, y, facing) {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined);
  return result.machine;
}

test("Minor Motion grants a Splitter and opens the Bridge and Stacker offerings in order", () => {
  const olderSave = JSON.parse(new Factory(createState(1)).exportSave());
  olderSave.state.runeVersion = 2;
  delete olderSave.state.stock.manualSplitter;
  const factory = Factory.importSave(JSON.stringify(olderSave));
  assert.equal(factory.state.stock.manualSplitter, 0);
  factory.state.minorRunes.transmutation = 2;
  const pedestal = place(factory, "minorRunePedestal", 70, 40);
  assert.ok(factory.shopUnlockError("manualSplitter"));
  assert.ok(factory.shopUnlockError("primitiveBridge"));
  assert.ok(factory.shopUnlockError("primitiveStacker"));
  Object.assign(factory.state.inventory, { wood: 125, leekFiber: 20, chert: 25, granite: 400, malachitePebble: 20 });
  assert.equal(factory.redeemRune(pedestal.id, "motion").offering.machine, "manualSplitter");
  assert.equal(factory.state.stock.manualSplitter, 1);
  assert.equal(factory.shopUnlockError("manualSplitter"), null);
  assert.ok(factory.shopUnlockError("primitiveBridge"));
  assert.equal(factory.redeemRune(pedestal.id, "motion").offering.machine, "primitiveBridge");
  assert.equal(factory.shopUnlockError("primitiveBridge"), null);
  assert.equal(factory.redeemRune(pedestal.id, "motion").offering.machine, "primitiveStacker");
  assert.equal(factory.shopUnlockError("primitiveStacker"), null);
  assert.equal(factory.nextRune("minor", "motion"), null);
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("Manual Splitter alternates, uses an open exit, and supports a Basic Conveyor upgrade", () => {
  const factory = new Factory(createState(1));
  const splitter = place(factory, "manualSplitter", 40, 40);
  const straight = place(factory, "basket", 41, 39);
  const side = place(factory, "basket", 39, 41);
  place(factory, "wheel", 38, 44, "right");
  place(factory, "drive", 39, 42, "down");
  assert.equal(cells(splitter).length, 5);
  const input = ports(splitter).find(point => point.role === "input");
  const feed = value => {
    assert.equal(factory.receive(splitter, cargo("wood", 1, value), input.x, input.y, input.direction, true), 1);
    factory.update(2);
  };
  feed(1); feed(2);
  assert.deepEqual(straight.contents.map(item => item.value), [1]);
  assert.deepEqual(side.contents.map(item => item.value), [2]);
  side.contents = [cargo("wood", 100)];
  feed(3); feed(4);
  factory.update(2);
  assert.deepEqual(straight.contents.map(item => item.value), [1, 3, 4]);
  assert.equal(factory.total(side, "contents"), 100);
  const obstacle = place(factory, "basket", 42, 40);
  assert.ok(factory.setSplitterSide(splitter.id, "right").error);
  factory.pickup(obstacle.id);
  assert.equal(factory.setSplitterSide(splitter.id, "right").error, undefined);
  assert.equal(ports(splitter).find(point => point.channel === "split").direction, "right");
  const right = place(factory, "basket", 43, 41);
  factory.state.stock.electricConveyor = 2;
  assert.equal(factory.upgradeConveyors(splitter.id).error, undefined);
  assert.equal(factory.electricity.demand, 2);
  place(factory, "heavyWheel", 79, 42, "right");
  place(factory, "kineticGenerator", 80, 40, "down");
  assert.equal(factory.receive(splitter, cargo("wood", 3), input.x, input.y, input.direction, true), 3);
  factory.update(1);
  assert.equal(factory.total(right, "contents"), 3);
  factory.pickup(right.id);
  const smallBelt = place(factory, "belt", 43, 41, "right");
  const receiver = place(factory, "basket", 44, 41);
  straight.contents = [cargo("wood", 100)];
  feed(1);
  assert.equal(factory.receive(splitter, cargo("wood", 5), input.x, input.y, input.direction, true), 5);
  factory.update(1);
  assert.equal(smallBelt.lanes[0].quantity, 2);
  assert.equal(splitter.lanes[0].quantity, 3);
  factory.update(8);
  assert.equal(factory.total(receiver, "contents"), 5);
  const loaded = Factory.importSave(factory.exportSave());
  assert.deepEqual(loaded.state, factory.state);
  loaded.pickup(splitter.id);
  assert.equal(loaded.state.stock.electricConveyor, 2);
});
