const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("opening has its own save identity, 250×250 grid, fixed permanent trees and a free Planter/Basket", () => {
  const state = createState(123);
  assert.equal(D.config.columns, 250); assert.equal(D.config.rows, 250);
  assert.equal(state.trees.length, D.config.treeCount);
  assert.equal(state.stock.planter, 1); assert.equal(state.stock.basket, 1);
  assert.equal(state.stock.sellTube, 1);
  assert.equal(state.stock.logger, 0); assert.equal(state.cash, 0);
  assert.notEqual(D.saveKey, "hamster-miners-save");
  assert.deepEqual(createState(123).trees, state.trees);
  for (let i = 0; i < state.trees.length; i++) for (let j = i + 1; j < state.trees.length; j++) {
    const a = state.trees[i], b = state.trees[j];
    assert.ok(Math.abs(a.x - b.x) >= 3 || Math.abs(a.y - b.y) >= 3);
  }
});

test("opening prices and manually operated Fiber match the decisions", () => {
  assert.deepEqual(D.machines.fiber.cost, { cash: 0, materials: { wood: 30, leek: 1 } });
  assert.deepEqual(D.machines.logger.cost, { cash: 0, materials: { wood: 50, leekFiber: 5 } });
  assert.deepEqual(D.machines.wheel.cost, { cash: 8, materials: { wood: 100, leekFiber: 25 } });
  assert.deepEqual(D.machines.drive.cost, { cash: 4, materials: { wood: 75, leekFiber: 7.5 } });
  assert.deepEqual(D.machines.primitive.cost, { cash: 5, materials: { wood: 50, leekFiber: 5 } });
  assert.deepEqual(D.machines.basket.cost, { cash: 0, materials: { leekFiber: 5 } });
  assert.deepEqual(D.machines.planter.cost, { cash: 500, materials: { brick: 50, leekFiber: 100 } });
  assert.equal(D.config.planterSeconds, 8); assert.equal(D.machines.planter.cycle, 8);
  assert.equal(D.materials.wood.heat, 30);
  assert.equal(D.machines.primitive.cashEffect, null, "test balance must not masquerade as an agreed effect");
});

test("slow starter Planter yields one Leek per eight seconds and additional Planters enforce the full new cost", () => {
  const factory = new Factory(createState(1));
  const planter = factory.place("planter", 40, 40).machine;
  const basket = place(factory, "basket", 43, 41);
  advance(factory, 7.9); assert.equal(factory.total(basket, "contents"), 0);
  advance(factory, 0.1); assert.equal(factory.total(basket, "contents"), 1);
  advance(factory, 52); assert.equal(factory.total(basket, "contents"), 7);
  assert.equal(planter.output.length, 0);
  factory.state.cash = 1000; factory.state.inventory.brick = 100; factory.state.inventory.leekFiber = 199;
  const before = factory.exportSave(); assert.ok(factory.buy("planter", 2).error); assert.equal(factory.exportSave(), before);
  factory.state.inventory.leekFiber = 200;
  assert.equal(factory.buy("planter", 2).amount, 2);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.brick, 0); assert.equal(factory.state.inventory.leekFiber, 0);
  assert.equal(factory.borrow("planter"), false);
});

test("manual Clay Pits cost 100 Wood, use one crew, and output to either half of their two-wide facing edge", () => {
  assert.deepEqual(D.machines.clayPit.cost, { cash: 0, materials: { wood: 100 } });
  assert.equal(D.materials.clay.value, 0.25); assert.equal(D.materials.clay.weight, 1);
  for (const facing of D.directions) {
    const factory = new Factory(createState(1)); factory.state.inventory.wood = 99;
    assert.ok(factory.buy("clayPit").error); assert.equal(factory.state.inventory.wood, 99);
    factory.state.inventory.wood = 100; assert.equal(factory.buy("clayPit").amount, 1);
    const pit = factory.place("clayPit", 40, 40, facing).machine;
    assert.equal(factory.availableCrew(), 9); assert.deepEqual(size(pit), { width: 2, height: 2 });
    const outputs = ports(pit); assert.equal(outputs.length, 2);
    const targets = outputs.map((point) => {
      assert.equal(point.direction, facing);
      const v = D.vectors[facing]; return place(factory, "basket", point.x + v.x, point.y + v.y);
    });
    targets[0].contents.push(cargo("wood", 100));
    advance(factory, 11.9); assert.equal(factory.total(targets[1], "contents"), 0);
    advance(factory, 0.1); assert.equal(factory.total(targets[1], "contents"), 1);
    assert.equal(targets[1].contents[0].material, "clay");
    assert.equal(factory.poweredDrives.length, 0, "manual extraction needs no Wheel or Drive");
    assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.wood, 0);
  }
});

