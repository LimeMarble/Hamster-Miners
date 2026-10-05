"use strict";

// Cargo density changes, not belt object count or transit speed.
const CARGO_WEIGHTS = Object.freeze({
  wire: 0.2, contact: 0.3, silverCopperContact: 0.3, silverTinContact: 0.3,
  cutMalachite: 1,
  ...Object.fromEntries(Object.entries(GEAR_DEFINITIONS).map(([material, definition]) => [material, definition.weight])),
});
const CONVEYOR_WEIGHT_LIMITS = Object.freeze({ standard: 5, industrial: 30 });
const AMMO_COATING_LIQUID_PER_BUNDLE = 0.5;
const AMMO_JACKET_LIQUID_PER_BUNDLE = 0.5;
const AGGREGATE_RECIPE = Object.freeze({ limestone: 40, chert: 20, output: 10, seconds: 10 });

function getCargoUnitWeight(item) {
  if (item?.kind === "ammo") {
    if (item.casingMaterial) return 3 / (item.type === "buckshot" ? 5 : 25);
    if (item.jacketMaterial) return 2 / 25;
    return item.material === "leek" ? 1 / 10 : 1.5 / 25;
  }
  return CARGO_WEIGHTS[item?.material] ?? 1;
}

function getCargoWeight(item) {
  const quantity = Number(item?.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity * getCargoUnitWeight(item) : Infinity;
}

function getConveyorWeightCapacity(conveyor) {
  if (Number.isFinite(conveyor?.weightCapacity) && conveyor.weightCapacity > 0) return conveyor.weightCapacity;
  if (isInternalConveyor(conveyor)) {
    const ingredients = MACHINE_PURCHASES[conveyor.internalMachineId]?.materials ?? {};
    if (ingredients.aggregate > 0 && Object.keys(ingredients).some((material) => /^(iron|castIron|steel)/.test(material))) {
      return CONVEYOR_WEIGHT_LIMITS.industrial;
    }
  }
  return CONVEYOR_WEIGHT_LIMITS.standard;
}

function canConveyorCarryItem(conveyor, item) {
  return Boolean(conveyor && item && getCargoWeight(item) <= getConveyorWeightCapacity(conveyor) + 1e-9);
}

// Emit a whole-unit portion; the caller keeps ownership of any remainder.
function emitCapacitySafeCargo(conveyor, item) {
  if (!conveyor || getConveyorItem(conveyor)) return 0;
  const quantity = Number(item?.quantity ?? 1);
  const maximum = getConveyorWeightCapacity(conveyor) / getCargoUnitWeight(item);
  const emitted = quantity <= maximum + 1e-9 ? quantity : Math.floor(maximum + 1e-9);
  if (!(emitted > 0) || !placeItemOnConveyor(conveyor, { ...item, quantity: emitted })) return 0;
  return emitted;
}

// Pure output projection: checking a blocked route never spends liquid or ingredients.
function getProjectedCargoOutput(conveyor, item) {
  const output = { ...item };
  if (isAmmoShaperProcessConveyor(conveyor) && item.kind === "material" && item.material === "leek") {
    output.kind = "ammo";
    output.material = item.metalMaterial ?? "leek";
    output.quantity *= item.metalMaterial ? AMMO_ROUNDS_PER_MINERAL : AMMO_ROUNDS_PER_OTHER_MATERIAL;
  } else if (isCasingMachineProcessConveyor(conveyor) && !item.casingMaterial) {
    output.casingMaterial = "pending";
    output.type = getCasingMachineMode(getCasingMachineForConveyor(conveyor)) === "buckshot" ? "buckshot" : "rapidfire";
    if (output.type === "buckshot") output.quantity *= BUCKSHOT_OUTPUT_ROUNDS / BUCKSHOT_INPUT_ROUNDS;
  } else if (isContactMakerProcessConveyor(conveyor) && item.material === "wire") {
    output.material = "contact";
  } else if (isExtruderProcessConveyor(conveyor) && INGOT_MATERIALS.includes(item.material)) {
    output.material = "wire";
    output.quantity *= 5;
  } else if (isQuartzWheelCutterProcessConveyor(conveyor) && item.material === "copper") {
    output.material = "cutMalachite";
    output.quantity *= QUARTZ_WHEEL_CUTTER_YIELD;
  } else if (isMetalPressProcessConveyor(conveyor) && Object.hasOwn(INGOT_TO_PLATE, item.material)) {
    output.material = INGOT_TO_PLATE[item.material];
  }
  return output;
}

function getCargoTransferGranularity(conveyor, item) {
  // Keep whole contact recipes and full mineral-ammo bundles usable downstream.
  if (isContactMakerProcessConveyor(conveyor) && item.material === "wire") return 5;
  if (item.kind === "ammo" && item.type !== "buckshot" && item.material !== "leek"
    && Number(item.quantity) % BUCKSHOT_INPUT_ROUNDS === 0) return BUCKSHOT_INPUT_ROUNDS;
  return 1;
}

function getWeightedConveyorDestination(conveyor, item) {
  const fullQuantity = Number(item.quantity ?? 1);
  if (!Number.isFinite(fullQuantity) || fullQuantity <= 0) return null;
  const quantum = getCargoTransferGranularity(conveyor, item);
  const sourceMaximum = getConveyorWeightCapacity(conveyor) / getCargoUnitWeight(item);
  let quantity = fullQuantity <= sourceMaximum + 1e-9
    ? fullQuantity : Math.floor((sourceMaximum + 1e-9) / quantum) * quantum;
  while (quantity > 1e-9) {
    const packet = quantity === fullQuantity ? item : { ...item, quantity };
    const target = getUnweightedConveyorAdvanceDestination(conveyor, packet);
    if (target) {
      const output = getProjectedCargoOutput(conveyor, packet);
      if (!target.nextConveyor || canConveyorCarryItem(target.nextConveyor, output)) {
        return { ...target, transferQuantity: quantity, clearsSource: quantity >= fullQuantity - 1e-9 };
      }
      const ratio = getConveyorWeightCapacity(target.nextConveyor) / getCargoWeight(output);
      quantity = Math.floor((quantity * ratio + 1e-9) / quantum) * quantum;
    } else {
      // A finite recipe input can accept the remaining whole units without losing overflow.
      quantity = Math.floor((quantity - 1e-9) / quantum) * quantum;
    }
  }
  return null;
}

function getAggregateMixerInputAt(column, row) {
  return getMachines("aggregateMixer").find((mixer) => getMachinePorts(mixer, "materialInputs")
    .some((port) => port.column === column && port.row === row)) ?? null;
}

function canAggregateMixerAcceptItem(mixer, item) {
  const required = AGGREGATE_RECIPE[item?.material];
  const buffer = state.aggregateMixerInputs[mixer?.instanceId] ?? {};
  return Boolean(mixer && item?.kind === "material" && ["limestone", "chert"].includes(item.material)
    && Number.isFinite(item.quantity) && item.quantity > 0
    && (buffer[item.material] ?? 0) + item.quantity <= required + 1e-9);
}

function receiveAggregateMixerItem(mixer, item) {
  if (!canAggregateMixerAcceptItem(mixer, item)) return false;
  const buffer = state.aggregateMixerInputs[mixer.instanceId] ?? { limestone: 0, chert: 0 };
  buffer[item.material] = Number(((buffer[item.material] ?? 0) + item.quantity).toPrecision(12));
  state.aggregateMixerInputs[mixer.instanceId] = buffer;
  return true;
}

function updateAggregateMixers(deltaSeconds) {
  getMachines("aggregateMixer").forEach((mixer) => {
    const instanceId = mixer.instanceId;
    let job = state.aggregateMixerJobs[instanceId];
    if (job) {
      job.secondsRemaining = Math.max(0, job.secondsRemaining - deltaSeconds * getProcessingSpeedMultiplier());
      if (job.secondsRemaining <= 1e-9) {
        state.aggregateMixerOutputs[instanceId] = (state.aggregateMixerOutputs[instanceId] ?? 0) + AGGREGATE_RECIPE.output;
        delete state.aggregateMixerJobs[instanceId];
      }
    }
    const pendingOutput = state.aggregateMixerOutputs[instanceId] ?? 0;
    const conveyor = getInternalConveyor(mixer, 0);
    if (pendingOutput > 0 && conveyor && !getConveyorItem(conveyor)) {
      const quantity = Math.min(pendingOutput, Math.floor(getConveyorWeightCapacity(conveyor)));
      if (placeItemOnConveyor(conveyor, { kind: "material", material: "aggregate", quantity })) {
        state.aggregateMixerOutputs[instanceId] = pendingOutput - quantity;
      }
    }
    const buffer = state.aggregateMixerInputs[instanceId] ?? {};
    if (!state.aggregateMixerJobs[instanceId] && !(state.aggregateMixerOutputs[instanceId] > 0)
      && !getConveyorItem(conveyor)
      && hasAtLeastQuantity(buffer.limestone ?? 0, AGGREGATE_RECIPE.limestone)
      && hasAtLeastQuantity(buffer.chert ?? 0, AGGREGATE_RECIPE.chert)) {
      buffer.limestone -= AGGREGATE_RECIPE.limestone;
      buffer.chert -= AGGREGATE_RECIPE.chert;
      state.aggregateMixerJobs[instanceId] = { secondsRemaining: AGGREGATE_RECIPE.seconds };
    }
  });
}

function recoverAggregateMixerContents(mixer) {
  const id = mixer.instanceId;
  const input = state.aggregateMixerInputs[id] ?? {};
  state.stockpile.limestone += input.limestone ?? 0;
  state.stockpile.chert += input.chert ?? 0;
  state.stockpile.aggregate += state.aggregateMixerOutputs[id] ?? 0;
  delete state.aggregateMixerInputs[id];
  delete state.aggregateMixerOutputs[id];
  // Consumed ingredients/in-progress work remain owned by the physical instance.
}

function normalizeAggregateMixerInputs(inputs) {
  if (!isSaveRecord(inputs)) return {};
  return Object.fromEntries(Object.entries(inputs).filter(([, buffer]) => isSaveRecord(buffer))
    .map(([id, buffer]) => [id, Object.fromEntries(["limestone", "chert"].map((material) => [
      material, Number.isFinite(buffer[material]) && buffer[material] >= 0 ? buffer[material] : 0,
    ]))]));
}
