"use strict";

const HOT_FLUID_PIPE_MODES = Object.freeze({
  straight: "Straight", leftJunction: "Left junction", rightJunction: "Right junction",
  fourWayJunction: "4-way junction", turn: "Turn", cap: "Cap",
});
const HOT_FLUID_PIPE_THROUGHPUT = 30;
let fluidPipeNetworkCache = null;
let selectedPipePlacementMode = "straight";
let selectedPipeTurnSide = "left";

function getHotFluidPipeMode(pipe) {
  return Object.hasOwn(HOT_FLUID_PIPE_MODES, pipe?.mode) ? pipe.mode : "straight";
}

function getHotFluidPipeOutputDirections(pipe) {
  const local = {
    straight: ["right"], leftJunction: ["right", "up"], rightJunction: ["right", "down"],
    fourWayJunction: ["right", "up", "down"],
    turn: [pipe.turnSide === "right" ? "down" : "up"], cap: [],
  }[getHotFluidPipeMode(pipe)];
  return local.map((direction) => rotateMachineDirection(direction, pipe.orientation ?? "right"));
}

function getHotFluidPipeOutputPorts(pipe) {
  return getHotFluidPipeOutputDirections(pipe).map((direction) => ({ column: pipe.column, row: pipe.row, direction }));
}

function getFluidInputPorts(machine) {
  if (machine.id === "ingotMolder") return [getMachinePort(machine, "liquidInputOutput")];
  if (machine.id === "refractoryCaster") return [getMachinePort(machine, "liquidInput")];
  return getMachinePorts(machine, "liquidInputs");
}

function getHotFluidPipeNetwork() {
  if (fluidPipeNetworkCache) return fluidPipeNetworkCache;
  const pipes = getMachines("hotFluidPipe");
  const byTile = new Map(pipes.map((pipe) => [getFactoryTileKey(pipe.column, pipe.row), pipe]));
  const consumers = state.machines.filter((machine) => getFluidInputPorts(machine).length > 0);
  const nodes = new Map(pipes.map((pipe) => [pipe.instanceId, { pipe, outputs: [], neighbours: new Set(), sealed: true }]));
  nodes.forEach((node) => {
    node.outputs = getHotFluidPipeOutputDirections(node.pipe).map((direction) => {
      const vector = DIRECTION_VECTORS[direction];
      const column = node.pipe.column + vector.column;
      const row = node.pipe.row + vector.row;
      const nextPipe = byTile.get(getFactoryTileKey(column, row));
      if (nextPipe && direction === (nextPipe.orientation ?? "right")) {
        node.neighbours.add(nextPipe.instanceId);
        nodes.get(nextPipe.instanceId).neighbours.add(node.pipe.instanceId);
        return { direction, pipe: nextPipe };
      }
      const consumer = consumers.find((machine) => getFluidInputPorts(machine).some((port) =>
        port && port.column === column && port.row === row && port.direction === direction));
      if (consumer) return { direction, consumer };
      node.sealed = false;
      return { direction, open: true };
    });
  });
  const visited = new Set();
  nodes.forEach((start) => {
    if (visited.has(start.pipe.instanceId)) return;
    const component = [];
    const pending = [start.pipe.instanceId];
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.get(id);
      component.push(node);
      pending.push(...node.neighbours);
    }
    const sealed = component.every((node) => node.sealed);
    component.forEach((node) => { node.sealed = sealed; });
  });
  fluidPipeNetworkCache = { nodes, byTile };
  return fluidPipeNetworkCache;
}

function getPipeStoredWeight(pipe) {
  return state.moltenCopper.reduce((sum, liquid) => getMoltenMetalOwnerInstanceId(liquid) === pipe.instanceId
    ? sum + getCargoWeight(liquid) : sum, 0);
}

function getFluidConsumerDemand(consumer, liquid, requestedItem = null) {
  const id = consumer.instanceId;
  if (["ingotMolder", "refractoryCaster"].includes(consumer.id)) {
    if (!MOLDER_METAL_ORES.includes(liquid.material) || state.molderOutputBuffers[id]
      || state.molderJobs.some((job) => job.molderInstanceId === id)) return 0;
    if (consumer.id === "ingotMolder" && (getAvailableCrew() < 1
      || liquid.material === "iron" && !hasAtLeastQuantity(state.molderClayBuffers[id] ?? 0, 1))) return 0;
    return 1;
  }
  const item = requestedItem ?? getConveyorItem(getInternalConveyor(consumer, getMachineProcessLaneIndex(consumer)));
  if (consumer.id === "ammoShaper") return state.mine.ammoShaperMode === "coated"
    && item?.kind === "material" && item.material === "leek" && !item.metalMaterial
    && LIQUID_METAL_AMMO_MATERIALS.includes(liquid.material)
    ? item.quantity * AMMO_COATING_LIQUID_PER_BUNDLE : 0;
  if (consumer.id === "jacketFormer") return item?.kind === "ammo" && !item.jacketMaterial && liquid.material === "nativeCopper"
    ? item.quantity / AMMO_ROUNDS_PER_MINERAL * AMMO_JACKET_LIQUID_PER_BUNDLE : 0;
  if (consumer.id === "casingMachine") {
    const output = getInternalConveyor(consumer, getMachineProcessLaneIndex(consumer) + 1);
    return item && !getConveyorItem(output) && canCasingMachineAcceptItem(consumer, item) && getCasingMaterial(liquid.material)
      ? item.quantity / BUCKSHOT_INPUT_ROUNDS : 0;
  }
  return 0;
}