test("blocked Clay output is bounded, instances retain their timers and cargo through moves/pickups/saves", () => {
  const factory = new Factory(createState(1));
  const first = place(factory, "clayPit", 40, 40), other = place(factory, "clayPit", 45, 40);
  advance(factory, 120);
  assert.equal(factory.total(first, "output"), 1); assert.equal(factory.total(other, "output"), 1);
  assert.equal(first.timer, 0); assert.match(factory.status(first), /blocked/);
  const loaded = Factory.importSave(factory.exportSave());
  assert.deepEqual(loaded.state, factory.state);
  assert.equal(loaded.move(first.id, 50, 40, "down").error, undefined);
  assert.equal(loaded.byId.get(first.id).output[0].material, "clay");
  loaded.pickup(first.id); assert.equal(loaded.state.inventory.clay, 1);
  const replacement = loaded.place("clayPit", 40, 40).machine;
  assert.equal(replacement.id, first.id); assert.equal(replacement.output.length, 0);
  assert.equal(loaded.total(loaded.byId.get(other.id), "output"), 1);
  advance(loaded, 6); const halfway = Factory.importSave(loaded.exportSave());
  assert.ok(Math.abs(halfway.byId.get(first.id).timer - 6) < 1e-8);
  advance(halfway, 6); assert.equal(halfway.total(halfway.byId.get(first.id), "output"), 1);
  const bad = JSON.parse(halfway.exportSave());
  bad.state.machines.find((machine) => machine.id === first.id).output.push(cargo("clay"));
  assert.throws(() => Factory.importSave(JSON.stringify(bad)), /source buffer/);
  bad.state.machines.find((machine) => machine.id === first.id).output = [cargo("wood")];
  assert.throws(() => Factory.importSave(JSON.stringify(bad)), /source buffer/);
});

test("four unpowered Clay Pits feed one free Sell Tube from four sides for exactly $5 per minute", () => {
  const factory = new Factory(createState(1));
  factory.place("sellTube", 40, 40);
  for (const [x, y, facing] of [[38, 40, "right"], [42, 40, "left"], [40, 38, "down"], [40, 42, "up"]]) place(factory, "clayPit", x, y, facing);
  advance(factory, 60);
  assert.equal(factory.state.cash, 5); assert.equal(factory.state.soldItems, 20);
  assert.equal(factory.availableCrew(), 6); assert.equal(factory.poweredDrives.length, 0);
});

test("Sell Tube feedback uses actual stack proceeds, never fires on intake checks, stays bounded and is not saved", () => {
  const factory = new Factory(createState(1)), tube = place(factory, "sellTube", 40, 40);
  const item = cargo("clay", 3, 0.75);
  assert.equal(factory.receive(tube, item, 40, 40, "left"), 3);
  assert.equal(factory.state.cash, 0); assert.equal(factory.saleTexts.length, 0);
  factory.receive(tube, item, 40, 40, "left", true);
  assert.equal(factory.state.cash, 2.25);
  assert.deepEqual(factory.saleTexts[0], { amount: 2.25, x: 41, y: 40, created: 0 });
  const other = place(factory, "sellTube", 45, 40);
  factory.receive(other, cargo("wood", 2), 45, 40, "left", true);
  assert.equal(factory.saleTexts[1].x, 46);
  assert.equal(factory.saleTexts[1].amount, 0.2);
  assert.equal(Factory.importSave(factory.exportSave()).saleTexts.length, 0);
  assert.equal(JSON.stringify(factory.state).includes("saleTexts"), false);
  for (let i = 0; i < 100; i++) factory.receive(tube, cargo("clay"), 40, 40, "left", true);
  assert.equal(factory.saleTexts.length, 64);
  assert.equal(factory.state.cash, 27.45, "limiting feedback cannot limit earnings");
  advance(factory, 1.3); assert.equal(factory.saleTexts.length, 0);
});

