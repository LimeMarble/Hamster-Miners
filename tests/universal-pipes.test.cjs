const assert = require("node:assert/strict");
const test = require("node:test");
const { ORIENTATIONS, machine, drawingGraphics, freshFactory } = require("./helpers/factory-rendering.cjs");
global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const pipe = (id, column, row, orientation = "right", pipePorts) => ({
  ...machine(game, "hotFluidPipe", id, column, row, orientation), ...(pipePorts ? { pipePorts } : {}),
});
const liquid = (owner, quantity, value = 100, material = "silver") => ({
  smelterInstanceId: owner.instanceId, kilnInstanceId: owner.instanceId, material, quantity,
  sourceMaterial: "silverIngot", sourceValue: value, sourceValueIsEffective: true,
  cashUpgraderEligibility: { bronzeStampUses: 6 },
});
const fresh = (machines) => {
  const state = Object.assign(game.createInitialState(), { machines, placedConveyors: [],
    tutorial: { stage: "complete", visible: false } });
  game.__setState(state);
  return state;
};
const total = (state) => state.moltenCopper.reduce((sum, entry) => sum + entry.quantity, 0);

test("every valid four-side configuration rotates and renders through the same rules, including one-port caps", () => {
  fresh([]);
  assert.deepEqual(Object.keys(game.HOT_FLUID_PIPE_PRESETS), ["straight", "leftTurn", "rightTurn", "junction", "cap"]);
  const roles = ["entrance", "exit", "absent"];
  const opposite = { right: "left", down: "up", left: "right", up: "down" };
  let validCount = 0;
  for (let n = 0; n < 81; n++) {
    const ports = Object.fromEntries(ORIENTATIONS.map((side, index) => [side, roles[Math.floor(n / 3 ** index) % 3]]));
    const values = Object.values(ports), inputs = values.filter((role) => role === "entrance").length;
    const outputs = values.filter((role) => role === "exit").length;
    const valid = inputs > 0 && outputs > 0 || inputs === 1 && outputs === 0;
    assert.equal(game.isValidHotFluidPipePorts(ports), valid);
    const owner = pipe("config", 20, 10);
    if (!valid) {
      const before = JSON.stringify(owner);
      assert.equal(game.configureHotFluidPipe(owner, ports), false);
      assert.equal(JSON.stringify(owner), before);
      continue;
    }
    validCount++;
    assert.equal(game.configureHotFluidPipe(owner, ports), true);
    assert.deepEqual(Object.fromEntries(game.getHotFluidPipePortSides(owner).map(({ side, role }) => [side, role])), ports,
      "normalizing the main exit must not move the configured world ports");
    const local = game.getHotFluidPipeLocalPorts(owner);
    for (const orientation of ORIENTATIONS) {
      owner.orientation = orientation;
      const world = Object.fromEntries(ORIENTATIONS.map((side, index) => [
        ORIENTATIONS[(index + ORIENTATIONS.indexOf(orientation)) % 4], local[side],
      ]));
      assert.deepEqual(new Set(game.getHotFluidPipeInputDirections(owner)),
        new Set(ORIENTATIONS.filter((side) => world[side] === "entrance").map((side) => opposite[side])));
      assert.deepEqual(new Set(game.getHotFluidPipeOutputDirections(owner)),
        new Set(ORIENTATIONS.filter((side) => world[side] === "exit")));
      if (outputs) assert.equal(game.getHotFluidPipeOutputDirections(owner)[0], orientation);
      assert.equal(game.isHotFluidPipeCap(owner), outputs === 0);
      const graphics = drawingGraphics();
      assert.doesNotThrow(() => game.drawMachinePreviewConveyors(graphics, owner, true));
      assert.equal(graphics.calls.filter(({ name }) => name === "fillTriangle").length, inputs + outputs);
      assert.equal(graphics.calls.filter(({ name }) => name === "lineBetween").length,
        (inputs + outputs) * 2 + (outputs === 0 ? 1 : 0));
    }
  }
  assert.equal(validCount, 54); // 50 flowing configurations and four one-port caps.
});

function junctionFixture(ports = { right: "exit", down: "exit", left: "entrance", up: "entrance" }) {
  const left = pipe("left-feed", 9, 10), top = pipe("top-feed", 10, 9, "down");
  const root = pipe("shared-junction", 10, 10, "right", ports);
  const right = pipe("right-exit", 11, 10), down = pipe("down-exit", 10, 11, "down");
  const rightCap = pipe("right-cap", 12, 10), downCap = pipe("down-cap", 10, 12, "down");
  rightCap.mode = downCap.mode = "cap";
  const state = fresh([left, top, root, right, down, rightCap, downCap]);
  return { state, left, top, root, right, down, rightCap, downCap };
}

