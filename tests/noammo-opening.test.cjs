const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../noammo-simulation.js");
const R = require("../noammo-renderer.js");
const { DATA: D, Factory, createState, ports, cells, size, cargo } = A;

function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, `${type} at ${x},${y}: ${result.error}`);
  return result.machine;
}
function advance(factory, seconds) {
  while (seconds > 1e-8) { const step = Math.min(30, seconds); factory.update(step); seconds -= step; }
}
function poweredFactory() {
  const factory = new Factory(createState(40));
  const wheel = place(factory, "wheel", 20, 20);
  const drive = place(factory, "drive", 21, 22, "up");
  assert.equal(factory.driveHasWheel(drive), true);
  return { factory, wheel, drive };
}
function drawingContext() {
  const calls = [];
  const context = {};
  for (const name of ["save", "restore", "clearRect", "fillRect", "strokeRect", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillText"]) {
    context[name] = (...args) => {
      assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite), `finite ${name} coordinates`);
      calls.push([name, ...args]);
    };
  }
  return { context, calls };
}

test("opening has its own save identity, 250×250 grid, 30 permanent trees and a free Planter/Basket", () => {
  const state = createState(123);
  assert.equal(D.config.columns, 250); assert.equal(D.config.rows, 250);
  assert.equal(state.trees.length, 30);
  assert.equal(state.stock.planter, 1); assert.equal(state.stock.basket, 1);
  assert.equal(state.stock.logger, 0); assert.equal(state.cash, 0);
  assert.notEqual(D.saveKey, "hamster-miners-save");
  assert.deepEqual(createState(123).trees, state.trees);
  for (let i = 0; i < state.trees.length; i++) for (let j = i + 1; j < state.trees.length; j++) {
    const a = state.trees[i], b = state.trees[j];
    assert.ok(Math.abs(a.x - b.x) >= 3 || Math.abs(a.y - b.y) >= 3);
  }
});

test("opening prices and manually operated Fiber match the decisions", () => {
  assert.deepEqual(D.machines.fiber.cost, { cash: 1, materials: { leek: 10 } });
  assert.deepEqual(D.machines.logger.cost, { cash: 0, materials: { wood: 50, leekFiber: 10 } });
  assert.deepEqual(D.machines.wheel.cost, { cash: 8, materials: { wood: 100, leekFiber: 50 } });
  assert.deepEqual(D.machines.drive.cost, { cash: 4, materials: { wood: 75, leekFiber: 15 } });
  assert.deepEqual(D.machines.primitive.cost, { cash: 5, materials: { wood: 50, leekFiber: 10 } });
  assert.equal(D.materials.wood.heat, 50);
  assert.equal(D.machines.primitive.cashEffect, null, "test balance must not masquerade as an agreed effect");
});

for (const facing of D.directions) {
  test(`rotated ${facing}: footprint and kinetic ports match their actual occupied cells`, () => {
    for (const type of Object.keys(D.machines)) {
      const machine = { type, x: 30, y: 30, facing };
      const occupied = new Set(cells(machine).map((point) => A.key(point.x, point.y)));
      for (const point of ports(machine)) assert.ok(occupied.has(A.key(point.x, point.y)), `${type} port belongs to its footprint`);
    }
    const drive = { type: "drive", x: 30, y: 30, facing };
    assert.equal(ports(drive).find((port) => port.role === "kineticInput").direction, facing);
    assert.equal(ports(drive).find((port) => port.role === "kineticOutput").direction, A.opposite(facing));
    const wheel = { type: "wheel", x: 20, y: 20, facing };
    const outputs = ports(wheel);
    assert.equal(outputs.length, 6);
    const expected = facing === "right" || facing === "left" ? ["up", "down"] : ["left", "right"];
    assert.ok(outputs.every((point) => expected.includes(point.direction)));
    assert.equal(cells(wheel).length, 6);
    assert.equal(cells(drive).length, 2);
    assert.equal(cells({ type: "fiber", x: 0, y: 0, facing }).length, 2);
  });
}

