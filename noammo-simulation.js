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
  const conveyorWeightLimit = (machine) => D.machines[machine.type].beltWeight ?? D.config.beltWeight;
  const conveyorSeconds = (machine) => D.machines[machine.type].beltSeconds ?? D.config.beltSeconds;
  function clearPickedUpFurnace(machine) {
    if (!D.machines[machine.type]?.heatCapacity) return;
    machine.heat = 0; machine.outputCooldown = 0; machine.timer = 0;
    machine.input = []; machine.output = []; machine.job = null;
  }
  const supportsOutputHistory = (type) => type === "primitive" || type === "gradingBench" || Boolean(D.machines[type]?.cashEffect);
  const isCrafter = (definition) => Boolean(definition.craftInput || definition.molder);
  function moldingProduct(material) {
    const source = D.materials[material], product = D.materials[source?.moldsTo];
    return source?.fluid && !source.requiresRefractoryCaster && product && !product.fluid && !product.requiresRefractoryCaster
      ? source.moldsTo : null;
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
      ...(point.material ? { material: point.material } : {}),
      ...(point.mode ? { mode: point.mode } : {}),
      ...(point.span ? { span: point.span } : {}),
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
      ...port(machine, x, y, "right", "conveyor"), index,
      upgrade: Boolean(definition.cashEffect) && (!definition.upgradeCells
        || definition.upgradeCells.some(([cx, cy]) => cx === x && cy === y)),
    }));
  }
  function sharesCrossing(a, b, x, y) {
    const bridge = D.machines[a.type]?.bridge ? a : D.machines[b.type]?.bridge ? b : null;
    const other = bridge === a ? b : a;
    if (!bridge || other.type !== "belt") return false;
    const middle = conveyorCells(bridge)[1];
    return middle.x === x && middle.y === y;
  }
  function validCargo(item) {
    return item && D.materials[item.material] && Number.isFinite(item.quantity) && item.quantity > 0
      && Number.isFinite(item.value) && item.value >= 0 && item.upgrades && typeof item.upgrades === "object"
      && !Array.isArray(item.upgrades) && Number.isFinite(item.progress) && item.progress >= 0 && item.progress <= 1
      && Object.values(item.upgrades).every((value) => typeof value === "boolean" || (Number.isSafeInteger(value) && value >= 0))
      && Object.entries(item.upgrades).every(([type, uses]) => D.machines[type]?.cashEffect?.useLimit === undefined
        || (Number.isSafeInteger(uses) && uses >= 0 && uses <= D.machines[type].cashEffect.useLimit))
      && item.grading === undefined && (item.graded === undefined || typeof item.graded === "boolean")
      && (item.materialHistory === undefined || (item.materialHistory && typeof item.materialHistory === "object" && !Array.isArray(item.materialHistory)
        && Object.entries(item.materialHistory).every(([key, value]) => {
          const [type, material, channel, extra] = key.split(":");
          return value === true && !extra && D.machines[type]?.remembersMaterials && Object.hasOwn(D.materials, material) && ["cash", "grade"].includes(channel);
        })))
      && (item.gradeTreatment === undefined || (gradeTable(item.material) && Array.isArray(item.gradeTreatment)
        && item.gradeTreatment.length === D.grades.length && item.gradeTreatment.every(validChances)))
      && (item.gradeRepairApplied === undefined || (item.gradeProfile && Number.isFinite(item.gradeRepairApplied)
        && item.gradeRepairApplied >= 0 && item.gradeRepairApplied <= (item.gradeRepairs?.brickSeal ?? 0) + epsilon))
      && (item.gradeProfile === undefined || (D.gradeTables[D.materials[item.material].gradeTable ?? D.materials[item.material].family]
        && Array.isArray(item.gradeProfile) && item.gradeProfile.length === D.grades.length
        && item.gradeProfile.every((chance) => Number.isFinite(chance) && chance >= 0 && chance <= 1)
        && Math.abs(item.gradeProfile.reduce((sum, chance) => sum + chance, 0) - 1) < epsilon))
      && (item.lateral === undefined || item.lateral === -0.5 || item.lateral === 0.5)
      && (item.gradeRepairs === undefined || (item.gradeRepairs && typeof item.gradeRepairs === "object" && !Array.isArray(item.gradeRepairs)
        && Object.entries(item.gradeRepairs).every(([type, count]) => Object.hasOwn(D.machines, type)
          && Number.isFinite(D.machines[type].gradeEffect?.poorToStandardPerUse) && Number.isFinite(count) && count >= 0 && count <= D.machines[type].gradeEffect.useLimit)));
  }
  function sameCargo(a, b) {
    return a.material === b.material && Math.abs(a.value - b.value) < epsilon
      && JSON.stringify(a.upgrades) === JSON.stringify(b.upgrades)
      && JSON.stringify(a.gradeRepairs ?? {}) === JSON.stringify(b.gradeRepairs ?? {})
      && JSON.stringify(a.gradeProfile ?? null) === JSON.stringify(b.gradeProfile ?? null)
      && JSON.stringify(a.gradeTreatment ?? null) === JSON.stringify(b.gradeTreatment ?? null)
      && JSON.stringify(a.materialHistory ?? {}) === JSON.stringify(b.materialHistory ?? {})
      && (a.gradeRepairApplied ?? 0) === (b.gradeRepairApplied ?? 0)
      && Boolean(a.graded) === Boolean(b.graded);
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
      const effect = D.machines[type]?.gradeEffect;
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
    for (const type of Object.keys(repairs)) repairs[type] = Math.min(D.machines[type].gradeEffect.useLimit, repairs[type]);
    if (Object.values(repairs).some((count) => count > 0)) output.gradeRepairs = repairs;
    return blendQuality(output, inputs);
  }
  function applyBrickSeal(item) {
    const definition = D.machines.brickSeal, effect = definition.cashEffect, material = D.materials[item.material];
    const uses = item.upgrades.brickSeal ?? 0;
    if (material.value !== null && material.value >= effect.baseValueRequired && item.value < effect.upperLimit && uses < effect.useLimit) {
      setCargoValue(item, item.value + effect.bonus); item.upgrades.brickSeal = Math.min(effect.useLimit, uses + 1);
    }
    // Material repair is independent of cash eligibility and has its own cap.
    if (material.family === definition.gradeEffect.family) {
      item.gradeRepairs = { ...item.gradeRepairs,
        brickSeal: Math.min(definition.gradeEffect.useLimit, (item.gradeRepairs?.brickSeal ?? 0) + 1) };
    }
  }
  function applyCashEffect(item, type) {
    if (type === "brickSeal") return applyBrickSeal(item);
    if (D.machines[type].remembersMaterials) {
      const cashKey = `${type}:${item.material}:cash`, gradeKey = `${type}:${item.material}:grade`;
      const { cashEffect, gradeEffect } = D.machines[type];
      if (!item.materialHistory?.[cashKey] && D.materials[item.material].value !== null && item.value + epsilon < cashEffect.upperLimit) {
        item.value *= cashEffect.multiplier; item.upgrades[type] = 1;
        item.materialHistory = { ...item.materialHistory, [cashKey]: true };
      }
      if (!item.graded && gradeTable(item.material) && !item.materialHistory?.[gradeKey]) {
        applyGradeTreatment(item, promotionTreatment(gradeEffect.promotionRates));
        item.materialHistory = { ...item.materialHistory, [gradeKey]: true };
      }
      return;
    }
    const effect = D.machines[type].cashEffect, base = D.materials[item.material].value;
    const uses = item.upgrades[type] ?? 0;
    if (!effect || base === null || base < (effect.baseValueRequired ?? 0)
      || item.value + epsilon >= effect.upperLimit || uses >= (effect.useLimit ?? Infinity)) return;
    item.value = effect.multiplier ? item.value * effect.multiplier : item.value + effect.bonus;
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
      settledContentVersion: 1, primitiveStackerVersion: 1, potSpinnerVersion: 2, crudeGearBenchVersion: 1, graniteProcessorVersion: 2, manualOverflowVersion: 1, beltCapacityVersion: 1, pebblePileVersion: 1,
      copperIndustryVersion: 1, heatScaleVersion: 1, copperFinishingVersion: 1, loggerSpeedVersion: 1, starterPlantersVersion: 1,
      gradeEvolutionVersion: 1, leekDusterVersion: 1,
      cash: 0, earned: 0, inventory: Object.fromEntries(Object.keys(D.materials).map((material) => [material, 0])),
      stock: Object.fromEntries(Object.keys(D.machines).map((type) => [type, 0])),
      storedMachines: [], machines: [], trees: startingTrees(), terrainVersion: D.startingTerrain.version, harvestProgress: 0,
      clickTokens: 1, harvestedWood: 0, soldItems: 0, producedFiber: 0, hiredCrew: 0,
      tuning: { primitiveBonus: 0.1, primitiveLimit: 1 },
    };
    state.stock.planter = 2;
    state.stock.basket = 1;
    state.stock.sellTube = 1;
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
      this.poweredDrives = this.state.machines.filter((machine) => machine.type === "drive" && this.driveHasWheel(machine));
      this.layoutVersion++;
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
      return ports(machine).filter((point) => point.role === "kineticInput").some((intake) => {
        const v = D.vectors[intake.direction], wheel = this.at.get(key(intake.x + v.x, intake.y + v.y));
        return wheel?.type === "wheel" && ports(wheel).some((point) => point.role === "kineticOutput"
          && point.x === intake.x + v.x && point.y === intake.y + v.y
          && point.direction === opposite(intake.direction));
      });
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
      if (collectorCapacity(machine)) this.collect(id);
      for (const item of [...machine.input, ...machine.output, ...Object.values(machine.lanes), ...Object.values(machine.beltRemainders ?? {})]) {
        if (validCargo(item) && !D.materials[item.material].fluid) this.state.inventory[item.material] += item.quantity;
      }
      for (const item of jobInputs(machine.job)) if (!D.materials[item.material].fluid) this.state.inventory[item.material] += item.quantity;
      machine.input = machine.input.filter((item) => D.materials[item.material].fluid);
      machine.output = machine.output.filter((item) => D.materials[item.material].fluid);
      machine.contents = []; machine.lanes = {};
      if (!D.machines[machine.type].molder) machine.job = null;
      machine.timer = 0;
      clearPickedUpFurnace(machine);
      delete machine.beltRemainders;
      this.state.machines = this.state.machines.filter((other) => other !== machine);
      this.state.stock[machine.type]++;
      this.state.storedMachines.push(machine);
      this.outputHistories.delete(id);
      this.rebuild(); return true;
    }
    affordability(type, amount = 1) {
      if (!Number.isInteger(amount) || amount < 1 || amount > 9999) return "Choose 1–9999 machines.";
      const cost = D.machines[type]?.cost;
      if (!cost) return "This prototype cost has not been set.";
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
    dismantle(type) {
      const error = this.dismantleError(type);
      if (error) return { error };
      const cost = D.machines[type].cost;
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
        wood = 1 + Math.floor(random(this.state) * 5);
        this.state.inventory.wood += wood; this.state.harvestedWood += wood;
      }
      return { accepted: true, wood };
    }
    sell(items) {
      let money = 0, quantity = 0;
      for (const item of items) if (D.materials[item.material]?.value !== null && !D.materials[item.material]?.fluid) {
        money += item.quantity * item.value; quantity += item.quantity;
      }
      this.state.cash += money; this.state.earned += money; this.state.soldItems += quantity;
      return money;
    }
    sellInventory(material, quantity) {
      if (!D.materials[material] || D.materials[material].value === null || !Number.isFinite(quantity) || quantity <= 0) return 0;
      const count = Math.min(quantity, this.state.inventory[material]);
      this.state.inventory[material] -= count;
      return this.sell([cargo(material, count)]);
    }
    total(machine, field) { return machine[field].reduce((sum, item) => sum + item.quantity, 0); }
    setOverflowMode(id, mode) {
      const machine = this.byId.get(id), definition = D.machines[machine?.type];
      if (!definition?.manualTransferSeconds || !Object.hasOwn(definition.modeFootprints, mode)) return { error: "Invalid overflow mode." };
      if (machine.mode === mode) return { machine };
      const error = this.placement(machine.type, machine.x, machine.y, machine.facing, id, mode);
      if (error) return { error: "The other hamster position must be clear to change overflow mode." };
      machine.mode = mode; this.rebuild();
      return { machine };
    }
    unloadManualOverflow(machine) {
      if (!machine.job || machine.job.remaining > epsilon) return;
      const output = ports(machine).find((point) => point.mode);
      machine.job.input.quantity -= this.send(machine, machine.job.input, output);
      if (machine.job.input.quantity <= epsilon) machine.job = null;
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
      return Math.min(machine.stackSize, Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight));
    }
    setShapingMode(id, mode) {
      const machine = this.byId.get(id);
      if (machine?.type !== "clayShaper" || !Object.hasOwn(D.machines.clayShaper.recipes, mode)) return { error: "Invalid shaping mode." };
      // A running job retains its original recipe. Only subsequent jobs change.
      machine.mode = mode;
      return { machine };
    }
    setSourceMode(id, mode) {
      const machine = this.byId.get(id), modes = D.machines[machine?.type]?.sourceModes;
      if (!modes || !Object.hasOwn(modes, mode)) return { error: "Invalid extraction mode." };
      machine.mode = mode; return { machine };
    }
    craftRecipe(machine, input = machine.input[0], mode = machine.mode) {
      const definition = D.machines[machine.type];
      if (!definition.molder) return definition.recipes[mode];
      const output = moldingProduct(input?.material);
      return output ? { input: 1, output, seconds: definition.seconds, valueMultiplier: 1 } : null;
    }
    startShaping(machine) {
      const definition = D.machines[machine.type], recipe = this.craftRecipe(machine);
      if (!recipe || machine.job || machine.output.length > (definition.outputBuffer ?? 0) || this.total(machine, "input") + epsilon < recipe.input
        || (definition.requiresKinetic && !this.kineticHasWheel(machine))) return;
      let needed = recipe.input;
      const ingredients = [];
      while (needed > epsilon) {
        const item = machine.input[0], amount = Math.min(needed, item.quantity);
        ingredients.push({ ...item, quantity: amount });
        needed -= amount; item.quantity -= amount;
        if (item.quantity <= epsilon) machine.input.shift();
      }
      machine.job = { input: combineCargo(ingredients), ...(definition.molder ? {} : { mode: machine.mode }), remaining: recipe.seconds };
    }
    finishShaping(machine) {
      if (!machine.job || machine.job.remaining > epsilon || machine.output.length) return;
      const recipe = this.craftRecipe(machine, machine.job.input, machine.job.mode);
      const product = blendGradeRepairs(cargo(recipe.output, 1, machine.job.input.value * recipe.input * recipe.valueMultiplier), [machine.job.input]);
      if (recipe.gradeProfile) {
        product.gradeProfile = [...recipe.gradeProfile]; delete product.gradeRepairApplied;
        commitQuality(product);
        if (product.gradeTreatment) product.gradeProfile = treatChances(product.gradeProfile, product.gradeTreatment);
      }
      machine.output.push(product); machine.job = null;
    }
    unloadShaping(machine) {
      if (machine.output.length) {
        const item = machine.output[0], output = ports(machine).find((point) => point.role === "output");
        item.quantity -= this.send(machine, item, output);
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
        item.quantity -= this.send(machine, item, output);
        if (item.quantity <= epsilon) machine.output.shift();
      }
      this.startGrading(machine);
    }
    furnaceRecipe(machine) {
      const definition = D.machines[machine.type];
      return definition.recipes[definition.manualRecipes ? machine.mode : machine.input[0]?.material];
    }
    setFurnaceMode(id, mode) {
      const machine = this.byId.get(id), definition = D.machines[machine?.type];
      if (!definition?.manualRecipes || !Object.hasOwn(definition.recipes, mode)) return { error: "Invalid furnace mode." };
      if (machine.mode !== mode) {
        for (const item of machine.input) this.state.inventory[item.material] += item.quantity;
        machine.input = []; machine.mode = mode;
      }
      return { machine };
    }
    startKiln(machine) {
      const definition = D.machines[machine.type], recipe = this.furnaceRecipe(machine);
      if (machine.job || !recipe || this.total(machine, "input") + epsilon < recipe.input) return;
      const heat = (recipe.heatPerSecond ?? definition.heatPerSecond) * recipe.seconds;
      if (machine.heat + epsilon < heat) return;
      // Full batches and their heat are committed together. Preserve each input's
      // value separately rather than averaging differently upgraded products.
      machine.heat = Math.max(0, machine.heat - heat);
      machine.job = { recipe: definition.manualRecipes ? machine.mode : machine.input[0].material,
        inputs: machine.input.splice(0), remaining: recipe.seconds };
    }
    finishKiln(machine) {
      if (!machine.job || machine.job.remaining > epsilon || machine.output.length) return;
      const recipe = D.machines[machine.type].recipes[machine.job.recipe];
      if (recipe.outputQuantity !== undefined) {
        const input = combineCargo(machine.job.inputs);
        machine.output.push(blendGradeRepairs(cargo(recipe.output, recipe.outputQuantity,
          input.value * input.quantity * recipe.valueMultiplier / recipe.outputQuantity), [input]));
      } else for (const item of machine.job.inputs) machine.output.push(blendGradeRepairs(cargo(recipe.output, item.quantity, item.value * recipe.valueMultiplier), [item]));
      if (recipe.gradePromotion) for (const item of machine.output) {
        const ceiling = recipe.gradePromotionCeiling ?? D.grades.length - 1;
        applyGradeTreatment(item, promotionTreatment(D.grades.map((_, i) => i < ceiling ? recipe.gradePromotion : 0)));
      }
      machine.job = null;
    }
    unloadKiln(machine) {
      if (machine.output.length && (D.materials[machine.output[0].material].fluid || machine.outputCooldown <= epsilon)) {
        const item = machine.output[0], output = ports(machine).find((point) => point.role === "output");
        const fluid = D.materials[item.material].fluid;
        const sent = this.send(machine, { ...item, quantity: fluid ? item.quantity : Math.min(1, item.quantity) }, output);
        if (sent > epsilon) {
          item.quantity -= sent;
          if (!fluid) {
            const v = D.vectors[output.direction], receivingBelt = this.conveyorAt(output.x + v.x, output.y + v.y);
            machine.outputCooldown = receivingBelt ? conveyorSeconds(receivingBelt.machine) : D.machines[machine.type].outputSeconds;
          }
          if (item.quantity <= epsilon) machine.output.shift();
        }
      }
      this.finishKiln(machine);
      this.startKiln(machine);
    }
    unloadBatchSource(machine) {
      const outputs = ports(machine).filter((point) => point.role === "output");
      for (const item of [...machine.output]) for (const output of outputs.filter((point) => point.material === item.material)) {
        item.quantity -= this.send(machine, item, output);
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
    receiveConveyor(machine, item, tile, consume, lateral = null) {
      if (machine.beltRemainders?.[tile.index]) return 0;
      const elevated = Boolean(D.machines[machine.type].bridge);
      const stacking = Boolean(D.machines[machine.type].maxStackSize), existing = machine.lanes[tile.index];
      if (stacking && existing && (existing.material !== item.material || (existing.lateral ?? null) !== lateral)) return 0;
      if (!this.conveyorPowered(machine, tile.x, tile.y) || this.slotBusy(tile.x, tile.y, elevated, stacking ? existing : item)) return 0;
      if (lateral) {
        const v = D.vectors[tile.direction], sign = Math.sign(lateral);
        const partner = this.conveyorAt(tile.x - v.y * sign, tile.y + v.x * sign, elevated);
        if (!partner || partner.tile.direction !== tile.direction || !this.conveyorPowered(partner.machine, partner.tile.x, partner.tile.y)
          || this.slotBusy(partner.tile.x, partner.tile.y, elevated, stacking ? existing : item)) return 0;
      }
      const capacity = stacking ? this.stackTarget(machine, item) - (existing?.quantity ?? 0)
        : Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight);
      const quantity = !stacking && item.quantity > capacity + epsilon ? 0 : Math.max(0, Math.min(item.quantity, capacity));
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
    receiveCentered(item, point, direction, consume = true, elevated = false, fromId = null) {
      const v = D.vectors[direction], perpendicular = { x: -v.y, y: v.x };
      const positions = [-0.5, 0.5].map((offset) => ({
        x: Math.round(point.x + perpendicular.x * offset), y: Math.round(point.y + perpendicular.y * offset),
      }));
      const slots = positions.map((cell) => this.conveyorAt(cell.x, cell.y, elevated));
      const allowed = (slot) => slot.machine.id === fromId || (slot.machine.type === "belt"
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
          return this.receiveConveyor(front.machine, item, front.tile, consume);
        }
        if (feeds[0] || slots[0].tile.direction !== slots[1].tile.direction
          || slots[0].tile.direction === opposite(direction) || !slots.every(allowed)) return 0;
        return this.receiveConveyor(slots[0].machine, item, slots[0].tile, consume, 0.5);
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
    receive(machine, item, x, y, incomingSide, consume = false) {
      if (!validCargo(item) || (D.materials[item.material].fluid && !D.machines[machine.type].molder)) return 0;
      const input = ports(machine).find((point) => point.role === "input" && point.x === x && point.y === y
        && (!incomingSide || point.direction === incomingSide));
      let quantity = 0;
      if (collectorCapacity(machine) && (machine.type === "basket" || input)) {
        quantity = Math.min(item.quantity, collectorCapacity(machine) - this.total(machine, "contents"));
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
        quantity = item.quantity + epsilon >= 1 && this.total(machine, "input") === 0 ? 1 : 0;
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (D.machines[machine.type].molder && input && moldingProduct(item.material)
        && machine.input.every((entry) => entry.material === item.material)) {
        quantity = Math.max(0, Math.min(item.quantity, D.machines[machine.type].inputLimit - this.total(machine, "input")));
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (D.machines[machine.type].craftInput && input && item.material === D.machines[machine.type].craftInput) {
        quantity = Math.min(Math.floor(item.quantity + epsilon), D.machines[machine.type].inputLimit - this.total(machine, "input"));
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (machine.type === "gradingBench" && input && gradeProbabilities(item)) {
        if (!machine.input.length) {
          quantity = Math.min(item.quantity, Math.floor(D.machines.gradingBench.inputWeightLimit / D.materials[item.material].weight));
          if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (D.machines[machine.type].heatCapacity && input) {
        const definition = D.machines[machine.type], recipe = this.furnaceRecipe(machine);
        const recipeKey = definition.manualRecipes ? recipe?.material : item.material;
        const feedRecipe = definition.manualRecipes ? recipe : definition.recipes[item.material];
        const isIngredient = feedRecipe && recipeKey === item.material;
        const fuelHeat = D.materials[item.material].heat;
        if (isIngredient && machine.input.every((entry) => entry.material === item.material)) {
          quantity = Math.max(0, Math.min(Math.floor(item.quantity), feedRecipe.input - this.total(machine, "input")));
          if (consume && quantity > 0) machine.input.push({ ...copy(item), quantity, progress: 0 });
        } else if (!isIngredient && Number.isFinite(fuelHeat) && fuelHeat > 0) {
          quantity = Math.min(Math.floor(item.quantity), Math.floor((definition.heatCapacity - machine.heat + epsilon) / fuelHeat));
          if (consume && quantity > 0) machine.heat += quantity * fuelHeat;
        }
      } else if (D.machines[machine.type].conveyors && (machine.type === "belt" || input)) {
        if (incomingSide === machine.facing) return 0;
        const tile = conveyorCells(machine).find((cell) => cell.x === x && cell.y === y);
        if (tile) quantity = this.receiveConveyor(machine, item, tile, consume);
      }
      return Math.max(0, quantity);
    }
    laneIndex(machine, x, y) {
      return conveyorCells(machine).findIndex((point) => point.x === x && point.y === y);
    }
    send(machine, item, output) {
      const v = D.vectors[output.direction], x = output.x + v.x, y = output.y + v.y;
      if (output.span === 2 || item.lateral) {
        const lateral = item.lateral ?? 0;
        return this.receiveCentered(item, { x: x - v.y * lateral, y: y + v.x * lateral }, output.direction, true,
          Boolean(D.machines[machine.type].bridge), machine.id);
      }
      const internal = conveyorCells(machine).find((cell) => cell.x === x && cell.y === y);
      if (internal) return this.receiveConveyor(machine, item, internal, true);
      const target = (this.occupantsAt.get(key(x, y)) ?? []).find((entry) =>
        !D.machines[entry.type].bridge || ports(entry).some((point) => point.role === "input" && point.x === x && point.y === y
          && point.direction === opposite(output.direction)));
      if (!target || target.id === machine.id) return 0;
      return this.receive(target, item, x, y, opposite(output.direction), true);
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
      state.seconds += seconds;
      // Visual-only, bounded feedback: never saved, replayed, or used for cash accounting.
      if (this.saleTexts.length) this.saleTexts = this.saleTexts.filter((entry) => state.seconds - entry.created < 1.2);
      state.clickTokens = Math.min(1, state.clickTokens + seconds * D.config.clicksPerSecond);
      // Arrivals cannot traverse a second belt during the same simulation step.
      const oldLanes = state.machines.flatMap((machine) => {
        const entries = Object.entries(machine.lanes);
        // Release the straight outlet before deciding whether its inlet is blocked.
        if (D.machines[machine.type].manualTransferSeconds) entries.reverse();
        return entries.map(([lane, item]) => ({ machine, lane, item,
          ready: !D.machines[machine.type].maxStackSize || item.quantity + epsilon >= this.stackTarget(machine, item) }));
      });
      for (const machine of state.machines) {
        const definition = D.machines[machine.type];
        if (definition.batchOutputs) {
          if (!machine.output.length && (!definition.requiresKinetic || this.kineticHasWheel(machine))) {
            machine.timer += seconds;
            if (machine.timer + epsilon >= definition.cycle) {
              machine.timer = Math.max(0, machine.timer - definition.cycle);
              for (const [material, quantity] of Object.entries(definition.batchOutputs)) machine.output.push(cargo(material, quantity));
            }
          }
        } else if (definition.source || definition.sourceModes) {
          const cycle = definition.cycle, limit = definition.outputLimit ?? 1;
          if ((!definition.requiresKinetic || this.kineticHasWheel(machine))
            && this.total(machine, "output") + (definition.sourceQuantity ?? 1) <= limit + epsilon) {
            machine.timer += seconds;
            if (machine.timer + epsilon >= cycle) {
              machine.timer = Math.max(0, machine.timer - cycle);
              machine.output.push(cargo(definition.source ?? machine.mode, definition.sourceQuantity ?? 1));
            }
          }
        } else if (definition.manualTransferSeconds && machine.job) {
          machine.job.remaining = Math.max(0, machine.job.remaining - seconds);
        } else if (machine.type === "fiber") {
          if (machine.job) {
            machine.job.remaining -= seconds;
            if (machine.job.remaining <= epsilon && this.total(machine, "output") === 0) {
              machine.output.push(cargo("leekFiber", 2, machine.job.input.value));
              state.producedFiber += 2; machine.job = null;
            }
          }
          if (!machine.job && machine.input.length && this.total(machine, "output") === 0) {
            machine.job = { input: machine.input.shift(), remaining: D.config.fiberSeconds };
          }
        } else if (isCrafter(definition) && machine.job) {
          if (!definition.requiresKinetic || this.kineticHasWheel(machine)) machine.job.remaining = Math.max(0, machine.job.remaining - seconds);
          this.finishShaping(machine);
        } else if (machine.type === "gradingBench" && machine.job) {
          machine.job.remaining = Math.max(0, machine.job.remaining - seconds);
          if (machine.job.remaining <= epsilon && !machine.output.length) {
            let grade = "Already graded";
            const product = gradeStack(state, machine.job.input, (name) => { grade = name; });
            machine.output.push(product); this.recordOutput(machine, product, grade); machine.job = null;
          }
        } else if (definition.heatCapacity) {
          machine.outputCooldown = Math.max(0, machine.outputCooldown - seconds);
          if (machine.job) machine.job.remaining = Math.max(0, machine.job.remaining - seconds);
          this.finishKiln(machine);
          // A previous finished batch may unload while the next one fires.
          this.startKiln(machine);
        }
        if (!definition.heatCapacity && machine.type !== "gradingBench" && !definition.batchOutputs && !definition.outputBuffer && machine.output.length) {
          const item = machine.output[0];
          for (const output of ports(machine).filter((point) => point.role === "output")) {
            item.quantity -= this.send(machine, item, output);
            if (item.quantity <= epsilon) { machine.output.shift(); break; }
          }
        }
        if (machine.type === "fiber" && !machine.job && machine.input.length && this.total(machine, "output") === 0) {
          machine.job = { input: machine.input.shift(), remaining: D.config.fiberSeconds };
        }
        if (isCrafter(definition)) this.startShaping(machine);
      }
      // Downstream belts release first, so a Stacker does not see its own
      // departing output as a blockage. New arrivals still wait for the next step.
      const stackers = new Map(oldLanes.filter(({ machine }) => D.machines[machine.type].maxStackSize)
        .map((entry) => [entry.machine.id, entry]));
      const orderedLanes = oldLanes.filter(({ machine }) => !D.machines[machine.type].maxStackSize
        && !D.machines[machine.type].manualTransferSeconds), visited = new Set();
      // Resolve occupied Stacker chains downstream first, independent of placement
      // order. Mark before following links so a closed loop cannot recurse forever.
      for (const entry of stackers.values()) {
        const chain = []; let next = entry;
        while (next && !visited.has(next.machine.id)) {
          visited.add(next.machine.id); chain.push(next);
          const output = ports(next.machine).find((point) => point.role === "output"), v = D.vectors[output.direction];
          const target = this.at.get(key(output.x + v.x, output.y + v.y));
          next = stackers.get(target?.id);
        }
        while (chain.length) orderedLanes.push(chain.pop());
      }
      // Check overflow only after downstream belts/Stackers have released. A
      // departing normal output must never trigger a spurious hand transfer.
      const overflows = new Map();
      for (const entry of oldLanes) if (D.machines[entry.machine.type].manualTransferSeconds) {
        if (!overflows.has(entry.machine.id)) overflows.set(entry.machine.id, []);
        overflows.get(entry.machine.id).push(entry);
      }
      const overflowVisited = new Set();
      for (const entries of overflows.values()) {
        const chain = []; let next = entries;
        while (next && !overflowVisited.has(next[0].machine.id)) {
          const machine = next[0].machine;
          overflowVisited.add(machine.id); chain.push(next);
          const output = ports(machine).find((point) => point.role === "output" && !point.mode), v = D.vectors[output.direction];
          next = overflows.get(this.at.get(key(output.x + v.x, output.y + v.y))?.id);
        }
        while (chain.length) orderedLanes.push(...chain.pop());
      }
      for (const { machine, lane, item, ready } of orderedLanes) {
        if (machine.lanes[lane] !== item) continue;
        if (D.machines[machine.type].manualTransferSeconds) this.unloadManualOverflow(machine);
        if (!ready) continue;
        const output = conveyorCells(machine)[Number(lane)];
        if (!output || !this.conveyorPowered(machine, output.x, output.y)) continue;
        if (item.lateral) {
          const v = D.vectors[output.direction], sign = Math.sign(item.lateral);
          const partner = this.conveyorAt(output.x - v.y * sign, output.y + v.x * sign, Boolean(D.machines[machine.type].bridge));
          if (!partner || partner.tile.direction !== output.direction || !this.conveyorPowered(partner.machine, partner.tile.x, partner.tile.y)) continue;
        }
        const before = item.progress;
        item.progress = Math.min(1, item.progress + seconds / conveyorSeconds(machine));
        if (machine.type === "primitive" && before + epsilon < 0.5 && item.progress + epsilon >= 0.5 && D.materials[item.material].value !== null) {
          const { primitiveBonus, primitiveLimit } = state.tuning;
          if (item.value + epsilon < primitiveLimit) {
            setCargoValue(item, item.value + primitiveBonus);
            item.upgrades.primitive = (item.upgrades.primitive ?? 0) + 1;
          }
        }
        if (output.upgrade && before + epsilon < 0.5 && item.progress + epsilon >= 0.5) applyCashEffect(item, machine.type);
        if ((machine.type === "primitive" || output.upgrade) && before + epsilon < 0.5 && item.progress + epsilon >= 0.5) this.recordOutput(machine, item);
        if (item.progress >= 1 - epsilon) {
          const stacking = Boolean(D.machines[machine.type].maxStackSize);
          const outgoing = stacking ? { ...copy(item), quantity: Math.min(item.quantity, this.stackTarget(machine, item)) } : item;
          const accepted = this.send(machine, outgoing, output);
          item.quantity -= accepted;
          if (stacking && accepted > epsilon) item.progress = 0;
          if (item.quantity <= epsilon) delete machine.lanes[lane];
          else if (D.machines[machine.type].manualTransferSeconds && Number(lane) === 0 && accepted <= epsilon && !machine.job) {
            // One bounded carried stack. The hand transfer has its own fixed
            // duration, independent of distance, weight and conveyor power.
            machine.job = { input: { ...copy(item), progress: 0 }, remaining: D.machines[machine.type].manualTransferSeconds };
            delete machine.job.input.lateral;
            delete machine.lanes[lane];
          }
        }
      }
      for (const machine of state.machines) if (D.machines[machine.type].manualTransferSeconds) this.unloadManualOverflow(machine);
      // A buffered shaping bench can work while one finished item waits. Let
      // its departing conveyor cargo clear before unloading and queueing work.
      for (const machine of state.machines) if (isCrafter(D.machines[machine.type])
        && D.machines[machine.type].outputBuffer) this.unloadShaping(machine);
      // Belts release their old cargo first: a Kiln must not see its own
      // departing product as a blockage and lose an extra tick every output.
      for (const machine of state.machines) if (D.machines[machine.type].heatCapacity) this.unloadKiln(machine);
      // Liquid deliveries arrive after solid belts unload. Queue molding in
      // this same step rather than spending another tick waiting to start.
      for (const machine of state.machines) if (D.machines[machine.type].molder) this.startShaping(machine);
      for (const machine of state.machines) if (machine.type === "gradingBench") this.unloadGrader(machine);
      // Like the Kiln, batch sources must not lose throughput by seeing their
      // own departing belt cargo as a blocked outlet on the next cycle.
      for (const machine of state.machines) if (D.machines[machine.type].batchOutputs) this.unloadBatchSource(machine);
      // Old saves can contain one heavier stack per belt cell. Keep its
      // remainder on that instance and release legal portions without bursts.
      for (const machine of state.machines) for (const [lane, item] of Object.entries(machine.beltRemainders ?? {})) {
        if (machine.lanes[lane]) continue;
        const quantity = Math.min(item.quantity, Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight));
        machine.lanes[lane] = { ...copy(item), quantity, progress: 0, fresh: true };
        item.quantity -= quantity;
        if (item.quantity <= epsilon) delete machine.beltRemainders[lane];
        if (!Object.keys(machine.beltRemainders).length) delete machine.beltRemainders;
      }
    }
    status(machine) {
      if (D.machines[machine.type].manualTransferSeconds) {
        if (machine.job) return machine.job.remaining <= epsilon ? "Overflow output blocked"
          : `Redirecting cargo · ${formatNumber(machine.job.remaining)}s`;
        return conveyorCells(machine).every((point) => this.powered(point.x, point.y))
          ? "Straight route first · manual overflow ready" : "Conveyors waiting for kinetic power";
      }
      if (D.machines[machine.type].craftInput && D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine)) return "Waiting for kinetic power";
      if (D.machines[machine.type].maxStackSize) {
        if (!this.powered(machine.x, machine.y)) return "Waiting for kinetic power";
        const item = machine.lanes[0];
        return item ? `Stacking · ${formatNumber(item.quantity)} / ${this.stackTarget(machine, item)}` : `Waiting for items · size ${machine.stackSize}`;
      }
      if (machine.type === "gradingBench") {
        if (machine.job) return `Grading · ${formatNumber(machine.job.remaining)}s`;
        if (machine.output.length) return `Output blocked · ${gradeLabel(machine.output[0])}`;
        return "Waiting for Clay products, stone or copper · 1s per weight";
      }
      if (D.machines[machine.type].batchOutputs) {
        if (machine.output.length) return "Output blocked";
        if (D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine)) return "Waiting for kinetic power";
        return `Sifting · ${formatNumber(Math.max(0, D.machines[machine.type].cycle - machine.timer))}s`;
      }
      if (machine.type === "copperDrill") return machine.output.length ? "Output blocked"
        : !this.kineticHasWheel(machine) ? "Waiting for kinetic power" : `Extracting Native Copper · ${formatNumber(D.machines.copperDrill.cycle - machine.timer)}s`;
      if (machine.type === "clayPit") return machine.output.length ? "Output blocked" : `Digging Clay · ${Math.max(0, D.machines.clayPit.cycle - machine.timer).toFixed(1)}s`;
      if (D.machines[machine.type].sourceModes) return machine.output.length ? "Output blocked"
        : D.machines[machine.type].requiresKinetic && !this.kineticHasWheel(machine) ? "Waiting for kinetic power"
        : `Extracting ${D.materials[machine.mode].name} · ${Math.max(0, D.machines[machine.type].cycle - machine.timer).toFixed(1)}s`;
      if (machine.type === "wheel") return "Kinetic source · two outputs at long-edge centers";
      if (machine.type === "drive") {
        const area = this.powerArea(machine);
        return this.driveHasWheel(machine) ? `Powered · ${area.width}×${area.height} coverage` : "Connect its facing intake to a wheel output";
      }
      if (collectorCapacity(machine)) return `${formatNumber(this.total(machine, "contents"))} / ${collectorCapacity(machine)} items`;
      if (D.machines[machine.type].conveyors) return conveyorCells(machine)
        .every((point) => this.conveyorPowered(machine, point.x, point.y)) ? "Kinetic power available" : "Waiting for kinetic power";
      if (D.machines[machine.type].heatCapacity) {
        if (machine.job) return machine.job.remaining <= epsilon ? "Output blocked" : `Firing · ${formatNumber(machine.job.remaining)}s`;
        if (machine.output.length) return D.materials[machine.output[0].material].fluid
          ? `${D.materials[machine.output[0].material].name} waiting for molding` : "Output waiting";
        const recipe = this.furnaceRecipe(machine);
        if (!recipe) return "Waiting for unfired Bricks or Pots";
        if (this.total(machine, "input") < recipe.input) return `Waiting for a full batch · ${this.total(machine, "input")} / ${recipe.input}`;
        return `Waiting for heat · ${formatNumber(recipe.seconds * (recipe.heatPerSecond ?? D.machines[machine.type].heatPerSecond))}u required`;
      }
      if (machine.job) return machine.job.remaining <= epsilon && isCrafter(D.machines[machine.type])
        ? "Output blocked" : `Processing · ${Math.max(0, machine.job.remaining).toFixed(1)}s`;
      if (machine.output.length) return "Output waiting";
      if (machine.type === "fiber") return "Waiting for a Leek · hand operated";
      if (D.machines[machine.type].molder) return "Waiting for liquid metal";
      if (machine.type === "clayShaper") return `Waiting for ${D.machines.clayShaper.recipes[machine.mode].input} Clay · hand operated`;
      if (D.machines[machine.type].craftInput) return `Waiting for ${D.machines[machine.type].recipes[machine.mode].input} ${D.materials[D.machines[machine.type].craftInput].name}`;
      if (machine.type === "logger") return `Next Wood in ${Math.max(0, D.config.loggerSeconds - machine.timer).toFixed(1)}s`;
      if (machine.type === "planter") return `Next Leek in ${Math.max(0, D.config.planterSeconds - machine.timer).toFixed(1)}s`;
      return "Ready";
    }
    exportSave() { return JSON.stringify({ kind: D.saveKind, version: D.saveVersion, state: this.state }); }
    static importSave(text) {
      const payload = JSON.parse(text);
      if (payload?.kind !== D.saveKind || payload.version !== D.saveVersion || payload.state?.kind !== D.saveKind) throw new Error("This is not a no-ammo opening prototype save. Existing mine saves are kept separate.");
      const state = copy(payload.state), base = createState(1);
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
      if ((state.manualOverflowVersion ?? 0) < 1) {
        if (state.stock && !Object.hasOwn(state.stock, "manualOverflow")) state.stock.manualOverflow = 0;
        state.manualOverflowVersion = 1;
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
        || !Array.isArray(state.storedMachines)) throw new Error("Incomplete prototype save.");
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
            if (!validCargo(item) || item.quantity * D.materials[item.material].weight > 5 + epsilon) throw new Error("Invalid legacy conveyor cargo.");
            const capacity = Math.floor(conveyorWeightLimit(machine) / D.materials[item.material].weight);
            if (item.quantity <= capacity + epsilon) continue;
            machine.beltRemainders ??= {};
            machine.beltRemainders[lane] = { ...copy(item), quantity: item.quantity - capacity, progress: 0 };
            item.quantity = capacity;
          }
        }
        state.beltCapacityVersion = 1;
      }
      for (const field of ["cash", "earned", "seconds", "harvestedWood", "producedFiber", "soldItems"]) {
        if (!Number.isFinite(state[field]) || state[field] < 0) throw new Error(`Invalid ${field}.`);
      }
      for (const material of Object.keys(D.materials)) if (!Number.isFinite(state.inventory?.[material]) || state.inventory[material] < 0
        || (D.materials[material].fluid && state.inventory[material] !== 0)) throw new Error("Invalid material inventory.");
      for (const type of Object.keys(D.machines)) if (!Number.isInteger(state.stock?.[type]) || state.stock[type] < 0) throw new Error("Invalid machine inventory.");
      const ids = new Set();
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
        ids.add(machine.id);
        if (!Number.isInteger(machine.x) || !Number.isInteger(machine.y) || !Number.isFinite(machine.timer) || machine.timer < 0) throw new Error("Invalid machine position or timer.");
        if (![machine.input, machine.output, machine.contents].every(Array.isArray) || !machine.lanes || typeof machine.lanes !== "object") throw new Error("Invalid machine buffers.");
        if (machine.beltRemainders !== undefined && (!machine.beltRemainders || typeof machine.beltRemainders !== "object"
          || Array.isArray(machine.beltRemainders))) throw new Error("Invalid conveyor remainders.");
        for (const item of [...machine.input, ...machine.output, ...machine.contents, ...Object.values(machine.lanes),
          ...Object.values(machine.beltRemainders ?? {})]) if (!validCargo(item)) throw new Error("Invalid cargo.");
        if (machine.job && (!D.machines[machine.type].heatCapacity && !validCargo(machine.job.input)
          || !Number.isFinite(machine.job.remaining))) throw new Error("Invalid production job.");
        if ([...(D.machines[machine.type].molder ? [] : machine.input), ...machine.contents, ...Object.values(machine.lanes), ...Object.values(machine.beltRemainders ?? {})]
          .some((item) => D.materials[item.material].fluid)
          || (!D.machines[machine.type].heatCapacity && machine.output.some((item) => D.materials[item.material].fluid))) {
          throw new Error("Liquid metal must stay in its furnace.");
        }
        if (collectorCapacity(machine) && machine.contents.reduce((sum, item) => sum + item.quantity, 0) > collectorCapacity(machine) + epsilon) throw new Error("Collector exceeds capacity.");
        if (machine.type === "fiber" && (machine.input.reduce((sum, item) => sum + item.quantity, 0) > 1 + epsilon
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > 2 + epsilon
          || machine.input.some((item) => item.material !== "leek" || item.quantity !== 1)
          || machine.output.some((item) => item.material !== "leekFiber")
          || (machine.job && (machine.job.input.material !== "leek" || machine.job.input.quantity !== 1)))) throw new Error("Invalid Fiber buffer.");
        if (!collectorCapacity(machine) && machine.contents.length) throw new Error("Only resource collectors hold collector contents.");
        if (D.machines[machine.type].manualTransferSeconds) {
          if (!Object.hasOwn(D.machines[machine.type].modeFootprints, machine.mode)
            || machine.input.length || machine.output.length || machine.timer !== 0
            || Object.keys(machine.lanes).some((lane) => lane !== "0" && lane !== "1")
            || (machine.job && (machine.job.remaining < 0 || machine.job.remaining > D.machines[machine.type].manualTransferSeconds
              || machine.job.input.lateral !== undefined
              || machine.job.input.quantity * D.materials[machine.job.input.material].weight > conveyorWeightLimit(machine) + epsilon))) {
            throw new Error("Invalid Manual Overflow mode or carried cargo.");
          }
        }
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
            || machine.input.reduce((sum, item) => sum + item.quantity, 0) > definition.inputLimit
            || machine.output.length > 1
            || machine.output.some((item) => !Object.values(recipes).some((outputRecipe) => outputRecipe.output === item.material) || item.quantity !== 1)
            || (machine.job && (!recipe || machine.job.input.material !== definition.craftInput || machine.job.input.quantity !== recipe.input
              || machine.job.remaining < 0 || machine.job.remaining > recipe.seconds
              || machine.output.length > (definition.outputBuffer ?? 0)))) throw new Error(`Invalid ${definition.name} buffer or mode.`);
        }
        if (D.machines[machine.type].molder) {
          const definition = D.machines[machine.type], pending = machine.input.reduce((sum, item) => sum + item.quantity, 0);
          if (pending > definition.inputLimit + epsilon
            || machine.input.some((item) => !moldingProduct(item.material) || item.material !== machine.input[0].material)
            || machine.output.length > definition.outputBuffer
            || machine.output.some((item) => item.quantity !== 1 || !Object.keys(D.materials).some((material) => moldingProduct(material) === item.material))
            || (machine.job && (!moldingProduct(machine.job.input.material) || Math.abs(machine.job.input.quantity - 1) > epsilon
              || machine.job.remaining < 0 || machine.job.remaining > definition.seconds))) throw new Error("Invalid Ingot Molder input, job or output buffer.");
        }
        if (D.machines[machine.type].heatCapacity) {
          const definition = D.machines[machine.type];
          if (definition.manualRecipes && !Object.hasOwn(definition.recipes, machine.mode)) throw new Error("Invalid furnace mode.");
          const inputRecipe = definition.recipes[definition.manualRecipes ? machine.mode : machine.input[0]?.material];
          const outputRecipe = Object.values(definition.recipes).find((recipe) => recipe.output === machine.output[0]?.material);
          const jobRecipe = definition.recipes[machine.job?.recipe];
          if (!Number.isFinite(machine.heat) || machine.heat < 0 || machine.heat > definition.heatCapacity
            || !Number.isFinite(machine.outputCooldown) || machine.outputCooldown < 0
            || machine.outputCooldown > Math.max(definition.outputSeconds, ...Object.values(D.machines)
              .filter((entry) => entry.conveyors).map((entry) => entry.beltSeconds ?? D.config.beltSeconds))
            || (machine.input.length && (!inputRecipe || machine.input.some((item) => item.material !== (inputRecipe.material ?? machine.input[0].material) || !Number.isInteger(item.quantity))
              || machine.input.reduce((sum, item) => sum + item.quantity, 0) > inputRecipe.input))
            || (machine.output.length && (!outputRecipe || machine.output.some((item) => item.material !== machine.output[0].material || !Number.isInteger(item.quantity))
              || machine.output.reduce((sum, item) => sum + item.quantity, 0) > (outputRecipe.outputQuantity ?? outputRecipe.input)))
            || (machine.job && (!jobRecipe || !Array.isArray(machine.job.inputs) || !machine.job.inputs.length
              || machine.job.inputs.some((item) => !validCargo(item) || item.material !== (jobRecipe.material ?? machine.job.recipe) || !Number.isInteger(item.quantity))
              || machine.job.inputs.reduce((sum, item) => sum + item.quantity, 0) !== jobRecipe.input
              || machine.job.remaining < 0 || machine.job.remaining > jobRecipe.seconds))) throw new Error("Invalid Kiln/Furnace heat, batch or output buffer.");
        }
        if (!D.machines[machine.type].heatCapacity && !isCrafter(D.machines[machine.type]) && !D.machines[machine.type].manualTransferSeconds
          && !["fiber", "kiln", "gradingBench"].includes(machine.type) && (machine.input.length || machine.job)) throw new Error("Unexpected machine input.");
        const sourceDefinition = D.machines[machine.type], sourceMaterial = sourceDefinition.source;
        if (sourceDefinition.sourceModes && (!Object.hasOwn(sourceDefinition.sourceModes, machine.mode)
          || machine.timer > sourceDefinition.cycle + epsilon
          || machine.output.some((item) => !Object.hasOwn(sourceDefinition.sourceModes, item.material) || !Number.isInteger(item.quantity))
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > sourceDefinition.outputLimit + epsilon)) throw new Error("Invalid Rock Drill buffer or mode.");
        const batch = D.machines[machine.type].batchOutputs;
        if (batch && (machine.timer > D.machines[machine.type].cycle + epsilon
          || machine.output.some((item) => !Object.hasOwn(batch, item.material))
          || Object.entries(batch).some(([material, quantity]) => machine.output.filter((item) => item.material === material)
            .reduce((sum, item) => sum + item.quantity, 0) > quantity + epsilon))) throw new Error("Invalid sifter timer or output buffer.");
        if (sourceMaterial && (machine.timer > sourceDefinition.cycle + epsilon || machine.output.some((item) => item.material !== sourceMaterial)
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > (D.machines[machine.type].outputLimit ?? 1) + epsilon)) throw new Error("Invalid source buffer.");
        if (!sourceDefinition.heatCapacity && !isCrafter(sourceDefinition) && !["fiber", "kiln", "gradingBench"].includes(machine.type) && !sourceMaterial && !sourceDefinition.sourceModes && !batch && machine.output.length) throw new Error("Unexpected output buffer.");
        const laneCount = conveyorCells(machine).length;
        for (const [lane, item] of Object.entries(machine.lanes)) {
          if (!/^\d+$/.test(lane) || Number(lane) >= laneCount || item.quantity * D.materials[item.material].weight > conveyorWeightLimit(machine) + epsilon) throw new Error("Invalid conveyor cargo.");
        }
        for (const [lane, item] of Object.entries(machine.beltRemainders ?? {})) {
          const active = machine.lanes[lane];
          if (!/^(0|[1-9]\d*)$/.test(lane) || Number(lane) >= laneCount || item.progress !== 0
            || (active && active.material !== item.material)
            || (item.quantity + (active?.quantity ?? 0)) * D.materials[item.material].weight > 5 + epsilon) throw new Error("Invalid conveyor remainder.");
        }
      }
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
      // Keep corrected machine footprints first. Only old layout collisions are
      // recovered with the normal pickup rules; inventory/cargo are not erased.
      const priority = (machine) => machine.type === "planter" ? 2 : machine.type === "fiber" ? 1 : 0;
      const ordered = migrateFootprints ? [...state.machines].sort((a, b) => priority(b) - priority(a)) : state.machines;
      for (const machine of ordered) {
        // Terrain migration picks everything up below. Do not reject an old
        // Logger or a corrected footprint before its contents can be recovered.
        const error = terrainUpdated ? null : factory.placement(machine.type, machine.x, machine.y, machine.facing, null, machine.mode);
        if (error && migrateFootprints && ["Another machine is in the way.", "The tree occupies those tiles.", "Outside the factory."].includes(error)) {
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
      factory.recoveredForPlanterResize = recovered.size;
      factory.reorientedForFiberResize = reorientedFiber;
      return factory;
    }
  }
  const API = { DATA: D, Factory, createState, size, cells, ports, rotatePoint, cargo, opposite, turn, copy, key, formatNumber, blendGradeRepairs, collectorCapacity,
    combineCargo, gradeProbabilities, gradeStack, gradeLabel, conveyorCells, supportsOutputHistory };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NoAmmo = API;
}(globalThis));
