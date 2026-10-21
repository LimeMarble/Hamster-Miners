const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const { DATA: D, Factory, createState, ports, cargo } = A;

function place(factory, type, x = 40, y = 40, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined);
  return result.machine;
}
function receive(factory, machine, item, consume = true) {
  const input = ports(machine).find((point) => point.role === "input") ?? { ...machine, direction: null };
  return factory.receive(machine, item, input.x, input.y, input.direction, consume);
}

test("Brick Resource Storage has the approved cost, no crew, and no free grant", () => {
  assert.deepEqual(D.machines.brickStorage.cost, { cash: 200, materials: { brick: 100, clay: 15 } });
  const factory = new Factory(createState(1));
  assert.equal(factory.state.stock.brickStorage, 0);
  factory.state.cash = 400; factory.state.inventory.brick = 200; factory.state.inventory.clay = 29;
  const before = factory.exportSave();
  assert.ok(factory.buy("brickStorage", 2).error);
  assert.equal(factory.exportSave(), before);
  factory.state.inventory.clay = 30; factory.state.cash = 399;
  assert.ok(factory.buy("brickStorage", 2).error);
  factory.state.cash = 400;
  assert.equal(factory.buy("brickStorage", 2).amount, 2);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.brick, 0);
  assert.equal(factory.state.inventory.clay, 0); assert.equal(factory.state.stock.brickStorage, 2);
  assert.ok(factory.place("brickStorage", 40, 40).machine);
  assert.equal(factory.availableCrew(), 10);
});

test("Brick Storage rotates its four occupied tiles and sole lower-left input; actual Clay Pit deliveries obey it", () => {
  for (const facing of D.directions) {
    const factory = new Factory(createState(1)), storage = place(factory, "brickStorage", 40, 40, facing);
    const point = A.rotatePoint(0, 1, 2, 2, facing);
    assert.equal(A.cells(storage).length, 4);
    assert.deepEqual(ports(storage), [{ x: 40 + point.x, y: 40 + point.y, direction: A.turn("left", D.directions.indexOf(facing)), role: "input" }]);
    const input = ports(storage)[0], vector = D.vectors[input.direction];
    for (const cell of A.cells(storage)) for (const side of D.directions) {
      const expected = cell.x === input.x && cell.y === input.y && side === input.direction ? 1 : 0;
      assert.equal(factory.receive(storage, cargo("clay"), cell.x, cell.y, side), expected);
    }
    assert.equal(storage.contents.length, 0, "intake previews are read-only");
    const sourceFacing = A.opposite(input.direction);
    const outputLocal = A.rotatePoint(1, 1, 2, 2, sourceFacing);
    const pit = place(factory, "clayPit", input.x + vector.x - outputLocal.x, input.y + vector.y - outputLocal.y, sourceFacing);
    receive(factory, storage, cargo("clay", 600));
    factory.update(12);
    assert.equal(factory.total(storage, "contents"), 600);
    assert.equal(factory.total(pit, "output"), 1, "a full collector blocks the real source");
    assert.equal(factory.collect(storage.id), 600);
    factory.update(0.1);
    assert.equal(factory.total(storage, "contents"), 1);
    assert.equal(factory.total(pit, "output"), 0);
  }
});

