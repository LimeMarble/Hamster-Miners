const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../noammo-simulation.js");
const R = require("../noammo-renderer.js");
const { DATA: D, Factory, createState, ports, cargo } = A;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function place(factory, type, x, y, facing = "right") {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  assert.equal(result.error, undefined, `${type}: ${result.error}`);
  return result.machine;
}
function setup(facing = "right", collectors = true) {
  const factory = new Factory(createState(1)), sifter = place(factory, "pebbleSifter", 40, 40, facing);
  const intake = ports(sifter).find((point) => point.role === "kineticInput"), vector = D.vectors[intake.direction];
  let wheel;
  for (const direction of D.directions) {
    for (const point of ports({ type: "wheel", x: 0, y: 0, facing: direction })) {
      if (point.direction !== A.opposite(intake.direction)) continue;
      const x = intake.x + vector.x - point.x, y = intake.y + vector.y - point.y;
      if (!factory.placement("wheel", x, y, direction)) { wheel = place(factory, "wheel", x, y, direction); break; }
    }
    if (wheel) break;
  }
  assert.ok(wheel); assert.equal(factory.kineticHasWheel(sifter), true);
  const receivers = {};
  if (collectors) for (const point of ports(sifter).filter((entry) => entry.role === "output")) {
    const v = D.vectors[point.direction];
    receivers[point.material] = place(factory, "basket", point.x + v.x, point.y + v.y);
  }
  return { factory, sifter, wheel, receivers };
}

test("Pebble Sifter cost, construction materials, six-cell footprint and material properties are exact", () => {
  assert.deepEqual(D.machines.pebbleSifter.cost, { cash: 700, materials: { wood: 150, brick: 30, leekFiber: 50 } });
  assert.equal(D.materials.chert.value, 0.1); assert.equal(D.materials.soil.value, null);
  const factory = new Factory(createState(1));
  assert.equal(factory.state.stock.pebbleSifter, 0);
  const full = { wood: 150, brick: 30, leekFiber: 50 };
  for (const missing of ["cash", ...Object.keys(full)]) {
    factory.state.cash = 700; Object.assign(factory.state.inventory, full);
    if (missing === "cash") factory.state.cash--; else factory.state.inventory[missing]--;
    const before = factory.exportSave(); assert.ok(factory.buy("pebbleSifter").error);
    assert.equal(factory.exportSave(), before);
  }
  factory.state.cash = 1400; Object.assign(factory.state.inventory, { wood: 300, brick: 60, leekFiber: 100 });
  assert.equal(factory.buy("pebbleSifter", 2).amount, 2); assert.equal(factory.state.cash, 0);
  const sifter = factory.place("pebbleSifter", 40, 40).machine;
  assert.equal(A.cells(sifter).length, 6); assert.equal(factory.availableCrew(), 10);
  assert.deepEqual(ports(sifter), [
    { x: 42, y: 40, direction: "right", role: "output", material: "soil" },
    { x: 41, y: 41, direction: "down", role: "kineticInput" },
    { x: 42, y: 41, direction: "right", role: "output", material: "chert" },
  ]);
});

test("every rotated Sifter routes fractional Soil and Chert only from its own port at 3 units/minute each", () => {
  for (const facing of D.directions) {
    const { factory, sifter, receivers } = setup(facing);
    factory.update(1.9); assert.equal(sifter.output.length, 0);
    near(factory.total(receivers.soil, "contents"), 0);
    factory.update(0.1);
    near(factory.total(receivers.soil, "contents"), 0.1);
    near(factory.total(receivers.chert, "contents"), 0.1);
    factory.update(58);
    for (const material of ["soil", "chert"]) {
      near(factory.total(receivers[material], "contents"), 3);
      assert.ok(receivers[material].contents.every((item) => item.material === material));
    }
    near(factory.state.cash, 0);
    near(factory.collect(receivers.chert.id), 3); near(factory.sellInventory("chert", 3), 0.3);
    near(factory.collect(receivers.soil.id), 3); assert.equal(factory.sellInventory("soil", 3), 0);
    near(factory.state.inventory.soil, 3);
    const tube = place(factory, "sellTube", 50, 50);
    assert.equal(factory.receive(tube, cargo("soil", 1), 50, 50, "left", true), 0);
    near(factory.receive(tube, cargo("chert", 0.1), 50, 50, "left", true), 0.1);
    near(factory.state.cash, 0.31);
  }
});

test("Sifter needs a physically matched Wheel port, not nearby area power, and pauses without banking production", () => {
  const { factory, sifter, wheel, receivers } = setup();
  factory.update(1);
  assert.equal(factory.move(wheel.id, wheel.x, wheel.y, "down").error, undefined);
  assert.equal(factory.kineticHasWheel(sifter), false);
  factory.update(60); near(sifter.timer, 1);
  assert.match(factory.status(sifter), /kinetic power/);
  factory.move(wheel.id, wheel.x, wheel.y, "right"); factory.update(1);
  near(factory.total(receivers.chert, "contents"), 0.1);
  const other = new Factory(createState(1));
  place(other, "wheel", 20, 20); place(other, "drive", 21, 22, "up");
  const unconnected = place(other, "pebbleSifter", 23, 24);
  assert.equal(other.powered(24, 25), true);
  other.update(60); assert.equal(unconnected.output.length, 0); near(unconnected.timer, 0);
});