test("sale text renders green, rises and fades, follows camera coordinates and never mutates earnings or save state", () => {
  const factory = new Factory(createState(1)), tube = place(factory, "sellTube", 40, 40);
  factory.receive(tube, cargo("clay", 1, 0.123456), 40, 40, "left", true);
  function draw() {
    const { context, calls } = drawingContext();
    context.fillText = (label, x, y) => calls.push(["text", label, x, y, context.fillStyle, context.globalAlpha]);
    const before = factory.exportSave(), feedback = JSON.stringify(factory.saleTexts);
    R.drawOverlay(context, factory, { x: 38, y: 38, zoom: 1 }, { width: 600, height: 400 });
    assert.equal(factory.exportSave(), before); assert.equal(JSON.stringify(factory.saleTexts), feedback);
    return calls.find(([kind, label]) => kind === "text" && label.startsWith("+$"));
  }
  const first = draw();
  assert.equal(first[1], "+$0.123"); assert.equal(first[2], 41 * R.TILE);
  assert.equal(first[4], "#75df86"); assert.equal(first[5], 1);
  advance(factory, 0.5); const next = draw();
  assert.ok(next[3] < first[3]); assert.ok(next[5] < first[5]);
  assert.equal(factory.state.cash, 0.123456);
  advance(factory, 1); assert.equal(draw(), undefined);
  assert.equal(A.formatNumber(12345), "12.3k");
});

test("older opening saves default the new Clay fields without changing progress or granting free pits", () => {
  const factory = new Factory(createState(1));
  factory.place("planter", 40, 40); factory.state.cash = 17;
  delete factory.state.inventory.clay; delete factory.state.stock.clayPit;
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.state.inventory.clay, 0); assert.equal(loaded.state.stock.clayPit, 0);
  assert.equal(loaded.state.cash, 17); assert.equal(loaded.state.machines.length, 1);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("crew hiring starts at $5, scales by 1.1 per paid hire, and rejects unaffordable hires without mutation", () => {
  const factory = new Factory(createState(1));
  assert.equal(factory.totalCrew(), 10); assert.equal(factory.availableCrew(), 10);
  for (let hired = 0; hired < 5; hired++) {
    const cost = 5 * 1.1 ** hired;
    assert.equal(factory.crewHireCost(), cost);
    factory.state.cash = cost - 0.01;
    const before = factory.exportSave();
    assert.equal(factory.canHireCrew(), false); assert.ok(factory.hireCrew().error);
    assert.equal(factory.exportSave(), before);
    factory.state.cash = cost;
    assert.equal(factory.hireCrew().cost, cost); assert.equal(factory.state.cash, 0);
    assert.equal(factory.state.hiredCrew, hired + 1);
    assert.equal(factory.totalCrew(), 11 + hired); assert.equal(factory.availableCrew(), 11 + hired);
  }
  assert.deepEqual(Factory.importSave(factory.exportSave()).state, factory.state);
});

test("hired crew support additional machines and haulers and survive placement, pickup and save/load", () => {
  const factory = new Factory(createState(1));
  for (let index = 0; index < 10; index++) place(factory, "fiber", 40 + index * 2, 40);
  const source = place(factory, "basket", 70, 45), destination = place(factory, "basket", 72, 45);
  assert.equal(factory.availableCrew(), 0);
  assert.ok(factory.addRoute(source.id, destination.id).error);
  factory.state.stock.fiber++;
  assert.ok(factory.place("fiber", 80, 40).error);
  factory.state.cash = 10.5; factory.hireCrew();
  const extra = factory.place("fiber", 80, 40).machine;
  assert.ok(extra); assert.equal(factory.availableCrew(), 0);
  factory.hireCrew(); assert.ok(factory.addRoute(source.id, destination.id).route);
  assert.equal(factory.totalCrew(), 12); assert.equal(factory.availableCrew(), 0);
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.totalCrew(), 12); assert.equal(loaded.availableCrew(), 0);
  assert.equal(loaded.move(extra.id, 80, 42, "right").error, undefined);
  loaded.pickup(extra.id);
  assert.equal(loaded.availableCrew(), 1); assert.equal(loaded.state.hiredCrew, 2);
  assert.equal(loaded.crewHireCost(), 5 * 1.1 ** 2);
});

test("old saves default to zero paid hires and malformed hired counts are rejected", () => {
  const factory = new Factory(createState(1));
  delete factory.state.hiredCrew;
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.state.hiredCrew, 0); assert.equal(loaded.totalCrew(), 10); assert.equal(loaded.crewHireCost(), 5);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  for (const invalid of [-1, 1.5, null, "2"]) {
    const saved = JSON.parse(factory.exportSave()); saved.state.hiredCrew = invalid;
    assert.throws(() => Factory.importSave(JSON.stringify(saved)), /Invalid hired crew/);
  }
});

