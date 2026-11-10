const test = require("node:test");
const assert = require("node:assert/strict");
const { Factory, createState, DATA, cargo } = require("../noammo-simulation.js");

test("Import retires placed and stocked Manual Overflows and recovers carried cargo once", () => {
  const factory = new Factory(createState(1));
  const old = JSON.parse(factory.exportSave()), state = old.state;
  const overflow = (id, x) => ({
    id, type: "manualOverflow", x, y: 40, facing: "right", mode: "up", timer: 0,
    input: [], output: [], contents: [], lanes: {}, job: null,
  });
  const placed = overflow("machine-1", 40);
  placed.lanes[1] = cargo("wood", 2);
  placed.job = { input: cargo("clay", 1), remaining: 1 };
  state.machines.push(placed);
  state.storedMachines.push(overflow("machine-2", 44));
  state.nextId = 3;
  state.stock.manualOverflow = 2;
  state.manualOverflowVersion = 1;
  state.cash = 12;
  const restored = Factory.importSave(JSON.stringify(old));
  assert.equal(Object.hasOwn(DATA.machines, "manualOverflow"), false);
  assert.equal(Object.hasOwn(restored.state.stock, "manualOverflow"), false);
  assert.equal(restored.state.stock.belt, 6);
  assert.equal(restored.state.inventory.wood, 62);
  assert.equal(restored.state.inventory.woodenGear, 6);
  assert.equal(restored.state.inventory.clay, 1);
  assert.equal(restored.state.cash, 12);
  assert.deepEqual(restored.state.machines, []);
  assert.deepEqual(restored.state.storedMachines, []);
  assert.deepEqual(Factory.importSave(restored.exportSave()).state, restored.state);
});