test("two real powered belt lines sustain the Sifter's full rate without seeing its own departing output as blockage", () => {
  const { factory, sifter } = setup("right", false);
  place(factory, "drive", 41, 44, "up");
  assert.equal(factory.poweredDrives.length, 1);
  const receivers = {}, belts = {};
  for (const point of ports(sifter).filter((entry) => entry.role === "output")) {
    belts[point.material] = place(factory, "belt", point.x + 1, point.y);
    receivers[point.material] = place(factory, "basket", point.x + 2, point.y);
  }
  factory.update(60);
  for (const material of ["soil", "chert"]) {
    near(factory.total(receivers[material], "contents"), 2.9);
    near(belts[material].lanes[0].quantity, 0.1);
  }
  assert.equal(sifter.output.length, 0);
});

test("either blocked output stalls the whole Sifter with at most one batch held, and clears without swapped cargo", () => {
  for (const blocked of ["soil", "chert"]) {
    const { factory, sifter, receivers } = setup();
    receivers[blocked].contents.push(cargo(blocked, 100));
    factory.update(60);
    const clear = blocked === "soil" ? "chert" : "soil";
    near(factory.total(receivers[clear], "contents"), 0.1);
    near(factory.total(sifter, "output"), 0.1);
    assert.equal(sifter.output[0].material, blocked);
    assert.match(factory.status(sifter), /blocked/);
    const loaded = Factory.importSave(factory.exportSave());
    loaded.collect(receivers[blocked].id); loaded.update(0.1);
    assert.equal(loaded.byId.get(sifter.id).output.length, 0);
    loaded.update(2);
    near(loaded.total(loaded.byId.get(receivers[clear].id), "contents"), 0.2);
    near(loaded.total(loaded.byId.get(receivers[blocked].id), "contents"), 0.2);
  }
});

test("Sifter work and separate outputs survive saves and group moves; pickup recovers once and never contaminates another instance", () => {
  const { factory, sifter, wheel } = setup("right", false);
  factory.update(1.2);
  const other = place(factory, "pebbleSifter", 60, 40);
  factory.moveGroup([sifter.id, wheel.id], 80, 80, 1);
  assert.equal(factory.kineticHasWheel(sifter), true); near(sifter.timer, 1.2);
  const loaded = Factory.importSave(factory.exportSave());
  loaded.update(0.8);
  assert.deepEqual(loaded.byId.get(sifter.id).output.map(({ material, quantity }) => [material, quantity]), [["soil", 0.1], ["chert", 0.1]]);
  assert.equal(loaded.byId.get(other.id).output.length, 0);
  loaded.pickup(sifter.id); near(loaded.state.inventory.soil, 0.1); near(loaded.state.inventory.chert, 0.1);
  assert.equal(loaded.pickup(sifter.id), false);
  const replacement = loaded.place("pebbleSifter", 40, 40).machine;
  assert.equal(replacement.id, sifter.id); assert.equal(replacement.output.length, 0); near(replacement.timer, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
});

test("Sifter migration only defaults new fields; corrupt output materials, sizes and timers fail validation", () => {
  const { factory, sifter } = setup("right", false); factory.update(2);
  const before = factory.exportSave();
  const old = new Factory(createState(1));
  const payload = JSON.parse(old.exportSave());
  delete payload.state.pebbleSifterVersion; delete payload.state.stock.pebbleSifter;
  delete payload.state.inventory.chert; delete payload.state.inventory.soil;
  const loaded = Factory.importSave(JSON.stringify(payload));
  assert.equal(loaded.state.stock.pebbleSifter, 0);
  assert.equal(loaded.state.inventory.chert, 0); assert.equal(loaded.state.inventory.soil, 0);
  assert.deepEqual(Factory.importSave(loaded.exportSave()).state, loaded.state);
  for (const mutate of [
    (machine) => { machine.output[0].quantity = 0.2; },
    (machine) => { machine.output[0].material = "wood"; },
    (machine) => { machine.timer = 100; },
  ]) {
    const invalid = JSON.parse(before); mutate(invalid.state.machines.find((machine) => machine.id === sifter.id));
    assert.throws(() => Factory.importSave(JSON.stringify(invalid)), /sifter/);
  }
});

test("buffered Soil and Chert render on separate port cells with compact fractional labels", () => {
  for (const facing of D.directions) {
    const { factory, sifter } = setup(facing, false); factory.update(2);
    const drawings = [], context = {};
    for (const method of ["save", "restore", "clearRect", "translate", "scale", "rotate", "fillRect", "strokeRect", "fillText", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke"]) {
      context[method] = (...args) => drawings.push({ method, args, color: context.fillStyle });
    }
    const before = factory.exportSave();
    R.drawOverlay(context, factory, { x: 38, y: 38, zoom: 1 }, { width: 800, height: 600 });
    for (const point of ports(sifter).filter((entry) => entry.role === "output")) {
      assert.ok(drawings.some(({ method, args, color }) => method === "fillRect" && color === D.materials[point.material].color
        && args[0] === (point.x + 0.5) * 32 - 6 && args[1] === (point.y + 0.5) * 32 - 5));
    }
    assert.equal(drawings.filter(({ method, args }) => method === "fillText" && args[0] === "0.1").length, 2);
    assert.equal(factory.exportSave(), before);
  }
});