test("Wood sells for $0.10 from inventory and a direct Logger-to-Sell-Tube route", () => {
  assert.equal(D.materials.wood.value, 0.1); assert.equal(D.materials.wood.heat, 30);
  const factory = new Factory(createState(1));
  factory.state.inventory.wood = 10;
  assert.equal(factory.sellInventory("wood", 10), 1);
  const basket = place(factory, "basket", 40, 40);
  factory.receive(basket, cargo("wood", 5), 40, 40, null, true);
  assert.equal(factory.collect(basket.id), 5);
  assert.equal(factory.sellInventory("wood", 5), 0.5);
  const tree = factory.state.trees[0];
  place(factory, "logger", tree.x, tree.y + 1, "left");
  const tube = factory.place("sellTube", tree.x - 2, tree.y).machine;
  assert.ok(tube); advance(factory, 12);
  assert.ok(Math.abs(factory.state.cash - 1.6) < 1e-8);
  assert.equal(factory.receive(tube, cargo("wood", 2, 0.7), tube.x, tube.y, null, true), 2);
  assert.ok(Math.abs(factory.state.cash - 3) < 1e-8, "fresh upgraded Wood retains its actual value");
});

test("one Sell Tube is free; additional tubes require $250 and 200 Bricks each and cannot be borrowed", () => {
  const factory = new Factory(createState(1));
  assert.equal(factory.state.stock.sellTube, 1);
  assert.deepEqual(D.machines.sellTube.cost, { cash: 250, materials: { brick: 200 } });
  assert.equal(factory.borrow("sellTube"), false);
  factory.state.cash = 249; factory.state.inventory.brick = 200;
  assert.ok(factory.buy("sellTube").error);
  factory.state.cash = 250; factory.state.inventory.brick = 199;
  assert.ok(factory.buy("sellTube").error);
  factory.state.inventory.brick = 200;
  assert.equal(factory.buy("sellTube").amount, 1);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.brick, 0);
  assert.equal(factory.state.stock.sellTube, 2);
  factory.state.cash = 500; factory.state.inventory.brick = 400;
  assert.equal(factory.buy("sellTube", 2).amount, 2);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.brick, 0);
  assert.equal(factory.state.stock.sellTube, 4);
});