test("all six long-edge Wheel connections accept correctly facing Drives in every rotation", () => {
  for (const facing of D.directions) {
    const wheel = { type: "wheel", x: 40, y: 40, facing };
    for (const point of ports(wheel)) {
      const factory = new Factory(createState(1));
      place(factory, "wheel", wheel.x, wheel.y, facing);
      const driveFacing = A.opposite(point.direction);
      const offset = ports({ type: "drive", x: 0, y: 0, facing: driveFacing }).find((entry) => entry.role === "kineticInput");
      const v = D.vectors[point.direction];
      const drive = place(factory, "drive", point.x + v.x - offset.x, point.y + v.y - offset.y, driveFacing);
      assert.equal(factory.driveHasWheel(drive), true);
      assert.equal(factory.poweredDrives.length, 1);
      assert.equal(factory.powerArea(drive).width, 16); assert.equal(factory.powerArea(drive).height, 16);
    }
  }
});

test("Drive intake rejects the Wheel's short edge, wrong facing and a missing direct connection", () => {
  const factory = new Factory(createState(1));
  place(factory, "wheel", 40, 40);
  const wrongSide = place(factory, "drive", 43, 40, "left");
  assert.equal(factory.driveHasWheel(wrongSide), false);
  const gap = place(factory, "drive", 41, 44, "up");
  assert.equal(factory.driveHasWheel(gap), false);
});

test("Planter has no internal conveyor and sends from its facing edge in every orientation", () => {
  assert.equal(D.machines.planter.internalConveyors, undefined);
  for (const facing of D.directions) {
    const factory = new Factory(createState(1));
    const planter = place(factory, "planter", 40, 40, facing);
    const point = ports(planter)[0], v = D.vectors[point.direction];
    const basket = place(factory, "basket", point.x + v.x, point.y + v.y);
    advance(factory, 10);
    assert.equal(factory.total(basket, "contents"), 5);
    assert.equal(factory.poweredDrives.length, 0);
    assert.equal(basket.contents[0].material, "leek");
  }
});

test("five globally capped chops yield one 1–5 Wood burst; idle time and reloading cannot bank clicks", () => {
  const factory = new Factory(createState(2)), trees = factory.state.trees;
  for (let i = 0; i < 4; i++) {
    assert.equal(factory.chop(trees[i].id).accepted, true);
    assert.equal(factory.chop(trees[i + 1].id).accepted, false);
    assert.equal(factory.state.inventory.wood, 0); factory.update(0.2);
  }
  const result = factory.chop(trees[0].id);
  assert.ok(result.wood >= 1 && result.wood <= 5);
  assert.equal(factory.state.harvestProgress, 0);
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.chop(trees[1].id).accepted, false);
  advance(loaded, 60);
  assert.equal(loaded.chop(trees[1].id).accepted, true);
  assert.equal(loaded.chop(trees[2].id).accepted, false);
  assert.equal(loaded.state.trees.length, 30);
});

test("Fiber doubles quantity AND total value without a kinetic connection", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 42, 40);
  assert.equal(factory.receive(fiber, cargo("leek", 1, 0.73), 40, 40, "left", true), 1);
  advance(factory, 2.2);
  assert.equal(factory.total(basket, "contents"), 2);
  assert.equal(basket.contents[0].value, 0.73);
  assert.ok(Math.abs(factory.sellBasket(basket.id) - 1.46) < 1e-8);
});

test("Fiber input capacity, output blockage, independent instances and overflow are bounded", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40), other = place(factory, "fiber", 45, 40);
  assert.equal(factory.receive(fiber, cargo("wood", 100), 40, 40, "left", true), 0);
  assert.equal(factory.receive(fiber, cargo("leek", 100), 41, 40, "right", true), 0);
  assert.equal(factory.receive(fiber, cargo("leek", 100), 40, 40, "left", true), 1);
  assert.equal(factory.receive(fiber, cargo("leek", 1), 40, 40, "left", true), 0);
  advance(factory, 2.2);
  assert.equal(factory.total(fiber, "output"), 2);
  factory.receive(fiber, cargo("leek", 100), 40, 40, "left", true);
  advance(factory, 60);
  assert.equal(factory.total(fiber, "input"), 1);
  assert.equal(factory.total(fiber, "output"), 2);
  assert.equal(factory.total(other, "output"), 0);
  place(factory, "basket", 42, 40);
  advance(factory, 3);
  assert.equal(factory.total(fiber, "input"), 0);
});