test("all collectors share collection, fractional total capacity, per-instance contents and pickup conservation", () => {
  for (const type of ["basket", "brickStorage"]) {
    const factory = new Factory(createState(1)), first = place(factory, type), second = place(factory, type, 46, 40);
    const capacity = A.collectorCapacity(first);
    assert.equal(capacity, type === "basket" ? 100 : 600);
    receive(factory, first, cargo("clay", capacity - 0.5, 2));
    assert.equal(receive(factory, first, cargo("wood", 5)), 0.5);
    assert.equal(receive(factory, first, cargo("leek")), 0);
    assert.equal(factory.total(second, "contents"), 0);
    assert.match(factory.status(first), new RegExp(`${capacity} / ${capacity}`));
    const loaded = Factory.importSave(factory.exportSave());
    assert.deepEqual(loaded.state, factory.state);
    assert.equal(loaded.collect(first.id), capacity);
    assert.equal(loaded.collect(first.id), 0);
    assert.equal(loaded.state.inventory.clay, capacity - 0.5);
    assert.equal(loaded.state.inventory.wood, 0.5);
    assert.equal(loaded.state.cash, 0, "collection never sells cargo");
    receive(loaded, loaded.byId.get(first.id), cargo("wood", 3));
    assert.equal(loaded.move(first.id, 50, 40, "up").error, undefined);
    assert.equal(loaded.state.inventory.wood, 3.5, "movement uses existing collector collection rules");
    receive(loaded, loaded.byId.get(first.id), cargo("wood", 2));
    loaded.pickup(first.id);
    assert.equal(loaded.state.inventory.wood, 5.5);
    const replacement = loaded.place(type, 40, 40).machine;
    assert.equal(replacement.id, first.id); assert.equal(replacement.contents.length, 0);
    assert.equal(typeof loaded.depositInventory, "undefined");
    assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  }
});

test("Brick Storage hauling uses real input ports, stale value and independent saved routes; pickup recovers carried cargo once", () => {
  const factory = new Factory(createState(1));
  const basket = place(factory, "basket"), storage = place(factory, "brickStorage", 44, 40);
  receive(factory, basket, cargo("clay", 2, 10));
  const inbound = factory.addRoute(basket.id, storage.id, "clay").route;
  factory.update(0.1);
  factory.update(inbound.duration + 0.1);
  assert.equal(factory.total(storage, "contents"), 1);
  assert.equal(storage.contents[0].value, D.materials.clay.value);
  factory.removeRoute(inbound.id);
  receive(factory, storage, cargo("wood", 3));
  const outputBasket = place(factory, "basket", 48, 40);
  const outbound = factory.addRoute(storage.id, outputBasket.id, "wood").route;
  factory.update(0.1);
  assert.equal(outbound.item.quantity, 1);
  const loaded = Factory.importSave(factory.exportSave());
  assert.deepEqual(loaded.state, factory.state);
  loaded.update(outbound.duration + 0.1);
  assert.equal(loaded.total(loaded.byId.get(outputBasket.id), "contents"), 1);
  loaded.update(outbound.duration + 1);
  loaded.pickup(storage.id);
  assert.equal(loaded.state.routes.length, 0);
  assert.equal(loaded.state.inventory.wood + loaded.total(loaded.byId.get(outputBasket.id), "contents"), 3);
  assert.equal(loaded.state.inventory.clay, 1);
  assert.equal(loaded.pickup(storage.id), false);
});

test("older saves receive only the missing Brick Storage stock key; current malformed or overfull saves are rejected", () => {
  const factory = new Factory(createState(1)), storage = place(factory, "brickStorage");
  receive(factory, storage, cargo("clay", 600));
  const old = JSON.parse(factory.exportSave());
  old.state.machines = []; old.state.nextId = 1;
  delete old.state.brickStorageVersion; delete old.state.stock.brickStorage;
  const migrated = Factory.importSave(JSON.stringify(old));
  assert.equal(migrated.state.stock.brickStorage, 0);
  assert.equal(migrated.state.brickStorageVersion, 1);
  assert.deepEqual(Factory.importSave(migrated.exportSave()).state, migrated.state);
  const malformed = JSON.parse(factory.exportSave());
  delete malformed.state.stock.brickStorage;
  assert.throws(() => Factory.importSave(JSON.stringify(malformed)), /machine inventory/);
  const overfull = JSON.parse(factory.exportSave());
  overfull.state.machines[0].contents[0].quantity = 601;
  assert.throws(() => Factory.importSave(JSON.stringify(overfull)), /capacity/);
});