test("old opening saves receive the missing starter tube and price unvalued Wood once, without losing cargo", () => {
  const factory = new Factory(createState(1));
  factory.state.stock.sellTube = 0;
  const basket = place(factory, "basket", 40, 40), other = place(factory, "basket", 50, 40), belt = place(factory, "belt", 45, 40);
  const tree = factory.state.trees[0], logger = place(factory, "logger", tree.x, tree.y + 1, "left");
  basket.contents.push(cargo("wood", 5, 0), cargo("wood", 1, 0.7));
  logger.output.push(cargo("wood", 1, 0)); belt.lanes[0] = cargo("wood", 2, 0);
  factory.addRoute(basket.id, other.id, "wood"); factory.update(0.1);
  factory.state.routes[0].item.value = 0;
  delete factory.state.openingEconomyVersion; delete factory.state.inventory.brick;
  const saved = factory.exportSave(), loaded = Factory.importSave(saved);
  assert.equal(factory.exportSave(), saved, "migration does not mutate its source");
  assert.equal(loaded.state.stock.sellTube, 1); assert.equal(loaded.state.inventory.brick, 0);
  assert.deepEqual(loaded.byId.get(basket.id).contents.map((item) => [item.quantity, item.value]), [[4, 0.1], [1, 0.7]]);
  assert.equal(loaded.byId.get(logger.id).output[0].value, 0.1);
  assert.equal(loaded.byId.get(belt.id).lanes[0].value, 0.1);
  assert.equal(loaded.state.routes[0].item.value, 0.1);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("old saves with a stocked, placed or picked-up Sell Tube never receive a duplicate free one", () => {
  for (const location of ["stock", "placed", "stored"]) {
    const factory = new Factory(createState(1));
    if (location !== "stock") {
      const tube = factory.place("sellTube", 40, 40).machine;
      if (location === "stored") factory.pickup(tube.id);
    }
    delete factory.state.openingEconomyVersion; delete factory.state.inventory.brick;
    const loaded = Factory.importSave(factory.exportSave());
    assert.equal(loaded.state.stock.sellTube + loaded.state.machines.filter((machine) => machine.type === "sellTube").length, 1);
    assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  }
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
    assert.equal(ports(drive).length, 1, "Drive has only a kinetic intake; power is supplied over an area");
    assert.equal(ports(drive).some((port) => port.role === "kineticOutput"), false);
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

test("Wheel defaults to a quarter-turn without changing saved orientations or its six-cell footprint", () => {
  const factory = new Factory(createState(1));
  factory.state.stock.wheel = 2;
  const wheel = factory.place("wheel", 40, 40).machine;
  assert.equal(wheel.facing, "down");
  assert.deepEqual(size(wheel), { width: 2, height: 3 });
  assert.equal(cells(wheel).length, 6);
  assert.ok(ports(wheel).every((point) => ["left", "right"].includes(point.direction)));
  const old = factory.place("wheel", 45, 40, "right").machine;
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.byId.get(old.id).facing, "right");
  assert.deepEqual(size(loaded.byId.get(old.id)), { width: 3, height: 2 });
  assert.deepEqual(loaded.state, factory.state);
});

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
    assert.deepEqual(size(planter), { width: 3, height: 3 });
    assert.equal(cells(planter).length, 9);
    assert.equal(ports(planter).length, 1);
    const expected = { right: [42, 41], down: [41, 42], left: [40, 41], up: [41, 40] }[facing];
    const point = ports(planter)[0], v = D.vectors[point.direction];
    assert.deepEqual([point.x, point.y], expected, "the sole output is centered on the facing edge");
    const basket = place(factory, "basket", point.x + v.x, point.y + v.y);
    advance(factory, D.config.planterSeconds * 5);
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
  assert.equal(loaded.state.trees.length, D.config.treeCount);
});

test("Fiber matches the actual Ingot Molder footprint and lower working tile, without a conveyor", () => {
  const legacy = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "game-data.js"), "utf8")
    + "\nglobalThis.molderLayout = MACHINE_LAYOUT.ingotMolder;", legacy);
  const molder = legacy.molderLayout;
  assert.equal(D.machines.fiber.width, molder.width);
  assert.equal(D.machines.fiber.height, molder.height);
  assert.equal(D.machines.fiber.internalConveyors, undefined);
  const factory = new Factory(createState(1));
  factory.state.stock.fiber = 1;
  const fiber = factory.place("fiber", 40, 40).machine;
  assert.equal(fiber.facing, molder.orientation);
  assert.deepEqual(size(fiber), { width: 1, height: 2 });
  assert.deepEqual(ports(fiber), [
    { x: 40, y: 41, direction: "left", role: "input" },
    { x: 40, y: 41, direction: "right", role: "output" },
  ]);
  const output = ports(fiber).find((point) => point.role === "output");
  assert.equal(output.x - fiber.x, molder.liquidInputOutput.column);
  assert.equal(output.y - fiber.y, molder.liquidInputOutput.row);
  assert.equal(output.direction, molder.liquidInputOutput.direction);
});

test("Fiber routes through its lower working tile in every rotation, leaving the body inactive", () => {
  const layouts = {
    right: { width: 1, height: 2, work: [40, 41], body: [40, 40] },
    down: { width: 2, height: 1, work: [40, 40], body: [41, 40] },
    left: { width: 1, height: 2, work: [40, 40], body: [40, 41] },
    up: { width: 2, height: 1, work: [41, 40], body: [40, 40] },
  };
  for (const [facing, layout] of Object.entries(layouts)) {
    const factory = new Factory(createState(1));
    const fiber = place(factory, "fiber", 40, 40, facing), v = D.vectors[facing];
    assert.deepEqual(size(fiber), { width: layout.width, height: layout.height });
    assert.deepEqual(ports(fiber).map((point) => [point.x, point.y]), [layout.work, layout.work]);
    assert.equal(ports(fiber)[0].direction, A.opposite(facing));
    assert.equal(ports(fiber)[1].direction, facing);
    const input = ports(fiber)[0];
    // An actual Planter supplies the working cell, rather than injecting cargo
    // into a test-only input that the visible output cannot reach.
    const source = { type: "planter", x: 0, y: 0, facing }, offset = ports(source)[0];
    place(factory, "planter", input.x - v.x - offset.x, input.y - v.y - offset.y, facing);
    const basket = place(factory, "basket", input.x + v.x, input.y + v.y);
    for (const side of D.directions) assert.equal(factory.receive(fiber, cargo("leek"), ...layout.body, side, true), 0);
    assert.equal(factory.receive(fiber, cargo("leek"), ...layout.work, facing, true), 0);
    advance(factory, D.config.planterSeconds * 4 + D.config.fiberSeconds + 1);
    assert.equal(factory.total(basket, "contents"), 8);
    assert.deepEqual(fiber.lanes, {}, "the Extractor does not turn into a belt");
    assert.equal(Factory.importSave(factory.exportSave()).byId.get(fiber.id).facing, facing);
  }
});

