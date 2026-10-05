const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const loadGame = require("./load-game.cjs");

function fixture() {
  let document;
  function node(tagName = "div") {
    const element = {
      tagName, children: [], dataset: {}, attributes: {}, listeners: {},
      hidden: false, disabled: false, scrollTop: 0, replacements: 0, textWrites: 0,
      _text: "",
      get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); },
      set textContent(value) { this._text = String(value); this.children = []; this.textWrites += 1; },
      append(...children) { this.children.push(...children); },
      contains(child) { return this === child || this.children.some((item) => item.contains(child)); },
      replaceChildren(...children) {
        if (this.contains(document.activeElement)) document.activeElement = null;
        this._text = "";
        this.children = children;
        this.replacements += 1;
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { document.activeElement = this; },
      querySelector(selector) {
        const noteKey = selector.match(/^\[data-machine-action-note="(.+)"\]$/)?.[1];
        for (const child of this.children) {
          if (noteKey && child.dataset.machineActionNote === noteKey) return child;
          if (selector === child.tagName) return child;
          const nested = child.querySelector(selector);
          if (nested) return nested;
        }
        return null;
      },
    };
    return element;
  }
  const dom = Object.fromEntries([
    "machineControls", "machineActions", "selectedMachineLabel", "machineSelectionHelp",
    "pickUpMachineButton", "moveMachineButton",
  ].map((id) => ["#" + id, node()]));
  document = { activeElement: null, querySelector: (selector) => dom[selector] ?? null,
    querySelectorAll: () => [], createElement: node };
  global.document = document;
  global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  const game = loadGame();
  const furnace = { ...game.MACHINE_LAYOUT.miniElectricArcFurnace, id: "miniElectricArcFurnace",
    instanceId: "selected-furnace", column: 10, row: 5, orientation: "right", mode: "smelting" };
  const other = { ...furnace, instanceId: "other-furnace", column: 20 };
  const state = Object.assign(game.createInitialState(), { machines: [furnace, other],
    placedConveyors: [], tutorial: { stage: "complete", visible: false } });
  game.__setState(state);
  game.__setActiveViewForTests("factory");
  function select(machine) {
    game.__setFactorySelection([{ type: "machine", id: machine.id, instanceId: machine.instanceId }]);
    game.renderFactoryMachineControls();
  }
  select(furnace);
  return { game, furnace, other, state, select, document, actions: dom["#machineActions"],
    recipe: () => dom["#machineActions"].querySelector("select"),
    progress: () => dom["#machineActions"].querySelector('[data-machine-action-note="arc-furnace-progress"]') };
}

test("furnace recipe stays mounted and focused through input, job, liquid and solid output changes", () => {
  const { game, state, furnace, actions, document, recipe, progress } = fixture();
  const dropdown = recipe();
  const status = progress();
  const initialReplacements = actions.replacements;
  dropdown.focus();
  actions.scrollTop = 83;
  for (const change of [
    () => { state.arcFurnaceInputs[furnace.instanceId] = { primary: [{ kind: "material", material: "clay", quantity: 1 }] }; },
    () => { state.arcFurnaceInputs[furnace.instanceId].primary[0].quantity = 2; },
    () => { state.arcFurnaceJobs = [{ furnaceInstanceId: furnace.instanceId, secondsRemaining: 4 }]; },
    () => { state.arcFurnaceJobs[0].secondsRemaining = 1.1; },
    () => { state.arcFurnaceJobs = []; state.moltenCopper = [{ kilnInstanceId: furnace.instanceId, material: "bronze", quantity: 6 }]; },
    () => { state.moltenCopper[0].quantity = 3; },
    () => { state.moltenCopper = []; state.arcFurnaceOutputBuffers[furnace.instanceId] = { material: "ceramic", quantity: 1 }; },
    () => { state.internalConveyorItems[`${furnace.instanceId}:0`] = { kind: "material", material: "ceramic", quantity: 1 }; },
    () => { delete state.arcFurnaceOutputBuffers[furnace.instanceId]; },
  ]) {
    change();
    game.renderFactoryMachineControls();
    assert.equal(recipe(), dropdown, "production must not replace the recipe selector");
    assert.equal(progress(), status, "the status node must update in place");
    assert.equal(document.activeElement, dropdown);
    assert.equal(actions.scrollTop, 83);
    assert.equal(dropdown.value, "smelting");
    assert.equal(actions.replacements, initialReplacements);
    assert.equal(status.textContent, game.getMachineActionProgressNote(furnace));
  }
});

