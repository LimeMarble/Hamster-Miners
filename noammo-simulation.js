(function (root) {
  "use strict";
  const D = typeof module !== "undefined" && module.exports ? require("./noammo-data.js") : root.NoAmmoData;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const key = (x, y) => `${x},${y}`;
  const epsilon = 1e-8;
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const opposite = (direction) => D.directions[(D.directions.indexOf(direction) + 2) % 4];
  const turn = (direction, count) => D.directions[(D.directions.indexOf(direction) + count + 4) % 4];

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
    switch (machine.type) {
      case "planter": add(2, 1, "right", "output"); break;
      case "logger": add(0, 0, "right", "output"); break;
      case "fiber": add(0, 1, "left", "input"); add(0, 1, "right", "output"); break;
      case "belt": add(0, 0, "right", "output"); break;
      case "primitive":
        for (let y = 0; y < 2; y++) { add(0, y, "left", "input"); add(0, y, "right", "output"); }
        break;
      case "drive": add(1, 0, "right", "kineticInput"); add(0, 0, "left", "kineticOutput"); break;
      case "wheel":
        for (let x = 0; x < 3; x++) { add(x, 0, "up", "kineticOutput"); add(x, 1, "down", "kineticOutput"); }
        break;
    }
    return result;
  }
  function cargo(material, quantity = 1, value = D.materials[material]?.value ?? 0) {
    return { material, quantity, value, upgrades: {}, progress: 0 };
  }
  function validCargo(item) {
    return item && D.materials[item.material] && Number.isFinite(item.quantity) && item.quantity > 0
      && Number.isFinite(item.value) && item.value >= 0 && item.upgrades && typeof item.upgrades === "object"
      && !Array.isArray(item.upgrades) && Number.isFinite(item.progress) && item.progress >= 0 && item.progress <= 1;
  }
  function sameCargo(a, b) {
    return a.material === b.material && Math.abs(a.value - b.value) < epsilon
      && JSON.stringify(a.upgrades) === JSON.stringify(b.upgrades);
  }
  function random(state) {
    state.random = (Math.imul(1664525, state.random) + 1013904223) >>> 0;
    return state.random / 4294967296;
  }
  function createState(seed = Date.now() >>> 0) {
    const state = {
      kind: D.saveKind, version: D.saveVersion, planterFootprintVersion: 2, fiberFootprintVersion: 3, random: seed >>> 0, seconds: 0, nextId: 1,
      cash: 0, earned: 0, inventory: { leek: 0, leekFiber: 0, wood: 0 },
      stock: Object.fromEntries(Object.keys(D.machines).map((type) => [type, 0])),
      storedMachines: [], machines: [], routes: [], trees: [], harvestProgress: 0,
      clickTokens: 1, harvestedWood: 0, soldItems: 0, producedFiber: 0,
      tuning: { primitiveBonus: 0.1, primitiveLimit: 1 },
    };
    // Guarantee a tree in the starting viewport; the remaining forest is seeded and scattered.
    state.trees.push({ id: "tree-1", x: 127, y: 9 });
    while (state.trees.length < D.config.treeCount) {
      const x = 3 + Math.floor(random(state) * (D.config.columns - 8));
      const y = 4 + Math.floor(random(state) * (D.config.rows - 9));
      if (x > 114 && x < 137 && y < 21) continue;
      if (state.trees.some((tree) => Math.abs(tree.x - x) < 5 && Math.abs(tree.y - y) < 5)) continue;
      state.trees.push({ id: `tree-${state.trees.length + 1}`, x, y });
    }
    state.stock.planter = 1;
    state.stock.basket = 1;
    return state;
  }

  class Factory {
    constructor(state = createState()) {
      this.state = state;
      this.layoutVersion = 0;
      this.rebuild();
    }
    rebuild() {
      this.byId = new Map(this.state.machines.map((machine) => [machine.id, machine]));
      this.at = new Map(); this.treeAt = new Map();
      for (const tree of this.state.trees) {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) this.treeAt.set(key(tree.x + dx, tree.y + dy), tree);
      }
      for (const machine of this.state.machines) for (const cell of cells(machine)) this.at.set(key(cell.x, cell.y), machine);
      this.poweredDrives = this.state.machines.filter((machine) => machine.type === "drive" && this.driveHasWheel(machine));
      this.layoutVersion++;
    }
    driveHasWheel(drive) {
      const intake = ports(drive).find((point) => point.role === "kineticInput");
      const v = D.vectors[intake.direction], wheel = this.at.get(key(intake.x + v.x, intake.y + v.y));
      return wheel?.type === "wheel" && ports(wheel).some((point) => point.role === "kineticOutput"
        && point.x === intake.x + v.x && point.y === intake.y + v.y
        && point.direction === opposite(intake.direction));
    }
    powerArea(drive) {
      const bounds = size(drive);
      return { x: drive.x + bounds.width / 2 - D.config.powerAreaSize / 2,
        y: drive.y + bounds.height / 2 - D.config.powerAreaSize / 2,
        width: D.config.powerAreaSize, height: D.config.powerAreaSize };
    }
    powered(x, y) {
      return this.poweredDrives.some((drive) => {
        const area = this.powerArea(drive);
        return x + 0.5 >= area.x && x + 0.5 < area.x + area.width
          && y + 0.5 >= area.y && y + 0.5 < area.y + area.height;
      });
    }
    availableCrew() {
      const used = this.state.machines.reduce((sum, machine) => sum + (D.machines[machine.type].crew ?? 0), 0);
      return D.config.startingCrew - used - this.state.routes.length;
    }
    placement(type, x, y, facing = D.machines[type]?.defaultFacing ?? "right", ignoreId = null) {
      if (!D.machines[type] || !D.directions.includes(facing) || !Number.isInteger(x) || !Number.isInteger(y)) return "Invalid placement.";
      const machine = { type, x, y, facing }, occupied = cells(machine);
      if (occupied.some((cell) => cell.x < 0 || cell.y < 0 || cell.x >= D.config.columns || cell.y >= D.config.rows)) return "Outside the factory.";
      if (occupied.some((cell) => this.at.has(key(cell.x, cell.y)) && this.at.get(key(cell.x, cell.y)).id !== ignoreId)) return "Another machine is in the way.";
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
    place(type, x, y, facing = D.machines[type]?.defaultFacing ?? "right") {
      const error = this.placement(type, x, y, facing);
      if (error) return { error };
      if (!(this.state.stock[type] > 0)) return { error: "No owned machine to place." };
      this.state.stock[type]--;
      const storedIndex = this.state.storedMachines.findIndex((machine) => machine.type === type);
      const stored = storedIndex < 0 ? null : this.state.storedMachines.splice(storedIndex, 1)[0];
      const machine = Object.assign(stored ?? { id: `machine-${this.state.nextId++}`, type, timer: 0,
        input: [], output: [], contents: [], lanes: {}, job: null }, { x, y, facing });
      this.state.machines.push(machine); this.rebuild();
      return { machine };
    }
    move(id, x, y, facing) {
      const machine = this.byId.get(id);
      if (!machine) return { error: "Machine not found." };
      const error = this.placement(machine.type, x, y, facing, id);
      if (error) return { error };
      if (machine.type === "basket") this.collect(id);
      Object.assign(machine, { x, y, facing }); this.rebuild();
      return { machine };
    }
    collect(id) {
      const basket = this.byId.get(id);
      if (basket?.type !== "basket") return 0;
      let quantity = 0;
      for (const item of basket.contents) { this.state.inventory[item.material] += item.quantity; quantity += item.quantity; }
      basket.contents = [];
      return quantity;
    }
    pickup(id) {
      const machine = this.byId.get(id);
      if (!machine) return false;
      if (machine.type === "basket") this.collect(id);
      // A pickup ends linked haul jobs; carried resources are recovered once, never copied.
      for (const route of this.state.routes.filter((route) => route.source === id || route.destination === id)) this.removeRoute(route.id);
      for (const item of [...machine.input, ...machine.output, ...Object.values(machine.lanes)]) {
        if (validCargo(item)) this.state.inventory[item.material] += item.quantity;
      }
      if (machine.job) this.state.inventory[machine.job.input.material] += machine.job.input.quantity;
      machine.input = []; machine.output = []; machine.contents = []; machine.lanes = {}; machine.job = null; machine.timer = 0;
      this.state.machines = this.state.machines.filter((other) => other !== machine);
      this.state.stock[machine.type]++;
      this.state.storedMachines.push(machine);
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
      return null;
    }
    buy(type, amount = 1) {
      const error = this.affordability(type, amount);
      if (error) return { error };
      const cost = D.machines[type].cost;
      this.state.cash = Math.max(0, this.state.cash - cost.cash * amount);
      for (const [material, quantity] of Object.entries(cost.materials)) this.state.inventory[material] -= quantity * amount;
      this.state.stock[type] += amount; return { amount };
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
      for (const item of items) if (D.materials[item.material]?.value !== null) {
        money += item.quantity * item.value; quantity += item.quantity;
      }
      this.state.cash += money; this.state.earned += money; this.state.soldItems += quantity;
      return money;
    }
    sellBasket(id) {
      const basket = this.byId.get(id);
      if (basket?.type !== "basket") return 0;
      const money = this.sell(basket.contents);
      basket.contents = basket.contents.filter((item) => D.materials[item.material].value === null);
      return money;
    }
    sellInventory(material, quantity) {
      if (!D.materials[material] || D.materials[material].value === null || !Number.isFinite(quantity) || quantity <= 0) return 0;
      const count = Math.min(quantity, this.state.inventory[material]);
      this.state.inventory[material] -= count;
      return this.sell([cargo(material, count)]);
    }
    total(machine, field) { return machine[field].reduce((sum, item) => sum + item.quantity, 0); }
    receive(machine, item, x, y, incomingSide, consume = false) {
      if (!validCargo(item)) return 0;
      const input = ports(machine).find((point) => point.role === "input" && point.x === x && point.y === y
        && (!incomingSide || point.direction === incomingSide));
      let quantity = 0;
      if (machine.type === "basket") {
        quantity = Math.min(item.quantity, D.config.basketCapacity - this.total(machine, "contents"));
        if (consume && quantity > epsilon) {
          const existing = machine.contents.find((entry) => sameCargo(entry, item));
          if (existing) existing.quantity += quantity;
          else machine.contents.push({ ...copy(item), quantity, progress: 0 });
        }
      } else if (machine.type === "sellTube" && D.materials[item.material].value !== null) {
        quantity = item.quantity;
        if (consume) this.sell([item]);
      } else if (machine.type === "fiber" && input && item.material === "leek") {
        quantity = item.quantity + epsilon >= 1 && this.total(machine, "input") === 0 ? 1 : 0;
        if (consume && quantity > epsilon) machine.input.push({ ...copy(item), quantity, progress: 0 });
      } else if (machine.type === "belt" || (machine.type === "primitive" && input)) {
        if (!this.powered(x, y)) return 0;
        if (machine.type === "belt" && incomingSide === machine.facing) return 0;
        const lane = this.laneIndex(machine, x, y);
        if (!machine.lanes[lane]) {
          quantity = Math.min(item.quantity, Math.floor(D.config.beltWeight / D.materials[item.material].weight));
          if (consume && quantity > epsilon) machine.lanes[lane] = { ...copy(item), quantity, progress: 0, fresh: true };
        }
      }
      return Math.max(0, quantity);
    }
    laneIndex(machine, x, y) {
      const outputs = ports(machine).filter((point) => point.role === "output");
      return Math.max(0, outputs.findIndex((point) => point.x === x && point.y === y));
    }
    send(machine, item, output) {
      const v = D.vectors[output.direction], x = output.x + v.x, y = output.y + v.y;
      const target = this.at.get(key(x, y));
      if (!target || target.id === machine.id) return 0;
      return this.receive(target, item, x, y, opposite(output.direction), true);
    }
    addRoute(sourceId, destinationId, material = "any") {
      const source = this.byId.get(sourceId), destination = this.byId.get(destinationId);
      if (source?.type !== "basket" || !destination || sourceId === destinationId) return { error: "Choose a Basket and a different destination." };
      if (!ports(destination).some((point) => point.role === "input") && !["basket", "sellTube", "belt"].includes(destination.type)) return { error: "That machine cannot accept deliveries." };
      if (this.availableCrew() < 1) return { error: "No hamster available for hauling." };
      if (material !== "any" && !D.materials[material]) return { error: "Unknown hauling material." };
      const route = { id: `route-${this.state.nextId++}`, source: sourceId, destination: destinationId,
        material, phase: "pickup", remaining: 0, duration: 0, item: null };
      this.state.routes.push(route); return { route };
    }
    removeRoute(id) {
      const route = this.state.routes.find((entry) => entry.id === id);
      if (!route) return;
      if (route.item) this.state.inventory[route.item.material] += route.item.quantity;
      this.state.routes = this.state.routes.filter((entry) => entry !== route);
    }
    routeDistance(source, destination) {
      const a = size(source), b = size(destination);
      return Math.max(1, Math.abs(source.x + a.width / 2 - destination.x - b.width / 2)
        + Math.abs(source.y + a.height / 2 - destination.y - b.height / 2));
    }
    updateRoute(route, seconds) {
      const source = this.byId.get(route.source), destination = this.byId.get(route.destination);
      if (!source || !destination) { this.removeRoute(route.id); return; }
      if (route.phase === "pickup") {
        const entry = source.contents.find((item) => route.material === "any" || item.material === route.material);
        if (!entry) return;
        // A collector withdrawal is stale: fresh cash upgrades do not teleport through storage.
        route.item = cargo(entry.material, Math.min(1, entry.quantity));
        entry.quantity -= route.item.quantity;
        source.contents = source.contents.filter((item) => item.quantity > epsilon);
        route.duration = this.routeDistance(source, destination) * D.config.loadedSecondsPerTilePerWeight
          * D.materials[route.item.material].weight * route.item.quantity;
        route.remaining = route.duration; route.phase = "loaded";
        return;
      }
      route.remaining = Math.max(0, route.remaining - seconds);
      if (route.remaining > epsilon) return;
      if (route.phase === "return") { route.phase = "pickup"; return; }
      const inputs = ports(destination).filter((point) => point.role === "input");
      const targets = inputs.length ? inputs : cells(destination);
      for (const point of targets) {
        const accepted = this.receive(destination, route.item, point.x, point.y, point.direction, true);
        route.item.quantity -= accepted;
        if (route.item.quantity <= epsilon) {
          route.item = null; route.phase = "return";
          route.duration = this.routeDistance(source, destination) * D.config.emptySecondsPerTile;
          route.remaining = route.duration; return;
        }
      }
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
      state.clickTokens = Math.min(1, state.clickTokens + seconds * D.config.clicksPerSecond);
      // Arrivals cannot traverse a second belt during the same simulation step.
      const oldLanes = state.machines.flatMap((machine) => Object.entries(machine.lanes).map(([lane, item]) => ({ machine, lane, item })));
      for (const machine of state.machines) {
        if (machine.type === "planter" || machine.type === "logger") {
          const cycle = machine.type === "planter" ? D.config.planterSeconds : D.config.loggerSeconds;
          const limit = machine.type === "planter" ? 2 : 1;
          if (this.total(machine, "output") < limit) {
            machine.timer += seconds;
            if (machine.timer + epsilon >= cycle) {
              machine.timer = Math.max(0, machine.timer - cycle);
              machine.output.push(cargo(machine.type === "planter" ? "leek" : "wood"));
            }
          }
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
        }
        if (machine.output.length) {
          const item = machine.output[0];
          for (const output of ports(machine).filter((point) => point.role === "output")) {
            item.quantity -= this.send(machine, item, output);
            if (item.quantity <= epsilon) { machine.output.shift(); break; }
          }
        }
        if (machine.type === "fiber" && !machine.job && machine.input.length && this.total(machine, "output") === 0) {
          machine.job = { input: machine.input.shift(), remaining: D.config.fiberSeconds };
        }
      }
      for (const { machine, lane, item } of oldLanes) {
        if (machine.lanes[lane] !== item) continue;
        const output = ports(machine).filter((point) => point.role === "output")[Number(lane)];
        if (!output || !this.powered(output.x, output.y)) continue;
        const before = item.progress;
        item.progress = Math.min(1, item.progress + seconds / D.config.beltSeconds);
        if (machine.type === "primitive" && before < 0.5 && item.progress >= 0.5 && D.materials[item.material].value !== null) {
          const { primitiveBonus, primitiveLimit } = state.tuning;
          if (item.value + epsilon < primitiveLimit) {
            item.value += primitiveBonus;
            item.upgrades.primitive = (item.upgrades.primitive ?? 0) + 1;
          }
        }
        if (item.progress >= 1 - epsilon) {
          item.quantity -= this.send(machine, item, output);
          if (item.quantity <= epsilon) delete machine.lanes[lane];
        }
      }
      for (const route of [...state.routes]) this.updateRoute(route, seconds);
    }
    status(machine) {
      if (machine.type === "wheel") return "Kinetic source · connections on both long edges";
      if (machine.type === "drive") return this.driveHasWheel(machine) ? "Powered · 16×16 coverage" : "Connect its facing intake to a wheel’s long edge";
      if (machine.type === "basket") return `${this.total(machine, "contents")} / ${D.config.basketCapacity} items`;
      if (machine.type === "belt" || machine.type === "primitive") return cells(machine).every((cell) => this.powered(cell.x, cell.y)) ? "Kinetic power available" : "Waiting for kinetic power";
      if (machine.job) return `Processing · ${Math.max(0, machine.job.remaining).toFixed(1)}s`;
      if (machine.output.length) return "Output waiting";
      if (machine.type === "fiber") return "Waiting for a Leek · hand operated";
      if (machine.type === "logger") return `Next Wood in ${Math.max(0, D.config.loggerSeconds - machine.timer).toFixed(1)}s`;
      if (machine.type === "planter") return `Next Leek in ${Math.max(0, D.config.planterSeconds - machine.timer).toFixed(1)}s`;
      return "Ready";
    }
    exportSave() { return JSON.stringify({ kind: D.saveKind, version: D.saveVersion, state: this.state }); }
    static importSave(text) {
      const payload = JSON.parse(text);
      if (payload?.kind !== D.saveKind || payload.version !== D.saveVersion || payload.state?.kind !== D.saveKind) throw new Error("This is not a no-ammo opening prototype save. Existing mine saves are kept separate.");
      const state = copy(payload.state), base = createState(1);
      if (!Array.isArray(state.machines) || !Array.isArray(state.trees) || !Array.isArray(state.routes)
        || !Array.isArray(state.storedMachines) || state.trees.length !== D.config.treeCount) throw new Error("Incomplete prototype save.");
      for (const field of ["cash", "earned", "seconds", "harvestedWood", "producedFiber", "soldItems"]) {
        if (!Number.isFinite(state[field]) || state[field] < 0) throw new Error(`Invalid ${field}.`);
      }
      for (const material of Object.keys(D.materials)) if (!Number.isFinite(state.inventory?.[material]) || state.inventory[material] < 0) throw new Error("Invalid material inventory.");
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
        for (const item of [...machine.input, ...machine.output, ...machine.contents, ...Object.values(machine.lanes)]) if (!validCargo(item)) throw new Error("Invalid cargo.");
        if (machine.job && (!validCargo(machine.job.input) || !Number.isFinite(machine.job.remaining))) throw new Error("Invalid production job.");
        if (machine.type === "basket" && machine.contents.reduce((sum, item) => sum + item.quantity, 0) > D.config.basketCapacity + epsilon) throw new Error("Basket exceeds capacity.");
        if (machine.type === "fiber" && (machine.input.reduce((sum, item) => sum + item.quantity, 0) > 1 + epsilon
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > 2 + epsilon
          || machine.input.some((item) => item.material !== "leek" || item.quantity !== 1)
          || machine.output.some((item) => item.material !== "leekFiber")
          || (machine.job && (machine.job.input.material !== "leek" || machine.job.input.quantity !== 1)))) throw new Error("Invalid Fiber buffer.");
        if (machine.type !== "basket" && machine.contents.length) throw new Error("Only Baskets hold collector contents.");
        if (machine.type !== "fiber" && (machine.input.length || machine.job)) throw new Error("Unexpected machine input.");
        const sourceMaterial = machine.type === "planter" ? "leek" : machine.type === "logger" ? "wood" : null;
        if (sourceMaterial && (machine.output.some((item) => item.material !== sourceMaterial)
          || machine.output.reduce((sum, item) => sum + item.quantity, 0) > (machine.type === "planter" ? 2 : 1) + epsilon)) throw new Error("Invalid source buffer.");
        if (!["fiber", "planter", "logger"].includes(machine.type) && machine.output.length) throw new Error("Unexpected output buffer.");
        const laneCount = machine.type === "primitive" ? 2 : machine.type === "belt" ? 1 : 0;
        for (const [lane, item] of Object.entries(machine.lanes)) {
          if (!/^\d+$/.test(lane) || Number(lane) >= laneCount || item.quantity * D.materials[item.material].weight > D.config.beltWeight + epsilon) throw new Error("Invalid conveyor cargo.");
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
      const factory = new Factory({ ...state, planterFootprintVersion: 2, fiberFootprintVersion: 3, machines: [], routes: [] });
      const recovered = new Set();
      // Keep corrected machine footprints first. Only old layout collisions are
      // recovered with the normal pickup rules; inventory/cargo are not erased.
      const priority = (machine) => machine.type === "planter" ? 2 : machine.type === "fiber" ? 1 : 0;
      const ordered = migrateFootprints ? [...state.machines].sort((a, b) => priority(b) - priority(a)) : state.machines;
      for (const machine of ordered) {
        const error = factory.placement(machine.type, machine.x, machine.y, machine.facing);
        if (error && migrateFootprints && ["Another machine is in the way.", "The tree occupies those tiles.", "Outside the factory."].includes(error)) {
          factory.state.machines.push(machine); factory.rebuild(); factory.pickup(machine.id);
          recovered.add(machine.id); continue;
        }
        if (error) throw new Error(error);
        factory.state.machines.push(machine); factory.rebuild();
      }
      for (const route of state.routes) {
        if (migrateFootprints && (recovered.has(route.source) || recovered.has(route.destination))) {
          if (route.item) {
            if (!validCargo(route.item) || route.item.quantity > 1) throw new Error("Invalid hauling cargo.");
            factory.state.inventory[route.item.material] += route.item.quantity;
          }
          continue;
        }
        if (ids.has(route.id) || typeof route.id !== "string" || factory.byId.get(route.source)?.type !== "basket"
          || !factory.byId.has(route.destination) || !["pickup", "loaded", "return"].includes(route.phase)
          || !Number.isFinite(route.remaining) || route.remaining < 0 || !Number.isFinite(route.duration)
          || route.duration < 0 || (route.item && !validCargo(route.item))
          || (route.material !== "any" && !D.materials[route.material])
          || (route.phase === "loaded" && (!route.item || route.item.quantity > 1))
          || (route.phase !== "loaded" && route.item) || route.source === route.destination
          || factory.availableCrew() < 1) throw new Error("Invalid hauling route.");
        ids.add(route.id); factory.state.routes.push(route);
      }
      if ([...ids].some((id) => /^(machine|route)-\d+$/.test(id) && Number(id.split("-")[1]) >= state.nextId)) throw new Error("Invalid next identity.");
      factory.recoveredForPlanterResize = recovered.size;
      factory.reorientedForFiberResize = reorientedFiber;
      return factory;
    }
  }
  const API = { DATA: D, Factory, createState, size, cells, ports, rotatePoint, cargo, opposite, turn, copy, key };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.NoAmmo = API;
}(globalThis));