test("multiple entrances merge matching fluid without losing quantity, effective value or tags", () => {
  const { state, left, top, root, right } = junctionFixture();
  state.moltenCopper.push(liquid(left, 4, 100), liquid(top, 6, 200));
  assert.equal(game.getHotFluidPipeNetwork().nodes.get(root.instanceId).sealed, true);
  game.updateHotFluidPipes(1);
  assert.equal(total(state), 10);
  const received = state.moltenCopper.find((entry) => entry.smelterInstanceId === right.instanceId);
  assert.equal(received.quantity, 10);
  assert.equal(received.sourceValue, 160);
  assert.equal(received.sourceValueIsEffective, true);
  assert.deepEqual(received.cashUpgraderEligibility, { bronzeStampUses: 6 });
  assert.equal(state.moltenCopper.some((entry) => entry.smelterInstanceId.endsWith("cap")), false);
});

test("junction throughput is shared across exits, incompatible inputs wait, and open exits stop every connected branch", () => {
  const { state, left, top, root, right, down, rightCap } = junctionFixture();
  state.moltenCopper.push(liquid(root, 100), liquid(right, 30));
  game.updateHotFluidPipes(0.1);
  assert.equal(state.moltenCopper.find((entry) => entry.smelterInstanceId === down.instanceId).quantity, 3);
  assert.equal(total(state), 130);
  state.moltenCopper = [liquid(root, 5), liquid(right, 30), liquid(down, 30),
    liquid(left, 4, 100, "bronze"), liquid(top, 4)];
  game.updateHotFluidPipes(0.1);
  assert.equal(state.moltenCopper.find((entry) => entry.smelterInstanceId === left.instanceId).quantity, 4);
  assert.equal(state.moltenCopper.find((entry) => entry.smelterInstanceId === root.instanceId).quantity, 9);
  assert.equal(total(state), 73);
  state.machines = state.machines.filter((owner) => owner !== rightCap);
  game.__setState(state);
  const before = JSON.stringify(state.moltenCopper);
  game.updateHotFluidPipes(1);
  for (const owner of [root, left, top, right, down]) {
    assert.equal(game.getHotFluidPipeNetwork().nodes.get(owner.instanceId).sealed, false);
  }
  assert.equal(JSON.stringify(state.moltenCopper), before);
});

test("absent junction ports are sealed geometry and closed pipe loops conserve fluid", () => {
  const { state, root } = junctionFixture({ right: "exit", down: "absent", left: "entrance", up: "entrance" });
  state.machines = state.machines.filter((owner) => !["down-exit", "down-cap"].includes(owner.instanceId));
  game.__setState(state);
  assert.equal(game.getHotFluidPipeNetwork().nodes.get(root.instanceId).sealed, true);
  const ring = [pipe("ring-1", 5, 10), pipe("ring-2", 6, 10, "down"),
    pipe("ring-3", 6, 11, "left"), pipe("ring-4", 5, 11, "up")];
  const loopState = fresh(ring);
  ring.forEach((owner) => game.switchHotFluidPipePreset(owner, "rightTurn"));
  loopState.moltenCopper.push(liquid(ring[0], 10, 123));
  for (let tick = 0; tick < 30; tick++) {
    game.updateHotFluidPipes(0.1);
    assert.ok(Math.abs(total(loopState) - 10) < 1e-8);
    assert.ok(loopState.moltenCopper.every((entry) => entry.material === "silver" && entry.sourceValue === 123));
  }
});

test("custom ports remain independent through movement, pickup, replacement and repeated save loads", () => {
  const first = pipe("custom-first", 25, 6), second = pipe("custom-second", 35, 16);
  const state = freshFactory(game, [first, second]);
  const ports = { right: "exit", down: "entrance", left: "entrance", up: "entrance" };
  assert.equal(game.configureHotFluidPipe(first, ports), true);
  assert.equal(game.getHotFluidPipePreset(first), "custom");
  const before = JSON.stringify(first);
  assert.equal(game.configureHotFluidPipe(first, { right: "exit", down: "exit", left: "absent", up: "absent" }), false);
  assert.equal(JSON.stringify(first), before);
  game.pickUpSelectedFactoryEntity({ type: "machine", id: first.id, instanceId: first.instanceId }, true);
  game.placeMachine("hotFluidPipe", 31, 6);
  game.pickUpSelectedFactoryEntity({ type: "machine", id: first.id, instanceId: first.instanceId });
  const loaded = game.hydrateSavedState(JSON.parse(JSON.stringify(state)));
  game.__setState(loaded);
  const stored = loaded.machineInventoryInstances.find(({ instanceId }) => instanceId === first.instanceId);
  assert.deepEqual(stored.pipePorts, ports);
  assert.equal(loaded.machines.find(({ instanceId }) => instanceId === second.instanceId).pipePorts.left, "entrance");
  stored.pipePorts.up = "absent";
  assert.equal(loaded.machines.find(({ instanceId }) => instanceId === second.instanceId).pipePorts.up, "absent");
  game.placeMachine("hotFluidPipe", 31, 6);
  assert.equal(loaded.machines.find(({ instanceId }) => instanceId === first.instanceId).pipePorts.down, "entrance");
  const again = game.hydrateSavedState(JSON.parse(JSON.stringify(loaded)));
  assert.deepEqual(again.machines.find(({ instanceId }) => instanceId === first.instanceId).pipePorts,
    { ...ports, up: "absent" });
});
