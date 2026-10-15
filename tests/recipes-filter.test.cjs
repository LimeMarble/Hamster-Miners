const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const loadGame = require("./load-game.cjs");

test("every displayed recipe has the fields the renderer actually reads", () => {
  for (const recipe of game.CRAFTING_RECIPES) {
    for (const field of ["name", "machine", "category", "input", "output", "note"]) {
      assert.equal(typeof recipe[field], "string", `${recipe.name}: missing ${field}`);
      assert.ok(recipe[field].trim().length, `${recipe.name}: empty ${field}`);
    }
  }
});

test("Aggregate's displayed recipe agrees with its real production quantities and timer", () => {
  const recipe = game.CRAFTING_RECIPES.find((entry) => entry.name === "Aggregate");
  const rule = game.AGGREGATE_RECIPE;
  assert.equal(recipe.machine, "Aggregate Mixer");
  assert.equal(recipe.input, `${rule.limestone} Limestone + ${rule.chert} Chert`);
  assert.equal(recipe.output, `${rule.output} Aggregate`);
  assert.equal(recipe.note, `Takes ${rule.seconds} seconds. No crew required.`);
});

test("machine filters group modes under a single full machine name", () => {
  const options = game.getRecipeMachineOptions();
  assert.equal(options.filter((name) => name === "Mini Electric Arc Furnace").length, 1);
  assert.equal(options.filter((name) => name === "Gear Press").length, 1);
  assert.ok(options.every((name) => !name.includes("·")));
  const gears = game.getFilteredCraftingRecipes("", "Gear Press");
  assert.deepEqual(gears.map((entry) => entry.name), ["Heavy Gears", "Fine Gears"]);
  assert.equal(game.getFilteredCraftingRecipes("", "Aggregate Mixer").length, 1);
});

test("arc search finds substrings anywhere in current and future full machine names", () => {
  const recipes = [
    ...game.CRAFTING_RECIPES,
    { name: "Future smelting", machine: "Industrial Arc Furnace · Smelting" },
  ];
  assert.deepEqual(game.getRecipeMachineOptions("arc", recipes), ["Industrial Arc Furnace", "Mini Electric Arc Furnace"]);
  const matches = game.getFilteredCraftingRecipes("ARC", "", recipes);
  assert.ok(matches.some((entry) => entry.machine.startsWith("Industrial Arc Furnace")));
  assert.ok(matches.some((entry) => entry.machine.startsWith("Mini Electric Arc Furnace")));
  assert.ok(matches.every((entry) => game.getRecipeMachineName(entry).toLowerCase().includes("arc")));
});

test("search ignores case and extra spaces and includes middle or end substrings", () => {
  assert.deepEqual(game.getRecipeMachineOptions("  MiNi   eLeCtRiC "), ["Mini Electric Arc Furnace"]);
  assert.deepEqual(game.getRecipeMachineOptions("gregate"), ["Aggregate Mixer"]);
  assert.deepEqual(game.getRecipeMachineOptions("caster").sort(), ["Bullet Core Caster", "Refractory Caster"]);
  assert.ok(game.getFilteredCraftingRecipes("caster").every((recipe) => /Caster/.test(recipe.machine)));
});

test("closest matching machine names put exact and prefix matches first without fuzzy unrelated results", () => {
  const recipes = [
    { machine: "Industrial Arc Furnace" },
    { machine: "Arc Furnace" },
    { machine: "Arc" },
    { machine: "Clay Kiln" },
  ];
  assert.deepEqual(game.getRecipeMachineOptions("arc", recipes), ["Arc", "Arc Furnace", "Industrial Arc Furnace"]);
  assert.deepEqual(game.getRecipeMachineOptions("not a machine"), []);
  assert.deepEqual(game.getFilteredCraftingRecipes("not a machine"), []);
});

test("selecting a machine narrows search results and blank search restores the normal catalogue", () => {
  const recipes = game.getFilteredCraftingRecipes("arc", "Mini Electric Arc Furnace");
  assert.ok(recipes.length > 1);
  assert.ok(recipes.every((entry) => game.getRecipeMachineName(entry) === "Mini Electric Arc Furnace"));
  assert.deepEqual(game.getFilteredCraftingRecipes("arc", "Gear Press"), []);
  assert.deepEqual(game.getFilteredCraftingRecipes("   "), game.CRAFTING_RECIPES);
});