function canPipeReceiveFluid(pipe, liquid) {
  if (getHotFluidPipeMode(pipe) === "cap" || !getHotFluidPipeNetwork().nodes.get(pipe.instanceId)?.sealed) return false;
  const current = state.moltenCopper.find((entry) => getMoltenMetalOwnerInstanceId(entry) === pipe.instanceId);
  return (!current || current.material === liquid.material) && getPipeStoredWeight(pipe) < HOT_FLUID_PIPE_THROUGHPUT - 1e-9;
}

function getPreferredPipeOutput(pipe, liquid, requestingConsumer = null, requestedItem = null) {
  const node = getHotFluidPipeNetwork().nodes.get(pipe.instanceId);
  if (!node?.sealed || !node.outputs.length) return null;
  const start = Math.max(0, Math.floor(pipe.pipeNextOutputIndex ?? 0)) % node.outputs.length;
  for (let offset = 0; offset < node.outputs.length; offset += 1) {
    const index = (start + offset) % node.outputs.length;
    const output = node.outputs[index];
    if (output.pipe && canPipeReceiveFluid(output.pipe, liquid)) return { ...output, index };
    if (output.consumer) {
      const required = getFluidConsumerDemand(output.consumer, liquid,
        output.consumer.instanceId === requestingConsumer?.instanceId ? requestedItem : null);
      const total = state.moltenCopper.reduce((sum, entry) => getMoltenMetalOwnerInstanceId(entry) === pipe.instanceId
        && entry.material === liquid.material ? sum + Number(entry.quantity ?? 1) : sum, 0);
      if (required > 0 && total + 1e-9 >= required
        && (pipe.pipeFlowCredit ?? 0) + 1e-9 >= required * getCargoUnitWeight(liquid)) return { ...output, index };
    }
  }
  return null;
}

function getAvailableLiquidQuantity(liquid, consumer = null, requestedItem = null) {
  const quantity = Math.max(0, Number(liquid?.quantity ?? 1) || 0);
  const owner = getMachineByInstanceId(getMoltenMetalOwnerInstanceId(liquid));
  if (owner?.id !== "hotFluidPipe") return quantity;
  if (!getHotFluidPipeNetwork().nodes.get(owner.instanceId)?.sealed) return 0;
  if (consumer && getPreferredPipeOutput(owner, liquid, consumer, requestedItem)?.consumer?.instanceId !== consumer.instanceId) return 0;
  return Math.min(quantity, (owner.pipeFlowCredit ?? 0) / getCargoUnitWeight(liquid));
}

function spendLiquidFlowCredit(liquid, quantity, consumer = null, requestedItem = null) {
  const pipe = getMachineByInstanceId(getMoltenMetalOwnerInstanceId(liquid));
  if (pipe?.id !== "hotFluidPipe") return;
  const output = getPreferredPipeOutput(pipe, liquid, consumer, requestedItem);
  pipe.pipeFlowCredit = Math.max(0, (pipe.pipeFlowCredit ?? 0) - quantity * getCargoUnitWeight(liquid));
  if (output) pipe.pipeNextOutputIndex = output.index + 1;
}

function getAvailableLiquidTotal(liquids, consumer, requestedItem = null) {
  const usedPipeWeight = new Map();
  return liquids.reduce((total, liquid) => {
    const owner = getMachineByInstanceId(getMoltenMetalOwnerInstanceId(liquid));
    let available = getAvailableLiquidQuantity(liquid, consumer, requestedItem);
    if (owner?.id === "hotFluidPipe") {
      const used = usedPipeWeight.get(owner.instanceId) ?? 0;
      const weight = getCargoUnitWeight(liquid);
      available = Math.min(available, Math.max(0, (owner.pipeFlowCredit ?? 0) - used) / weight);
      usedPipeWeight.set(owner.instanceId, used + available * weight);
    }
    return total + available;
  }, 0);
}

