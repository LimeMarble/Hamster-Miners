const assert = require("node:assert/strict");

const ORIENTATIONS = ["right", "down", "left", "up"];
const TILE_SIZE = 32;
const machine = (game, id, instanceId, column, row, orientation = "right") => ({
  ...game.MACHINE_LAYOUT[id], id, instanceId, column, row, orientation,
});

// Run the real renderer against the Phaser surface it uses. Unsupported calls,
// invalid coordinates, unfinished redraws and wrong layer order fail for any type.
function drawingGraphics() {
  const graphics = { calls: [], destroyed: false, clears: 0 };
  for (const name of ["fillStyle", "fillRect", "lineStyle", "strokeRect", "lineBetween",
    "fillRoundedRect", "fillTriangle", "fillCircle", "fillEllipse", "strokeEllipse",
    "strokeCircle", "strokeRoundedRect"]) {
    graphics[name] = (...args) => {
      assert.equal(graphics.destroyed, false, "cannot draw on a destroyed surface");
      assert.ok(args.every(Number.isFinite), `${name} must receive finite drawing coordinates`);
      graphics.calls.push({ name, args });
      return graphics;
    };
  }
  graphics.setDepth = () => graphics;
  graphics.clear = () => { graphics.calls = []; graphics.clears++; return graphics; };
  graphics.destroy = () => { graphics.destroyed = true; };
  return graphics;
}

function drawingScene() {
  const events = [], labels = [], floors = [];
  let graphics = drawingGraphics(), layer, texture, graphicsUsed = false;
  const scene = { add: {
    container: () => (layer = {
      children: [], destroyed: false, setDepth() { return this; },
      add(child) { this.children.push(child); return this; },
      addAt(child, index) { this.children.splice(index, 0, child); return this; },
      destroy() { this.destroyed = true; this.children.forEach((child) => child.destroy?.()); },
    }),
    graphics: () => {
      if (graphicsUsed) graphics = drawingGraphics();
      graphicsUsed = true;
      return graphics;
    },
    renderTexture: () => (texture = {
      setOrigin() { return this; }, destroy() { this.destroyed = true; },
      draw(source) {
        assert.equal(source, graphics);
        assert.equal(source.destroyed, false, "cannot bake a destroyed drawing surface");
        events.push("bake floor");
        this.baked = true;
        floors.push({ graphics, layer, texture: this });
        return this;
      },
    }),
    text(x, y, text, style) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      events.push(`label: ${text}`);
      const label = { x, y, text, style,
        setResolution() { return this; }, setOrigin() { return this; }, setDepth() { return this; },
        setText(value) { this.text = value; return this; }, setColor() { return this; },
        setPosition(x, y) { this.x = x; this.y = y; return this; },
        destroy() { this.destroyed = true; } };
      labels.push(label);
      return label;
    },
  } };
  return { scene, get graphics() { return graphics; }, get layer() { return layer; },
    get texture() { return texture; }, labels, events, floors };
}

function freshFactory(game, extraMachines = []) {
  const state = Object.assign(game.createInitialState(), {
    machines: [
      machine(game, "gun", "reference-gun", 6, 0),
      machine(game, "gunDeposit", "reference-deposit", 6, 3),
      machine(game, "materialStorage", "reference-storage", 2, 6),
      machine(game, "clayKiln", "reference-kiln", 10, 6),
      machine(game, "casingMachine", "reference-casing", 10, 14),
      machine(game, "sellTube", "reference-sell", 2, 14),
      ...extraMachines,
    ],
    placedConveyors: [{ column: 18, row: 20, direction: "right", item: null }],
    tutorial: { stage: "complete", visible: false },
  });
  for (const id of Object.keys(game.MACHINE_LAYOUT)) state.machineInventory[id] = 0;
  game.__setState(state);
  game.__setFactorySelection([]);
  game.__setActiveViewForTests("factory");
  return state;
}

function renderFloor(game) {
  const rendering = drawingScene();
  const stateBefore = JSON.stringify(game.__getState());
  assert.doesNotThrow(() => game.drawMachineFloor(rendering.scene));
  assert.equal(JSON.stringify(game.__getState()), stateBefore, "drawing must not change gameplay state");
  assert.equal(rendering.texture.baked, true, "the redraw must reach the floor cache");
  assert.equal(rendering.graphics.destroyed, true);
  assert.equal(rendering.layer.children[0], rendering.texture);
  assert.equal(rendering.events[0], "bake floor", "labels belong above the completed floor");
  for (const label of rendering.labels) assert.ok(rendering.layer.children.includes(label));
  return rendering;
}

function counts(values) {
  const result = new Map();
  for (const value of values) {
    const key = JSON.stringify(value);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function assertOldVisualsRemain(before, after) {
  const afterCalls = counts(after.graphics.calls);
  for (const [key, count] of counts(before.graphics.calls)) {
    assert.ok((afterCalls.get(key) ?? 0) >= count, `existing floor drawing disappeared: ${key}`);
  }
  const labelKey = ({ x, y, text }) => ({ x, y, text });
  const afterLabels = counts(after.labels.map(labelKey));
  for (const [key, count] of counts(before.labels.map(labelKey))) {
    assert.ok((afterLabels.get(key) ?? 0) >= count, `existing label disappeared: ${key}`);
  }
}

function machineBounds(owner) {
  const vertical = owner.orientation === "up" || owner.orientation === "down";
  return { x: owner.column * TILE_SIZE, y: owner.row * TILE_SIZE,
    width: (vertical ? owner.height : owner.width) * TILE_SIZE,
    height: (vertical ? owner.width : owner.height) * TILE_SIZE };
}

function labelsForMachine(rendering, owner) {
  const bounds = machineBounds(owner);
  return rendering.labels.filter(({ x, y }) => x >= bounds.x && x < bounds.x + bounds.width
    && y >= bounds.y && y < bounds.y + bounds.height);
}

function assertMachineVisible(rendering, owner) {
  const bounds = machineBounds(owner);
  const primitives = new Set(["fillRect", "strokeRect", "fillRoundedRect", "fillTriangle",
    "fillCircle", "lineBetween"]);
  assert.ok(rendering.graphics.calls.some(({ name, args: [x, y] }) => primitives.has(name)
    && x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height),
  `${owner.id} must draw its own visual, not just avoid throwing`);
}

function assertBeltDrawn(graphics, tile) {
  const x = (tile.column + 0.5) * TILE_SIZE, y = (tile.row + 0.5) * TILE_SIZE;
  assert.ok(graphics.calls.some(({ name, args }) => name === "fillRoundedRect"
    && args[0] === x - 14 && args[1] === y - 11 && args[2] === 28 && args[3] === 22),
  `belt must be drawn at ${tile.column}, ${tile.row}`);
}

module.exports = { ORIENTATIONS, machine, drawingGraphics, drawingScene, freshFactory, renderFloor,
  assertOldVisualsRemain, labelsForMachine, assertMachineVisible, assertBeltDrawn };
