(function (root) {
  "use strict";
  const D = typeof module !== "undefined" && module.exports ? require("./noammo-data.js") : root.NoAmmoData;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const key = (x, y) => `${x},${y}`;
  const epsilon = 1e-8;
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const numberSuffixes = ["", "k", "M", "B", "T", "Qd", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  function formatNumber(value) {
    if (!Number.isFinite(value) || value === 0) return "0";
    const tier = Math.max(0, Math.floor(Math.log10(Math.abs(value)) / 3));
    if (tier >= numberSuffixes.length) return value.toExponential(2);
    return `${Number((value / 1000 ** tier).toPrecision(3))}${numberSuffixes[tier]}`;
  }
  const opposite = (direction) => D.directions[(D.directions.indexOf(direction) + 2) % 4];
  const turn = (direction, count) => D.directions[(D.directions.indexOf(direction) + count + 4) % 4];
  const jobInputs = (job) => job?.inputs ?? (job?.input ? [job.input] : []);
  const collectorCapacity = (machine) => D.machines[machine?.type]?.collectorCapacity ?? 0;
  const CHEATS = ["resources", "storage", "machineSpeed", "machineBulk", "conveyorCapacity", "conveyorSpeed", "cash"];
  const cheatEnabled = (state, id) => Boolean(state?.playtest?.unlocked && state.playtest.toggles[id]);
  const machineBulk = (state, machine) => D.machines[machine.type]?.category === "Material" && cheatEnabled(state, "machineBulk") ? 10 : 1;
  const conveyorWeightLimit = (machine, state) => (machine.conveyorUpgrade === "electricConveyor" ? D.machines.electricConveyor.beltWeight : D.machines[machine.type].beltWeight ?? D.config.beltWeight)
    * (cheatEnabled(state, "conveyorCapacity") ? 10 : 1);
  const legacyFoodWeights = { flour: 0.05, dough: 0.25 };
  const conveyorSeconds = (machine) => machine.conveyorUpgrade === "electricConveyor" ? D.machines.electricConveyor.beltSeconds : D.machines[machine.type].beltSeconds ?? D.config.beltSeconds;
  const conveyorUpgradeCost = (type) => {
    const definition = D.machines[type];
    return definition?.conveyors && (definition.cashEffect || type === "primitive" || type === "manualSplitter") && !definition.electricPower
      && definition.cost?.machines?.belt === definition.conveyors.length ? definition.conveyors.length : 0;
  };
  function clearPickedUpFurnace(machine) {
    if (!D.machines[machine.type]?.heatCapacity) return;
    machine.heat = 0; machine.outputCooldown = 0; machine.timer = 0;
    machine.input = []; machine.output = []; machine.job = null; delete machine.outputBulk;
  }
  const supportsOutputHistory = (type) => type === "primitive" || type === "gradingBench" || Boolean(D.machines[type]?.cashEffect);
  const isCrafter = (definition) => Boolean(definition.craftInput || definition.molder || definition.pressModes || definition.formingModes);
  const runeUnlocks = new Map();
  for (const [category, offerings] of Object.entries(D.minorRunes)) {
    for (const [index, offering] of offerings.entries()) {
      if (!D.machines[offering.machine] || Object.keys(offering.materials).some(material => !D.materials[material])) break;
      runeUnlocks.set(offering.machine, { category, tier: index + 1 });
    }
  }
  const thermalRecipeEntry = (definition, material) => Object.entries(definition.recipes)
    .find(([id, recipe]) => (recipe.material ?? id) === material);
  const ovenRecipeForInput = (definition, input) => input.length
    ? Object.values(definition.recipes).find(recipe => input.every(item => Object.hasOwn(recipe.inputs, item.material))) : null;
  function moldingProduct(material) {
    const source = D.materials[material], product = D.materials[source?.moldsTo];
    return source?.fluid && !source.requiresRefractoryCaster && product && !product.fluid && !product.requiresRefractoryCaster
      ? source.moldsTo : null;
  }
  function formingRecipe(definition, input, mode, job = {}) {
    const recipe = definition.formingModes?.[mode], source = D.materials[input?.material];
    const output = source?.[recipe?.materialProperty];
    if (!recipe || !output || !D.materials[output] || Boolean(source.fluid) !== Boolean(definition.fluidInput)
      || D.materials[output].fluid) return null;
    // Finish jobs saved before a recipe change using their original yields.
    const { legacyExtrusionBatch, legacyFoodRecipe } = job;
    if (legacyExtrusionBatch !== undefined && (legacyExtrusionBatch !== true || definition !== D.machines.extruder)) return null;
    const resolved = { ...recipe, ...(recipe.recipeProperty ? source[recipe.recipeProperty] : {}), output };
    if (legacyExtrusionBatch) return { ...resolved, input: 1, outputQuantity: 5 };
    if (legacyFoodRecipe === undefined) return resolved;
    if (legacyFoodRecipe !== true) return null;
    if (definition === D.machines.grainMill) return { ...resolved, input: 1, outputQuantity: 5 };
    if (definition === D.machines.doughShaper) {
      return { ...resolved, input: input.material === "flour" ? 5 : 1, outputQuantity: 1, valueMultiplier: 2, water: 0 };
    }
    return null;
  }

  function rotatePoint(x, y, width, height, direction) {
    if (direction === "down") return { x: height - 1 - y, y: x };
    if (direction === "left") return { x: width - 1 - x, y: height - 1 - y };
    if (direction === "up") return { x: y, y: width - 1 - x };
    return { x, y };
  }
  function rotation(machine) {
    const definition = D.machines[machine.type];
    return (D.directions.indexOf(machine.facing) - D.directions.indexOf(definition.baseFacing ?? "right") + 4) % 4;
  }
  function size(machine) {
    const definition = D.machines[machine.type];
    return rotation(machine) % 2 === 1
      ? { width: definition.height, height: definition.width }
      : { width: definition.width, height: definition.height };
  }
  function cells(machine) {
    const definition = D.machines[machine.type];
    const footprint = definition.modeFootprints?.[machine.mode ?? definition.defaultMode] ?? definition.footprint;
    if (footprint) return footprint.map(([x, y]) => {
      const point = rotatePoint(x, y, definition.width, definition.height, D.directions[rotation(machine)]);
      return { x: machine.x + point.x, y: machine.y + point.y };
    });
    const bounds = size(machine), result = [];
    for (let y = 0; y < bounds.height; y++) {
      for (let x = 0; x < bounds.width; x++) result.push({ x: machine.x + x, y: machine.y + y });
    }
    return result;
  }
  function port(machine, x, y, direction, role) {
    const definition = D.machines[machine.type];
    const turns = rotation(machine);
    const rotated = rotatePoint(x, y, definition.width, definition.height, D.directions[turns]);
    return { x: machine.x + rotated.x, y: machine.y + rotated.y,
      direction: turn(direction, turns), role };
  }
  function ports(machine) {
    const result = [], add = (x, y, direction, role) => result.push(port(machine, x, y, direction, role));
    const configured = D.machines[machine.type].ports;
    if (configured) return configured.filter((point) => !point.mode || point.mode === (machine.mode ?? D.machines[machine.type].defaultMode)).map((point) => ({
      ...port(machine, point.x, point.y, point.direction, point.role),
      ...(point.material ? { material: D.machines[machine.type].batchModes && point.material === "chert"
        ? (machine.mode === "soil" ? "soil" : machine.mode === "malachite" ? "malachitePebble" : "chert") : point.material } : {}),
      ...(point.mode ? { mode: point.mode } : {}),
      ...(point.span ? { span: point.span } : {}),
      ...(point.channel ? { channel: point.channel } : {}),
    }));
    if (D.machines[machine.type].centeredOutput) {
      const definition = D.machines[machine.type];
      return [{ ...port(machine, definition.width - 1, (definition.height - 1) / 2, "right", "output"), span: 2 }];
    }
    if (D.machines[machine.type].conveyors) {
      const coordinates = D.machines[machine.type].conveyors;
      for (const [x, y] of coordinates) {
        if (!coordinates.some(([cx, cy]) => cx === x - 1 && cy === y)) add(x, y, "left", "input");
        if (!coordinates.some(([cx, cy]) => cx === x + 1 && cy === y)) add(x, y, "right", "output");
      }
      return result;
    }
    switch (machine.type) {
      case "planter": add(2, 1, "right", "output"); break;
      case "logger": add(0, 0, "right", "output"); break;
      case "fiber": add(0, 1, "left", "input"); add(0, 1, "right", "output"); break;
      case "clayShaper": add(1, 1, "left", "input"); add(1, 1, "right", "output"); break;
      case "gradingBench": add(1, 1, "left", "input"); add(1, 1, "right", "output"); break;
      case "brickStorage": add(0, 1, "left", "input"); break;
      case "kiln": add(0, 0, "left", "input"); add(0, 1, "left", "input"); add(1, 1, "right", "output"); break;
      case "drive": add(1, 0, "right", "kineticInput"); break;
      case "wheel":
        add(1, 0, "up", "kineticOutput"); add(1, 1, "down", "kineticOutput");
        break;
    }
    return result;
  }
  function cargo(material, quantity = 1, value = D.materials[material]?.value ?? 0) {
    return { material, quantity, value, upgrades: {}, progress: 0 };
  }
  function conveyorCells(machine) {
    const definition = D.machines[machine.type];
    return (definition.conveyors ?? []).map(([x, y], index) => ({
      ...port(machine, x, y, definition.baseFacing ?? "right", "conveyor"), index,
      upgrade: Boolean(definition.cashEffect) && (!definition.upgradeCells
        || definition.upgradeCells.some(([cx, cy]) => cx === x && cy === y)),
    }));
  }
  function sharesCrossing(a, b, x, y) {
    const bridge = D.machines[a.type]?.bridge ? a : D.machines[b.type]?.bridge ? b : null;
    const other = bridge === a ? b : a;
    if (!bridge || !["belt", "electricConveyor"].includes(other.type)) return false;
    const middle = conveyorCells(bridge)[1];
    return middle.x === x && middle.y === y;
  }
  // Older cargo can retain more spent uses than the rebalanced upgrade allows.
  const legacyCashUseLimits = { brickSeal: 9, pebblePile: 5 };
  function validCargo(item) {
    return item && D.materials[item.material] && Number.isFinite(item.quantity) && item.quantity > 0
      && Number.isFinite(item.value) && item.value >= 0 && item.upgrades && typeof item.upgrades === "object"
      && !Array.isArray(item.upgrades) && Number.isFinite(item.progress) && item.progress >= 0 && item.progress <= 1
      && Object.values(item.upgrades).every((value) => typeof value === "boolean" || (Number.isSafeInteger(value) && value >= 0))
      && Object.entries(item.upgrades).every(([type, uses]) => D.machines[type]?.cashEffect?.useLimit === undefined
        || (Number.isSafeInteger(uses) && uses >= 0 && uses <= (legacyCashUseLimits[type] ?? D.machines[type].cashEffect.useLimit)))
      && item.grading === undefined && (item.graded === undefined || typeof item.graded === "boolean")
      && (item.materialHistory === undefined || (item.materialHistory && typeof item.materialHistory === "object" && !Array.isArray(item.materialHistory)
        && Object.entries(item.materialHistory).every(([key, value]) => {
          const [type, material, channel, extra] = key.split(":");
          return value === true && !extra && D.machines[type]?.persistentEffects && Object.hasOwn(D.materials, material) && ["cash", "grade"].includes(channel);
        })))
      && (item.gradeTreatment === undefined || (gradeTable(item.material) && Array.isArray(item.gradeTreatment)
        && item.gradeTreatment.length === D.grades.length && item.gradeTreatment.every(validChances)))
      && (item.preheated === undefined || (item.preheated === true && ["unfiredBrick", "unfiredPot"].includes(item.material)))
      && (item.burnished === undefined || (item.burnished === true && item.material === "unfiredPot"))
      && (item.gradeRepairApplied === undefined || (item.gradeProfile && Number.isFinite(item.gradeRepairApplied)
        && item.gradeRepairApplied >= 0 && item.gradeRepairApplied <= (item.gradeRepairs?.brickSeal ?? 0) + epsilon))
      && (item.gradeProfile === undefined || (D.gradeTables[D.materials[item.material].gradeTable ?? D.materials[item.material].family]
        && Array.isArray(item.gradeProfile) && item.gradeProfile.length === D.grades.length
        && item.gradeProfile.every((chance) => Number.isFinite(chance) && chance >= 0 && chance <= 1)
        && Math.abs(item.gradeProfile.reduce((sum, chance) => sum + chance, 0) - 1) < epsilon))
      && (item.lateral === undefined || item.lateral === -0.5 || item.lateral === 0.5)
      && (item.gradeRepairs === undefined || (item.gradeRepairs && typeof item.gradeRepairs === "object" && !Array.isArray(item.gradeRepairs)
        && Object.entries(item.gradeRepairs).every(([type, count]) => Object.hasOwn(D.machines, type)
          && Number.isFinite((D.machines[type].gradeEffect ?? D.machines[type].legacyGradeEffect)?.poorToStandardPerUse) && Number.isFinite(count) && count >= 0 && count <= (D.machines[type].gradeEffect ?? D.machines[type].legacyGradeEffect).useLimit)));
  }
  function sameCargo(a, b) {
    return a.material === b.material && Math.abs(a.value - b.value) < epsilon
      && Boolean(a.preheated) === Boolean(b.preheated) && Boolean(a.burnished) === Boolean(b.burnished)
      && JSON.stringify(a.upgrades) === JSON.stringify(b.upgrades)
      && JSON.stringify(a.gradeRepairs ?? {}) === JSON.stringify(b.gradeRepairs ?? {})
      && JSON.stringify(a.gradeProfile ?? null) === JSON.stringify(b.gradeProfile ?? null)
      && JSON.stringify(a.gradeTreatment ?? null) === JSON.stringify(b.gradeTreatment ?? null)
      && JSON.stringify(a.materialHistory ?? {}) === JSON.stringify(b.materialHistory ?? {})
      && (a.gradeRepairApplied ?? 0) === (b.gradeRepairApplied ?? 0)
      && Boolean(a.graded) === Boolean(b.graded);
  }
  function joinBufferedOutput(output) {
    const first = output[0];
    while (output.length > 1 && sameCargo(first, output[1])) {
      first.quantity += output[1].quantity;
      output.splice(1, 1);
    }
  }
  function splitOverweightLane(machine, lane, item, capacity) {
    if (item.quantity <= capacity + epsilon) return;
    const remainder = { ...copy(item), quantity: item.quantity - capacity, progress: 0 };
    machine.beltRemainders ??= {};
    const previous = machine.beltRemainders[lane];
    if (previous) {
      const combined = combineCargo([previous, remainder]);
      if (previous.lateral !== undefined) combined.lateral = previous.lateral;
      machine.beltRemainders[lane] = combined;
    } else machine.beltRemainders[lane] = remainder;
    item.quantity = capacity;
  }
  // Import-only validation for saves from the previous portion-based model.
  function validLegacyGrading(item) {
    if (item.grading === undefined) return true;
    const { shares, values } = item.grading ?? {};
    return Array.isArray(shares) && Array.isArray(values) && [5, 6, D.grades.length + 1].includes(shares.length)
      && values.length === shares.length && shares.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
      && values.every((value, index) => Number.isFinite(value) && value >= 0 && (shares[index] > 0 || value === 0))
      && Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) < epsilon
      && Math.abs(values.reduce((sum, value) => sum + value, 0) - item.value) <= epsilon * Math.max(1, item.value);
  }
  function gradeLabel(item) {
    return item.graded ? "Graded" : "";
  }
  const gradeTable = (material) => D.gradeTables[D.materials[material]?.gradeTable ?? D.materials[material]?.family];
  const validChances = (chances) => Array.isArray(chances) && chances.length === D.grades.length
    && chances.every((chance) => Number.isFinite(chance) && chance >= 0 && chance <= 1)
    && Math.abs(chances.reduce((sum, chance) => sum + chance, 0) - 1) < epsilon;
  const identityTreatment = () => D.grades.map((_, i) => D.grades.map((_, j) => Number(i === j)));
  const promotionTreatment = (rates) => D.grades.map((_, i) => D.grades.map((_, j) => {
    const rate = i < D.grades.length - 1 ? (rates[i] ?? 0) : 0;
    return (j === i ? 1 - rate : 0) + (j === i + 1 ? rate : 0);
  }));
  const treatChances = (chances, treatment) => D.grades.map((_, j) => chances.reduce((sum, chance, i) => sum + chance * treatment[i][j], 0));
  function commitQuality(item) {
    const chances = gradeProbabilities(item);
    if (!chances) return null;
    item.gradeProfile = chances;
    if (item.gradeRepairs?.brickSeal) item.gradeRepairApplied = item.gradeRepairs.brickSeal;
    else delete item.gradeRepairApplied;
    return chances;
  }
  function applyGradeTreatment(item, treatment) {
    if (item.graded || !commitQuality(item)) return;
    item.gradeProfile = treatChances(item.gradeProfile, treatment);
    const previous = item.gradeTreatment ?? identityTreatment();
    item.gradeTreatment = previous.map((row) => treatChances(row, treatment));
  }
  function gradeProbabilities(item) {
    const material = D.materials[item.material], table = D.gradeTables[material?.gradeTable ?? material?.family];
    if (!table) return null;
    const result = [...(item.gradeProfile ?? table)];
    for (const [type, count] of Object.entries(item.gradeRepairs ?? {})) {
      const effect = D.machines[type]?.gradeEffect ?? D.machines[type]?.legacyGradeEffect;
      if (effect?.family !== material.family) continue;
      const repaired = Math.min(result[0], Math.max(0, count - (item.gradeRepairApplied ?? 0)) * effect.poorToStandardPerUse);
      result[0] -= repaired; result[1] += repaired;
    }
    return result;
  }
  function setCargoValue(item, value) {
    item.value = value;
  }
  function blendQuality(output, inputs) {
    if (inputs.some((item) => item.graded)) output.graded = true;
    for (const input of inputs) if (input.materialHistory) output.materialHistory = { ...output.materialHistory, ...input.materialHistory };
    // Average actual chances separately from the bounded treatment matrix.
    // This keeps stacks one object and lets a recipe's new quality profile
    // inherit the averaged treatments without keeping individual ingredients.
    if (gradeTable(output.material) && inputs.every((item) => gradeTable(item.material)) && inputs.some((item) =>
      item.gradeProfile || item.gradeRepairs || item.gradeTreatment || gradeTable(item.material) !== gradeTable(output.material))) {
      const total = inputs.reduce((sum, item) => sum + item.quantity, 0);
      const chances = inputs.map(gradeProbabilities);
      output.gradeProfile = D.grades.map((_, index) => inputs.reduce((sum, item, i) => sum + chances[i][index] * item.quantity / total, 0));
      if (output.gradeRepairs?.brickSeal) output.gradeRepairApplied = output.gradeRepairs.brickSeal;
      if (inputs.some((item) => item.gradeTreatment)) {
        const treatments = inputs.map((item) => item.gradeTreatment ?? identityTreatment());
        output.gradeTreatment = D.grades.map((_, i) => D.grades.map((_, j) => inputs.reduce((sum, item, k) => sum + treatments[k][i][j] * item.quantity / total, 0)));
      }
    }
    return output;
  }
  function combineCargo(inputs) {
    if (!inputs.length || inputs.some((item) => !validCargo(item) || item.material !== inputs[0].material)) throw new Error("Only valid cargo of the same material can form a stack.");
    const quantity = inputs.reduce((sum, item) => sum + item.quantity, 0);
    const output = cargo(inputs[0].material, quantity, inputs.reduce((sum, item) => sum + item.value * item.quantity, 0) / quantity);
    if (inputs.every((item) => item.preheated)) output.preheated = true;
    if (inputs.every((item) => item.burnished)) output.burnished = true;
    const uses = new Map();
    for (const item of inputs) for (const [type, count] of Object.entries(item.upgrades)) {
      const previous = uses.get(type);
      // Counts retain the most-used ingredient's history; one-off tags form a union.
      uses.set(type, typeof count === "boolean" && (previous === undefined || typeof previous === "boolean")
        ? Boolean(previous || count) : Math.max(Number(previous ?? 0), Number(count)));
    }
    output.upgrades = Object.fromEntries(uses);
    return blendGradeRepairs(output, inputs);
  }
  function gradeStack(state, item, onGrade) {
    const result = copy(item), chances = gradeProbabilities(item);
    if (!chances || item.graded) return result;
    const roll = random(state);
    let index = 0, threshold = chances[0];
    while (index < chances.length - 1 && roll >= threshold) threshold += chances[++index];
    result.graded = true;
    result.value *= D.grades[index].multiplier;
    if (onGrade) onGrade(D.grades[index].name);
    return result;
  }
  function blendGradeRepairs(output, inputs) {
    const total = inputs.reduce((sum, item) => sum + item.quantity, 0);
    if (total <= 0) return output;
    const repairs = {};
    for (const item of inputs) for (const [type, count] of Object.entries(item.gradeRepairs ?? {})) {
      repairs[type] = (repairs[type] ?? 0) + count * item.quantity / total;
    }
    for (const type of Object.keys(repairs)) repairs[type] = Math.min((D.machines[type].gradeEffect ?? D.machines[type].legacyGradeEffect).useLimit, repairs[type]);
    if (Object.values(repairs).some((count) => count > 0)) output.gradeRepairs = repairs;
    return blendQuality(output, inputs);
  }
  function applyCashEffect(item, type) {
    if (D.machines[type].persistentEffects) {
      const cashKey = `${type}:${item.material}:cash`, gradeKey = `${type}:${item.material}:grade`;
      // Keep the original material in saved history for compatibility/provenance,
      // but spending an effect on ANY material spends it for the entire chain.
      const spent = (channel) => Object.entries(item.materialHistory ?? {}).some(([key, used]) => {
        const [machine, , effect] = key.split(":");
        return used === true && machine === type && effect === channel;
      });
      const { cashEffect, gradeEffect } = D.machines[type];
      if (!spent("cash") && D.materials[item.material].value !== null && item.value + epsilon < cashEffect.upperLimit) {
        item.value *= cashEffect.multiplier; item.upgrades[type] = 1;
        item.materialHistory = { ...item.materialHistory, [cashKey]: true };
      }
      if (gradeEffect && !item.graded && gradeTable(item.material) && !spent("grade")) {
        applyGradeTreatment(item, promotionTreatment(gradeEffect.promotionRates));
        item.materialHistory = { ...item.materialHistory, [gradeKey]: true };
      }
      return;
    }
    const effect = D.machines[type].cashEffect, base = D.materials[item.material].value;
    const uses = item.upgrades[type] ?? 0;
    if (!effect || base === null || base < (effect.baseValueRequired ?? 0)
      || item.value < (effect.lowerLimit ?? 0)
      || item.value + epsilon >= effect.upperLimit || uses >= (effect.useLimit ?? Infinity)) return;
    const multiplier = effect.brackets
      ? effect.brackets.find((bracket) => item.value + epsilon < bracket.upperLimit).multiplier
      : effect.multiplier;
    item.value = multiplier ? item.value * multiplier : item.value + effect.bonus;
    item.upgrades[type] = uses + 1;
  }
  function random(state) {
    state.random = (Math.imul(1664525, state.random) + 1013904223) >>> 0;
    return state.random / 4294967296;
  }
  function startingTrees() {
    return D.startingTerrain.treeCenters.map(([column, row], index) => ({
      id: `tree-${index + 1}`, x: column - 2, y: row - 2,
    }));
  }
  function createState(seed = Date.now() >>> 0) {
    const state = {
      kind: D.saveKind, version: D.saveVersion, planterFootprintVersion: 2, fiberFootprintVersion: 3, openingEconomyVersion: 1, clayShapingVersion: 1, kilnVersion: 1, brickSealVersion: 1, brickStorageVersion: 1, pebbleSifterVersion: 1, gradingVersion: 2, random: seed >>> 0, seconds: 0, nextId: 1,
      settledContentVersion: 1, primitiveStackerVersion: 1, potSpinnerVersion: 2, crudeGearBenchVersion: 1, graniteProcessorVersion: 2, beltCapacityVersion: 1, pebblePileVersion: 1,
      copperIndustryVersion: 1, heatScaleVersion: 1, copperFinishingVersion: 1, loggerSpeedVersion: 1, starterPlantersVersion: 1, starterSiftersVersion: 1, starterBasketsVersion: 1,
      gradeEvolutionVersion: 1, leekDusterVersion: 1, metalPressVersion: 1, thermalAutoVersion: 1, wireIndustryVersion: 2, electricityVersion: 1, spoolTimingVersion: 1, limestoneDrillVersion: 1, preheaterVersion: 1, burnisherVersion: 1, paintingVersion: 1, sawmillVersion: 1, copperWashVersion: 1, potShelfVersion: 1, plantCutterVersion: 1, playtestVersion: 2,
      runeVersion: 3, minorRunes: { harvest: 0, motion: 0, transmutation: 0 }, capitalUnlocked: false, freeMajorPedestals: 0, foodVersion: 6,
      cash: 0, earned: 0, inventory: Object.fromEntries(Object.keys(D.materials).map((material) => [material, 0])),
      stock: Object.fromEntries(Object.keys(D.machines).map((type) => [type, 0])),
      storedMachines: [], machines: [], trees: startingTrees(), terrainVersion: D.startingTerrain.version, harvestProgress: 0,
      clickTokens: 1, harvestedWood: 0, soldItems: 0, producedFiber: 0, hiredCrew: 0,
      tuning: { primitiveBonus: 0.1, primitiveLimit: 0.5 },
      playtest: { unlocked: false, toggles: Object.fromEntries(CHEATS.map((id) => [id, false])), used: Object.fromEntries(CHEATS.map((id) => [id, false])) },
    };
    state.stock.planter = 2;
    state.stock.basket = D.machines.basket.dismantleMinimum;
    state.stock.sellTube = 1;
    state.stock.pebbleSifter = 1;
    state.stock.wheel = 1;
    return state;
  }

  class Factory {
    constructor(state = createState()) {
      this.state = state;
      // Older saves retained heat and liquid inside inventory furnace instances.
      for (const machine of state.storedMachines) clearPickedUpFurnace(machine);
      this.saleTexts = [];
      // Diagnostics are session-local snapshots, not cargo properties or save data.
      this.outputHistories = new Map();
      this.layoutVersion = 0;
      this.rebuild();
    }
    rebuild() {
      this.byId = new Map(this.state.machines.map((machine) => [machine.id, machine]));
      this.at = new Map(); this.occupantsAt = new Map(); this.treeAt = new Map();
      for (const tree of this.state.trees) {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) this.treeAt.set(key(tree.x + dx, tree.y + dy), tree);
      }
      for (const machine of this.state.machines) for (const cell of cells(machine)) {
        const position = key(cell.x, cell.y), occupants = this.occupantsAt.get(position) ?? [];
        occupants.push(machine); this.occupantsAt.set(position, occupants);
        if (!this.at.has(position) || !D.machines[machine.type].bridge) this.at.set(position, machine);
      }
      // Connections depend only on layout, never on tick order or cargo. Cache
      // both ends so a shared Basic Wheel is rejected by every connected Press.
      this.kineticConnections = new Map();
      const consumers = new Map();
      for (const machine of this.state.machines) {
        const connections = [];
        for (const intake of ports(machine).filter((point) => point.role === "kineticInput")) {
          const v = D.vectors[intake.direction], wheel = this.at.get(key(intake.x + v.x, intake.y + v.y));
          if (!D.machines[wheel?.type]?.kineticSource) continue;
          const output = ports(wheel).find((point) => point.role === "kineticOutput"
            && point.x === intake.x + v.x && point.y === intake.y + v.y && point.direction === opposite(intake.direction));
          if (!output) continue;
          connections.push({ wheel, intake });
          if (!consumers.has(wheel.id)) consumers.set(wheel.id, new Set());
          consumers.get(wheel.id).add(machine.id);
        }
        this.kineticConnections.set(machine.id, connections);
      }
      this.pressPowers = new Map();
      for (const machine of this.state.machines) if (D.machines[machine.type].pressModes || D.machines[machine.type].kineticPairSpeed) {
        const connections = this.kineticConnections.get(machine.id).filter(({ wheel }) =>
          !D.machines[wheel.type].dedicatedPressSource || consumers.get(wheel.id).size === 1);
        const paired = connections.some(({ intake: a }, i) => connections.slice(i + 1).some(({ intake: b }) =>
          a.direction === b.direction && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1));
        const heavy = connections.some(({ wheel }, i) => wheel.type === "heavyWheel" && connections.slice(i + 1).some((other) => other.wheel.id === wheel.id));
        this.pressPowers.set(machine.id, { connections: connections.length, speed: connections.length < 2 ? 0 : paired ? (D.machines[machine.type].kineticPairSpeed ?? 2) : 1,
          ...(D.machines[machine.type].dualPower ? { heavy } : {}) });
      }
      this.poweredDrives = this.state.machines.filter((machine) => machine.type === "drive" && this.driveHasWheel(machine));
      const supply = this.state.machines.reduce((total, machine) => total
        + (D.machines[machine.type].electricOutput && this.kineticHasWheel(machine) ? D.machines[machine.type].electricOutput : 0), 0);
      const demand = this.state.machines.reduce((total, machine) => total + (D.machines[machine.type].electricPower ?? 0) + (machine.powerSource === "electric" ? (D.machines[machine.type].dualPower ?? 0) : 0)
        + (machine.conveyorUpgrade === "electricConveyor" ? conveyorUpgradeCost(machine.type) * D.machines.electricConveyor.electricPower : 0), 0);
      this.electricity = { supply, demand, shortage: demand > supply };
      this.transportOrder = this.orderConveyors();
      this.layoutVersion++;
    }
    orderConveyors() {
      const slots = this.state.machines.flatMap((machine) => conveyorCells(machine).map((tile) => ({
        machine, lane: String(tile.index), tile,
      })));
      const bySlot = new Map(slots.map((slot) => [`${slot.machine.id}:${slot.lane}`, slot]));
      const targets = new Map();
      for (const slot of slots) {
        const outputs = [slot.tile];
        if (slot.machine.type === "manualSplitter" && slot.lane === "0") outputs.push(ports(slot.machine).find(point => point.channel === "split"));
        const downstream = [];
        for (const output of outputs) {
          const v = D.vectors[output.direction], x = output.x + v.x, y = output.y + v.y;
          const internal = conveyorCells(slot.machine).find((cell) => cell.x === x && cell.y === y);
          const target = internal ? slot.machine : (this.occupantsAt.get(key(x, y)) ?? []).find((machine) =>
            !D.machines[machine.type].bridge || ports(machine).some((point) => point.role === "input"
              && point.x === x && point.y === y && point.direction === opposite(output.direction)));
          const tile = target && (internal ?? conveyorCells(target).find((cell) => cell.x === x && cell.y === y));
          if (tile) downstream.push(bySlot.get(`${target.id}:${tile.index}`));
        }
        targets.set(slot, downstream);
      }
      // One order for belts, Stackers and machine conveyors. Mixing types must
      // not make an upstream transfer see cargo that departs later in this tick.
      // This graph is layout-only, so build it once rather than every frame.
      const visited = new Set(), ordered = [];
      for (const slot of slots) {
        const pending = [[slot, false]];
        while (pending.length) {
          const [entry, closing] = pending.pop();
          if (closing) { ordered.push(entry); continue; }
          if (visited.has(entry)) continue;
          visited.add(entry); pending.push([entry, true]);
          for (const target of targets.get(entry)) if (!visited.has(target)) pending.push([target, false]);
        }
      }
      return ordered;
    }
    recentOutputs(id) { return copy(this.outputHistories.get(id) ?? []); }
    recordOutput(machine, item, grade = null) {
      if (!supportsOutputHistory(machine.type)) return;
      const history = this.outputHistories.get(machine.id) ?? [];
      history.unshift({ value: D.materials[item.material].value === null ? null : item.value, quantity: item.quantity, grade });
      history.length = Math.min(5, history.length);
      this.outputHistories.set(machine.id, history);
    }
    driveHasWheel(drive) {
      return this.kineticHasWheel(drive);
    }
    kineticHasWheel(machine) {
      const definition = D.machines[machine.type], connections = this.kineticConnections.get(machine.id) ?? [];
      if (definition.pressModes || definition.kineticPairSpeed) return this.pressPower(machine).speed > 0;
      if (definition.requiresHeavyKinetic) return connections.some(({ wheel }) => wheel.type === "heavyWheel");
      return connections.length >= (definition.kineticInputsRequired ?? 1);
    }
    pressPower(machine) { return this.pressPowers.get(machine.id) ?? { connections: 0, speed: 0 }; }
    dualPowered(machine) {
      return machine.powerSource === "electric" ? !this.electricity.shortage : Boolean(this.pressPower(machine).heavy);
    }
    setPowerSource(id, source) {
      const machine = this.byId.get(id);
      if (!D.machines[machine?.type]?.dualPower || !["kinetic", "electric"].includes(source)) return { error: "Invalid power source." };
      machine.powerSource = source; this.rebuild(); return { machine };
    }
    powerArea(drive) {
      const bounds = size(drive), reach = D.config.powerAreaReach;
      return { x: drive.x - reach, y: drive.y - reach,
        width: bounds.width + reach * 2, height: bounds.height + reach * 2 };
    }
    powered(x, y) {
      return this.poweredDrives.some((drive) => {
        const area = this.powerArea(drive);
        return x + 0.5 >= area.x && x + 0.5 < area.x + area.width
          && y + 0.5 >= area.y && y + 0.5 < area.y + area.height;
      });
    }
    conveyorPowered(machine, x, y) {
      if (D.machines[machine.type].dualPower) return this.dualPowered(machine);
      if (machine.conveyorUpgrade === "electricConveyor") return !this.electricity.shortage;
      if (D.machines[machine.type].electricPower) return !this.electricity.shortage;
      return D.machines[machine.type].requiresKinetic ? this.kineticHasWheel(machine) : this.powered(x, y);
    }
    totalCrew() { return D.config.startingCrew + this.state.hiredCrew; }
    crewHireCost() { return D.config.crewHireBaseCost * D.config.crewHireCostMultiplier ** this.state.hiredCrew; }
    canHireCrew() {
      const cost = this.crewHireCost();
      return Number.isFinite(cost) && this.state.cash + epsilon >= cost;
    }
    hireCrew() {
      if (!this.canHireCrew()) return { error: "Not enough cash to hire a hamster." };
      const cost = this.crewHireCost();
      this.state.cash = Math.max(0, this.state.cash - cost);
      this.state.hiredCrew++;
      return { cost };
    }
    availableCrew() {
      const used = this.state.machines.reduce((sum, machine) => sum + (D.machines[machine.type].crew ?? 0), 0);
      return this.totalCrew() - used;
    }
    unlockPlaytest(code) {
      if (typeof code !== "string" || code.trim().toLowerCase() !== "whereismyspill") return { error: "Unknown code." };
      this.state.playtest.unlocked = true; return { unlocked: true };
    }
    setPlaytestCheat(id, enabled) {
      if (!this.state.playtest.unlocked || !CHEATS.includes(id) || typeof enabled !== "boolean") return { error: "Invalid playtest setting." };
      if (id === "conveyorCapacity" && !enabled && cheatEnabled(this.state, id)) {
        for (const machine of this.state.machines) for (const item of Object.values(machine.lanes)) {
          if (D.materials[item.material].weight > conveyorWeightLimit(machine) + epsilon) return { error: "Pick up or clear items too heavy for the normal conveyor before disabling this cheat." };
        }
        for (const machine of this.state.machines) for (const [lane, item] of Object.entries(machine.lanes)) {
          const capacity = Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight);
          splitOverweightLane(machine, lane, item, capacity);
        }
      }
      this.state.playtest.toggles[id] = enabled;
      if (enabled) this.state.playtest.used[id] = true;
      return { enabled };
    }
    collectorCapacity(machine) { return collectorCapacity(machine) * (cheatEnabled(this.state, "storage") ? 10 : 1); }
    bulkFactor(machine) { return machineBulk(this.state, machine); }
    waterCapacity(machine) { return (D.machines[machine.type].waterCapacity ?? 0) * machineBulk(this.state, machine); }
    heatCapacity(machine) { return (D.machines[machine.type].heatCapacity ?? 0) * machineBulk(this.state, machine); }
    takeInput(machine, quantity, material) {
      const selected = [];
      for (let i = 0; i < machine.input.length && quantity > epsilon;) {
        const item = machine.input[i];
        if (material && item.material !== material) { i++; continue; }
        const amount = Math.min(quantity, item.quantity);
        selected.push({ ...copy(item), quantity: amount }); item.quantity -= amount; quantity -= amount;
        if (item.quantity <= epsilon) machine.input.splice(i, 1); else i++;
      }
      return selected;
    }
    waterDropoffInRange(well, target, index) {
      const point = ports(target).filter((port) => port.role === "waterDropoff")[index];
      return Boolean(point && point.x >= well.x - 4 && point.x <= well.x + 5 && point.y >= well.y - 4 && point.y <= well.y + 5);
    }
    addWaterDelivery(id, targetId, index) {
      const well = this.byId.get(id), target = this.byId.get(targetId);
      if (!D.machines[well?.type]?.waterSource || !D.machines[target?.type]?.waterCapacity || !Number.isInteger(index)
        || !this.waterDropoffInRange(well, target, index)) return { error: "Choose a Water dropoff within the Well's 10 by 10 area." };
      if (well.waterSchedule.some((entry) => entry.targetId === targetId && entry.index === index)) return { error: "That dropoff is already scheduled." };
      well.waterSchedule.push({ targetId, index }); return { machine: well };
    }
    removeWaterDelivery(id, index) {
      const well = this.byId.get(id);
      if (!D.machines[well?.type]?.waterSource || !Number.isInteger(index) || index < 0 || index >= well.waterSchedule.length) return { error: "Invalid delivery." };
      well.waterSchedule.splice(index, 1);
      if (index < well.waterNext) well.waterNext--;
      if (well.waterNext >= well.waterSchedule.length) well.waterNext = 0;
      if (!well.waterSchedule.length) well.waterTimer = 0;
      return { machine: well };
    }
    placement(type, x, y, facing = D.machines[type]?.defaultFacing ?? "right", ignoreId = null, mode = undefined) {
      if (!D.machines[type] || !D.directions.includes(facing) || !Number.isInteger(x) || !Number.isInteger(y)) return "Invalid placement.";
      const machine = { type, x, y, facing, mode: mode ?? this.byId.get(ignoreId)?.mode ?? D.machines[type].defaultMode }, occupied = cells(machine);
      if (occupied.some((cell) => cell.x < 0 || cell.y < 0 || cell.x >= D.config.columns || cell.y >= D.config.rows)) return "Outside the factory.";
      if (occupied.some((cell) => {
        return (this.occupantsAt.get(key(cell.x, cell.y)) ?? []).some((other) =>
          !(ignoreId instanceof Set ? ignoreId.has(other.id) : other.id === ignoreId)
          && !sharesCrossing(machine, other, cell.x, cell.y));
      })) return "Another machine is in the way.";
      if (type === "logger") {
        const tree = this.treeAt.get(key(x, y));
        if (!tree) return "Place the Logger inside a tree’s middle edge tile.";
        const valid = (x === tree.x && y === tree.y + 1 && facing === "left")
          || (x === tree.x + 2 && y === tree.y + 1 && facing === "right")
          || (x === tree.x + 1 && y === tree.y && facing === "up")
          || (x === tree.x + 1 && y === tree.y + 2 && facing === "down");
        if (!valid) return "Use the middle of a tree edge, facing away from the tree.";
      } else if (occupied.some((cell) => this.treeAt.has(key(cell.x, cell.y)))) return "The tree occupies those tiles.";
      if (!ignoreId && this.availableCrew() < (D.machines[type].crew ?? 0)) return "Not enough available hamsters.";
      return null;
    }
    place(type, x, y, facing = D.machines[type]?.defaultFacing ?? "right", configuration = null) {
      const storedIndex = this.state.storedMachines.findIndex((machine) => machine.type === type);
      const error = this.placement(type, x, y, facing, null, configuration?.mode ?? this.state.storedMachines[storedIndex]?.mode);
      if (error) return { error };
      if (!(this.state.stock[type] > 0)) return { error: "No owned machine to place." };
      this.state.stock[type]--;
      const stored = storedIndex < 0 ? null : this.state.storedMachines.splice(storedIndex, 1)[0];
      const machine = Object.assign(stored ?? { id: `machine-${this.state.nextId++}`, type, timer: 0,
        input: [], output: [], contents: [], lanes: {}, job: null,
        ...(D.machines[type].heatCapacity ? { heat: 0, outputCooldown: 0 } : {}),
        ...(D.machines[type].waterCapacity ? { water: 0 } : {}),
        ...(D.machines[type].waterSource ? { waterSchedule: [], waterNext: 0, waterTimer: 0 } : {}),
        ...(D.machines[type].dualPower ? { powerSource: "kinetic" } : {}),
        ...(D.machines[type].maxStackSize ? { stackSize: D.machines[type].defaultStackSize } : {}),
        ...(D.machines[type].defaultMode ? { mode: D.machines[type].defaultMode } : {}) }, { x, y, facing });
      if (configuration?.mode !== undefined) machine.mode = configuration.mode;
      if (configuration?.stackSize !== undefined) machine.stackSize = configuration.stackSize;
      this.state.machines.push(machine); this.rebuild();
      return { machine };
    }
    move(id, x, y, facing) {
      const machine = this.byId.get(id);
      if (!machine) return { error: "Machine not found." };
      const error = this.placement(machine.type, x, y, facing, id);
      if (error) return { error };
      if (collectorCapacity(machine)) this.collect(id);
      Object.assign(machine, { x, y, facing }); this.rebuild();
      return { machine };
    }
    selectBox(start, end) {
      const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
      return this.state.machines.filter((machine) => cells(machine).some((cell) =>
        cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= bottom)).map((machine) => machine.id);
    }
    hasGroupStock(ids) {
      const needed = new Map();
      for (const id of new Set(ids)) {
        const machine = this.byId.get(id);
        if (!machine) return false;
        needed.set(machine.type, (needed.get(machine.type) ?? 0) + 1);
      }
      return needed.size > 0 && [...needed].every(([type, count]) => this.state.stock[type] >= count);
    }
    groupPlan(ids, x, y, turns = 0, placing = false) {
      const selected = new Set(ids), machines = [...selected].map((id) => this.byId.get(id));
      if (!machines.length || machines.some((machine) => !machine)
        || ![x, y, turns].every(Number.isInteger)) return { error: "Invalid group selection.", machines: [] };
      const left = Math.min(...machines.map((machine) => machine.x));
      const top = Math.min(...machines.map((machine) => machine.y));
      const width = Math.max(...machines.map((machine) => machine.x + size(machine).width)) - left;
      const height = Math.max(...machines.map((machine) => machine.y + size(machine).height)) - top;
      const rotation = ((turns % 4) + 4) % 4;
      const planned = machines.map((machine) => {
        const dx = machine.x - left, dy = machine.y - top, bounds = size(machine);
        const offsets = [
          [dx, dy], [height - dy - bounds.height, dx],
          [width - dx - bounds.width, height - dy - bounds.height], [dy, width - dx - bounds.width],
        ][rotation];
        return { id: machine.id, type: machine.type, x: x + offsets[0], y: y + offsets[1], facing: turn(machine.facing, rotation),
          ...(machine.mode ? { mode: machine.mode } : {}), ...(machine.stackSize !== undefined ? { stackSize: machine.stackSize } : {}) };
      });
      let error = null;
      if (placing && !this.hasGroupStock(ids)) error = "Not enough owned machines for the whole group.";
      if (placing && this.availableCrew() < machines.reduce((sum, machine) => sum + (D.machines[machine.type].crew ?? 0), 0)) {
        error ||= "Not enough available hamsters for the whole group.";
      }
      const occupied = new Map();
      const ignored = placing ? new Set() : selected;
      for (const machine of planned) {
        error ||= this.placement(machine.type, machine.x, machine.y, machine.facing, ignored, machine.mode);
        for (const cell of cells(machine)) {
          const position = key(cell.x, cell.y);
          const others = occupied.get(position) ?? [];
          if (others.some((other) => !sharesCrossing(machine, other, cell.x, cell.y))) error ||= "Selected machines overlap.";
          others.push(machine); occupied.set(position, others);
        }
      }
      return { error, machines: planned, width: rotation % 2 ? height : width, height: rotation % 2 ? width : height };
    }
    moveGroup(ids, x, y, turns = 0) {
      const plan = this.groupPlan(ids, x, y, turns);
      if (plan.error) return { error: plan.error };
      // Validate the entire destination before collecting or moving anything.
      for (const entry of plan.machines) {
        const machine = this.byId.get(entry.id);
        if (collectorCapacity(machine)) this.collect(machine.id);
        Object.assign(machine, { x: entry.x, y: entry.y, facing: entry.facing });
      }
      this.rebuild(); return { machines: plan.machines.map((entry) => this.byId.get(entry.id)) };
    }
    placeGroup(ids, x, y, turns = 0) {
      const plan = this.groupPlan(ids, x, y, turns, true);
      if (plan.error) return { error: plan.error };
      // The complete footprint, stock and crew requirements are checked first.
      return { machines: plan.machines.map((entry) => this.place(entry.type, entry.x, entry.y, entry.facing, entry).machine) };
    }
    pickupGroup(ids) {
      const selected = [...new Set(ids)];
      if (!selected.length || selected.some((id) => !this.byId.has(id))) return { error: "Invalid group selection." };
      for (const id of selected) this.pickup(id);
      return { amount: selected.length };
    }
    collect(id) {
      const basket = this.byId.get(id);
      if (!collectorCapacity(basket)) return 0;
      let quantity = 0;
      for (const item of basket.contents) { this.state.inventory[item.material] += item.quantity; quantity += item.quantity; }
      basket.contents = [];
      return quantity;
    }
    pickup(id) {
      const machine = this.byId.get(id);
      if (!machine) return false;
      for (const well of this.state.machines.filter((entry) => D.machines[entry.type].waterSource)) {
        for (let i = well.waterSchedule.length - 1; i >= 0; i--) if (well.waterSchedule[i].targetId === id) this.removeWaterDelivery(well.id, i);
      }
      if (D.machines[machine.type].waterSource) { machine.waterSchedule = []; machine.waterNext = 0; machine.waterTimer = 0; }
      if (D.machines[machine.type].waterCapacity) {
        machine.water = 0;
      }
      if (collectorCapacity(machine)) this.collect(id);
      for (const item of [...machine.input, ...machine.output, ...Object.values(machine.lanes), ...Object.values(machine.beltRemainders ?? {})]) {
        if (validCargo(item) && !D.materials[item.material].fluid) this.state.inventory[item.material] += item.quantity;
      }
      for (const item of jobInputs(machine.job)) if (!D.materials[item.material].fluid) this.state.inventory[item.material] += item.quantity;
      machine.input = machine.input.filter((item) => D.materials[item.material].fluid);
      machine.output = machine.output.filter((item) => D.materials[item.material].fluid);
      machine.contents = []; machine.lanes = {};
      if (!D.machines[machine.type].molder && !D.machines[machine.type].fluidInput) machine.job = null;
      machine.timer = 0;
      clearPickedUpFurnace(machine);
      delete machine.beltRemainders;
      if (machine.conveyorUpgrade === "electricConveyor") {
        this.state.stock.electricConveyor += conveyorUpgradeCost(machine.type);
        delete machine.conveyorUpgrade;
      }
      this.state.machines = this.state.machines.filter((other) => other !== machine);
      this.state.stock[machine.type]++;
      this.state.storedMachines.push(machine);
      this.outputHistories.delete(id);
      this.rebuild(); return true;
    }
    upgradeConveyors(id) {
      const machine = this.byId.get(id), count = machine && conveyorUpgradeCost(machine.type);
      if (!count) return { error: "This machine cannot receive a Basic Conveyor upgrade." };
      if (machine.conveyorUpgrade) return { error: "This machine already has upgraded conveyors." };
      if (this.state.stock.electricConveyor < count) return { error: `Requires ${count} unplaced Basic Conveyor${count === 1 ? "" : "s"}.` };
      let remaining = count;
      this.state.storedMachines = this.state.storedMachines.filter((entry) => {
        if (entry.type !== "electricConveyor" || remaining <= 0) return true;
        remaining--; return false;
      });
      this.state.stock.electricConveyor -= count;
      machine.conveyorUpgrade = "electricConveyor";
      this.rebuild();
      return { amount: count };
    }
    nextRune(pedestal, category) {
      if (pedestal !== "minor" || !Object.hasOwn(D.minorRunes, category)) return null;
      if (category === "activation" && this.state.capitalUnlocked) return null;
      return D.minorRunes[category][this.state.minorRunes[category] ?? 0] ?? null;
    }
    runeCostError(offering) {
      if (!offering) return "No offering available.";
      if (offering.machine && !runeUnlocks.has(offering.machine)) return "This unlock is pending.";
      if (this.state.cash < (offering.cash ?? 0)) return "Not enough cash.";
      for (const [material, quantity] of Object.entries(offering.materials)) {
        if (this.state.inventory[material] + epsilon < quantity) return `Not enough ${D.materials[material].name}.`;
      }
      return null;
    }
    redeemRune(id, category) {
      const pedestal = D.machines[this.byId.get(id)?.type]?.runePedestal;
      const offering = this.nextRune(pedestal, category);
      const error = this.runeCostError(offering);
      if (error) return { error };
      this.state.cash -= offering.cash ?? 0;
      for (const [material, quantity] of Object.entries(offering.materials)) this.state.inventory[material] = Math.max(0, this.state.inventory[material] - quantity);
      if (category === "activation") this.state.capitalUnlocked = true;
      else {
        this.state.minorRunes[category]++;
        this.state.stock[offering.machine]++;
      }
      return { offering };
    }
    shopUnlockError(type) {
      if (D.machines[type]?.legacyOnly) return "Use the Primitive Oven for new builds.";
      if (D.machines[type]?.hiddenFromShop) return "This machine is currently unavailable in the shop.";
      const unlock = runeUnlocks.get(type);
      if (unlock && this.state.minorRunes[unlock.category] < unlock.tier) return `Unlock this at the Minor Rune Pedestal under ${D.runeCategories[unlock.category]}.`;
      return null;
    }
    affordability(type, amount = 1) {
      if (!Number.isInteger(amount) || amount < 1 || amount > 9999) return "Choose 1–9999 machines.";
      const unlockError = this.shopUnlockError(type);
      if (unlockError) return unlockError;
      const cost = D.machines[type]?.cost;
      if (!cost) return "This item's cost has not been set.";
      if (this.state.cash + epsilon < cost.cash * amount) return "Not enough cash.";
      for (const [material, quantity] of Object.entries(cost.materials)) {
        if (this.state.inventory[material] + epsilon < quantity * amount) return `Not enough ${D.materials[material].name}.`;
      }
      for (const [machine, quantity] of Object.entries(cost.machines ?? {})) {
        if (this.state.stock[machine] < quantity * amount) return `Not enough unplaced ${D.machines[machine].name}.`;
      }
      return null;
    }
    buy(type, amount = 1) {
      const error = this.affordability(type, amount);
      if (error) return { error };
      const cost = D.machines[type].cost;
      this.state.cash = Math.max(0, this.state.cash - cost.cash * amount);
      for (const [material, quantity] of Object.entries(cost.materials)) this.state.inventory[material] -= quantity * amount;
      for (const [machine, quantity] of Object.entries(cost.machines ?? {})) {
        let needed = quantity * amount;
        // Owned stored instances are consumed once, never left as ghost inventory.
        this.state.storedMachines = this.state.storedMachines.filter((entry) => {
          if (entry.type !== machine || needed <= 0) return true;
          needed--; return false;
        });
        this.state.stock[machine] -= quantity * amount;
      }
      this.state.stock[type] += amount; return { amount };
    }
    dismantleError(type) {
      const definition = D.machines[type];
      if (!definition?.cost) return "This machine has no construction recipe to recover.";
      const minimum = definition.dismantleMinimum ?? 0;
      const owned = this.state.stock[type] + this.state.machines.filter((machine) => machine.type === type).length;
      if (minimum && owned <= minimum) return `Keep at least ${minimum} ${definition.name}${minimum === 1 ? "" : "s"}.`;
      if (!(this.state.stock[type] > 0)) return "Pick up an owned machine before dismantling it.";
      return null;
    }
    dismantleRefund(type) {
      if (type === "majorRunePedestal" && this.state.freeMajorPedestals > 0) return { materials: {} };
      return D.machines[type]?.cost;
    }
    dismantle(type) {
      const error = this.dismantleError(type);
      if (error) return { error };
      const cost = this.dismantleRefund(type);
      const index = this.state.storedMachines.findIndex((machine) => machine.type === type);
      const materials = { ...cost.materials }, machines = { ...cost.machines };
      if (index >= 0) {
        const stored = this.state.storedMachines.splice(index, 1)[0];
        for (const item of [...stored.input, ...stored.output, ...stored.contents, ...Object.values(stored.lanes),
          ...Object.values(stored.beltRemainders ?? {}), ...jobInputs(stored.job)]) {
          if (validCargo(item) && !D.materials[item.material].fluid) materials[item.material] = (materials[item.material] ?? 0) + item.quantity;
        }
        this.outputHistories.delete(stored.id);
      }
      this.state.stock[type]--;
      if (type === "majorRunePedestal" && this.state.freeMajorPedestals > 0) this.state.freeMajorPedestals--;
      for (const [material, quantity] of Object.entries(materials)) this.state.inventory[material] += quantity;
      for (const [machine, quantity] of Object.entries(machines)) this.state.stock[machine] += quantity;
      return { amount: 1, materials, machines };
    }
    borrow(type, amount = 1) {
      if (!D.machines[type] || D.machines[type].cost || !Number.isInteger(amount) || amount < 1 || amount > 100) return false;
      this.state.stock[type] += amount; return true;
    }
    chop(treeId) {
      if (!this.state.trees.some((tree) => tree.id === treeId) || this.state.clickTokens < 1 - epsilon) return { accepted: false, wood: 0 };
      this.state.clickTokens = Math.max(0, this.state.clickTokens - 1);
      this.state.harvestProgress++;
      let wood = 0;
      if (this.state.harvestProgress === D.config.chopsPerHarvest) {
        this.state.harvestProgress = 0;
        wood = (1 + Math.floor(random(this.state) * 5)) * (cheatEnabled(this.state, "resources") ? 10 : 1);
        this.state.inventory.wood += wood; this.state.harvestedWood += wood;
      }
      return { accepted: true, wood };
    }
    sell(items) {
      let money = 0, quantity = 0;
      for (const item of items) if (D.materials[item.material]?.value !== null && !D.materials[item.material]?.fluid) {
        money += item.quantity * item.value; quantity += item.quantity;
      }
      if (cheatEnabled(this.state, "cash")) money *= 10;
      this.state.cash += money; this.state.earned += money; this.state.soldItems += quantity;
      return money;
    }
    total(machine, field, material) {
      return machine[field].reduce((sum, item) => sum + (material && item.material !== material ? 0 : item.quantity), 0);
    }
    setStackSize(id, value) {
      const machine = this.byId.get(id), definition = D.machines[machine?.type];
      const amount = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
      if (!definition?.maxStackSize || !Number.isInteger(amount) || amount < 1 || amount > definition.maxStackSize) {
        return { error: `Enter a whole stack size from 1 to ${definition?.maxStackSize ?? 2}.` };
      }
      machine.stackSize = amount;
      return { machine };
    }
    stackTarget(machine, item) {
      return Math.min(machine.stackSize, Math.floor(conveyorWeightLimit(machine, this.state) / D.materials[item.material].weight));
    }
    setShapingMode(id, mode) {
      const machine = this.byId.get(id);
      const definition = D.machines[machine?.type];
      if (!definition?.craftInput || !Object.hasOwn(definition.recipes, mode)) return { error: "Invalid shaping mode." };
      // A running job retains its original recipe. Only subsequent jobs change.
      machine.mode = mode;
      return { machine };
    }
    setSplitterSide(id, side) {
      const machine = this.byId.get(id);
      if (machine?.type !== "manualSplitter" || !Object.hasOwn(D.machines.manualSplitter.modeFootprints, side)) return { error: "Invalid splitter side." };
      const error = this.placement(machine.type, machine.x, machine.y, machine.facing, id, side);
      if (error) return { error };
      machine.mode = side;
      this.rebuild();
      return { machine };
    }
    setPressMode(id, mode) {
      const machine = this.byId.get(id), definition = D.machines[machine?.type];
      if (!definition?.pressModes || !Object.hasOwn(definition.pressModes, mode)) return { error: "Invalid Press mode." };
      if (machine.mode !== mode) {
        for (const item of [...machine.input, ...[machine.lanes[0], machine.beltRemainders?.[0]].filter(Boolean)]) {
          this.state.inventory[item.material] += item.quantity;
        }
        delete machine.lanes[0];
        if (machine.beltRemainders) delete machine.beltRemainders[0];
        machine.input = []; machine.mode = mode;
      }
      return { machine };
    }
    setSourceMode(id, mode) {
      const machine = this.byId.get(id), modes = D.machines[machine?.type]?.sourceModes ?? D.machines[machine?.type]?.batchModes;
      if (!modes || !Object.hasOwn(modes, mode)) return { error: "Invalid extraction mode." };
      machine.mode = mode; return { machine };
    }
    setFormingMode(id, mode) {
      const machine = this.byId.get(id), definition = D.machines[machine?.type];
      if (!definition?.formingModes || !Object.hasOwn(definition.formingModes, mode)) return { error: "Invalid forming mode." };
      if (mode !== machine.mode) {
        // Only solid, waiting ingredients are returned; a running job keeps
        // its own recipe and liquid input never enters inventory.
        if (definition.fluidInput) return { error: "This machine has no alternate mode." };
        for (const item of machine.input) this.state.inventory[item.material] += item.quantity;
        machine.input = []; machine.mode = mode;
      }
      return { machine };
    }
    craftRecipe(machine, input = machine.input[0], mode = machine.mode) {
      const definition = D.machines[machine.type];
      if (definition.formingModes) {
        return formingRecipe(definition, input, mode);
      }
      if (definition.pressModes) {
        const recipe = definition.pressModes[mode], source = D.materials[input?.material];
        const output = source?.[recipe?.materialProperty];
        if (!recipe || !output || !D.materials[output] || source.fluid || D.materials[output].fluid) return null;
        return { ...recipe, output, seconds: definition.seconds };
      }
      if (!definition.molder) return definition.recipes[mode];
      const output = moldingProduct(input?.material);
      return output ? { input: 1, output, seconds: definition.seconds, valueMultiplier: 1 } : null;
    }
    startShaping(machine) {
      const definition = D.machines[machine.type], recipe = this.craftRecipe(machine), bulk = machineBulk(this.state, machine);
      const water = (recipe?.water ?? definition.waterPerBatch ?? 0) * bulk;
      if (!recipe || machine.job || machine.output.length > (definition.outputBuffer ?? 0) || this.total(machine, "input") + epsilon < recipe.input * bulk
        || (definition.requiresKinetic && !this.kineticHasWheel(machine)) || (definition.dualPower && !this.dualPowered(machine))
        || (water && machine.water + epsilon < water)) return;
      if (water) machine.water = Math.max(0, machine.water - water);
      const ingredients = this.takeInput(machine, recipe.input * bulk);
      machine.job = { input: combineCargo(ingredients), ...(definition.molder ? {} : { mode: machine.mode }), ...(bulk > 1 ? { bulk } : {}), remaining: recipe.seconds };
      if (recipe.seconds === 0) this.finishShaping(machine);
    }
    finishShaping(machine) {
      if (!machine.job || machine.job.remaining > epsilon || machine.output.length) return;
      const definition = D.machines[machine.type];
      const recipe = definition.formingModes
        ? formingRecipe(definition, machine.job.input, machine.job.mode, machine.job)
        : this.craftRecipe(machine, machine.job.input, machine.job.mode);
      const quantity = (recipe.outputQuantity ?? 1) * (machine.job.bulk ?? 1);
      const product = definition.preservesCargo ? copy(machine.job.input) : blendGradeRepairs(cargo(recipe.output, quantity,
        machine.job.input.value * machine.job.input.quantity * recipe.valueMultiplier / quantity), [machine.job.input]);
      if (machine.type === "burnisher") product.burnished = true;
      if (recipe.gradeProfile) {
        product.gradeProfile = [...recipe.gradeProfile]; delete product.gradeRepairApplied;
        commitQuality(product);
        if (product.gradeTreatment) product.gradeProfile = treatChances(product.gradeProfile, product.gradeTreatment);
      }
      machine.output.push(product); machine.job = null;
    }
    unloadShaping(machine) {
      if (machine.output.length) {
        const item = machine.output[0], definition = D.machines[machine.type];
        item.quantity -= definition.pressModes
          ? this.receiveOutputConveyor(machine, item, conveyorCells(machine)[definition.processingCell])
          : this.sendOutput(machine, item, ports(machine).find((point) => point.role === "output"));
        if (item.quantity <= epsilon) machine.output.shift();
      }
      this.finishShaping(machine);
      this.startShaping(machine);
    }
    startGrading(machine) {
      if (machine.job || machine.output.length || !machine.input.length) return;
      const input = machine.input.shift();
      machine.job = { input, remaining: input.quantity * D.materials[input.material].weight * D.machines.gradingBench.secondsPerWeight };
    }
    unloadGrader(machine) {
      if (machine.output.length) {
        const item = machine.output[0], output = ports(machine).find((point) => point.role === "output");
        item.quantity -= this.sendOutput(machine, item, output);
        if (item.quantity <= epsilon) machine.output.shift();
      }
      this.startGrading(machine);
    }
    startPainting(machine) {
      const definition = D.machines[machine.type], bulk = machineBulk(this.state, machine);
      if (machine.job || machine.output.length > definition.outputBuffer || machine.water + epsilon < definition.paintWater * bulk) return;
      if (["pot", "malachitePebble"].some((material) => machine.input.filter((item) => item.material === material).reduce((sum, item) => sum + item.quantity, 0) < bulk)) return;
      machine.water = Math.max(0, machine.water - definition.paintWater * bulk);
      const pot = combineCargo(this.takeInput(machine, bulk, "pot")), pebble = combineCargo(this.takeInput(machine, bulk, "malachitePebble"));
      machine.job = { inputs: [pot, pebble], ...(bulk > 1 ? { bulk } : {}), remaining: definition.paintSeconds };
    }
    finishPainting(machine) {
      if (!machine.job || machine.job.remaining > epsilon || machine.output.length) return;
      const pot = machine.job.inputs.find((item) => item.material === "pot");
      machine.output.push(blendGradeRepairs(cargo("paintedPot", machine.job.bulk ?? 1, pot.value * 3), [pot]));
      machine.job = null;
    }
    unloadPainting(machine) {
      if (machine.output.length) {
        const item = machine.output[0];
        item.quantity -= this.sendOutput(machine, item, ports(machine).find((point) => point.role === "output"));
        if (item.quantity <= epsilon) machine.output.shift();
      }
      this.finishPainting(machine); this.startPainting(machine);
    }
    furnaceRecipe(machine) {
      const definition = D.machines[machine.type];
      if (definition.oven) return ovenRecipeForInput(definition, machine.input);
      return thermalRecipeEntry(definition, machine.input[0]?.material)?.[1];
    }
    preheatCargo(item, definition) {
      const product = { ...copy(item), preheated: true };
      const chance = gradeProbabilities(product)?.[1] ?? 0;
      if (chance > epsilon) applyGradeTreatment(product, promotionTreatment([0, Math.min(1, definition.preheatGradeTransfer / chance), 0, 0, 0, 0]));
      return product;
    }
    startKiln(machine) {
      const definition = D.machines[machine.type], bulk = machineBulk(this.state, machine);
      if (definition.oven) {
        const recipe = this.furnaceRecipe(machine);
        if (machine.output.length || !recipe || machine.heat + epsilon < recipe.heat * bulk) return;
        const ingredients = Object.entries(recipe.inputs);
        if (ingredients.some(([material, count]) => this.total(machine, "input", material) < count * bulk)) return;
        machine.heat = Math.max(0, machine.heat - recipe.heat * bulk);
        const inputs = ingredients.flatMap(([material, count]) => this.takeInput(machine, count * bulk, material));
        if (recipe.preheats) machine.output.push(...inputs.map(item => this.preheatCargo(item, definition)));
        else {
          const quantity = recipe.outputQuantity * bulk;
          const value = inputs.reduce((sum, item) => sum + item.quantity * item.value, 0) * recipe.valueMultiplier / quantity;
          machine.output.push(blendGradeRepairs(cargo(recipe.output, quantity, value), inputs));
        }
        return;
      }
      const entry = thermalRecipeEntry(definition, machine.input[0]?.material), recipe = entry?.[1];
      if (machine.job || !recipe || this.total(machine, "input") + epsilon < recipe.input * bulk) return;
      let pending = recipe.input * bulk; const batch = [];
      for (const item of machine.input) {
        if (pending <= epsilon) break;
        batch.push(item); pending -= Math.min(item.quantity, pending);
      }
      const seconds = recipe.preheatedSeconds && batch.every((item) => item.preheated) ? recipe.preheatedSeconds : recipe.seconds;
      const heat = (recipe.heatPerSecond ?? definition.heatPerSecond) * seconds * bulk;
      if (machine.heat + epsilon < heat) return;
      // Full batches and their heat are committed together. Preserve each input's
      // value separately rather than averaging differently upgraded products.
      machine.heat = Math.max(0, machine.heat - heat);
      machine.job = { recipe: entry[0],
        inputs: this.takeInput(machine, recipe.input * bulk), ...(bulk > 1 ? { bulk } : {}), remaining: seconds };
    }
    finishKiln(machine) {
      if (!machine.job || machine.job.remaining > epsilon || machine.output.length) return;
      const definition = D.machines[machine.type], recipe = definition.recipes[machine.job.recipe];
      if (machine.job.bulk > 1) machine.outputBulk = true;
      if (definition.preheats) {
        machine.output.push(...machine.job.inputs.map(item => this.preheatCargo(item, definition)));
        machine.job = null; return;
      }
      if (recipe.outputQuantity !== undefined) {
        const input = combineCargo(machine.job.inputs);
        const quantity = recipe.outputQuantity * (machine.job.bulk ?? 1);
        machine.output.push(blendGradeRepairs(cargo(recipe.output, quantity,
          input.value * input.quantity * recipe.valueMultiplier / quantity), [input]));
      } else for (const item of (machine.job.bulk > 1 ? [false, true].map((burnished) => machine.job.inputs.filter((entry) => Boolean(entry.burnished) === burnished))
        .filter((entries) => entries.length).map((entries) => combineCargo(entries)) : machine.job.inputs)) {
        const product = blendGradeRepairs(cargo(recipe.output, item.quantity, item.value * recipe.valueMultiplier), [item]);
        if (item.burnished && recipe.burnishedGradeEffect) {
          const treatment = identityTreatment();
          const effect = recipe.burnishedGradeEffect;
          treatment[effect.from].fill(0);
          for (const outcome of effect.outcomes) treatment[effect.from][outcome.grade] = outcome.share;
          applyGradeTreatment(product, treatment);
        }
        machine.output.push(product);
      }
      if (recipe.gradePromotion) for (const item of machine.output) {
        const ceiling = recipe.gradePromotionCeiling ?? D.grades.length - 1;
        applyGradeTreatment(item, promotionTreatment(D.grades.map((_, i) => i < ceiling ? recipe.gradePromotion : 0)));
      }
      machine.job = null;
    }
    unloadKiln(machine) {
      const direct = machine.type === "kiln" || D.machines[machine.type].preheats || D.machines[machine.type].oven;
      const output = ports(machine).find((point) => point.role === "output");
      const direction = D.vectors[output.direction];
      const belt = this.conveyorAt(output.x + direction.x, output.y + direction.y);
      // Kiln and Preheater output can enter a machine immediately, just as molten
      // furnace output does. A conveyor still controls its own transfer rate.
      if (direct && !belt) {
        while (machine.output.length) {
          joinBufferedOutput(machine.output);
          const item = machine.output[0];
          const sent = this.sendOutput(machine, item, output);
          if (sent <= epsilon) break;
          item.quantity -= sent;
          if (item.quantity <= epsilon) machine.output.shift();
        }
        if (!machine.output.length) delete machine.outputBulk;
        this.finishKiln(machine);
        this.startKiln(machine);
        return;
      }
      if (machine.output.length && (D.materials[machine.output[0].material].fluid || machine.outputCooldown <= epsilon)) {
        if (belt) joinBufferedOutput(machine.output);
        const item = machine.output[0];
        const fluid = D.materials[item.material].fluid;
        const sent = fluid ? this.send(machine, item, output) : (belt || D.machines[machine.type].preheats || machine.outputBulk) ? this.sendOutput(machine, item, output)
          : this.send(machine, { ...item, quantity: Math.min(1, item.quantity) }, output);
        if (sent > epsilon) {
          item.quantity -= sent;
          if (!fluid) {
            const v = D.vectors[output.direction], receivingBelt = this.conveyorAt(output.x + v.x, output.y + v.y);
            machine.outputCooldown = receivingBelt
              ? conveyorSeconds(receivingBelt.machine) / (cheatEnabled(this.state, "conveyorSpeed") ? 5 : 1)
              : D.machines[machine.type].outputSeconds / (cheatEnabled(this.state, "machineSpeed") ? 10 : 1);
          }
          if (item.quantity <= epsilon) machine.output.shift();
          if (!machine.output.length) delete machine.outputBulk;
        }
      }
      this.finishKiln(machine);
      this.startKiln(machine);
    }
    unloadBatchSource(machine) {
      const definition = D.machines[machine.type];
      if (definition.electricPower && this.electricity.shortage) return;
      const outputs = ports(machine).filter((point) => point.role === "output");
      if (definition.batchModes) {
        for (const item of [...machine.output]) {
          const slot = item.sifterSlot ?? (item.material === "soil" ? 0 : 1);
          const delivered = { ...item }; delete delivered.sifterSlot;
          item.quantity -= this.sendOutput(machine, delivered, outputs[slot]);
          if (item.quantity <= epsilon) machine.output.splice(machine.output.indexOf(item), 1);
        }
        return;
      }
      for (const item of [...machine.output]) for (const output of outputs.filter((point) => point.material === item.material)) {
        item.quantity -= this.sendOutput(machine, item, output);
        if (item.quantity <= epsilon) { machine.output.splice(machine.output.indexOf(item), 1); break; }
      }
    }
    conveyorAt(x, y, elevated = false) {
      for (const machine of this.occupantsAt.get(key(x, y)) ?? []) {
        if (Boolean(D.machines[machine.type].bridge) !== elevated) continue;
        const tile = conveyorCells(machine).find((cell) => cell.x === x && cell.y === y);
        if (tile) return { machine, tile };
      }
      return null;
    }
    slotBusy(x, y, elevated, ignore = null) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const slot = this.conveyorAt(x + dx, y + dy, elevated), item = slot?.machine.lanes[slot.tile.index];
        if (!item || item === ignore) continue;
        if (dx === 0 && dy === 0) return true;
        if (item.lateral) {
          const v = D.vectors[slot.tile.direction], sign = Math.sign(item.lateral);
          if (slot.tile.x - v.y * sign === x && slot.tile.y + v.x * sign === y) return true;
        }
      }
      return false;
    }
    receiveConveyor(machine, item, tile, consume, lateral = null, machineOutput = false) {
      if (D.materials[item.material].directTransferOnly || machine.beltRemainders?.[tile.index]) return 0;
      const elevated = Boolean(D.machines[machine.type].bridge);
      const stacking = Boolean(D.machines[machine.type].maxStackSize), existing = machine.lanes[tile.index];
      if (stacking && existing && (existing.material !== item.material || Boolean(existing.preheated) !== Boolean(item.preheated)
        || Boolean(existing.burnished) !== Boolean(item.burnished)
        || (existing.lateral ?? null) !== lateral)) return 0;
      if (!this.conveyorPowered(machine, tile.x, tile.y) || this.slotBusy(tile.x, tile.y, elevated, stacking ? existing : item)) return 0;
      if (lateral) {
        const v = D.vectors[tile.direction], sign = Math.sign(lateral);
        const partner = this.conveyorAt(tile.x - v.y * sign, tile.y + v.x * sign, elevated);
        if (!partner || partner.tile.direction !== tile.direction || !this.conveyorPowered(partner.machine, partner.tile.x, partner.tile.y)
          || this.slotBusy(partner.tile.x, partner.tile.y, elevated, stacking ? existing : item)) return 0;
      }
      const capacity = stacking ? this.stackTarget(machine, item) - (existing?.quantity ?? 0)
        : Math.floor(conveyorWeightLimit(machine, this.state) / D.materials[item.material].weight);
      if (stacking && existing && item.quantity > capacity + epsilon) {
        return this.receiveStackerBatch(machine, item, tile, consume);
      }
      const quantity = !stacking && !machineOutput && item.quantity > capacity + epsilon
        ? 0 : Math.max(0, Math.min(item.quantity, capacity));
      if (consume && quantity > epsilon) {
        const received = { ...copy(item), quantity, progress: 0, fresh: true };
        delete received.lateral;
        if (lateral) received.lateral = lateral;
        if (stacking && existing) {
          const combined = combineCargo([existing, received]);
          Object.assign(existing, combined, { progress: existing.progress });
        } else machine.lanes[tile.index] = received;
      }
      return quantity;
    }
    receiveStackerBatch(machine, item, tile, consume) {
      const existing = machine.lanes[tile.index], target = this.stackTarget(machine, item);
      // A ready Stacker can combine and dispatch a full batch atomically. It
      // never parks more than its target inside, or splits an incoming pair
      // just to fill the last free place in a partial stack.
      if (existing.progress < 1 - epsilon || target <= 0 || existing.quantity > target + epsilon
        || this.activeStackTransfers?.has(machine.id)) return 0;
      const quantity = Math.min(item.quantity, target);
      const combined = combineCargo([existing, { ...item, quantity }]);
      if (combined.quantity + epsilon < target) return 0;
      const outgoing = { ...copy(combined), quantity: target, progress: 0 };
      if (existing.lateral) outgoing.lateral = existing.lateral;
      this.activeStackTransfers ??= new Set();
      this.activeStackTransfers.add(machine.id);
      try {
        const accepted = this.sendOutput(machine, outgoing, tile, false);
        if (accepted <= epsilon || combined.quantity - accepted > target + epsilon) return 0;
        if (consume) {
          this.sendOutput(machine, outgoing, tile);
          machine.lanes[tile.index] = { ...combined, quantity: combined.quantity - accepted, progress: 0, fresh: true };
          if (existing.lateral) machine.lanes[tile.index].lateral = existing.lateral;
        }
        return quantity;
      } finally { this.activeStackTransfers.delete(machine.id); }
    }
    receiveCentered(item, point, direction, consume = true, elevated = false, fromId = null, machineOutput = false) {
      const v = D.vectors[direction], perpendicular = { x: -v.y, y: v.x };
      const positions = [-0.5, 0.5].map((offset) => ({
        x: Math.round(point.x + perpendicular.x * offset), y: Math.round(point.y + perpendicular.y * offset),
      }));
      const slots = positions.map((cell) => this.conveyorAt(cell.x, cell.y, elevated));
      const allowed = (slot) => slot.machine.id === fromId || (["belt", "electricConveyor"].includes(slot.machine.type)
        ? slot.tile.direction !== opposite(direction)
        : ports(slot.machine).some((entry) => entry.role === "input" && entry.x === slot.tile.x
          && entry.y === slot.tile.y && entry.direction === opposite(direction)));
      if (slots.every(Boolean)) {
        const feeds = slots.map((slot, index) => {
          const step = D.vectors[slot.tile.direction], other = slots[1 - index].tile;
          return slot.tile.x + step.x === other.x && slot.tile.y + step.y === other.y;
        });
        if (feeds[0] !== feeds[1]) {
          const front = slots[feeds[0] ? 1 : 0];
          if (front.tile.direction === opposite(direction) || !allowed(front)) return 0;
          return this.receiveConveyor(front.machine, item, front.tile, consume, null, machineOutput);
        }
        if (feeds[0] || slots[0].tile.direction !== slots[1].tile.direction
          || slots[0].tile.direction === opposite(direction) || !slots.every(allowed)) return 0;
        return this.receiveConveyor(slots[0].machine, item, slots[0].tile, consume, 0.5, machineOutput);
      }
      // A single wide machine can cover the complete outlet (for example Sell Tube).
      const targets = positions.map((cell) => this.at.get(key(cell.x, cell.y)));
      if (targets[0] && targets[0] === targets[1] && !D.machines[targets[0].type].conveyors) {
        for (const position of positions) {
          if (this.receive(targets[0], item, position.x, position.y, opposite(direction), false) > epsilon) {
            return this.receive(targets[0], item, position.x, position.y, opposite(direction), consume);
          }
        }
      }
      return 0;
    }
    receive(machine, item, x, y, incomingSide, consume = false, machineOutput = false) {
      if (!validCargo(item) || (D.materials[item.material].fluid && !D.machines[machine.type].molder && !D.machines[machine.type].fluidInput)) return 0;
      const input = ports(machine).find((point) => point.role === "input" && point.x === x && point.y === y
        && (!incomingSide || point.direction === incomingSide));
      if (D.materials[item.material].directTransferOnly && !(input?.channel === "dish" && D.machines[machine.type].plateRecipes?.[item.material])) return 0;
      let quantity = 0;
      if (collectorCapacity(machine) && (machine.type === "basket" || input)) {
        quantity = Math.max(0, Math.min(item.quantity, this.collectorCapacity(machine) - this.total(machine, "contents")));
        if (consume && quantity > epsilon) {
          const existing = machine.contents.find((entry) => sameCargo(entry, item));
          if (existing) existing.quantity += quantity;
          else machine.contents.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (machine.type === "sellTube" && D.materials[item.material].value !== null) {
        quantity = item.quantity;
        if (consume) {
          const amount = this.sell([item]);
          if (amount > 0) {
            this.saleTexts.push({ amount, x: machine.x + size(machine).width / 2, y: machine.y, created: this.state.seconds });
            if (this.saleTexts.length > 64) this.saleTexts.shift();
          }
        }
      } else if (machine.type === "fiber" && input && item.material === "leek") {
        quantity = Math.max(0, Math.min(Math.floor(item.quantity + epsilon), machineBulk(this.state, machine) - this.total(machine, "input")));
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (D.machines[machine.type].molder && input && moldingProduct(item.material)
        && machine.input.every((entry) => entry.material === item.material)) {
        quantity = Math.max(0, Math.min(item.quantity, D.machines[machine.type].inputLimit * machineBulk(this.state, machine) - this.total(machine, "input")));
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (D.machines[machine.type].formingModes && input) {
        const definition = D.machines[machine.type], recipe = this.craftRecipe(machine, item);
        if (recipe && machine.input.every((entry) => entry.material === item.material)) {
          quantity = Math.max(0, Math.min(item.quantity, Math.min(definition.inputLimit, recipe.input) * machineBulk(this.state, machine) - this.total(machine, "input")));
          if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (D.machines[machine.type].craftInput && input && item.material === D.machines[machine.type].craftInput) {
        quantity = Math.max(0, Math.min(Math.floor(item.quantity + epsilon), D.machines[machine.type].inputLimit * machineBulk(this.state, machine) - this.total(machine, "input")));
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (machine.type === "gradingBench" && input && gradeProbabilities(item)) {
        if (!machine.input.length) {
          quantity = Math.min(item.quantity, Math.floor(D.machines.gradingBench.inputWeightLimit / D.materials[item.material].weight));
          if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (D.machines[machine.type].plateRecipes && input) {
        const recipes = D.machines[machine.type].plateRecipes;
        const dish = machine.input.find(entry => Object.hasOwn(recipes, entry.material));
        const isDish = input.channel === "dish" && Object.hasOwn(recipes, item.material) && (!dish || dish.material === item.material);
        if (!isDish && !(input.channel === "plate" && input.material === item.material)) return 0;
        const required = machineBulk(this.state, machine);
        const waiting = this.total(machine, "input", item.material);
        quantity = Math.max(0, Math.min(Math.floor(item.quantity + epsilon), required - waiting));
        if (consume && quantity) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (machine.type === "paintingBench" && input) {
        const expected = input.channel === "pot" ? "pot" : input.channel === "malachite" ? "malachitePebble" : null;
        if (item.material === expected) {
          const existing = machine.input.filter((entry) => entry.material === expected).reduce((sum, entry) => sum + entry.quantity, 0);
          quantity = Math.max(0, Math.min(Math.floor(item.quantity + epsilon), machineBulk(this.state, machine) - existing));
          if (consume && quantity) machine.input.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (D.machines[machine.type].heatCapacity && input) {
        const definition = D.machines[machine.type];
        const feedRecipe = definition.oven ? null : thermalRecipeEntry(definition, item.material)?.[1];
        const fuelHeat = D.materials[item.material].heat;
        if (definition.oven && input.channel !== "fuel") {
          const recipe = Object.values(definition.recipes).find(entry => {
            const index = Object.keys(entry.inputs).indexOf(item.material);
            return index >= 0 && input.channel === `ingredient${index + 1}` && machine.input.every(waiting => Object.hasOwn(entry.inputs, waiting.material));
          });
          if (recipe && !(recipe.preheats && item.preheated)) {
            quantity = Math.max(0, Math.min(Math.floor(item.quantity), recipe.inputs[item.material] * machineBulk(this.state, machine) - this.total(machine, "input", item.material)));
            if (consume && quantity) machine.input.push({ ...copy(item), quantity, progress: 0 });
          }
        } else if (input.channel === "material" && feedRecipe && !(definition.preheats && item.preheated)
          && machine.input.every((entry) => entry.material === item.material)) {
          quantity = Math.max(0, Math.min(Math.floor(item.quantity), feedRecipe.input * machineBulk(this.state, machine) - this.total(machine, "input")));
          if (consume && quantity > 0) machine.input.push({ ...copy(item), quantity, progress: 0 });
        } else if (input.channel === "fuel" && Number.isFinite(fuelHeat) && fuelHeat > 0) {
          quantity = Math.max(0, Math.min(Math.floor(item.quantity), Math.floor((this.heatCapacity(machine) - machine.heat + epsilon) / fuelHeat)));
          if (consume && quantity > 0) machine.heat += quantity * fuelHeat;
        }
      } else if (D.machines[machine.type].conveyors && (["belt", "electricConveyor"].includes(machine.type) || input)) {
        if (incomingSide === machine.facing) return 0;
        if (D.machines[machine.type].pressModes && !this.craftRecipe(machine, item)) return 0;
        const tile = conveyorCells(machine).find((cell) => cell.x === x && cell.y === y);
        if (tile) quantity = this.receiveConveyor(machine, item, tile, consume, null, machineOutput);
      }
      return Math.max(0, quantity);
    }
    laneIndex(machine, x, y) {
      return conveyorCells(machine).findIndex((point) => point.x === x && point.y === y);
    }
    receivePressInput(machine, item, consume = false) {
      const definition = D.machines[machine.type];
      if (!this.craftRecipe(machine, item) || machine.input.some((entry) => entry.material !== item.material)) return 0;
      const quantity = Math.max(0, Math.min(Math.floor(item.quantity + epsilon), definition.inputLimit * machineBulk(this.state, machine) - this.total(machine, "input")));
      if (consume && quantity > epsilon) {
        const received = { ...copy(item), quantity, progress: 0 };
        delete received.lateral;
        machine.input.push(received);
      }
      return quantity;
    }
    send(machine, item, output, consume = true, machineOutput = false) {
      const v = D.vectors[output.direction], x = output.x + v.x, y = output.y + v.y;
      if (output.span === 2 || item.lateral) {
        const lateral = item.lateral ?? 0;
        return this.receiveCentered(item, { x: x - v.y * lateral, y: y + v.x * lateral }, output.direction, consume,
          Boolean(D.machines[machine.type].bridge), machine.id, machineOutput);
      }
      const internal = conveyorCells(machine).find((cell) => cell.x === x && cell.y === y);
      if (internal) return D.machines[machine.type].pressModes && internal.index === D.machines[machine.type].processingCell
        ? this.receivePressInput(machine, item, consume) : this.receiveConveyor(machine, item, internal, consume, null, machineOutput);
      const target = (this.occupantsAt.get(key(x, y)) ?? []).find((entry) =>
        !D.machines[entry.type].bridge || ports(entry).some((point) => point.role === "input" && point.x === x && point.y === y
          && point.direction === opposite(output.direction)));
      if (!target || target.id === machine.id) return 0;
      return this.receive(target, item, x, y, opposite(output.direction), consume, machineOutput);
    }
    sendSplitCargo(machine, item, straight) {
      const side = ports(machine).find(point => point.channel === "split");
      const exits = machine.splitterSideNext ? [side, straight] : [straight, side];
      for (const exit of exits) {
        const accepted = exit === side
          ? this.sendOutput(machine, item.lateral ? { ...item, lateral: undefined } : item, exit)
          : this.send(machine, item, exit);
        if (accepted <= epsilon) continue;
        machine.splitterSideNext = exit === straight;
        return accepted;
      }
      return 0;
    }
    receiveOutputConveyor(machine, item, tile) {
      return this.receiveConveyor(machine, item, tile, true, null, true);
    }
    sendOutput(machine, item, output, consume = true) {
      return this.send(machine, item, output, consume, !D.materials[item.material].fluid);
    }
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      // Fixed small steps keep timers and transport independent of wall-clock/UI frame rate.
      let remaining = Math.min(seconds, 60);
      while (remaining > epsilon) {
        const step = Math.min(remaining, 0.1); this.step(step); remaining -= step;
      }
    }
    step(seconds) {
      const state = this.state;
      const machineSeconds = seconds * (cheatEnabled(state, "machineSpeed") ? 10 : 1);
      const resourceMultiplier = cheatEnabled(state, "resources") ? 10 : 1;
      state.seconds += seconds;
      // Visual-only, bounded feedback: never saved, replayed, or used for cash accounting.
      if (this.saleTexts.length) this.saleTexts = this.saleTexts.filter((entry) => state.seconds - entry.created < 1.2);
      state.clickTokens = Math.min(1, state.clickTokens + seconds * D.config.clicksPerSecond);
      for (const well of state.machines) if (D.machines[well.type].waterSource && well.waterSchedule.length) {
        const definition = D.machines[well.type]; well.waterTimer += machineSeconds;
        while (well.waterTimer + epsilon >= definition.waterSeconds) {
          well.waterTimer = Math.max(0, well.waterTimer - definition.waterSeconds);
          const entry = well.waterSchedule[well.waterNext], target = this.byId.get(entry.targetId);
          if (target && this.waterDropoffInRange(well, target, entry.index)) target.water = Math.max(target.water, Math.min(this.waterCapacity(target), target.water + definition.waterDelivery));
          well.waterNext = (well.waterNext + 1) % well.waterSchedule.length;
        }
      }
      // Arrivals cannot traverse a second belt during the same simulation step.
      const oldLanes = this.transportOrder.flatMap(({ machine, lane }) => {
        const item = machine.lanes[lane];
        return item ? [{ machine, lane, item }] : [];
      });
      for (const machine of state.machines) {
        const definition = D.machines[machine.type];
        if (definition.batchOutputs) {
          if ((definition.outputOverflow || !machine.output.length)
            && (!definition.requiresKinetic || this.kineticHasWheel(machine))
            && (!definition.electricPower || !this.electricity.shortage)) {
            machine.timer += machineSeconds;
            if (machine.timer + epsilon >= definition.cycle) {
              machine.timer = Math.max(0, machine.timer - definition.cycle);
              if (definition.batchModes) {
                const { soil, chert } = definition.batchOutputs;
                machine.output.push(cargo("soil", soil * resourceMultiplier));
                if (machine.mode === "soil") machine.output.push({ ...cargo("soil", soil * resourceMultiplier), sifterSlot: 1 });
                else if (machine.mode === "malachite") {
                  if (random(state) < definition.malachiteChance) machine.output.push(cargo("malachitePebble", resourceMultiplier));
                } else machine.output.push(cargo("chert", chert * resourceMultiplier));
              } else for (const [material, quantity] of Object.entries(definition.batchOutputs)) {
                if (definition.outputOverflow === "discardExcess") {
                  const current = machine.output.find((item) => item.material === material);
                  const available = Math.max(0, quantity * resourceMultiplier - (current?.quantity ?? 0));
                  if (available > epsilon) {
                    if (current) current.quantity += available;
                    else machine.output.push(cargo(material, available));
                  }
                } else machine.output.push(cargo(material, quantity * resourceMultiplier));
              }
            }
          }
        } else if (definition.source || definition.sourceModes) {
          const cycle = definition.cycle, limit = (definition.outputLimit ?? 1) * resourceMultiplier;
          if ((!definition.requiresKinetic || this.kineticHasWheel(machine))
            && (!definition.waterPerBatch || machine.water + epsilon >= definition.waterPerBatch)
            && (!definition.singleBatchOutput || !machine.output.length)
            && this.total(machine, "output") + (definition.sourceQuantity ?? 1) * resourceMultiplier <= limit + epsilon) {
            machine.timer += machineSeconds;
            if (machine.timer + epsilon >= cycle) {
              machine.timer = Math.max(0, machine.timer - cycle);
              if (definition.waterPerBatch) machine.water = Math.max(0, machine.water - definition.waterPerBatch);
              machine.output.push(cargo(definition.source ?? machine.mode, (definition.sourceQuantity ?? 1) * resourceMultiplier));
            }
          }
        } else if (machine.type === "fiber") {
          if (machine.job) {
            machine.job.remaining -= machineSeconds;
            if (machine.job.remaining <= epsilon && this.total(machine, "output") === 0) {
              const quantity = 2 * (machine.job.bulk ?? 1);
              machine.output.push(cargo("leekFiber", quantity, machine.job.input.value));
              state.producedFiber += quantity; machine.job = null;
            }
          }
          if (!machine.job && this.total(machine, "input") >= machineBulk(state, machine) && this.total(machine, "output") === 0) {
            const bulk = machineBulk(state, machine);
            machine.job = { input: combineCargo(this.takeInput(machine, bulk)), ...(bulk > 1 ? { bulk } : {}), remaining: D.config.fiberSeconds };
          }
        } else if (isCrafter(definition) && machine.job) {
          const speed = definition.dualPower ? (machine.powerSource === "electric" ? 2 : 1) : (definition.pressModes || definition.kineticPairSpeed) ? this.pressPower(machine).speed : 1;
          if ((!definition.requiresKinetic || this.kineticHasWheel(machine)) && (!definition.dualPower || this.dualPowered(machine))) machine.job.remaining = Math.max(0, machine.job.remaining - machineSeconds * speed);
          this.finishShaping(machine);
        } else if (machine.type === "gradingBench" && machine.job) {
          machine.job.remaining = Math.max(0, machine.job.remaining - machineSeconds);
          if (machine.job.remaining <= epsilon && !machine.output.length) {
            let grade = "Already graded";
            const product = gradeStack(state, machine.job.input, (name) => { grade = name; });
            machine.output.push(product); this.recordOutput(machine, product, grade); machine.job = null;
          }
        } else if (definition.plateRecipes && !machine.output.length) {
          const dishType = machine.input.find(item => Object.hasOwn(definition.plateRecipes, item.material))?.material;
          const recipe = definition.plateRecipes[dishType], bulk = machineBulk(state, machine);
          const ingredients = recipe && Object.entries(recipe.inputs);
          if (ingredients?.every(([material, quantity]) => this.total(machine, "input", material) >= quantity * bulk)) {
            const inputs = ingredients.map(([material, quantity]) => combineCargo(this.takeInput(machine, quantity * bulk, material)));
            const dish = inputs.find(item => item.material === recipe.valueIngredient);
            machine.output.push(blendGradeRepairs(cargo(recipe.output, bulk, dish.value * recipe.valueMultiplier), [dish]));
          }
        } else if (machine.type === "paintingBench") {
          if (machine.job) machine.job.remaining = Math.max(0, machine.job.remaining - machineSeconds);
          this.finishPainting(machine); this.startPainting(machine);
        } else if (definition.heatCapacity) {
          machine.outputCooldown = Math.max(0, machine.outputCooldown - seconds);
          if (machine.job) machine.job.remaining = Math.max(0, machine.job.remaining - machineSeconds);
          this.finishKiln(machine);
          // A previous finished batch may unload while the next one fires.
          this.startKiln(machine);
        }
        if (!definition.heatCapacity && machine.type !== "gradingBench" && !definition.batchOutputs && !definition.outputBuffer && machine.output.length) {
          joinBufferedOutput(machine.output);
          const item = machine.output[0];
          for (const output of ports(machine).filter((point) => point.role === "output")) {
            item.quantity -= this.sendOutput(machine, item, output);
            if (item.quantity <= epsilon) { machine.output.shift(); break; }
          }
        }
        if (machine.type === "fiber" && !machine.job && this.total(machine, "input") >= machineBulk(state, machine) && this.total(machine, "output") === 0) {
          const bulk = machineBulk(state, machine);
          machine.job = { input: combineCargo(this.takeInput(machine, bulk)), ...(bulk > 1 ? { bulk } : {}), remaining: D.config.fiberSeconds };
        }
        if (isCrafter(definition)) this.startShaping(machine);
      }
      for (const { machine, lane, item } of oldLanes) {
        if (machine.lanes[lane] !== item) continue;
        const output = conveyorCells(machine)[Number(lane)];
        if (!output || !this.conveyorPowered(machine, output.x, output.y)) continue;
        if (item.lateral) {
          const v = D.vectors[output.direction], sign = Math.sign(item.lateral);
          const partner = this.conveyorAt(output.x - v.y * sign, output.y + v.x * sign, Boolean(D.machines[machine.type].bridge));
          if (!partner || partner.tile.direction !== output.direction || !this.conveyorPowered(partner.machine, partner.tile.x, partner.tile.y)) continue;
        }
        const before = item.progress;
        item.progress = Math.min(1, item.progress + seconds * (cheatEnabled(state, "conveyorSpeed") ? 5 : 1) / conveyorSeconds(machine));
        if (machine.type === "primitive" && before + epsilon < 0.5 && item.progress + epsilon >= 0.5 && D.materials[item.material].value !== null) {
          const { primitiveBonus, primitiveLimit } = state.tuning;
          if (item.value + epsilon < primitiveLimit) {
            setCargoValue(item, item.value + primitiveBonus);
            item.upgrades.primitive = (item.upgrades.primitive ?? 0) + 1;
          }
        }
        if (output.upgrade && before + epsilon < 0.5 && item.progress + epsilon >= 0.5
          && (!D.machines[machine.type].requiresKinetic || this.kineticHasWheel(machine))) applyCashEffect(item, machine.type);
        if ((machine.type === "primitive" || output.upgrade) && before + epsilon < 0.5 && item.progress + epsilon >= 0.5) this.recordOutput(machine, item);
        if (item.progress >= 1 - epsilon && (!D.machines[machine.type].maxStackSize
          || item.quantity + epsilon >= this.stackTarget(machine, item))) {
          const stacking = Boolean(D.machines[machine.type].maxStackSize);
          const outgoing = stacking ? { ...copy(item), quantity: Math.min(item.quantity, this.stackTarget(machine, item)) } : item;
          const externalOutput = !["belt", "electricConveyor"].includes(machine.type)
            && ports(machine).some(point => point.role === "output" && point.x === output.x && point.y === output.y && point.direction === output.direction);
          const accepted = machine.type === "manualSplitter" && Number(lane) === 0
            ? this.sendSplitCargo(machine, outgoing, output)
            : this.send(machine, outgoing, output, true, externalOutput);
          item.quantity -= accepted;
          if (stacking && accepted > epsilon) item.progress = 0;
          if (item.quantity <= epsilon) delete machine.lanes[lane];
        }
      }
      // A buffered shaping bench can work while one finished item waits. Let
      // its departing conveyor cargo clear before unloading and queueing work.
      for (const machine of state.machines) if (isCrafter(D.machines[machine.type])
        && D.machines[machine.type].outputBuffer) this.unloadShaping(machine);
      // Belts release their old cargo first: a Kiln must not see its own
      // departing product as a blockage and lose an extra tick every output.
      for (const machine of state.machines) if (D.machines[machine.type].heatCapacity) this.unloadKiln(machine);
      // Liquid deliveries arrive after solid belts unload. Queue molding in
      // this same step rather than spending another tick waiting to start.
      for (const machine of state.machines) if (D.machines[machine.type].molder || D.machines[machine.type].fluidInput) this.startShaping(machine);
      for (const machine of state.machines) if (machine.type === "gradingBench") this.unloadGrader(machine);
      for (const machine of state.machines) if (machine.type === "paintingBench") this.unloadPainting(machine);
      // Like the Kiln, batch sources must not lose throughput by seeing their
      // own departing belt cargo as a blocked outlet on the next cycle.
      for (const machine of state.machines) if (D.machines[machine.type].batchOutputs) this.unloadBatchSource(machine);
      // Old saves can contain one heavier stack per belt cell. Keep its
      // remainder on that instance and release legal portions without bursts.
      for (const machine of state.machines) for (const [lane, item] of Object.entries(machine.beltRemainders ?? {})) {
        if (machine.lanes[lane]) continue;
        const quantity = Math.min(item.quantity, Math.floor(conveyorWeightLimit(machine, state) / D.materials[item.material].weight));
        machine.lanes[lane] = { ...copy(item), quantity, progress: 0, fresh: true };
        item.quantity -= quantity;
        if (item.quantity <= epsilon) delete machine.beltRemainders[lane];
        if (!Object.keys(machine.beltRemainders).length) delete machine.beltRemainders;
      }
    }
    status(machine) {
      const definition = D.machines[machine.type];
      const timeScale = cheatEnabled(this.state, "machineSpeed") ? 10 : 1;
      if (definition.dualPower) {
        if (!this.dualPowered(machine)) return machine.powerSource === "electric" ? "Electricity shortage · paused" : "Waiting for Heavy Hamster Wheel";
        return machine.job ? `Sawing · ${formatNumber(machine.job.remaining / ((machine.powerSource === "electric" ? 2 : 1) * timeScale))}s` : "Ready to saw Wood";
      }
      if (machine.conveyorUpgrade === "electricConveyor") {
        if (this.electricity.shortage) return `Electricity shortage · ${formatNumber(this.electricity.demand)}u demand / ${formatNumber(this.electricity.supply)}u supply · paused`;
        if (definition.requiresKinetic && !this.kineticHasWheel(machine)) return "Basic Conveyors powered · upgrade waiting for kinetic power";
        return "Basic Conveyors powered";
      }
      if (definition.kineticInputsRequired && !this.kineticHasWheel(machine)) {
        return `Waiting for kinetic connections · ${this.kineticConnections.get(machine.id)?.length ?? 0} / ${definition.kineticInputsRequired}`;
      }
      if (definition.electricOutput) return `Generating ${formatNumber(definition.electricOutput)}u · factory-wide supply`;
      if (definition.electricPower && definition.batchOutputs) return this.electricity.shortage
        ? `Electricity shortage · ${formatNumber(this.electricity.demand)}u demand / ${formatNumber(this.electricity.supply)}u supply · paused`
        : `Extracting · ${formatNumber(Math.max(0, definition.cycle - machine.timer) / timeScale)}s · ${formatNumber(definition.electricPower)}u`;
      if (definition.electricPower) return this.electricity.shortage
        ? `Electricity shortage · ${formatNumber(this.electricity.demand)}u demand / ${formatNumber(this.electricity.supply)}u supply · paused`
        : `Electric power available · ${formatNumber(definition.electricPower)}u`;
      if (definition.waterPerBatch && !machine.job && !machine.output.length && machine.water + epsilon < definition.waterPerBatch * machineBulk(this.state, machine)) return "Waiting for Water";
      if (definition.formingModes) {
        if (machine.job) return machine.job.remaining <= epsilon ? "Output blocked"
          : `Making ${definition.formingModes[machine.job.mode].name} · ${formatNumber(machine.job.remaining / (timeScale * (definition.kineticPairSpeed ? this.pressPower(machine).speed : 1)))}s`;
        if (machine.output.length) return "Output blocked";
        const recipe = this.craftRecipe(machine) ?? definition.formingModes[machine.mode];
        const bulk = machineBulk(this.state, machine);
        if (recipe.water && this.total(machine, "input") + epsilon >= recipe.input * bulk && machine.water + epsilon < recipe.water * bulk) {
          return "Waiting for Water";
        }
        const input = recipe.inputName ?? (definition.fluidInput ? "molten metal" : {
          washesTo: "matching rock", cutsTo: "Leek or Peeled Leek",
        }[recipe.materialProperty] ?? "Wire or Fiber");
        return `Waiting for ${recipe.input * machineBulk(this.state, machine)} ${input} · ${formatNumber(this.total(machine, "input"))} / ${recipe.input * machineBulk(this.state, machine)}`;
      }
      if (D.machines[machine.type].pressModes) {
        const power = this.pressPower(machine), mode = D.machines[machine.type].pressModes[machine.mode];
        if (!power.speed) return `Waiting for two kinetic connections · ${power.connections} / 2 · Basic Wheels must be dedicated`;
        const speed = power.speed === 2 ? "Adjacent pair · 2× speed" : "2 kinetic connections · normal speed";
        if (machine.job) return machine.job.remaining <= epsilon ? `Output blocked · ${speed}`
          : `Pressing · ${formatNumber(machine.job.remaining / (power.speed * timeScale))}s · ${speed}`;
        if (machine.output.length) return `Output blocked · ${speed}`;
        const bulk = machineBulk(this.state, machine);
        return bulk === 1 ? `Waiting for ${mode.name === "Plates" ? "ingots" : "two matching Plates"} · ${speed}`
          : `Waiting for ${mode.input * bulk} ${mode.name === "Plates" ? "matching ingots" : "matching Plates"} · ${speed}`;
      }
      if (D.machines[machine.type].craftInput && D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine)) return "Waiting for kinetic power";
      if (D.machines[machine.type].maxStackSize) {
        if (!this.powered(machine.x, machine.y)) return "Waiting for kinetic power";
        const item = machine.lanes[0];
        return item ? `Stacking · ${formatNumber(item.quantity)} / ${this.stackTarget(machine, item)}` : `Waiting for items · size ${machine.stackSize}`;
      }
      if (machine.type === "gradingBench") {
        if (machine.job) return `Grading · ${formatNumber(machine.job.remaining / timeScale)}s`;
        if (machine.output.length) return `Output blocked · ${gradeLabel(machine.output[0])}`;
        return `Waiting for a gradeable item · ${formatNumber(definition.secondsPerWeight / timeScale)}s per weight`;
      }
      if (machine.type === "paintingBench") {
        if (machine.job) return machine.job.remaining <= epsilon ? "Output blocked" : `Painting · ${formatNumber(machine.job.remaining / timeScale)}s`;
        if (machine.output.length) return "Output waiting";
        const bulk = machineBulk(this.state, machine);
        if (machine.input.filter((item) => item.material === "pot").reduce((sum, item) => sum + item.quantity, 0) < bulk) return bulk === 1 ? "Waiting for a fired Pot" : `Waiting for ${bulk} fired Pots`;
        if (machine.input.filter((item) => item.material === "malachitePebble").reduce((sum, item) => sum + item.quantity, 0) < bulk) return bulk === 1 ? "Waiting for a Malachite Pebble" : `Waiting for ${bulk} Malachite Pebbles`;
        return "Waiting for Water";
      }
      if (definition.plateRecipes) {
        if (machine.output.length) return "Output waiting";
        const bulk = machineBulk(this.state, machine);
        const dishType = machine.input.find(item => Object.hasOwn(definition.plateRecipes, item.material))?.material;
        if (!dishType) return "Waiting for food";
        const missing = Object.entries(definition.plateRecipes[dishType].inputs).find(([material, quantity]) => this.total(machine, "input", material) < quantity * bulk);
        return missing ? `Waiting for ${D.materials[missing[0]].name}` : "Ready to plate";
      }
      if (machine.type === "wheatPlanter") {
        const resourceMultiplier = cheatEnabled(this.state, "resources") ? 10 : 1;
        const freeOutput = definition.outputLimit * resourceMultiplier - this.total(machine, "output");
        return freeOutput + epsilon < definition.sourceQuantity * resourceMultiplier
          ? "Output waiting" : `Next Wheat in ${formatNumber((definition.cycle - machine.timer) / timeScale)}s`;
      }
      if (machine.type === "limestoneDrill") return this.kineticHasWheel(machine)
        ? `Extracting · ${formatNumber(Math.max(0, definition.cycle - machine.timer) / timeScale)}s`
        : "Waiting for a Heavy Hamster Wheel connection";
      if (D.machines[machine.type].batchOutputs) {
        if (machine.output.length) return "Output blocked";
        if (D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine)) return "Waiting for kinetic power";
        return `Sifting · ${formatNumber(Math.max(0, D.machines[machine.type].cycle - machine.timer) / timeScale)}s`;
      }
      if (machine.type === "copperDrill" || machine.type === "graphiteDrill") return machine.output.length ? "Output blocked"
        : !this.kineticHasWheel(machine) ? "Waiting for kinetic power" : `Extracting ${D.materials[definition.source].name} · ${formatNumber((definition.cycle - machine.timer) / timeScale)}s`;
      if (machine.type === "clayPit") return machine.output.length ? "Output blocked" : `Digging Clay · ${(Math.max(0, D.machines.clayPit.cycle - machine.timer) / timeScale).toFixed(1)}s`;
      if (D.machines[machine.type].sourceModes) return machine.output.length ? "Output blocked"
        : D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine) ? "Waiting for kinetic power"
        : `Extracting ${D.materials[machine.mode].name} · ${(Math.max(0, D.machines[machine.type].cycle - machine.timer) / timeScale).toFixed(1)}s`;
      if (machine.type === "wheel") return "Kinetic source · two outputs at long-edge centers";
      if (machine.type === "heavyWheel") return "Kinetic source · two pairs of outputs · 2 crew";
      if (machine.type === "drive") {
        const area = this.powerArea(machine);
        return this.driveHasWheel(machine) ? `Powered · ${area.width}×${area.height} coverage` : "Connect its facing intake to a wheel output";
      }
      if (collectorCapacity(machine)) return `${formatNumber(this.total(machine, "contents"))} / ${this.collectorCapacity(machine)} items`;
      if (D.machines[machine.type].conveyors) return conveyorCells(machine)
        .every((point) => this.conveyorPowered(machine, point.x, point.y)) ? "Kinetic power available" : "Waiting for kinetic power";
      if (D.machines[machine.type].heatCapacity) {
        if (machine.job) return machine.job.remaining <= epsilon ? "Output blocked" : `${definition.preheats ? "Preheating" : "Firing"} · ${formatNumber(machine.job.remaining / timeScale)}s`;
        if (machine.type !== "kiln" && machine.output.length) return D.materials[machine.output[0].material].fluid
          ? `${D.materials[machine.output[0].material].name} waiting for molding` : "Output waiting";
        const recipe = this.furnaceRecipe(machine);
        if (!recipe) return "Waiting for material";
        const bulk = machineBulk(this.state, machine);
        if (definition.oven) {
          const missing = Object.entries(recipe.inputs).find(([material, amount]) => this.total(machine, "input", material) < amount * bulk);
          return missing ? `Waiting for ${D.materials[missing[0]].name}` : `Waiting for heat · ${formatNumber(recipe.heat * bulk)}u required`;
        }
        if (this.total(machine, "input") < recipe.input * bulk) return `Waiting for a full batch · ${this.total(machine, "input")} / ${recipe.input * bulk}`;
        const seconds = recipe.preheatedSeconds && machine.input.every((item) => item.preheated) ? recipe.preheatedSeconds : recipe.seconds;
        return `Waiting for heat · ${formatNumber(seconds * (recipe.heatPerSecond ?? D.machines[machine.type].heatPerSecond) * bulk)}u required`;
      }
      if (machine.job) return machine.job.remaining <= epsilon && isCrafter(D.machines[machine.type])
        ? "Output blocked" : `Processing · ${(Math.max(0, machine.job.remaining) / timeScale).toFixed(1)}s`;
      if (machine.output.length) return "Output waiting";
      if (machine.type === "fiber") return "Waiting for a Leek · hand operated";
      if (D.machines[machine.type].molder) return "Waiting for liquid metal";
      if (machine.type === "clayShaper") return `Waiting for ${D.machines.clayShaper.recipes[machine.mode].input} Clay · hand operated`;
      if (D.machines[machine.type].craftInput) return `Waiting for ${D.machines[machine.type].recipes[machine.mode].input * machineBulk(this.state, machine)} ${D.materials[D.machines[machine.type].craftInput].name}`;
      if (machine.type === "logger") return `Next Wood in ${(Math.max(0, D.config.loggerSeconds - machine.timer) / timeScale).toFixed(1)}s`;
      if (machine.type === "planter") return `Next Leek in ${(Math.max(0, D.config.planterSeconds - machine.timer) / timeScale).toFixed(1)}s`;
      return "Ready";
    }
    exportSave() { return JSON.stringify({ kind: D.saveKind, version: D.saveVersion, state: this.state }); }
    static importSave(text) {
      const payload = JSON.parse(text);
      if (payload?.kind !== D.saveKind || payload.version !== D.saveVersion || payload.state?.kind !== D.saveKind) throw new Error("This is not a no-ammo factory save. Existing mine saves are kept separate.");
      const state = copy(payload.state), base = createState(1);
      const overflowPlaced = (state.machines ?? []).filter(machine => machine.type === "manualOverflow");
      const overflowStored = (state.storedMachines ?? []).filter(machine => machine.type === "manualOverflow");
      const overflowStock = state.stock?.manualOverflow ?? 0;
      if (!Number.isSafeInteger(overflowStock) || overflowStock < overflowStored.length) throw new Error("Invalid Manual Overflow stock.");
      const retiredOverflows = overflowStock + overflowPlaced.length;
      if (retiredOverflows) {
        state.stock.belt += 2 * retiredOverflows;
        state.inventory.wood += 20 * retiredOverflows;
        state.inventory.woodenGear = (state.inventory.woodenGear ?? 0) + 2 * retiredOverflows;
        for (const machine of [...overflowPlaced, ...overflowStored]) {
          const cargo = [...(machine.input ?? []), ...(machine.output ?? []), ...(machine.contents ?? []),
            ...Object.values(machine.lanes ?? {}), ...Object.values(machine.beltRemainders ?? {}), ...jobInputs(machine.job)];
          for (const item of cargo) {
            if (!D.materials[item?.material] || D.materials[item.material].fluid || !Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Invalid Manual Overflow cargo.");
            state.inventory[item.material] = (state.inventory[item.material] ?? 0) + item.quantity;
          }
        }
        state.machines = state.machines.filter(machine => machine.type !== "manualOverflow");
        state.storedMachines = (state.storedMachines ?? []).filter(machine => machine.type !== "manualOverflow");
      }
      if (state.stock) delete state.stock.manualOverflow;
      delete state.manualOverflowVersion;
      const legacyMajorFootprint = (state.runeVersion ?? 0) < 2;
      const legacyDoughFootprint = (state.foodVersion ?? 0) < 6;
      if ((state.playtestVersion ?? 0) < 1) { state.playtest = copy(base.playtest); state.playtestVersion = 1; }
      if (state.playtestVersion < 2 && state.playtest?.toggles && state.playtest?.used) {
        if (!Object.hasOwn(state.playtest.toggles, "machineBulk")) state.playtest.toggles.machineBulk = false;
        if (!Object.hasOwn(state.playtest.used, "machineBulk")) state.playtest.used.machineBulk = false;
        state.playtestVersion = 2;
      }
      if (!state.playtest || typeof state.playtest.unlocked !== "boolean" || !state.playtest.toggles || !state.playtest.used
        || CHEATS.some((id) => typeof state.playtest.toggles[id] !== "boolean" || typeof state.playtest.used[id] !== "boolean"
          || (state.playtest.toggles[id] && !state.playtest.used[id]))
        || Object.keys(state.playtest.toggles).some((id) => !CHEATS.includes(id))
        || Object.keys(state.playtest.used).some((id) => !CHEATS.includes(id))) throw new Error("Invalid playtest settings.");
      if ((state.potShelfVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "potShelf")) state.stock.potShelf = 0;
        if (state.inventory && !Object.hasOwn(state.inventory, "leekCoil")) state.inventory.leekCoil = 0;
        state.potShelfVersion = 1;
      }
      if ((state.plantCutterVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "plantCutter")) state.stock.plantCutter = 0;
        for (const material of ["peeledLeek", "choppedLeek"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        state.plantCutterVersion = 1;
      }
      if ((state.foodVersion ?? 0) < 1) {
        for (const type of ["platingBench", "wheatPlanter", "grainMill"]) {
          if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        }
        for (const material of ["woodenPlate", "leekSalad", "wheat", "flour"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        state.foodVersion = 1;
      }
      if (state.foodVersion < 2) {
        for (const type of ["doughShaper", "primitiveOven"]) {
          if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        }
        for (const material of ["dough", "rawPasta", "unplatedLeekPasta", "leekPasta"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        state.foodVersion = 2;
      }
      if (state.foodVersion < 3) {
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type === "crudeGearBench" && machine.job?.mode === "gear" && Number.isFinite(machine.job.remaining)) {
            machine.job.remaining *= D.machines.crudeGearBench.recipes.gear.seconds / 12;
          }
        }
        state.foodVersion = 3;
      }
      if (state.foodVersion < 4) {
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type === "doughShaper") machine.water = 0;
          if ((machine.type === "doughShaper" || machine.type === "grainMill") && machine.job) {
            machine.job.legacyFoodRecipe = true;
          }
        }
        state.foodVersion = 4;
      }
      if ((state.runeVersion ?? 0) < 1) {
        for (const type of ["minorRunePedestal", "majorRunePedestal"]) {
          if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        }
        state.minorRunes = copy(base.minorRunes);
        if (state.stock?.kiln > 0 || (state.machines ?? []).some(machine => machine.type === "kiln")) state.minorRunes.transmutation = 1;
        state.capitalUnlocked = false;
        state.runeVersion = 1;
      }
      const placedMajorPedestals = (state.machines ?? []).filter(machine => machine.type === "majorRunePedestal").length;
      if (legacyMajorFootprint) {
        if (state.inventory && !Object.hasOwn(state.inventory, "aluminiumBronzePlate")) state.inventory.aluminiumBronzePlate = 0;
        state.freeMajorPedestals = state.stock?.majorRunePedestal + placedMajorPedestals;
        state.runeVersion = 2;
      }
      if (state.runeVersion < 3) {
        if (state.stock && !Object.hasOwn(state.stock, "manualSplitter")) state.stock.manualSplitter = 0;
        state.runeVersion = 3;
      }
      if (!Number.isSafeInteger(state.freeMajorPedestals) || state.freeMajorPedestals < 0
        || state.freeMajorPedestals > state.stock?.majorRunePedestal + placedMajorPedestals) throw new Error("Invalid legacy Major Rune Pedestal count.");
      if (typeof state.capitalUnlocked !== "boolean" || !state.minorRunes
        || Object.keys(state.minorRunes).length !== Object.keys(base.minorRunes).length
        || Object.keys(base.minorRunes).some(category => !Number.isSafeInteger(state.minorRunes[category])
          || state.minorRunes[category] < 0 || state.minorRunes[category] > D.minorRunes[category].length)) {
        throw new Error("Invalid rune progress.");
      }
      if ((state.sawmillVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "sawmill")) state.stock.sawmill = 0;
        if (state.inventory && !Object.hasOwn(state.inventory, "plank")) state.inventory.plank = 0;
        state.sawmillVersion = 1;
      }
      if ((state.paintingVersion ?? 0) < 1) {
        for (const type of ["well", "paintingBench"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        for (const material of ["malachitePebble", "paintedPot"]) if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type === "pebbleSifter" && machine.mode === undefined) machine.mode = "chert";
        }
        state.paintingVersion = 1;
      }
      if ((state.copperWashVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "oreCrushWasher")) state.stock.oreCrushWasher = 0;
        if (state.inventory) { state.inventory.copperOre = state.inventory.nativeCopper ?? 0; state.inventory.nativeCopper = 0; }
        const renameCargo = (value) => {
          if (!value || typeof value !== "object") return;
          if (value.material === "nativeCopper") value.material = "copperOre";
          for (const child of Object.values(value)) renameCargo(child);
        };
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) renameCargo(machine);
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (D.machines[machine.type]?.waterSource) { machine.waterSchedule = []; machine.waterNext = 0; machine.waterTimer = 0; }
        }
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (!D.machines[machine.type]?.waterCapacity) continue;
          const well = (state.machines ?? []).find((entry) => entry.id === machine.waterSourceId && D.machines[entry.type]?.waterSource);
          if (well && machine.waterCarriers > 0 && (state.machines ?? []).includes(machine)) well.waterSchedule.push({ targetId: machine.id, index: 0 });
          delete machine.waterSourceId; delete machine.waterCarriers;
        }
        const assigned = (state.machines ?? []).reduce((sum, machine) => sum + (D.machines[machine.type]?.crew ?? 0), 0);
        if (state.hiredCrew === undefined) state.hiredCrew = 0;
        if (Number.isSafeInteger(state.hiredCrew) && state.hiredCrew >= 0) {
          state.hiredCrew = Math.max(state.hiredCrew, assigned - D.config.startingCrew);
        }
        state.copperWashVersion = 1;
      }
      if ((state.burnisherVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "burnisher")) state.stock.burnisher = 0;
        state.burnisherVersion = 1;
      }
      if ((state.preheaterVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "preheater")) state.stock.preheater = 0;
        state.preheaterVersion = 1;
      }
      if ((state.limestoneDrillVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "limestoneDrill")) state.stock.limestoneDrill = 0;
        if (state.inventory && !Object.hasOwn(state.inventory, "zincOre")) state.inventory.zincOre = 0;
        state.limestoneDrillVersion = 1;
      }
      if ((state.spoolTimingVersion ?? 0) < 1) {
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type !== "windingSpool" || !machine.job) continue;
          const oldSeconds = { coil: 3, winding: 8 }[machine.job.mode];
          if (!oldSeconds || !Number.isFinite(machine.job.remaining) || machine.job.remaining < 0 || machine.job.remaining > oldSeconds) throw new Error("Invalid Winding Spool job.");
          machine.job.remaining *= D.machines.windingSpool.formingModes[machine.job.mode].seconds / oldSeconds;
        }
        state.spoolTimingVersion = 1;
      }
      if ((state.electricityVersion ?? 0) < 1) {
        for (const type of ["electricConveyor", "kineticGenerator", "orangeMetal"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        state.electricityVersion = 1;
      }
      if ((state.wireIndustryVersion ?? 0) < 1) {
        for (const type of ["graphiteDrill", "extruder", "windingSpool"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        for (const material of ["graphite", "copperWire", "copperCoil", "copperWinding"]) if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        state.wireIndustryVersion = 1;
      }
      if (state.wireIndustryVersion < 2) {
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type === "extruder" && machine.job?.input?.quantity === 1) machine.job.legacyExtrusionBatch = true;
        }
        state.wireIndustryVersion = 2;
      }
      if ((state.metalPressVersion ?? 0) < 1) {
        for (const type of ["metalPress", "heavyWheel"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        for (const material of ["copperPlate", "copperGear"]) if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        state.metalPressVersion = 1;
      }
      if ((state.leekDusterVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "leekDuster")) state.stock.leekDuster = 0;
        state.leekDusterVersion = 1;
      }
      if ((state.pebblePileVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "pebblePile")) state.stock.pebblePile = 0;
        state.pebblePileVersion = 1;
      }
      if ((state.copperFinishingVersion ?? 0) < 1) {
        for (const type of ["ingotMolder", "copperChimes"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        if (state.inventory && !Object.hasOwn(state.inventory, "copperIngot")) state.inventory.copperIngot = 0;
        state.copperFinishingVersion = 1;
      }
      if ((state.copperIndustryVersion ?? 0) < 1) {
        for (const type of ["copperDrill", "primitiveFurnace"]) if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        for (const material of ["charcoal", "moltenCopper"]) if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        state.copperIndustryVersion = 1;
      }
      if ((state.graniteProcessorVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "graniteProcessor")) state.stock.graniteProcessor = 0;
        state.graniteProcessorVersion = 1;
      }
      if ((state.crudeGearBenchVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "crudeGearBench")) state.stock.crudeGearBench = 0;
        if (state.inventory && !Object.hasOwn(state.inventory, "woodenGear")) state.inventory.woodenGear = 0;
        state.crudeGearBenchVersion = 1;
      }
      if ((state.potSpinnerVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "potSpinner")) state.stock.potSpinner = 0;
        state.potSpinnerVersion = 1;
      }
      if ((state.primitiveStackerVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "primitiveStacker")) state.stock.primitiveStacker = 0;
        state.primitiveStackerVersion = 1;
      }
      if ((state.settledContentVersion ?? 0) < 1) {
        for (const material of ["granite", "limestone", "corundum", "nativeCopper"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        for (const type of ["primitiveRockDrill", "leekInfuser", "primitiveShack", "primitiveBridge"]) {
          if (state.stock && !Object.hasOwn(state.stock, type)) state.stock[type] = 0;
        }
        state.settledContentVersion = 1;
      }
      if ((state.gradingVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "gradingBench")) state.stock.gradingBench = 0;
        state.gradingVersion = 1;
      }
      if ((state.pebbleSifterVersion ?? 0) < 1) {
        for (const material of ["chert", "soil"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        if (state.stock && !Object.hasOwn(state.stock, "pebbleSifter")) state.stock.pebbleSifter = 0;
        state.pebbleSifterVersion = 1;
      }
      if ((state.starterSiftersVersion ?? 0) < 1) {
        if (state.tuning?.primitiveLimit === 1) state.tuning.primitiveLimit = 0.5;
        // Existing sifters had focus modes. Keep their recipes and placements.
        for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
          if (machine.type === "pebbleSifter") {
            machine.type = "pebbleSifterII";
            machine.mode ??= "chert";
          }
        }
        if (state.stock && Number.isInteger(state.stock.pebbleSifter) && state.stock.pebbleSifter >= 0) {
          state.stock.pebbleSifterII = state.stock.pebbleSifter;
          state.stock.pebbleSifter = 1;
          if (state.stock.wheel === 0 && !(state.machines ?? []).some((machine) => machine.type === "wheel")) state.stock.wheel = 1;
        }
        state.starterSiftersVersion = 1;
      }
      if ((state.brickStorageVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "brickStorage")) state.stock.brickStorage = 0;
        state.brickStorageVersion = 1;
      }
      if ((state.brickSealVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "brickSeal")) state.stock.brickSeal = 0;
        state.brickSealVersion = 1;
      }
      if ((state.kilnVersion ?? 0) < 1) {
        if (state.inventory && !Object.hasOwn(state.inventory, "pot")) state.inventory.pot = 0;
        if (state.stock && !Object.hasOwn(state.stock, "kiln")) state.stock.kiln = 0;
        state.kilnVersion = 1;
      }
      if ((state.clayShapingVersion ?? 0) < 1) {
        for (const material of ["unfiredBrick", "unfiredPot"]) {
          if (state.inventory && !Object.hasOwn(state.inventory, material)) state.inventory[material] = 0;
        }
        if (state.stock && !Object.hasOwn(state.stock, "clayShaper")) state.stock.clayShaper = 0;
        state.clayShapingVersion = 1;
      }
      // New content must not make existing opening saves unreadable. Only new
      // keys receive defaults; invalid/missing older fields still fail validation.
      if (state.inventory && !Object.hasOwn(state.inventory, "clay")) state.inventory.clay = 0;
      if (state.stock && !Object.hasOwn(state.stock, "clayPit")) state.stock.clayPit = 0;
      if (!Object.hasOwn(state, "hiredCrew")) state.hiredCrew = 0;
      if (!Number.isSafeInteger(state.hiredCrew) || state.hiredCrew < 0) throw new Error("Invalid hired crew count.");
      const legacyEconomy = (state.openingEconomyVersion ?? 0) < 1;
      if (legacyEconomy && state.inventory && !Object.hasOwn(state.inventory, "brick")) state.inventory.brick = 0;
      const legacyRoutes = state.routes === undefined ? [] : state.routes;
      if (!Array.isArray(state.machines) || !Array.isArray(state.trees) || !Array.isArray(legacyRoutes)
        || !Array.isArray(state.storedMachines)) throw new Error("Incomplete factory save.");
      if ((state.thermalAutoVersion ?? 0) < 1) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          const definition = D.machines[machine.type];
          if (!definition?.automaticRecipes || machine.mode === undefined) continue;
          if (!Object.hasOwn(definition.recipes, machine.mode)) throw new Error("Invalid legacy furnace mode.");
          delete machine.mode;
        }
        state.thermalAutoVersion = 1;
      }
      delete state.routes;
      if ((state.loggerSpeedVersion ?? 0) < 1) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          if (machine.type === "logger" && Number.isFinite(machine.timer)) machine.timer /= 2;
        }
        state.loggerSpeedVersion = 1;
      }
      if ((state.potSpinnerVersion ?? 0) < 2) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          if (machine.type === "potSpinner" && machine.job && Number.isFinite(machine.job.remaining)) machine.job.remaining *= 8 / 12;
        }
        state.potSpinnerVersion = 2;
      }
      if ((state.heatScaleVersion ?? 0) < 1) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          if (D.machines[machine.type]?.heatCapacity) machine.heat *= 1000;
        }
        state.heatScaleVersion = 1;
      }
      if ((state.gradingVersion ?? 0) < 2) {
        const migrateCargo = (item) => {
          if (!item || typeof item !== "object") return;
          if (!validLegacyGrading(item)) throw new Error("Invalid cargo grading data.");
          if (item.grading) {
            if (item.grading.shares.slice(1).some((share) => share > 0)) item.graded = true;
            delete item.grading;
          }
          // Old averaged counts cannot recover spent eligibility by rounding down.
          for (const [type, count] of Object.entries(item.upgrades ?? {})) {
            if (typeof count === "number" && Number.isFinite(count) && count >= 0) item.upgrades[type] = Math.ceil(count);
          }
        };
        for (const machine of [...state.machines, ...state.storedMachines]) {
          for (const item of [...(machine.input ?? []), ...(machine.output ?? []), ...(machine.contents ?? []),
            ...Object.values(machine.lanes ?? {}), ...jobInputs(machine.job)]) migrateCargo(item);
        }
        for (const route of legacyRoutes) migrateCargo(route.item);
        state.gradingVersion = 2;
      }
      if ((state.graniteProcessorVersion ?? 0) < 2) {
        const migrateProcessorUses = (item) => {
          const uses = item?.upgrades?.graniteProcessor;
          if (uses === undefined) return;
          if (!Number.isSafeInteger(uses) || uses < 0 || uses > 12) throw new Error("Invalid cargo Processor uses.");
          item.upgrades.graniteProcessor = Math.min(uses, D.machines.graniteProcessor.cashEffect.useLimit);
        };
        for (const machine of [...state.machines, ...state.storedMachines]) {
          for (const item of [...(machine.input ?? []), ...(machine.output ?? []), ...(machine.contents ?? []),
            ...Object.values(machine.lanes ?? {}), ...Object.values(machine.beltRemainders ?? {}), ...jobInputs(machine.job)]) migrateProcessorUses(item);
        }
        for (const route of legacyRoutes) migrateProcessorUses(route?.item);
        state.graniteProcessorVersion = 2;
      }
      if ((state.gradeEvolutionVersion ?? 0) < 1) {
        const migrateQuality = (item) => {
          if (!item || typeof item !== "object") return;
          if (Array.isArray(item.gradeProfile) && item.gradeProfile.length === 5) item.gradeProfile.push(0);
          if (!validCargo(item)) throw new Error("Invalid cargo grading data.");
          if (!item.graded && ["brick", "pot"].includes(item.material)) {
            applyGradeTreatment(item, promotionTreatment(D.grades.map((_, i) => i < 4 ? 0.4 : 0)));
          }
        };
        for (const machine of [...state.machines, ...state.storedMachines]) {
          for (const item of [...(machine.input ?? []), ...(machine.output ?? []), ...(machine.contents ?? []),
            ...Object.values(machine.lanes ?? {}), ...Object.values(machine.beltRemainders ?? {}), ...jobInputs(machine.job)]) migrateQuality(item);
        }
        for (const route of legacyRoutes) migrateQuality(route?.item);
        state.gradeEvolutionVersion = 1;
      }
      if ((state.beltCapacityVersion ?? 0) < 1) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          if (machine.beltRemainders !== undefined) throw new Error("Unexpected legacy conveyor remainder.");
          for (const [lane, item] of Object.entries(machine.lanes ?? {})) {
            if (!validCargo(item) || item.quantity * (legacyFoodWeights[item.material] ?? D.materials[item.material].weight) > 5 + epsilon) throw new Error("Invalid legacy conveyor cargo.");
            const capacity = Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight);
            splitOverweightLane(machine, lane, item, capacity);
          }
        }
        state.beltCapacityVersion = 1;
      }
      if (state.foodVersion < 6) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          const limit = conveyorWeightLimit(machine, state);
          for (const [lane, item] of Object.entries(machine.lanes ?? {})) {
            if (Object.hasOwn(legacyFoodWeights, item?.material)) {
              splitOverweightLane(machine, lane, item, Math.floor(limit / D.materials[item.material].weight));
            }
          }
        }
        state.foodVersion = 6;
      }
      for (const field of ["cash", "earned", "seconds", "harvestedWood", "producedFiber", "soldItems"]) {
        if (!Number.isFinite(state[field]) || state[field] < 0) throw new Error(`Invalid ${field}.`);
      }
      for (const material of Object.keys(D.materials)) if (!Number.isFinite(state.inventory?.[material]) || state.inventory[material] < 0
        || (D.materials[material].fluid && state.inventory[material] !== 0)) throw new Error("Invalid material inventory.");
      for (const type of Object.keys(D.machines)) if (!Number.isInteger(state.stock?.[type]) || state.stock[type] < 0) throw new Error("Invalid machine inventory.");
      const ids = new Set();
      for (const machine of [...(state.machines ?? []), ...(state.storedMachines ?? [])]) {
        if (machine.conveyorUpgrade !== undefined && (machine.conveyorUpgrade !== "electricConveyor"
          || !conveyorUpgradeCost(machine.type) || (state.storedMachines ?? []).includes(machine))) throw new Error("Invalid conveyor upgrade.");
      }
      const treeCells = new Set();
      for (const tree of state.trees) {
        if (typeof tree.id !== "string" || ids.has(tree.id) || !Number.isInteger(tree.x) || !Number.isInteger(tree.y)
          || tree.x < 0 || tree.y < 0 || tree.x + 3 > D.config.columns || tree.y + 3 > D.config.rows) throw new Error("Invalid tree.");
        ids.add(tree.id);
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          const position = key(tree.x + dx, tree.y + dy);
          if (treeCells.has(position)) throw new Error("Overlapping trees.");
          treeCells.add(position);
        }
      }
      for (const machine of [...state.machines, ...state.storedMachines]) {
        if (!D.machines[machine.type] || !D.directions.includes(machine.facing) || typeof machine.id !== "string" || ids.has(machine.id)) throw new Error("Invalid or duplicate machine.");
        const maxBulk = D.machines[machine.type].category === "Material" && state.playtest.used.machineBulk ? 10 : 1;
        if (machine.job?.bulk !== undefined && (machine.job.bulk !== 10 || maxBulk !== 10)) throw new Error("Invalid bulk job.");
        if (D.machines[machine.type].dualPower && !["kinetic", "electric"].includes(machine.powerSource)) throw new Error("Invalid power source.");
        if (D.machines[machine.type].waterSource) {
          if (!Array.isArray(machine.waterSchedule) || !Number.isInteger(machine.waterNext) || machine.waterNext < 0
            || (machine.waterSchedule.length ? machine.waterNext >= machine.waterSchedule.length : machine.waterNext !== 0)
            || !Number.isFinite(machine.waterTimer) || machine.waterTimer < 0 || machine.waterTimer >= D.machines[machine.type].waterSeconds + epsilon
            || (state.storedMachines.includes(machine) && machine.waterSchedule.length)
            || machine.waterSchedule.some((entry) => {
              const target = state.machines.find((other) => other.id === entry.targetId);
              return !D.machines[target?.type]?.waterCapacity || !Number.isInteger(entry.index) || entry.index < 0
                || entry.index >= ports(target).filter((point) => point.role === "waterDropoff").length;
            }) || new Set(machine.waterSchedule.map((entry) => `${entry.targetId}:${entry.index}`)).size !== machine.waterSchedule.length) throw new Error("Invalid Well schedule.");
        }
        if (D.machines[machine.type].waterCapacity && (!Number.isFinite(machine.water) || machine.water < 0
          || machine.water > D.machines[machine.type].waterCapacity * maxBulk + epsilon
          || (state.storedMachines.includes(machine) && machine.water !== 0))) throw new Error("Invalid Water buffer.");
        ids.add(machine.id);
        if (!Number.isInteger(machine.x) || !Number.isInteger(machine.y) || !Number.isFinite(machine.timer) || machine.timer < 0) throw new Error("Invalid machine position or timer.");
        if (![machine.input, machine.output, machine.contents].every(Array.isArray) || !machine.lanes || typeof machine.lanes !== "object") throw new Error("Invalid machine buffers.");
        if (machine.beltRemainders !== undefined && (!machine.beltRemainders || typeof machine.beltRemainders !== "object"
          || Array.isArray(machine.beltRemainders))) throw new Error("Invalid conveyor remainders.");
        for (const item of [...machine.input, ...machine.output, ...machine.contents, ...Object.values(machine.lanes),
          ...Object.values(machine.beltRemainders ?? {})]) if (!validCargo(item)) throw new Error("Invalid cargo.");
        if (machine.job && (!D.machines[machine.type].heatCapacity && machine.type !== "paintingBench" && !validCargo(machine.job.input)
          || !Number.isFinite(machine.job.remaining))) throw new Error("Invalid production job.");
        if ([...(D.machines[machine.type].molder || D.machines[machine.type].fluidInput ? [] : machine.input), ...machine.contents, ...Object.values(machine.lanes), ...Object.values(machine.beltRemainders ?? {})]
          .some((item) => D.materials[item.material].fluid)
          || (!D.machines[machine.type].heatCapacity && machine.output.some((item) => D.materials[item.material].fluid))) {
          throw new Error("Liquid metal must stay in its furnace.");
        }
        if (collectorCapacity(machine) && machine.contents.reduce((sum, item) => sum + item.quantity, 0) > collectorCapacity(machine) * (state.playtest.used.storage ? 10 : 1) + epsilon) throw new Error("Collector exceeds capacity.");
        if (machine.type === "fiber" && (machine.input.reduce((sum, item) => sum + item.quantity, 0) > maxBulk + epsilon
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > 2 * maxBulk + epsilon
          || machine.input.some((item) => item.material !== "leek" || !Number.isInteger(item.quantity))
          || machine.output.some((item) => item.material !== "leekFiber")
          || (machine.job && (machine.job.input.material !== "leek" || machine.job.input.quantity !== (machine.job.bulk ?? 1))))) throw new Error("Invalid Fiber buffer.");
        if (!collectorCapacity(machine) && machine.contents.length) throw new Error("Only resource collectors hold collector contents.");
        if (D.machines[machine.type].maxStackSize && (!Number.isInteger(machine.stackSize)
          || machine.stackSize < 1 || machine.stackSize > D.machines[machine.type].maxStackSize
          || Object.keys(machine.lanes).some((lane) => lane !== "0")
          || Object.values(machine.lanes).some((item) => item.quantity > D.machines[machine.type].maxStackSize + epsilon))) {
          throw new Error("Invalid Stacker size or buffer.");
        }
        if (machine.type === "gradingBench") {
          const definition = D.machines.gradingBench;
          const validStack = (item) => gradeProbabilities(item)
            && item.quantity * D.materials[item.material].weight <= definition.inputWeightLimit + epsilon;
          if (machine.input.length > 1 || machine.output.length > 1
            || machine.input.some((item) => !validStack(item)) || machine.output.some((item) => !validStack(item) || !item.graded)
            || (machine.job && (!validStack(machine.job.input) || machine.output.length || machine.job.remaining < 0
              || machine.job.remaining > machine.job.input.quantity * D.materials[machine.job.input.material].weight * definition.secondsPerWeight + epsilon))) throw new Error("Invalid Grading Bench buffer or job.");
        }
        if (D.machines[machine.type].craftInput) {
          const definition = D.machines[machine.type], recipes = definition.recipes, recipe = recipes[machine.job?.mode];
          if (!Object.hasOwn(recipes, machine.mode)
            || machine.input.some((item) => item.material !== definition.craftInput || !Number.isInteger(item.quantity))
            || machine.input.reduce((sum, item) => sum + item.quantity, 0) > definition.inputLimit * maxBulk
            || machine.output.length > 1
            || machine.output.some((item) => !Object.values(recipes).some(outputRecipe => outputRecipe.output === item.material && item.quantity <= (outputRecipe.outputQuantity ?? 1) * maxBulk))
            || (machine.job && (!recipe || machine.job.input.material !== definition.craftInput
              || (machine.job.input.quantity !== recipe.input * (machine.job.bulk ?? 1)
                && !(machine.type === "crudeGearBench" && machine.job.mode === "gear" && machine.job.input.quantity === 2 * (machine.job.bulk ?? 1)))
              || machine.job.remaining < 0 || machine.job.remaining > recipe.seconds
              || machine.output.length > (definition.outputBuffer ?? 0)))) throw new Error(`Invalid ${definition.name} buffer or mode.`);
        }
        if (D.machines[machine.type].formingModes) {
          const definition = D.machines[machine.type];
          const pending = machine.input.reduce((sum, item) => sum + item.quantity, 0);
          const recipe = formingRecipe(definition, machine.input[0], machine.mode);
          const jobRecipe = machine.job && formingRecipe(definition, machine.job.input, machine.job.mode, machine.job);
          // Old Flour buffers can be larger than new batches. Drain them normally.
          const inputLimit = machine.type === "doughShaper" && machine.input[0]?.material === "flour" ? 5 : Math.min(definition.inputLimit, recipe?.input);
          const validOutput = (item) => Object.keys(D.materials).some((material) => Object.keys(definition.formingModes).some((mode) => {
            const recipe = formingRecipe(definition, { material }, mode);
            const quantity = machine.type === "grainMill" ? 5 : recipe?.outputQuantity ?? 1;
            return recipe?.output === item.material && item.quantity <= quantity * maxBulk + epsilon;
          }));
          if (!Object.hasOwn(definition.formingModes, machine.mode)
            || (machine.input.length && (!recipe || pending > inputLimit * maxBulk + epsilon
              || machine.input.some((item) => item.material !== machine.input[0].material)))
            || machine.output.length > definition.outputBuffer || machine.output.some((item) => !validOutput(item))
            || (machine.job && (!jobRecipe || Math.abs(machine.job.input.quantity - jobRecipe.input * (machine.job.bulk ?? 1)) > epsilon
              || machine.job.remaining < 0 || machine.job.remaining > jobRecipe.seconds + epsilon))) {
            throw new Error(`Invalid ${definition.name} input, mode, job or output buffer.`);
          }
        }
        if (D.machines[machine.type].pressModes) {
          const definition = D.machines[machine.type];
          const product = (item, mode) => D.materials[item?.material]?.[definition.pressModes[mode]?.materialProperty];
          const validInput = (item, mode) => Boolean(D.materials[product(item, mode)]) && Number.isInteger(item.quantity)
            && !D.materials[item.material].fluid && !D.materials[product(item, mode)].fluid;
          const outputs = new Set(Object.values(D.materials).flatMap((material) => Object.values(definition.pressModes)
            .map((mode) => material[mode.materialProperty]).filter(Boolean)));
          if (!Object.hasOwn(definition.pressModes, machine.mode)
            || machine.input.some((item) => !validInput(item, machine.mode) || item.material !== machine.input[0].material)
            || machine.input.reduce((sum, item) => sum + item.quantity, 0) > definition.inputLimit * maxBulk
            || machine.output.length > definition.outputBuffer
            || machine.output.some((item) => !outputs.has(item.material) || item.quantity > Math.max(...Object.values(definition.pressModes).map((mode) => mode.outputQuantity ?? 1)) * maxBulk)
            || (machine.lanes[0] && !validInput(machine.lanes[0], machine.mode))
            || Object.entries(machine.lanes).some(([lane, item]) => Number(lane) > 0 && !outputs.has(item.material))
            || (machine.job && (!validInput(machine.job.input, machine.job.mode)
              || machine.job.input.quantity !== definition.pressModes[machine.job.mode].input * (machine.job.bulk ?? 1)
              || machine.job.remaining < 0 || machine.job.remaining > definition.seconds))) throw new Error("Invalid Metal Press mode, job or buffers.");
        }
        if (D.machines[machine.type].molder) {
          const definition = D.machines[machine.type], pending = machine.input.reduce((sum, item) => sum + item.quantity, 0);
          if (pending > definition.inputLimit * maxBulk + epsilon
            || machine.input.some((item) => !moldingProduct(item.material) || item.material !== machine.input[0].material)
            || machine.output.length > definition.outputBuffer
            || machine.output.some((item) => item.quantity > maxBulk || !Object.keys(D.materials).some((material) => moldingProduct(material) === item.material))
            || (machine.job && (!moldingProduct(machine.job.input.material) || Math.abs(machine.job.input.quantity - (machine.job.bulk ?? 1)) > epsilon
              || machine.job.remaining < 0 || machine.job.remaining > definition.seconds))) throw new Error("Invalid Ingot Molder input, job or output buffer.");
        }
        if (D.machines[machine.type].heatCapacity) {
          const definition = D.machines[machine.type];
          if (definition.automaticRecipes && machine.mode !== undefined) throw new Error("Invalid furnace recipe selection.");
          const outputRecipe = Object.values(definition.recipes).find((recipe) => recipe.output === machine.output[0]?.material);
          if (!Number.isFinite(machine.heat) || machine.heat < 0 || machine.heat > definition.heatCapacity * maxBulk
            || (machine.outputBulk !== undefined && (machine.outputBulk !== true || maxBulk !== 10 || !machine.output.length))
            || !Number.isFinite(machine.outputCooldown) || machine.outputCooldown < 0
            || machine.outputCooldown > Math.max(definition.outputSeconds, ...Object.values(D.machines)
              .filter((entry) => entry.conveyors).map((entry) => entry.beltSeconds ?? D.config.beltSeconds))
            || (machine.output.length && (!outputRecipe || machine.output.some((item) => item.material !== machine.output[0].material || !Number.isInteger(item.quantity))
              || machine.output.reduce((sum, item) => sum + item.quantity, 0) > (outputRecipe.outputQuantity ?? outputRecipe.input) * maxBulk))) throw new Error("Invalid Kiln/Furnace heat, batch or output buffer.");
          if (definition.oven) {
            const recipe = ovenRecipeForInput(definition, machine.input);
            if (machine.job || (machine.input.length && (!recipe || machine.input.some(item => !Number.isInteger(item.quantity) || item.preheated)
              || Object.entries(recipe.inputs).some(([material, quantity]) => machine.input.filter(item => item.material === material)
                .reduce((sum, item) => sum + item.quantity, 0) > quantity * maxBulk)))) throw new Error("Invalid Primitive Oven input.");
          } else {
            const inputRecipe = thermalRecipeEntry(definition, machine.input[0]?.material)?.[1];
            const jobRecipe = definition.recipes[machine.job?.recipe];
            if ((machine.input.length && (!inputRecipe || machine.input.some(item => item.material !== (inputRecipe.material ?? machine.input[0].material) || !Number.isInteger(item.quantity))
              || machine.input.reduce((sum, item) => sum + item.quantity, 0) > inputRecipe.input * maxBulk))
              || (machine.job && (!jobRecipe || !Array.isArray(machine.job.inputs) || !machine.job.inputs.length
                || machine.job.inputs.some(item => !validCargo(item) || item.material !== (jobRecipe.material ?? machine.job.recipe) || !Number.isInteger(item.quantity))
                || machine.job.inputs.reduce((sum, item) => sum + item.quantity, 0) !== jobRecipe.input * (machine.job.bulk ?? 1)
                || machine.job.remaining < 0 || machine.job.remaining > jobRecipe.seconds))) throw new Error("Invalid Kiln/Furnace heat, batch or output buffer.");
          }
        }
        if (machine.type === "paintingBench") {
          const def = D.machines.paintingBench;
          const validIngredient = (item) => validCargo(item) && ["pot", "malachitePebble"].includes(item.material) && Number.isInteger(item.quantity) && item.quantity <= maxBulk;
          if (!Number.isFinite(machine.water) || machine.water < 0 || machine.water > def.waterCapacity * maxBulk + epsilon
            || (state.storedMachines.includes(machine) && machine.water !== 0)
            || machine.input.some((item) => !validIngredient(item))
            || ["pot", "malachitePebble"].some((material) => machine.input.filter((item) => item.material === material).reduce((sum, item) => sum + item.quantity, 0) > maxBulk)
            || machine.output.length > def.outputBuffer
            || machine.output.some((item) => item.material !== "paintedPot" || item.quantity > maxBulk)
            || (machine.job && (!Array.isArray(machine.job.inputs) || machine.job.inputs.length !== 2
              || machine.job.inputs.some((item) => !validIngredient(item) || item.quantity !== (machine.job.bulk ?? 1))
              || new Set(machine.job.inputs.map((item) => item.material)).size !== 2
              || machine.job.remaining < 0 || machine.job.remaining > def.paintSeconds))) throw new Error("Invalid Painting Bench assignment or buffers.");
        }
        const plateRecipes = D.machines[machine.type].plateRecipes;
        if (plateRecipes) {
          const dishes = new Set(machine.input.filter(item => item.material !== "woodenPlate").map(item => item.material));
          if (machine.job || dishes.size > 1 || machine.input.some(item => !Number.isInteger(item.quantity)
            || (item.material !== "woodenPlate" && !Object.hasOwn(plateRecipes, item.material)))
            || machine.input.filter(item => item.material === "woodenPlate").reduce((sum, item) => sum + item.quantity, 0) > maxBulk
            || machine.input.filter(item => item.material !== "woodenPlate").reduce((sum, item) => sum + item.quantity, 0) > maxBulk
            || machine.output.length > 1 || machine.output.some(item => item.quantity > maxBulk
              || !Object.values(plateRecipes).some(recipe => recipe.output === item.material))) throw new Error("Invalid Plating Bench buffers.");
        }
        if (!plateRecipes && !D.machines[machine.type].heatCapacity && !isCrafter(D.machines[machine.type])
          && !["fiber", "kiln", "gradingBench", "paintingBench"].includes(machine.type) && (machine.input.length || machine.job)) throw new Error("Unexpected machine input.");
        const sourceDefinition = D.machines[machine.type], sourceMaterial = sourceDefinition.source;
        if (sourceDefinition.sourceModes && (!Object.hasOwn(sourceDefinition.sourceModes, machine.mode)
          || machine.timer > sourceDefinition.cycle + epsilon
          || machine.output.some((item) => !Object.hasOwn(sourceDefinition.sourceModes, item.material) || !Number.isInteger(item.quantity))
            || machine.output.reduce((sum, item) => sum + item.quantity, 0) > sourceDefinition.outputLimit * (state.playtest.used.resources ? 10 : 1) + epsilon)) throw new Error("Invalid Rock Drill buffer or mode.");
        const batch = D.machines[machine.type].batchOutputs;
        if (sourceDefinition.batchModes) {
          const slots = machine.output.map((item) => item.sifterSlot ?? (item.material === "soil" ? 0 : 1));
          if (!Object.hasOwn(sourceDefinition.batchModes, machine.mode)
            || machine.timer > sourceDefinition.cycle + epsilon || new Set(slots).size !== slots.length
            || machine.output.some((item, index) => ![0, 1].includes(slots[index])
              || (slots[index] === 0 && item.material !== "soil")
              || (slots[index] === 1 && !["soil", "chert", "malachitePebble"].includes(item.material))
              || item.quantity > (batch[item.material] ?? 1) * (state.playtest.used.resources ? 10 : 1) + epsilon)) throw new Error("Invalid sifter timer or output buffer.");
        }
        if (batch && !sourceDefinition.batchModes && (machine.timer > sourceDefinition.cycle + epsilon
          || machine.output.some((item) => !Object.hasOwn(batch, item.material))
          || (D.machines[machine.type].outputOverflow === "discardExcess"
            && Object.keys(batch).some((material) => machine.output.filter((item) => item.material === material).length > 1))
          || Object.entries(batch).some(([material, quantity]) => machine.output.filter((item) => item.material === material)
            .reduce((sum, item) => sum + item.quantity, 0) > quantity * (state.playtest.used.resources ? 10 : 1) + epsilon))) throw new Error(`Invalid ${sourceDefinition.name} timer or output buffer.`);
        // Before the washer update, Copper Drill output was already smeltable
        // Copper. A migrated buffered batch is Copper Ore until it leaves.
        if (sourceMaterial && (machine.timer > sourceDefinition.cycle + epsilon || machine.output.some((item) => item.material !== sourceMaterial
          && !(machine.type === "copperDrill" && item.material === "copperOre"))
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > (D.machines[machine.type].outputLimit ?? 1) * (state.playtest.used.resources ? 10 : 1) + epsilon)) throw new Error("Invalid source buffer.");
        if (!plateRecipes && !sourceDefinition.heatCapacity && !isCrafter(sourceDefinition) && !["fiber", "kiln", "gradingBench", "paintingBench"].includes(machine.type) && !sourceMaterial && !sourceDefinition.sourceModes && !batch && machine.output.length) throw new Error("Unexpected output buffer.");
        const laneCount = conveyorCells(machine).length;
        if (machine.type === "manualSplitter" && (!Object.hasOwn(D.machines.manualSplitter.modeFootprints, machine.mode)
          || (machine.splitterSideNext !== undefined && typeof machine.splitterSideNext !== "boolean"))) throw new Error("Invalid Manual Splitter routing.");
        for (const [lane, item] of Object.entries(machine.lanes)) {
          if (!/^\d+$/.test(lane) || Number(lane) >= laneCount || item.quantity * D.materials[item.material].weight > conveyorWeightLimit(machine, state) + epsilon) throw new Error("Invalid conveyor cargo.");
        }
        for (const [lane, item] of Object.entries(machine.beltRemainders ?? {})) {
          const active = machine.lanes[lane];
          const oldWeight = legacyFoodWeights[item.material] ?? D.materials[item.material].weight;
          if (!/^(0|[1-9]\d*)$/.test(lane) || Number(lane) >= laneCount || item.progress !== 0
            || (active && active.material !== item.material)
            || (item.quantity + (active?.quantity ?? 0)) * oldWeight > Math.max(5, conveyorWeightLimit(machine) * (state.playtest.used.conveyorCapacity ? 10 : 1)) + epsilon) throw new Error("Invalid conveyor remainder.");
        }
      }
      if (state.machines.reduce((sum, machine) => sum + (D.machines[machine.type].crew ?? 0), 0)
        > D.config.startingCrew + state.hiredCrew) throw new Error("Assigned hamsters exceed available crew.");
      if (!Number.isInteger(state.nextId) || state.nextId < 1 || !Number.isInteger(state.random)) throw new Error("Invalid identity state.");
      for (const type of Object.keys(D.machines)) {
        if (state.storedMachines.filter((machine) => machine.type === type).length > state.stock[type]) throw new Error("Invalid stored-machine count.");
      }
      state.harvestProgress = Math.max(0, Math.min(4, Math.floor(finite(state.harvestProgress))));
      state.clickTokens = Math.max(0, Math.min(1, finite(state.clickTokens)));
      state.tuning = { primitiveBonus: Math.max(0, finite(state.tuning?.primitiveBonus, base.tuning.primitiveBonus)),
        primitiveLimit: Math.max(0, finite(state.tuning?.primitiveLimit, base.tuning.primitiveLimit)) };
      const trees = startingTrees();
      const terrainUpdated = state.terrainVersion !== D.startingTerrain.version
        || state.trees.length !== trees.length
        || trees.some((tree, index) => Object.keys(tree).some((field) => state.trees[index]?.[field] !== tree[field]));
      const legacyFootprint = !state.planterFootprintVersion || state.planterFootprintVersion < 2;
      const legacyHorizontalFiber = !state.fiberFootprintVersion || state.fiberFootprintVersion < 2;
      const legacyFiber = !state.fiberFootprintVersion || state.fiberFootprintVersion < 3;
      let reorientedFiber = 0;
      if (legacyFiber) {
        for (const machine of [...state.machines, ...state.storedMachines]) {
          if (machine.type !== "fiber") continue;
          // Version 2 used down as its unrotated facing. Preserve its occupied
          // tiles while correcting the working ports to the Molder-style cell.
          const previousFacing = legacyHorizontalFiber && machine.facing === "right" ? "down" : machine.facing;
          machine.facing = turn(previousFacing, -1);
          reorientedFiber++;
        }
      }
      const migrateFootprints = legacyFootprint || legacyHorizontalFiber;
      const factory = new Factory({ ...state, planterFootprintVersion: 2, fiberFootprintVersion: 3, machines: [] });
      const recovered = new Set();
      // Give unchanged footprints priority over expanded ones.
      const priority = (machine) => {
        if (legacyDoughFootprint && machine.type === "doughShaper") return -2;
        if (legacyMajorFootprint && machine.type === "majorRunePedestal") return -1;
        if (migrateFootprints && machine.type === "planter") return 2;
        if (migrateFootprints && machine.type === "fiber") return 1;
        return 0;
      };
      const ordered = migrateFootprints || (legacyMajorFootprint && placedMajorPedestals)
        || (legacyDoughFootprint && state.machines.some(machine => machine.type === "doughShaper"))
        ? [...state.machines].sort((a, b) => priority(b) - priority(a)) : state.machines;
      for (const machine of ordered) {
        // Terrain migration picks everything up below. Do not reject an old
        // Logger or a corrected footprint before its contents can be recovered.
        const error = terrainUpdated ? null : factory.placement(machine.type, machine.x, machine.y, machine.facing, null, machine.mode);
        const canRecover = migrateFootprints || (legacyMajorFootprint && machine.type === "majorRunePedestal")
          || (legacyDoughFootprint && machine.type === "doughShaper");
        if (error && canRecover && ["Another machine is in the way.", "The tree occupies those tiles.", "Outside the factory."].includes(error)) {
          factory.state.machines.push(machine); factory.rebuild(); factory.pickup(machine.id);
          recovered.add(machine.id);
          continue;
        }
        if (error) throw new Error(error);
        factory.state.machines.push(machine); factory.rebuild();
      }
      // Hauling has been removed. Recover only cargo already in transit from old saves.
      const legacyMachines = new Map(state.machines.map((machine) => [machine.id, machine]));
      for (const route of legacyRoutes) {
        if (!route || ids.has(route.id) || typeof route.id !== "string" || !collectorCapacity(legacyMachines.get(route.source))
          || !legacyMachines.has(route.destination) || !["pickup", "loaded", "return"].includes(route.phase)
          || !Number.isFinite(route.remaining) || route.remaining < 0 || !Number.isFinite(route.duration)
          || route.duration < 0 || (route.item && (!validCargo(route.item) || D.materials[route.item.material].fluid))
          || (route.material !== "any" && !D.materials[route.material])
          || (route.phase === "loaded" && (!route.item || route.item.quantity > 1))
          || (route.phase !== "loaded" && route.item) || route.source === route.destination) throw new Error("Invalid legacy hauling route.");
        ids.add(route.id);
        if (route.item) factory.state.inventory[route.item.material] += route.item.quantity;
      }
      if ([...ids].some((id) => /^(machine|route)-\d+$/.test(id) && Number(id.split("-")[1]) >= state.nextId)) throw new Error("Invalid next identity.");
      factory.terrainUpdated = terrainUpdated;
      factory.pickedUpForTerrainReset = 0;
      if (terrainUpdated) {
        factory.pickedUpForTerrainReset = factory.state.machines.length;
        // Normal pickup also recovers unfinished inputs, Basket
        // contents and conveyor cargo, and retains each owned machine instance.
        factory.pickupGroup(factory.state.machines.map((machine) => machine.id));
        factory.state.trees = trees;
        factory.state.terrainVersion = D.startingTerrain.version;
        factory.rebuild();
      }
      if (legacyEconomy) {
        // Previously borrowed tubes already count as the free starter machine.
        if (!factory.state.stock.sellTube && !factory.state.machines.some((machine) => machine.type === "sellTube")) factory.state.stock.sellTube = 1;
        const existingCargo = [...factory.state.machines, ...factory.state.storedMachines].flatMap((machine) => [
          ...machine.input, ...machine.output, ...machine.contents, ...Object.values(machine.lanes),
          ...Object.values(machine.beltRemainders ?? {}), ...jobInputs(machine.job),
        ]);
        for (const item of existingCargo) if (item?.material === "wood" && item.value === 0) item.value = D.materials.wood.value;
        factory.state.openingEconomyVersion = 1;
      }
      if ((state.starterPlantersVersion ?? 0) < 1) {
        // Stored instances already count toward stock; do not count them twice.
        const owned = factory.state.stock.planter + factory.state.machines.filter((machine) => machine.type === "planter").length;
        factory.state.stock.planter += Math.max(0, 2 - owned);
        factory.state.starterPlantersVersion = 1;
      }
      if ((state.starterBasketsVersion ?? 0) < 1) {
        const owned = factory.state.stock.basket + factory.state.machines.filter(machine => machine.type === "basket").length;
        factory.state.stock.basket += Math.max(0, D.machines.basket.dismantleMinimum - owned);
        factory.state.starterBasketsVersion = 1;
      }
      factory.recoveredForPlanterResize = recovered.size;
      factory.reorientedForFiberResize = reorientedFiber;
      return factory;
    }
  }
  const API = { DATA: D, Factory, createState, size, cells, ports, rotatePoint, rotation, cargo, opposite, turn, copy, key, formatNumber, blendGradeRepairs, collectorCapacity, conveyorUpgradeCost,
    combineCargo, gradeProbabilities, gradeStack, gradeLabel, conveyorCells, supportsOutputHistory };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NoAmmo = API;
}(globalThis));