test("Basket capacity stops intake; collecting and moving recover contents, and there is no inventory deposit API", () => {
  const factory = new Factory(createState(1)), basket = place(factory, "basket", 40, 40);
  assert.equal(factory.receive(basket, cargo("leek", 120), 40, 40, "left", true), 100);
  assert.equal(factory.receive(basket, cargo("leek", 1), 40, 40, "left", true), 0);
  assert.equal(factory.collect(basket.id), 100);
  assert.equal(factory.state.inventory.leek, 100);
  factory.receive(basket, cargo("leekFiber", 12, 2), 40, 40, null, true);
  assert.equal(factory.move(basket.id, 41, 41, "right").error, undefined);
  assert.equal(basket.contents.length, 0);
  assert.equal(factory.state.inventory.leekFiber, 12);
  assert.equal(typeof factory.depositInventory, "undefined");
});

test("Logger is inside the tree, uses crew, faces outward and produces Wood on a 12-second timer", () => {
  for (const [dx, dy, facing] of [[0, 1, "left"], [2, 1, "right"], [1, 0, "up"], [1, 2, "down"]]) {
    const factory = new Factory(createState(1)), tree = factory.state.trees[0];
    const logger = place(factory, "logger", tree.x + dx, tree.y + dy, facing);
    const point = ports(logger)[0], v = D.vectors[point.direction];
    const basket = place(factory, "basket", point.x + v.x, point.y + v.y);
    assert.equal(factory.availableCrew(), 9);
    advance(factory, 11.9); assert.equal(factory.total(basket, "contents"), 0);
    advance(factory, 0.1); assert.equal(factory.total(basket, "contents"), 1);
    assert.ok(factory.placement("logger", tree.x + 1, tree.y + 1, "right"));
    assert.ok(factory.placement("logger", tree.x - 1, tree.y + 1, "left"));
    assert.equal(factory.state.trees.length, 30);
  }
});

test("unpowered belts reject cargo; powered lanes have one object, weight 5 and no same-tick chain teleport", () => {
  const { factory } = poweredFactory();
  const first = place(factory, "belt", 21, 26), second = place(factory, "belt", 22, 26);
  const distant = place(factory, "belt", 60, 60);
  assert.equal(factory.receive(distant, cargo("leek", 1), 60, 60, "left", true), 0);
  assert.equal(factory.receive(first, cargo("leek", 20), 21, 26, "left", true), 5);
  assert.equal(factory.receive(first, cargo("leek", 1), 21, 26, "left", true), 0);
  advance(factory, 1);
  assert.equal(first.lanes[0], undefined);
  assert.equal(second.lanes[0].quantity, 5);
  assert.equal(second.lanes[0].progress, 0);
});

test("removing the Wheel immediately stops its area, without deleting waiting cargo", () => {
  const { factory, wheel } = poweredFactory();
  const belt = place(factory, "belt", 23, 24);
  factory.receive(belt, cargo("leek", 1), 23, 24, "left", true);
  advance(factory, 0.4);
  const before = belt.lanes[0].progress;
  factory.pickup(wheel.id); advance(factory, 3);
  assert.equal(belt.lanes[0].progress, before);
  assert.equal(factory.poweredDrives.length, 0);
});

test("haulers carry one stale item, observe loaded/return timing, and keep blocked deliveries", () => {
  const factory = new Factory(createState(1)), basket = place(factory, "basket", 40, 40), fiber = place(factory, "fiber", 44, 40);
  factory.receive(basket, cargo("leek", 5, 5), 40, 40, null, true);
  const { route } = factory.addRoute(basket.id, fiber.id, "leek");
  factory.update(0.1);
  assert.equal(route.item.quantity, 1); assert.equal(route.item.value, 0.1);
  assert.equal(factory.total(basket, "contents"), 4);
  assert.equal(route.duration, factory.routeDistance(basket, fiber) * 0.5);
  factory.receive(fiber, cargo("leek", 1), 44, 40, "left", true);
  fiber.output.push(cargo("leekFiber", 2));
  advance(factory, route.duration + 2);
  assert.equal(route.phase, "loaded"); assert.equal(route.item.quantity, 1);
  factory.removeRoute(route.id);
  assert.equal(factory.state.inventory.leek, 1);
  assert.equal(factory.availableCrew(), 9);
});

