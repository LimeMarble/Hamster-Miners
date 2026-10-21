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
  function world(ctx, camera) {
    ctx.save(); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x * TILE, -camera.y * TILE);
  }
  function machineBox(ctx, machine, inset, fill = true) {
    const bounds = size(machine);
    const boxes = D.machines[machine.type].footprint ? cells(machine).map((cell) => ({ ...cell, width: 1, height: 1 }))
      : [{ x: machine.x, y: machine.y, ...bounds }];
    for (const box of boxes) {
      const args = [box.x * TILE + inset, box.y * TILE + inset, box.width * TILE - inset * 2, box.height * TILE - inset * 2];
      if (fill) ctx.fillRect(...args);
      ctx.strokeRect(...args);
    }
  }
  function drawFloor(ctx, factory, camera, viewport) {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
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
    for (const machine of factory.state.machines) {
      const bounds = size(machine);
      if (!visible(machine.x, machine.y, bounds.width, bounds.height, camera, viewport)) continue;
      const definition = D.machines[machine.type], x = machine.x * TILE, y = machine.y * TILE;
      ctx.fillStyle = definition.color; ctx.strokeStyle = "#c3cba890"; ctx.lineWidth = 1;
      machineBox(ctx, machine, 2);
      if (["primitive", "belt", "brickSeal"].includes(machine.type)) {
        for (const point of ports(machine).filter((point) => point.role === "output")) {
          ctx.fillStyle = factory.powered(point.x, point.y) ? "#455d4a" : "#423c31";
          ctx.fillRect(point.x * TILE + 4, point.y * TILE + 7, 24, 18);
          arrow(ctx, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE, point.direction, 0.8);
        }
      }
      for (const point of ports(machine)) {
        const v = D.vectors[point.direction], px = (point.x + 0.5 + v.x * 0.4) * TILE, py = (point.y + 0.5 + v.y * 0.4) * TILE;
        if (point.role.startsWith("kinetic")) {
          ctx.fillStyle = point.role === "kineticInput" ? "#a8d6e2" : "#f2ca76";
          ctx.fillRect(px - 3, py - 3, 6, 6);
        } else if (!["belt", "primitive", "brickSeal"].includes(machine.type)) arrow(ctx, px, py, point.role === "input" ? API.opposite(point.direction) : point.direction, 0.6,
          D.materials[point.material]?.color);
      }
      if (machine.type !== "belt") {
        const names = { planter: "Leek Planter", fiber: "Fiber", logger: "Log", clayPit: "Clay Pit", clayShaper: "Clay Shaping", kiln: "Clay Kiln", drive: "Drive", sellTube: "Sell Tube", wheel: "Hamster Wheel", basket: "Basket", primitive: "+" };
        ctx.fillStyle = "#101b13"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 10px system-ui";
        const labelPoint = definition.labelCell && API.rotatePoint(...definition.labelCell, definition.width, definition.height, machine.facing);
        const occupied = labelPoint ? [{ x: machine.x + labelPoint.x, y: machine.y + labelPoint.y }] : cells(machine);
        const cx = occupied.reduce((sum, cell) => sum + cell.x + 0.5, 0) / occupied.length;
        const cy = occupied.reduce((sum, cell) => sum + cell.y + 0.5, 0) / occupied.length;
        const lines = definition.labelLines ?? [names[machine.type] ?? machine.type];
        for (const [index, line] of lines.entries()) ctx.fillText(line, cx * TILE, cy * TILE + (index - (lines.length - 1) / 2) * 10,
          definition.labelCell ? TILE - 6 : bounds.width * TILE - 8);
      }
      if ((["belt", "primitive", "brickSeal"].includes(machine.type) && !ports(machine).filter((point) => point.role === "output")
        .every((cell) => factory.powered(cell.x, cell.y))) || (definition.requiresKinetic && !factory.kineticHasWheel(machine))) {
        ctx.fillStyle = "#f5bc73"; ctx.fillRect(x + 3, y + 3, 4, 4);
      }
    }
    ctx.restore();
  }
  function drawCargo(ctx, item, x, y) {
    const definition = D.materials[item.material];
    ctx.fillStyle = definition.color; ctx.strokeStyle = "#172318"; ctx.lineWidth = 1;
    ctx.fillRect(x - 6, y - 5, 12, 10); ctx.strokeRect(x - 6, y - 5, 12, 10);
    if (item.quantity !== 1) {
      ctx.fillStyle = "#10190f"; ctx.fillRect(x + 3, y + 2, 11, 12);
      ctx.fillStyle = "#edf1d7"; ctx.font = "9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(API.formatNumber(item.quantity), x + 8, y + 8);
    }
  }
  function drawOverlay(ctx, factory, camera, viewport, interaction = {}) {
    ctx.clearRect(0, 0, viewport.width, viewport.height); world(ctx, camera);
    const selected = factory.byId.get(interaction.selected);
    if (selected?.type === "drive" || interaction.tool?.type === "drive") {
      const drive = selected?.type === "drive" ? selected : { ...interaction.tool, x: interaction.hover?.x ?? 0, y: interaction.hover?.y ?? 0 };
      const area = factory.powerArea(drive);
      ctx.fillStyle = "#e9d18a0d"; ctx.fillRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
      ctx.strokeStyle = "#d3c47d80"; ctx.lineWidth = 1; ctx.strokeRect(area.x * TILE, area.y * TILE, area.width * TILE, area.height * TILE);
    }
    for (const machine of factory.state.machines) {
      const bounds = size(machine);
      if (!visible(machine.x, machine.y, bounds.width, bounds.height, camera, viewport)) continue;
      const outputs = ports(machine).filter((point) => point.role === "output");
      for (const [index, item] of Object.entries(machine.lanes)) {
        const point = outputs[Number(index)];
        if (!point) continue;
        drawCargo(ctx, item, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE);
      }
      if (machine.output.length && outputs.length) {
        if (outputs.some((point) => point.material)) {
          for (const point of outputs) {
            const item = machine.output.find((entry) => entry.material === point.material);
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
        const point = ports(machine).find((entry) => entry.role === "input") ?? machine;
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
    if (interaction.tree) { const tree = factory.state.trees.find((entry) => entry.id === interaction.tree);
      if (tree) { ctx.strokeStyle = "#e8e9ab"; ctx.lineWidth = 2; ctx.strokeRect(tree.x * TILE, tree.y * TILE, 96, 96); } }
    const previews = [];
    if (interaction.group && interaction.hover) {
      const plan = factory.groupPlan(interaction.group.ids, interaction.hover.x, interaction.hover.y, interaction.group.turns);
      for (const machine of plan.machines) previews.push({ machine, error: plan.error });
    } else if (interaction.tool && interaction.hover) {
      const machine = { ...interaction.tool, ...interaction.hover };
      previews.push({ machine, error: factory.placement(machine.type, machine.x, machine.y, machine.facing, machine.id) });
    }
    for (const { machine: preview, error } of previews) {
      ctx.fillStyle = error ? "#df796433" : "#dceaa73a"; ctx.strokeStyle = error ? "#ee9b89" : "#e3efa9"; ctx.lineWidth = 2;
      machineBox(ctx, preview, 0);
      for (const point of ports(preview)) arrow(ctx, (point.x + 0.5) * TILE, (point.y + 0.5) * TILE, point.role === "input" ? API.opposite(point.direction) : point.direction, 0.65,
        point.role === "kineticInput" ? "#a8d6e2" : "#f1edbd");
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