test("the two earlier Fiber layouts migrate once without losing active work or saved rotations", () => {
  for (const version of [1, 2]) for (const oldFacing of D.directions) {
    const factory = new Factory(createState(1));
    const newFacing = A.turn(version === 1 && oldFacing === "right" ? "down" : oldFacing, -1);
    const fiber = place(factory, "fiber", 40, 40, newFacing);
    const input = ports(fiber)[0];
    factory.receive(fiber, cargo("leek", 1, 0.4), input.x, input.y, input.direction, true);
    advance(factory, 0.1);
    const occupied = cells(fiber);
    fiber.facing = oldFacing;
    factory.state.fiberFootprintVersion = version;
    const loaded = Factory.importSave(factory.exportSave()), restored = loaded.byId.get(fiber.id);
    assert.equal(restored.facing, newFacing);
    assert.deepEqual(cells(restored), occupied);
    assert.equal(restored.job.input.value, 0.4);
    assert.equal(loaded.state.fiberFootprintVersion, 3);
    assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state, "migration is not repeated");
  }
});

test("version-2 Fiber correction preserves occupied tiles, neighbours and stored instances", () => {
  const factory = new Factory(createState(1));
  const fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 41, 41);
  const stored = place(factory, "fiber", 50, 50, "up");
  factory.pickup(stored.id);
  fiber.output.push(cargo("leekFiber", 2, 0.4));
  factory.receive(basket, cargo("leek", 3), basket.x, basket.y, null, true);
  fiber.facing = "down"; stored.facing = "right";
  factory.state.fiberFootprintVersion = 2;
  const loaded = Factory.importSave(factory.exportSave());
  assert.equal(loaded.byId.get(fiber.id).facing, "right");
  assert.deepEqual(size(loaded.byId.get(fiber.id)), { width: 1, height: 2 });
  assert.equal(loaded.state.storedMachines[0].facing, "up");
  assert.deepEqual(loaded.byId.get(basket.id), basket);
  assert.equal(loaded.recoveredForPlanterResize, 0);
  advance(loaded, 0.1);
  assert.equal(loaded.total(loaded.byId.get(basket.id), "contents"), 5);
});

test("Fiber doubles quantity AND total value without a kinetic connection", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40), basket = place(factory, "basket", 41, 41);
  assert.equal(factory.receive(fiber, cargo("leek", 1, 0.73), 40, 41, "left", true), 1);
  advance(factory, 2.2);
  assert.equal(factory.total(basket, "contents"), 2);
  assert.equal(basket.contents[0].value, 0.73);
  assert.ok(Math.abs(basket.contents.reduce((sum, item) => sum + item.quantity * item.value, 0) - 1.46) < 1e-8);
});

test("Fiber input capacity, output blockage, independent instances and overflow are bounded", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40), other = place(factory, "fiber", 45, 40);
  assert.equal(factory.receive(fiber, cargo("wood", 100), 40, 41, "left", true), 0);
  assert.equal(factory.receive(fiber, cargo("leek", 100), 40, 41, "right", true), 0);
  assert.equal(factory.receive(fiber, cargo("leek", 100), 40, 41, "left", true), 1);
  assert.equal(factory.receive(fiber, cargo("leek", 1), 40, 41, "left", true), 0);
  advance(factory, 2.2);
  assert.equal(factory.total(fiber, "output"), 2);
  factory.receive(fiber, cargo("leek", 100), 40, 41, "left", true);
  advance(factory, 60);
  assert.equal(factory.total(fiber, "input"), 1);
  assert.equal(factory.total(fiber, "output"), 2);
  assert.equal(factory.total(other, "output"), 0);
  place(factory, "basket", 41, 41);
  advance(factory, 3);
  assert.equal(factory.total(fiber, "input"), 0);
});

test("Basket capacity stops intake; collecting and moving recover contents, and there is no inventory deposit API", () => {
  const factory = new Factory(createState(1)), basket = place(factory, "basket", 40, 40);
  assert.equal(factory.receive(basket, cargo("leek", 120), 40, 40, "left", true), 100);
  assert.equal(factory.receive(basket, cargo("leek", 1), 40, 40, "left", true), 0);
  advance(factory, 10);
  assert.equal(factory.state.cash, 0, "holding sellables in a Basket does not sell them");
  assert.equal(typeof factory.sellBasket, "undefined");
  assert.equal(factory.collect(basket.id), 100);
  assert.equal(factory.state.cash, 0, "collection transfers items, not cash");
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
    assert.equal(factory.state.trees.length, D.config.treeCount);
  }
});