test("purchasing checks cash AND materials and cannot buy an unsettled cost", () => {
  const factory = new Factory(createState(1));
  factory.state.inventory.leek = 10;
  assert.ok(factory.buy("fiber").error); assert.equal(factory.state.inventory.leek, 10);
  factory.state.cash = 1;
  assert.equal(factory.buy("fiber").amount, 1);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.leek, 0);
  assert.ok(factory.buy("belt").error);
  assert.equal(factory.borrow("belt", 5), true); assert.equal(factory.state.stock.belt, 5);
  assert.equal(factory.borrow("primitive", 1), false);
  assert.ok(factory.buy("planter", 1.5).error); assert.ok(factory.buy("planter", 10000).error);
});

test("Primitive test ceiling is incoming eligibility, not an output clamp, and blockage cannot reapply it", () => {
  const { factory } = poweredFactory();
  const primitive = place(factory, "primitive", 23, 24);
  assert.equal(factory.receive(primitive, cargo("leek", 1, 0.95), 23, 24, "left", true), 1);
  advance(factory, 0.5);
  assert.ok(Math.abs(primitive.lanes[0].value - 1.05) < 1e-8);
  advance(factory, 10);
  assert.ok(Math.abs(primitive.lanes[0].value - 1.05) < 1e-8);
  assert.equal(primitive.lanes[0].upgrades.primitive, 1);
});

test("partially arrived Leeks cannot turn into a full two-Fiber recipe", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40);
  assert.equal(factory.receive(fiber, cargo("leek", 0.5), 40, 40, "left", true), 0);
  advance(factory, 10);
  assert.equal(fiber.output.length, 0);
});

test("real pending output follows its instance on move, is recovered once on pickup, and never leaks into a replacement", () => {
  const factory = new Factory(createState(1)), first = place(factory, "fiber", 40, 40), second = place(factory, "fiber", 45, 40);
  factory.receive(first, cargo("leek", 1, 0.5), 40, 40, "left", true);
  factory.receive(second, cargo("leek", 1, 2), 45, 40, "left", true);
  advance(factory, 3);
  factory.move(first.id, 50, 40, "right");
  assert.equal(first.output[0].value, 0.5); assert.equal(second.output[0].value, 2);
  factory.pickup(first.id); assert.equal(factory.state.inventory.leekFiber, 2);
  const replacement = factory.place("fiber", 40, 40).machine;
  assert.equal(replacement.output.length, 0); assert.equal(replacement.job, null);
  assert.equal(second.output[0].value, 2); assert.equal(second.output[0].quantity, 2);
  const loaded = Factory.importSave(factory.exportSave());
  advance(loaded, 10);
  assert.equal(loaded.byId.get(replacement.id).output.length, 0);
  assert.equal(loaded.state.inventory.leekFiber, 2);
});