test("other furnaces, kilns, molders and dusters cannot remount the selected furnace recipe", () => {
  const { game, state, other, actions, recipe } = fixture();
  const dropdown = recipe();
  const replacements = actions.replacements;
  state.arcFurnaceJobs = [{ furnaceInstanceId: other.instanceId, secondsRemaining: 12 }];
  state.kilnJobs = [{ kilnInstanceId: "another-kiln" }];
  state.kilnInputs = [{ kilnInstanceId: "another-kiln" }];
  state.molderJobs = [{ molderInstanceId: "another-molder" }];
  state.dusterJob = { material: "silver" };
  game.renderFactoryMachineControls();
  assert.equal(recipe(), dropdown);
  state.arcFurnaceJobs = [];
  state.kilnJobs = [];
  state.kilnInputs = [];
  state.molderJobs = [];
  state.dusterJob = null;
  game.renderFactoryMachineControls();
  assert.equal(recipe(), dropdown);
  assert.equal(actions.replacements, replacements);
});

test("furnace status only writes changed text while retaining countdown and outlet updates", () => {
  const { game, furnace, state, progress } = fixture();
  const status = progress();
  const writes = status.textWrites;
  game.renderFactoryMachineControls();
  game.renderFactoryMachineControls();
  assert.equal(status.textWrites, writes);
  state.arcFurnaceJobs = [{ furnaceInstanceId: furnace.instanceId, secondsRemaining: 2 }];
  game.renderFactoryMachineControls();
  assert.equal(progress(), status);
  assert.match(status.textContent, /Processing.*2s/);
  state.arcFurnaceJobs[0].secondsRemaining = 1.5;
  game.renderFactoryMachineControls();
  assert.match(status.textContent, /1\.5s/);
  state.arcFurnaceJobs = [];
  state.moltenCopper = [{ kilnInstanceId: furnace.instanceId, material: "tin", quantity: 1 }];
  game.renderFactoryMachineControls();
  assert.match(status.textContent, /Liquid output.*Tin ore 1/);
});

test("actual recipe, facing and instance changes still refresh furnace controls", () => {
  const { game, furnace, other, select, actions, recipe } = fixture();
  const oldDropdown = recipe();
  assert.equal(game.switchArcFurnaceMode(furnace, "copperContactAlloy"), true);
  game.renderFactoryMachineControls();
  assert.notEqual(recipe(), oldDropdown);
  assert.equal(recipe().value, "copperContactAlloy");
  assert.match(actions.textContent, /4 Silver \+ 1 Copper/);
  furnace.orientation = "down";
  game.renderFactoryMachineControls();
  assert.match(actions.textContent, /adjacent tile down/);
  select(other);
  assert.equal(recipe().value, "smelting");
  assert.match(actions.textContent, /adjacent tile right/);
});

test("furnace selector styles prevent hover movement, overflow and live-status height changes", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.machine-action-recipe-select:hover:not\(:disabled\)[\s\S]*?\{\s*transform: none;/);
  assert.match(css, /\.machine-action-recipe-select\s*\{[^}]*min-width: 0;[^}]*transition: none;/);
  assert.match(css, /\.machine-actions\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*scrollbar-gutter: stable;/);
  assert.match(css, /\[data-machine-action-note="arc-furnace-progress"\]\s*\{[^}]*block-size: 5\.4em;[^}]*overflow-y: auto;/);
});

test("Contact Maker flip control switches the actual port and remains mounted during production", () => {
  const { game, state, select, actions, document } = fixture();
  const maker = { ...game.MACHINE_LAYOUT.contactMaker, id: "contactMaker", instanceId: "selected-contact",
    column: 30, row: 10, orientation: "right" };
  state.machines.push(maker);
  select(maker);
  const button = actions.querySelector("button");
  assert.equal(button.textContent, "Flip ingot input");
  assert.match(actions.textContent, /from below the wire lane/);
  button.focus();
  const replacements = actions.replacements;
  state.contactMakerInputs[maker.instanceId] = { silver: 1, silverValue: 313 };
  state.arcFurnaceJobs = [{ furnaceInstanceId: "unrelated", secondsRemaining: 1 }];
  game.renderFactoryMachineControls();
  assert.equal(actions.querySelector("button"), button);
  assert.equal(document.activeElement, button);
  assert.equal(actions.replacements, replacements);
  button.listeners.pointerdown({ preventDefault() {} });
  game.renderFactoryMachineControls();
  assert.equal(maker.metalInputFlipped, true);
  assert.deepEqual(game.getMachinePort(maker, "silverInput"), { column: 31, row: 10, direction: "down" });
  assert.match(actions.textContent, /from above the wire lane/);
  actions.querySelector("button").listeners.keydown({ key: "Enter", preventDefault() {} });
  game.renderFactoryMachineControls();
  assert.equal(maker.metalInputFlipped, false);
  assert.match(actions.textContent, /from below the wire lane/);
  assert.deepEqual(state.contactMakerInputs[maker.instanceId], { silver: 1, silverValue: 313 });
});