test("unpowered belts reject cargo; powered lanes have one object, weight 5 and no same-tick chain teleport", () => {
  const { factory } = poweredFactory();
  const first = place(factory, "belt", 21, 26), second = place(factory, "belt", 22, 26);
  const distant = place(factory, "belt", 60, 60);
  assert.equal(factory.receive(distant, cargo("leek", 1), 60, 60, "left", true), 0);
  assert.equal(factory.receive(first, cargo("leek", 20), 21, 26, "left", true), 5);
  assert.equal(factory.receive(first, cargo("leek", 1), 21, 26, "left", true), 0);
  advance(factory, D.config.beltSeconds);
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
  factory.receive(fiber, cargo("leek", 1), 44, 41, "left", true);
  fiber.output.push(cargo("leekFiber", 2));
  advance(factory, route.duration + 2);
  assert.equal(route.phase, "loaded"); assert.equal(route.item.quantity, 1);
  factory.removeRoute(route.id);
  assert.equal(factory.state.inventory.leek, 1);
  assert.equal(factory.availableCrew(), 9);
});

test("purchasing checks cash AND materials, including the $1 and 20 Wood per conveyor", () => {
  const factory = new Factory(createState(1));
  factory.state.inventory.leek = 1; factory.state.inventory.wood = 29;
  assert.ok(factory.buy("fiber").error); assert.equal(factory.state.inventory.leek, 1);
  factory.state.inventory.wood = 30; factory.state.inventory.leek = 0;
  assert.ok(factory.buy("fiber").error); assert.equal(factory.state.inventory.wood, 30);
  factory.state.inventory.leek = 1;
  assert.equal(factory.buy("fiber").amount, 1);
  assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.leek, 0); assert.equal(factory.state.inventory.wood, 0);
  assert.ok(factory.buy("belt").error);
  assert.deepEqual(D.machines.belt.cost, { cash: 1, materials: { wood: 20 } });
  assert.equal(factory.borrow("belt", 5), false); assert.equal(factory.state.stock.belt, 0);
  factory.state.cash = 5; factory.state.inventory.wood = 99;
  assert.ok(factory.buy("belt", 5).error);
  factory.state.cash = 4; factory.state.inventory.wood = 100;
  assert.ok(factory.buy("belt", 5).error);
  factory.state.cash = 5;
  assert.equal(factory.buy("belt", 5).amount, 5);
  assert.equal(factory.state.stock.belt, 5); assert.equal(factory.state.cash, 0); assert.equal(factory.state.inventory.wood, 0);
  assert.equal(factory.borrow("primitive", 1), false);
  assert.ok(factory.buy("planter", 1.5).error); assert.ok(factory.buy("planter", 10000).error);
});

test("Primitive test ceiling is incoming eligibility, not an output clamp, and blockage cannot reapply it", () => {
  const { factory } = poweredFactory();
  const primitive = place(factory, "primitive", 23, 24);
  assert.equal(factory.receive(primitive, cargo("leek", 1, 0.95), 23, 24, "left", true), 1);
  advance(factory, D.config.beltSeconds / 2);
  assert.ok(Math.abs(primitive.lanes[0].value - 1.05) < 1e-8);
  advance(factory, 10);
  assert.ok(Math.abs(primitive.lanes[0].value - 1.05) < 1e-8);
  assert.equal(primitive.lanes[0].upgrades.primitive, 1);
});

test("partially arrived Leeks cannot turn into a full two-Fiber recipe", () => {
  const factory = new Factory(createState(1)), fiber = place(factory, "fiber", 40, 40);
  assert.equal(factory.receive(fiber, cargo("leek", 0.5), 40, 41, "left", true), 0);
  advance(factory, 10);
  assert.equal(fiber.output.length, 0);
});