function withRecipeDom(check) {
  function node(tag, fragment = false) {
    return {
      tag, fragment, dataset: {}, children: [], value: "", textContent: "", replacements: 0,
      append(...children) { this.children.push(...children.flatMap((child) => child.fragment ? child.children : [child])); },
      replaceChildren(...children) { this.children = []; this.append(...children); this.replacements++; },
    };
  }
  const controls = Object.fromEntries(["recipesList", "recipeMachineSearch", "recipeMachineFilter", "recipeFilterStatus"]
    .map((id) => [id, node(id)]));
  const previousDocument = global.document;
  global.document = {
    querySelector: (selector) => controls[selector.slice(1)] ?? null,
    querySelectorAll: () => [],
    createElement: (tag) => node(tag),
    createDocumentFragment: () => node("fragment", true),
  };
  try { check(loadGame(), controls); } finally { global.document = previousDocument; }
}

test("rendered Aggregate card contains its actual ingredients, output, and duration", () => {
  withRecipeDom((ui, controls) => {
    controls.recipeMachineFilter.value = "Aggregate Mixer";
    ui.renderRecipes();
    assert.equal(controls.recipesList.children.length, 1);
    const text = controls.recipesList.children[0].children.map((child) => child.textContent).join("\n");
    assert.match(text, /40 Limestone \+ 20 Chert → 10 Aggregate/);
    assert.match(text, /Takes 10 seconds/);
    assert.doesNotMatch(text, /undefined/);
  });
});

test("typed search refreshes matching options and cards without rebuilding unchanged controls", () => {
  withRecipeDom((ui, controls) => {
    ui.renderRecipes();
    const originalCards = [...controls.recipesList.children];
    const initialListRenders = controls.recipesList.replacements;
    const initialOptionRenders = controls.recipeMachineFilter.replacements;
    ui.renderRecipes();
    ui.renderRecipes();
    assert.equal(controls.recipesList.replacements, initialListRenders);
    assert.equal(controls.recipeMachineFilter.replacements, initialOptionRenders);
    assert.strictEqual(controls.recipesList.children[0], originalCards[0]);
    controls.recipeMachineSearch.value = "arc";
    ui.renderRecipes();
    assert.deepEqual(controls.recipeMachineFilter.children.map((option) => option.value), ["", "Mini Electric Arc Furnace"]);
    assert.ok(controls.recipesList.children.every((card) => card.children[0].textContent.includes("Mini Electric Arc Furnace")));
    const matchedCard = controls.recipesList.children[0];
    ui.renderRecipes();
    assert.strictEqual(controls.recipesList.children[0], matchedCard);
    controls.recipeMachineFilter.value = "Mini Electric Arc Furnace";
    ui.renderRecipes();
    assert.equal(controls.recipeMachineFilter.value, "Mini Electric Arc Furnace");
    assert.equal(controls.recipeMachineFilter.replacements, initialOptionRenders + 1);
  });
});

test("changing search clears an incompatible machine selection and no matches do not show stale recipes", () => {
  withRecipeDom((ui, controls) => {
    controls.recipeMachineFilter.value = "Gear Press";
    ui.renderRecipes();
    assert.equal(controls.recipesList.children.length, 2);
    controls.recipeMachineSearch.value = "aggregate";
    ui.renderRecipes();
    assert.equal(controls.recipeMachineFilter.value, "");
    assert.equal(controls.recipesList.children.length, 1);
    assert.equal(controls.recipesList.children[0].children[1].textContent, "Aggregate");
    controls.recipeMachineSearch.value = "xyz-not-a-machine";
    ui.renderRecipes();
    assert.equal(controls.recipesList.children.length, 0);
    assert.match(controls.recipeFilterStatus.textContent, /No machines match/);
    controls.recipeMachineSearch.value = "";
    ui.renderRecipes();
    assert.equal(controls.recipesList.children.length, ui.CRAFTING_RECIPES.length);
  });
});

test("Recipes screen exposes accessible live search and machine selection controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(html, /label for="recipeMachineSearch"/);
  assert.match(html, /id="recipeMachineSearch" type="search"/);
  assert.match(html, /label for="recipeMachineFilter"/);
  assert.match(html, /id="recipeFilterStatus" role="status"/);
  assert.match(source, /recipeMachineSearch\?\.addEventListener\("input", renderRecipes\)/);
  assert.match(source, /recipeMachineFilter\?\.addEventListener\("change", renderRecipes\)/);
});