test("actual opening reaches the $22 powered setup without cheats or a free Fiber Extractor", () => {
  const factory = new Factory(createState(8));
  const planter = factory.place("planter", 121, 5).machine;
  let basket = factory.place("basket", 123, 5).machine;
  advance(factory, 40); factory.collect(basket.id);
  assert.equal(factory.state.inventory.leek, 20);
  assert.equal(factory.sellInventory("leek", 10), 1);
  assert.equal(factory.buy("fiber").amount, 1);
  factory.pickup(basket.id);
  const fiber = factory.place("fiber", 123, 5).machine;
  basket = factory.place("basket", 125, 5).machine;
  for (let i = 0; i < 6; i++) { advance(factory, 60); factory.collect(basket.id); }
  assert.ok(factory.state.inventory.leekFiber >= 305, "one Planter must support the agreed six dollars/minute Fiber opening");
  while (factory.state.inventory.wood < 275) {
    factory.chop(factory.state.trees[0].id); factory.update(0.2);
  }
  factory.sellInventory("leekFiber", 220);
  for (const [type, count] of [["wheel", 1], ["drive", 1], ["primitive", 2]]) assert.equal(factory.buy(type, count).amount, count);
  const wheel = factory.place("wheel", 118, 4).machine;
  const drive = factory.place("drive", 119, 6, "up").machine;
  assert.equal(factory.driveHasWheel(drive), true);
  factory.move(basket.id, 124, 8, "right");
  const first = factory.place("primitive", 125, 5).machine;
  const second = factory.place("primitive", 126, 5).machine;
  factory.borrow("sellTube"); const sell = factory.place("sellTube", 127, 5).machine;
  assert.ok(planter && fiber && wheel && first && second && sell);
  const before = factory.state.cash; advance(factory, 30);
  assert.ok(factory.state.cash > before, "a real, powered Fiber → two Primitives → sale line must earn cash");
  const restored = Factory.importSave(factory.exportSave());
  assert.deepEqual(restored.state, factory.state);
  const cash = restored.state.cash; advance(restored, 10); assert.ok(restored.state.cash > cash);
});

test("invalid and legacy saves are rejected without mutating the live state", () => {
  assert.throws(() => Factory.importSave(JSON.stringify({ version: 1, state: { ammoStacks: [] } })), /not a no-ammo/);
  const factory = new Factory(createState(2)); place(factory, "basket", 40, 40);
  const payload = JSON.parse(factory.exportSave());
  payload.state.machines.push(A.copy(payload.state.machines[0]));
  assert.throws(() => Factory.importSave(JSON.stringify(payload)), /duplicate/);
  payload.state.machines.pop(); payload.state.cash = null;
  assert.throws(() => Factory.importSave(JSON.stringify(payload)), /Invalid cash/);
  assert.equal(factory.state.cash, 0);
});

for (const [type] of Object.entries(D.machines)) {
  test(`${type}: generic placement/move/pickup/replacement/save/render contract in all rotations`, () => {
    for (const facing of D.directions) {
      const factory = new Factory(createState(1));
      let x = 40, y = 40;
      if (type === "logger") {
        const tree = factory.state.trees[0];
        const offset = { right: [2, 1], down: [1, 2], left: [0, 1], up: [1, 0] }[facing];
        x = tree.x + offset[0]; y = tree.y + offset[1];
      }
      const reference = place(factory, "basket", x - 2, y - 2);
      const machine = place(factory, type, x, y, facing);
      const referenceBefore = JSON.stringify(reference);
      function draw() {
        const { context, calls } = drawingContext(), before = factory.exportSave();
        const camera = { x: x - 2, y: y - 2, zoom: 1 }, viewport = { width: 700, height: 500 };
        R.drawFloor(context, factory, camera, viewport);
        R.drawOverlay(context, factory, camera, viewport, { selected: machine.id, tool: { type, facing }, hover: { x: x + 2, y: y + 2 } });
        assert.equal(factory.exportSave(), before, "drawing is read-only");
        assert.ok(calls.some(([name, label]) => name === "fillText" && label === "Basket"), "the unrelated visible Basket remains labelled after every lifecycle operation");
        assert.equal(JSON.stringify(reference), referenceBefore);
      }
      draw();
      if (type !== "logger") assert.equal(factory.move(machine.id, x + 5, y + 5, facing).error, undefined);
      draw();
      const savedId = machine.id;
      factory.pickup(machine.id); draw();
      assert.equal(factory.place(type, x, y, facing).machine.id, savedId);
      draw();
      assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
    }
  });
}

test("prototype uses separate ordered scripts, local assets and no cosmetic machine animation", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "noammo.html"), "utf8");
  const names = [...html.matchAll(/<script src="([^"?]+)/g)].map((match) => match[1]);
  assert.deepEqual(names, ["noammo-data.js", "noammo-simulation.js", "noammo-renderer.js", "noammo-ui.js"]);
  assert.ok(!html.includes("phaser"));
  const renderer = fs.readFileSync(path.join(__dirname, "..", "noammo-renderer.js"), "utf8");
  assert.ok(!renderer.includes("Math.cos")); assert.ok(!renderer.includes("Math.sin"));
});
