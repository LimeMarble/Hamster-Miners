(function (root) {
  "use strict";
  const API = typeof module !== "undefined" && module.exports ? require("./noammo-simulation.js") : root.NoAmmo;
  const { DATA: D, size, cells, ports } = API;
  const TILE = 32;
  function visible(x, y, width, height, camera, viewport) {
    const right = camera.x + viewport.width / (TILE * camera.zoom), bottom = camera.y + viewport.height / (TILE * camera.zoom);
    return x + width >= camera.x && y + height >= camera.y && x <= right && y <= bottom;
  }
  function arrow(ctx, x, y, direction, scale = 1, color = "#d6e4b5") {
    const angle = D.directions.indexOf(direction) * Math.PI / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(6 * scale, 0); ctx.lineTo(-4 * scale, -4 * scale); ctx.lineTo(-4 * scale, 4 * scale); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function waterDropoff(ctx, point) {
    ctx.fillStyle = "#76b9dc";
    ctx.fillRect((point.x + 0.5) * TILE - 4, (point.y + 0.5) * TILE - 4, 8, 8);
  }
  function labelledInput(ctx, point) {
    const v = D.vectors[point.direction], color = point.channel === "fuel" ? "#e5a568" : "#f1edbd";
    const x = (point.x + 0.5) * TILE, y = (point.y + 0.5) * TILE;
    arrow(ctx, x + v.x * 0.4 * TILE, y + v.y * 0.4 * TILE, API.opposite(point.direction), 0.6, color);
    const labelX = x - v.x * 3, labelY = y - v.y * 3, width = Math.min(TILE - 8, point.label.length * 5 + 6);
    ctx.fillStyle = "#172318"; ctx.fillRect(labelX - width / 2, labelY - 5, width, 10);
    ctx.fillStyle = color; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(point.label, labelX, labelY, width - 2);
  }
  function world(ctx, camera) {
    ctx.save(); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x * TILE, -camera.y * TILE);
  }
  function clearCanvas(ctx, viewport) {
    // Canvas backing dimensions are rounded to whole physical pixels. Clear
    // in that coordinate space so fractional display scaling cannot leave a
    // partially uncleared final row or column of old drawing behind.
    if (ctx.canvas && typeof ctx.setTransform === "function") {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    } else ctx.clearRect(0, 0, viewport.width, viewport.height);
  }
  const contourCache = new Map();
  function footprintContours(machine) {
    const cacheKey = `${machine.type}:${machine.facing}:${machine.mode ?? D.machines[machine.type].defaultMode ?? ""}`;
    if (contourCache.has(cacheKey)) return contourCache.get(cacheKey);
    const occupied = cells({ ...machine, x: 0, y: 0 }), tiles = new Set(occupied.map(p => API.key(p.x, p.y)));
    const edges = [], outgoing = new Map();
    function edge(x, y, ex, ey, direction) {
      const segment = { x, y, ex, ey, direction }, start = API.key(x, y);
      edges.push(segment);
      if (!outgoing.has(start)) outgoing.set(start, []);
      outgoing.get(start).push(segment);
    }
    for (const { x, y } of occupied) {
      if (!tiles.has(API.key(x, y - 1))) edge(x, y, x + 1, y, 0);
      if (!tiles.has(API.key(x + 1, y))) edge(x + 1, y, x + 1, y + 1, 1);
      if (!tiles.has(API.key(x, y + 1))) edge(x + 1, y + 1, x, y + 1, 2);
      if (!tiles.has(API.key(x - 1, y))) edge(x, y + 1, x, y, 3);
    }
    const used = new Set(), contours = [];
    for (const first of edges) {
      if (used.has(first)) continue;
      const points = []; let segment = first;
      do {
        used.add(segment); points.push({ x: segment.x, y: segment.y });
        if (segment.ex === first.x && segment.ey === first.y) break;
        const next = outgoing.get(API.key(segment.ex, segment.ey)).filter(candidate => !used.has(candidate));
        // Keep occupied tiles on the right, including at diagonal-only contacts.
        const priority = candidate => [1, 0, 3, 2].indexOf((candidate.direction - segment.direction + 4) % 4);
        segment = next.sort((a, b) => priority(a) - priority(b))[0];
      } while (segment);
      contours.push(points.filter((point, i) => {
        const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
        return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
      }));
    }
    contourCache.set(cacheKey, contours); return contours;
  }
  function machineBox(ctx, machine, inset, fill = true) {
    const bounds = size(machine);
    if (!D.machines[machine.type].footprint && !D.machines[machine.type].modeFootprints) {
      const args = [machine.x * TILE + inset, machine.y * TILE + inset, bounds.width * TILE - inset * 2, bounds.height * TILE - inset * 2];
      if (fill) ctx.fillRect(...args); ctx.strokeRect(...args); return;
    }
    ctx.beginPath();
    for (const points of footprintContours(machine)) {
      for (const [i, point] of points.entries()) {
        const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
        const x = (machine.x + point.x) * TILE - inset * (Math.sign(point.y - previous.y) + Math.sign(next.y - point.y));
        const y = (machine.y + point.y) * TILE + inset * (Math.sign(point.x - previous.x) + Math.sign(next.x - point.x));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    if (fill) ctx.fill();
    ctx.stroke();
  }
  function drawFloor(ctx, factory, camera, viewport) {
    clearCanvas(ctx, viewport);
    ctx.fillStyle = "#111a14"; ctx.fillRect(0, 0, viewport.width, viewport.height);
    world(ctx, camera);
    ctx.fillStyle = "#24362a"; ctx.fillRect(0, 0, D.config.columns * TILE, D.config.rows * TILE);
    const minX = Math.max(0, Math.floor(camera.x)), minY = Math.max(0, Math.floor(camera.y));
    const maxX = Math.min(D.config.columns, Math.ceil(camera.x + viewport.width / (TILE * camera.zoom)));
    const maxY = Math.min(D.config.rows, Math.ceil(camera.y + viewport.height / (TILE * camera.zoom)));
    ctx.strokeStyle = "#354836"; ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) { ctx.moveTo(x * TILE, minY * TILE); ctx.lineTo(x * TILE, maxY * TILE); }
    for (let y = minY; y <= maxY; y++) { ctx.moveTo(minX * TILE, y * TILE); ctx.lineTo(maxX * TILE, y * TILE); }
    ctx.stroke();
    for (const tree of factory.state.trees) {
      if (!visible(tree.x, tree.y, 3, 3, camera, viewport)) continue;
      const x = tree.x * TILE, y = tree.y * TILE;
      ctx.fillStyle = "#34452b"; ctx.fillRect(x + 1, y + 1, TILE * 3 - 2, TILE * 3 - 2);
      ctx.strokeStyle = "#779553"; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, 94, 94);
      ctx.fillStyle = "#d7dfc2"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 12px system-ui"; ctx.fillText("TREE", x + 48, y + 48);
    }
    for (const machine of [...factory.state.machines.filter((entry) => !D.machines[entry.type].bridge),
      ...factory.state.machines.filter((entry) => D.machines[entry.type].bridge)]) {
      const bounds = size(machine);
      if (!visible(machine.x, machine.y, bounds.width, bounds.height, camera, viewport)) continue;
      const definition = D.machines[machine.type], x = machine.x * TILE, y = machine.y * TILE;
      ctx.fillStyle = definition.color; ctx.strokeStyle = "#c3cba890"; ctx.lineWidth = 1;
      if (definition.bridge) {
        const tiles = API.conveyorCells(machine), horizontal = machine.facing === "right" || machine.facing === "left";
        for (const point of [tiles[0], tiles[2]]) {
          ctx.fillRect(point.x * TILE + 2, point.y * TILE + 2, TILE - 4, TILE - 4);
          ctx.strokeRect(point.x * TILE + 2, point.y * TILE + 2, TILE - 4, TILE - 4);
        }
        const middle = tiles[1];
        for (const offset of [3, 27]) ctx.fillRect(middle.x * TILE + (horizontal ? 0 : offset),
          middle.y * TILE + (horizontal ? offset : 0), horizontal ? TILE : 2, horizontal ? 2 : TILE);
      } else machineBox(ctx, machine, 2);
      const displayedBelts = API.conveyorCells(machine);
      if (displayedBelts.length) {
        for (const point of displayedBelts) {
          ctx.fillStyle = factory.conveyorPowered(machine, point.x, point.y) ? "#455d4a" : "#423c31";
          if (!definition.bridge || point.index !== 1) ctx.fillRect(point.x * TILE + 4, point.y * TILE + 7, 24, 18);
          arrow(ctx, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE, point.direction, 0.8);
        }
      }
      for (const point of ports(machine)) {
        const v = D.vectors[point.direction], px = (point.x + 0.5 + v.x * 0.4) * TILE, py = (point.y + 0.5 + v.y * 0.4) * TILE;
        if (point.role === "waterDropoff") {
          waterDropoff(ctx, point);
        } else if (point.role === "input" && point.label) {
          labelledInput(ctx, point);
        } else if (point.role.startsWith("kinetic")) {
          ctx.fillStyle = point.role === "kineticInput" ? "#a8d6e2" : "#f2ca76";
          ctx.fillRect(px - 3, py - 3, 6, 6);
        } else if (!definition.conveyors || point.channel === "split") arrow(ctx, px, py, point.role === "input" ? API.opposite(point.direction) : point.direction, 0.6,
          point.channel === "fuel" ? "#e5a568" : D.materials[point.material]?.color);
      }
      if (!["belt", "electricConveyor"].includes(machine.type)) {
        const names = { fiber: "Fiber", logger: "Log", clayPit: "Clay Pit", clayShaper: "Clay Shaping", kiln: "Clay Kiln", drive: "Drive", sellTube: "Sell Tube", wheel: "Hamster Wheel", basket: "Basket", primitive: "+" };
        ctx.fillStyle = "#101b13"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 10px system-ui";
        const labelCell = definition.labelCell;
        const labelPoint = labelCell && API.rotatePoint(...labelCell, definition.width, definition.height, D.directions[API.rotation(machine)]);
        const occupied = labelPoint ? [{ x: machine.x + labelPoint.x, y: machine.y + labelPoint.y }] : cells(machine);
        const cx = occupied.reduce((sum, cell) => sum + cell.x + 0.5, 0) / occupied.length;
        const cy = occupied.reduce((sum, cell) => sum + cell.y + 0.5, 0) / occupied.length;
        const lines = definition.labelLines ?? [names[machine.type] ?? definition.name];
        for (const [index, line] of lines.entries()) ctx.fillText(line, cx * TILE, cy * TILE + (index - (lines.length - 1) / 2) * 10,
          labelCell ? TILE - 6 : bounds.width * TILE - 8);
      }
      if ((definition.conveyors && !API.conveyorCells(machine)
        .every((cell) => factory.conveyorPowered(machine, cell.x, cell.y))) || (definition.requiresKinetic && !factory.kineticHasWheel(machine))
        || (definition.electricPower && factory.electricity.shortage)) {
        const marker = cells(machine)[0];
        ctx.fillStyle = "#f5bc73"; ctx.fillRect(marker.x * TILE + 3, marker.y * TILE + 3, 4, 4);
      }
    }
    ctx.restore();
  }
  function drawCargo(ctx, item, x, y) {
    const definition = D.materials[item.material];
    ctx.fillStyle = definition.color; ctx.strokeStyle = "#172318"; ctx.lineWidth = 1;
    const grade = API.gradeLabel(item);
    if (grade) { ctx.strokeStyle = "#d8bf88"; ctx.lineWidth = 2; }
    ctx.fillRect(x - 6, y - 5, 12, 10); ctx.strokeRect(x - 6, y - 5, 12, 10);
    if (item.preheated) { ctx.fillStyle = "#f1a05a"; ctx.fillRect(x - 6, y - 8, 12, 2); }
    if (item.burnished) { ctx.fillStyle = "#d9d8b2"; ctx.fillRect(x - 6, y + 6, 12, 2); }
    if (grade) {
      ctx.fillStyle = ctx.strokeStyle; ctx.font = "bold 8px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(grade[0], x - 8, y - 8);
    }
    if (item.quantity !== 1) {
      ctx.fillStyle = "#10190f"; ctx.fillRect(x + 3, y + 2, 11, 12);
      ctx.fillStyle = "#edf1d7"; ctx.font = "9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(API.formatNumber(item.quantity), x + 8, y + 8);
    }
  }
  function drawOverlay(ctx, factory, camera, viewport, interaction = {}) {
    clearCanvas(ctx, viewport); world(ctx, camera);
    const selected = factory.byId.get(interaction.selected);
    if (selected?.type === "drive" || interaction.tool?.type === "drive") {
      const drive = selected?.type === "drive" ? selected : { ...interaction.tool, x: interaction.hover?.x ?? 0, y: interaction.hover?.y ?? 0 };
      const area = factory.powerArea(drive);
      ctx.fillStyle = "#e9d18a0d"; ctx.fillRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
      ctx.strokeStyle = "#d3c47d80"; ctx.lineWidth = 1; ctx.strokeRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
    }
    if (D.machines[selected?.type]?.waterSource) {
      const area = factory.wellArea(selected);
      ctx.fillStyle = "#76b9dc22"; ctx.fillRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
      ctx.strokeStyle = "#76b9dcc0"; ctx.lineWidth = 1; ctx.strokeRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
    }
    for (const machine of [...factory.state.machines.filter((entry) => !D.machines[entry.type].bridge),
      ...factory.state.machines.filter((entry) => D.machines[entry.type].bridge)]) {
      const bounds = size(machine);
      if (!visible(machine.x, machine.y, bounds.width, bounds.height, camera, viewport)) continue;
      const machinePorts = ports(machine);
      const outputs = machinePorts.filter((point) => point.role === "output");
      for (const [index, item] of Object.entries(machine.lanes)) {
        const point = API.conveyorCells(machine)[Number(index)];
        if (!point) continue;
        const v = D.vectors[point.direction], lateral = item.lateral ?? 0;
        drawCargo(ctx, item, (point.x + 0.5 - v.y * lateral) * TILE, (point.y + 0.5 + v.x * lateral) * TILE);
      }
      const { plateRecipes } = D.machines[machine.type];
      if (plateRecipes && machine.input.length) {
        for (const channel of ["dish", "plate"]) {
          const point = machinePorts.find((port) => port.channel === channel);
          const item = machine.input.find((entry) => channel === "plate"
            ? entry.material === point.material : Object.hasOwn(plateRecipes, entry.material));
          if (!item) continue;
          const quantity = factory.total(machine, "input", item.material);
          drawCargo(ctx, { ...item, quantity }, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE);
        }
      }
      if (machine.output.length && outputs.length) {
        if (outputs.some((point) => point.material)) {
          for (const [index, point] of outputs.entries()) {
            const item = D.machines[machine.type].batchModes
              ? machine.output.find((entry) => API.sifterOutputSlot(entry) === index)
              : machine.output.find((entry) => entry.material === point.material);
            if (item) drawCargo(ctx, item, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE);
          }
        } else {
          const points = D.machines[machine.type].centeredOutput ? outputs : [outputs[0]];
          const x = points.reduce((sum, point) => sum + point.x + 0.5, 0) / points.length;
          const y = points.reduce((sum, point) => sum + point.y + 0.5, 0) / points.length;
          drawCargo(ctx, machine.output[0], x * TILE, y * TILE);
        }
      }
      if (API.collectorCapacity(machine)) {
        const count = factory.total(machine, "contents");
        const point = machinePorts.find((entry) => entry.role === "input") ?? machine;
        if (count) { ctx.fillStyle = "#102014"; ctx.fillRect(point.x * TILE + 4, point.y * TILE + 9, 24, 14);
          ctx.fillStyle = "#f0edcf"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(API.formatNumber(count), (point.x + 0.5) * TILE, (point.y + 0.5) * TILE); }
      }
    }
    for (const id of interaction.selectedIds ?? (selected ? [selected.id] : [])) {
      const machine = factory.byId.get(id);
      if (!machine) continue;
      ctx.strokeStyle = "#eef7b2"; ctx.lineWidth = 2;
      machineBox(ctx, machine, 1, false);
    }
    if (D.machines[selected?.type]?.waterSource) {
      for (const [index, entry] of selected.waterSchedule.entries()) {
        const target = factory.byId.get(entry.targetId);
        if (!target) continue;
        const point = ports(target).filter(port => port.role === "waterDropoff")[entry.index];
        if (!point || !visible(point.x, point.y, 1, 1, camera, viewport)) continue;
        const label = String(index + 1), x = (point.x + 0.5) * TILE, y = (point.y + 0.5) * TILE;
        const width = Math.max(14, label.length * 7 + 6);
        ctx.fillStyle = "#172318"; ctx.fillRect(x - width / 2, y - 7, width, 14);
        ctx.strokeStyle = index === selected.waterNext ? "#c4ebff" : "#76b9dc";
        ctx.lineWidth = 1; ctx.strokeRect(x - width / 2, y - 7, width, 14);
        ctx.fillStyle = ctx.strokeStyle; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, x, y);
      }
    }
    if (interaction.tree) { const tree = factory.state.trees.find((entry) => entry.id === interaction.tree);
      if (tree) { ctx.strokeStyle = "#e8e9ab"; ctx.lineWidth = 2; ctx.strokeRect(tree.x * TILE, tree.y * TILE, 96, 96); } }
    const previews = [];
    if (interaction.group && interaction.hover) {
      const plan = factory.groupPlan(interaction.group.ids, interaction.hover.x, interaction.hover.y, interaction.group.turns, interaction.group.placing);
      for (const machine of plan.machines) previews.push({ machine, error: plan.error });
    } else if (interaction.tool && interaction.hover) {
      const machine = { ...interaction.tool, ...interaction.hover };
      previews.push({ machine, error: factory.placement(machine.type, machine.x, machine.y, machine.facing, machine.id, machine.mode) });
    }
    for (const { machine: preview, error } of previews) {
      ctx.fillStyle = error ? "#df796433" : "#dceaa73a"; ctx.strokeStyle = error ? "#ee9b89" : "#e3efa9"; ctx.lineWidth = 2;
      machineBox(ctx, preview, 0);
      for (const point of API.conveyorCells(preview)) {
        ctx.fillStyle = "#455d4a77"; ctx.fillRect(point.x * TILE + 4, point.y * TILE + 7, 24, 18);
        arrow(ctx, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE, point.direction, 0.65, "#f1edbd");
      }
      for (const point of ports(preview)) {
        if (point.role === "waterDropoff") waterDropoff(ctx, point);
        else if (point.role === "input" && point.label) labelledInput(ctx, point);
        else {
          const edge = point.channel === "plate" || point.channel === "fuel" ? 0.4 : 0, v = D.vectors[point.direction];
          arrow(ctx, (point.x + 0.5 + v.x * edge) * TILE, (point.y + 0.5 + v.y * edge) * TILE,
            point.role === "input" ? API.opposite(point.direction) : point.direction, 0.65,
            point.role === "kineticInput" ? "#a8d6e2" : point.channel === "fuel" ? "#e5a568" : "#f1edbd");
        }
      }
    }
    const box = interaction.marquee ?? interaction.box;
    if (box?.start && box.end) {
      const x = Math.min(box.start.x, box.end.x), y = Math.min(box.start.y, box.end.y);
      const width = Math.abs(box.start.x - box.end.x) + 1, height = Math.abs(box.start.y - box.end.y) + 1;
      ctx.fillStyle = "#dceaa725"; ctx.strokeStyle = "#e3efa9"; ctx.lineWidth = 1.5;
      ctx.fillRect(x * TILE, y * TILE, width * TILE, height * TILE);
      ctx.strokeRect(x * TILE, y * TILE, width * TILE, height * TILE);
    }
    for (const entry of factory.saleTexts) {
      const age = factory.state.seconds - entry.created;
      if (age < 0 || age >= 1.2 || !visible(entry.x - 1, entry.y - 1.5, 2, 2, camera, viewport)) continue;
      ctx.save(); ctx.globalAlpha = 1 - age / 1.2;
      ctx.fillStyle = "#75df86"; ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(`+$${API.formatNumber(entry.amount)}`, entry.x * TILE, entry.y * TILE - 4 - age * 22);
      ctx.restore();
    }
    ctx.restore();
  }
  const rendering = { TILE, visible, drawFloor, drawOverlay };
  if (typeof module !== "undefined" && module.exports) module.exports = rendering;
  else root.NoAmmoRenderer = rendering;
}(globalThis));