function queuePipeFluid(pipe, liquid, quantity) {
  const signature = (entry) => JSON.stringify([entry.material, entry.sourceMaterial, entry.sourceValueIsEffective === true,
    entry.cashUpgraderEligibility ?? {}]);
  const matching = state.moltenCopper.find((entry) => getMoltenMetalOwnerInstanceId(entry) === pipe.instanceId
    && signature(entry) === signature(liquid));
  if (matching) {
    const total = Number(matching.quantity) + quantity;
    matching.sourceValue = ((matching.sourceValue ?? 0) * matching.quantity + (liquid.sourceValue ?? 0) * quantity) / total;
    matching.quantity = Number(total.toPrecision(12));
  } else {
    state.moltenCopper.push({ ...liquid, quantity, kilnInstanceId: pipe.instanceId, smelterInstanceId: pipe.instanceId });
  }
}

function updateHotFluidPipes(deltaSeconds) {
  const network = getHotFluidPipeNetwork();
  if (!network.nodes.size) return;
  network.nodes.forEach(({ pipe, sealed }) => {
    pipe.pipeFlowCredit = sealed
      ? Math.min(HOT_FLUID_PIPE_THROUGHPUT, (pipe.pipeFlowCredit ?? 0) + Math.max(0, deltaSeconds) * HOT_FLUID_PIPE_THROUGHPUT)
      : 0;
  });
  const sources = [...getMachines("clayKiln"), ...getMachines("miniElectricArcFurnace"), ...getMachines("hotFluidPipe")];
  sources.forEach((source) => {
    const liquidIndex = findMoltenCopperIndex(source.instanceId);
    if (liquidIndex < 0) return;
    const liquid = state.moltenCopper[liquidIndex];
    let target;
    if (source.id === "hotFluidPipe") {
      target = getPreferredPipeOutput(source, liquid)?.pipe;
    } else {
      const port = getMachinePort(source, "liquidOutput");
      const vector = port?.direction && DIRECTION_VECTORS[port.direction];
      target = vector && network.byTile.get(getFactoryTileKey(port.column + vector.column, port.row + vector.row));
      if (target?.orientation !== port?.direction) target = null;
    }
    if (!target || !canPipeReceiveFluid(target, liquid)) return;
    const quantity = Math.min(getAvailableLiquidQuantity(liquid),
      (HOT_FLUID_PIPE_THROUGHPUT - getPipeStoredWeight(target)) / getCargoUnitWeight(liquid));
    if (quantity <= 1e-9) return;
    spendLiquidFlowCredit(liquid, quantity);
    queuePipeFluid(target, liquid, quantity);
    subtractQuantity(liquid, quantity, 1);
  });
  state.moltenCopper = state.moltenCopper.filter((liquid) => Number(liquid.quantity ?? 1) > 1e-9);
}

function getAdjacentFluidSourceLinks(inputs, permittedSmelters = ["clayKiln", "miniElectricArcFurnace"]) {
  return state.machines.filter((machine) => permittedSmelters.includes(machine.id) || machine.id === "hotFluidPipe")
    .flatMap((source) => {
      if (source.id === "hotFluidPipe" && !getHotFluidPipeNetwork().nodes.get(source.instanceId)?.sealed) return [];
      const outputs = source.id === "hotFluidPipe" ? getHotFluidPipeOutputPorts(source) : [getMachinePort(source, "liquidOutput")];
      return outputs.filter(Boolean).flatMap((output) => {
        const vector = DIRECTION_VECTORS[output.direction];
        const input = inputs.find((port) => port && output.column + vector.column === port.column
          && output.row + vector.row === port.row && output.direction === port.direction);
        return input ? [{ source, output, input }] : [];
      });
    });
}

function getReadyFluidSourceLink(links, consumer) {
  return links.find(({ source }) => state.moltenCopper.some((liquid) => {
    if (getMoltenMetalOwnerInstanceId(liquid) !== source.instanceId) return false;
    const required = getFluidConsumerDemand(consumer, liquid);
    return required > 0 && hasAtLeastQuantity(getAvailableLiquidQuantity(liquid, consumer), required);
  })) ?? links[0] ?? null;
}

function switchHotFluidPipeMode(pipe, mode, turnSide = pipe.turnSide ?? "left") {
  if (pipe?.id !== "hotFluidPipe" || !Object.hasOwn(HOT_FLUID_PIPE_MODES, mode)) return false;
  pipe.mode = mode;
  pipe.turnSide = turnSide === "right" ? "right" : "left";
  pipe.pipeNextOutputIndex = 0;
  pipe.pipeFlowCredit = 0;
  invalidateFactoryConveyorCache();
  refreshMachineStaticLayer();
  return true;
}