test("real pending output follows its instance on move, is recovered once on pickup, and never leaks into a replacement", () => {
  const factory = new Factory(createState(1)), first = place(factory, "fiber", 40, 40), second = place(factory, "fiber", 45, 40);
  factory.receive(first, cargo("leek", 1, 0.5), 40, 41, "left", true);
  factory.receive(second, cargo("leek", 1, 2), 45, 41, "left", true);
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

test("actual opening bootstraps cash-free Fiber and reaches the $22 powered setup using four manual Clay Pits", () => {
  const factory = new Factory(createState(8));
  const planter = factory.place("planter", 121, 5).machine;
  let basket = factory.place("basket", 124, 6).machine;
  while (factory.state.inventory.wood < 430) {
    factory.chop(factory.state.trees[0].id); factory.update(0.2);
  }
  factory.collect(basket.id);
  assert.ok(factory.state.inventory.leek >= 1); assert.equal(factory.state.cash, 0);
  assert.equal(factory.buy("fiber").amount, 1);
  factory.pickup(basket.id);
  const fiber = factory.place("fiber", 124, 5).machine;
  basket = factory.place("basket", 125, 6).machine;
  assert.equal(factory.buy("clayPit", 4).amount, 4);
  const incomeTube = factory.place("sellTube", 147, 10).machine;
  for (const [x, y, facing] of [[145, 10, "right"], [149, 10, "left"], [147, 8, "down"], [147, 12, "up"]]) {
    assert.ok(factory.place("clayPit", x, y, facing).machine);
  }
  for (let i = 0; i < 5; i++) { advance(factory, 60); factory.collect(basket.id); }
  assert.ok(factory.state.cash >= 22, "Clay alone must fund the powered setup");
  assert.ok(factory.state.inventory.leekFiber >= 42.5, "slow Leeks must cover the halved construction costs");
  while (factory.state.inventory.wood < 275) {
    factory.chop(factory.state.trees[0].id); factory.update(0.2);
  }
  for (const [type, count] of [["wheel", 1], ["drive", 1], ["primitive", 2]]) assert.equal(factory.buy(type, count).amount, count);
  const wheel = factory.place("wheel", 119, 10, "right").machine;
  const drive = factory.place("drive", 120, 12, "up").machine;
  assert.equal(factory.driveHasWheel(drive), true);
  factory.move(basket.id, 124, 8, "right");
  const first = factory.place("primitive", 125, 6).machine;
  const second = factory.place("primitive", 126, 6).machine;
  assert.equal(factory.move(incomeTube.id, 127, 6, "right").error, undefined);
  const sell = incomeTube;
  assert.ok(planter && fiber && wheel && first && second && sell);
  const before = factory.state.cash; advance(factory, 30);
  assert.ok(factory.state.cash > before, "a real, powered Fiber → two Primitives → sale line must earn cash");
  const restored = Factory.importSave(factory.exportSave());
  assert.deepEqual(restored.state, factory.state);
  const cash = restored.state.cash; advance(restored, 10); assert.ok(restored.state.cash > cash);
});

test("old 2×2 Planter saves recover overlapping machines and carried cargo without erasing progress", () => {
  const factory = new Factory(createState(2));
  const planter = place(factory, "planter", 40, 40);
  const basket = place(factory, "basket", 44, 40);
  const other = place(factory, "basket", 50, 40);
  factory.receive(basket, cargo("leekFiber", 5), 44, 40, null, true);
  factory.addRoute(basket.id, other.id, "leekFiber");
  factory.update(0.1);
  basket.x = 42; // This adjacent tile was legal beside the old 2×2 Planter.
  delete factory.state.planterFootprintVersion;
  const stock = factory.state.stock.basket;
  const restored = Factory.importSave(factory.exportSave());
  assert.ok(restored.byId.has(planter.id));
  assert.deepEqual(size(restored.byId.get(planter.id)), { width: 3, height: 3 });
  assert.ok(restored.byId.has(other.id));
  assert.equal(restored.byId.has(basket.id), false);
  assert.equal(restored.state.stock.basket, stock + 1);
  assert.equal(restored.state.inventory.leekFiber, 5);
  assert.equal(restored.state.routes.length, 0);
  assert.equal(restored.recoveredForPlanterResize, 1);
  assert.equal(restored.state.planterFootprintVersion, 2);
  const reloaded = Factory.importSave(restored.exportSave());
  assert.equal(reloaded.state.inventory.leekFiber, 5);
  assert.equal(reloaded.state.stock.basket, stock + 1);
});

test("old Planter saves with room expand without moving or recovering unrelated machines", () => {
  const factory = new Factory(createState(1));
  const planter = place(factory, "planter", 40, 40), other = place(factory, "basket", 44, 41);
  delete factory.state.planterFootprintVersion;
  const restored = Factory.importSave(factory.exportSave());
  assert.equal(restored.recoveredForPlanterResize, 0);
  assert.equal(restored.byId.get(planter.id).x, 40);
  assert.equal(restored.byId.get(other.id).x, 44);
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
        R.drawOverlay(context, factory, camera, viewport, {
          selectedIds: [machine.id, reference.id], group: { ids: [machine.id, reference.id], turns: 1 },
          hover: { x: x + 2, y: y + 2 }, box: { start: { x: x - 2, y: y - 2 }, end: { x: x + 2, y: y + 2 } },
        });
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
