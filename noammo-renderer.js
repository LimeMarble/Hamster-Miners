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
      ctx.fillStyle = definition.color; ctx.fillRect(x + 2, y + 2, bounds.width * TILE - 4, bounds.height * TILE - 4);
      ctx.strokeStyle = "#c3cba890"; ctx.lineWidth = 1; ctx.strokeRect(x + 2, y + 2, bounds.width * TILE - 4, bounds.height * TILE - 4);
      if (machine.type === "primitive" || machine.type === "belt") {
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
        } else if (machine.type !== "belt" && machine.type !== "primitive") arrow(ctx, px, py, point.role === "input" ? API.opposite(point.direction) : point.direction, 0.6);
      }
      if (machine.type !== "belt") {
        const names = { planter: "Leek Planter", fiber: "Fiber", logger: "Log", clayPit: "Clay Pit", drive: "Drive", sellTube: "Sell Tube", wheel: "Hamster Wheel", basket: "Basket", primitive: "+" };
        ctx.fillStyle = "#101b13"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 10px system-ui";
        ctx.fillText(names[machine.type] ?? machine.type, x + bounds.width * 16, y + bounds.height * 16, bounds.width * TILE - 8);
      }
      if ((machine.type === "belt" || machine.type === "primitive") && !cells(machine).every((cell) => factory.powered(cell.x, cell.y))) {
        ctx.fillStyle = "#f5bc73"; ctx.fillRect(x + 3, y + 3, 4, 4);
      }
    }
    ctx.restore();
  }
  function drawCargo(ctx, item, x, y) {
    const definition = D.materials[item.material];
    ctx.fillStyle = definition.color; ctx.strokeStyle = "#172318"; ctx.lineWidth = 1;
    ctx.fillRect(x - 6, y - 5, 12, 10); ctx.strokeRect(x - 6, y - 5, 12, 10);
    if (item.quantity > 1) {
      ctx.fillStyle = "#10190f"; ctx.fillRect(x + 3, y + 2, 11, 12);
      ctx.fillStyle = "#edf1d7"; ctx.font = "9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(item.quantity), x + 8, y + 8);
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
        const points = D.machines[machine.type].centeredOutput ? outputs : [outputs[0]];
        const x = points.reduce((sum, point) => sum + point.x + 0.5, 0) / points.length;
        const y = points.reduce((sum, point) => sum + point.y + 0.5, 0) / points.length;
        drawCargo(ctx, machine.output[0], x * TILE, y * TILE);
      }
      if (machine.type === "basket") {
        const count = factory.total(machine, "contents");
        if (count) { ctx.fillStyle = "#102014"; ctx.fillRect(machine.x * TILE + 4, machine.y * TILE + 9, 24, 14);
          ctx.fillStyle = "#f0edcf"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(count), (machine.x + 0.5) * TILE, (machine.y + 0.5) * TILE); }
      }
    }
    for (const id of interaction.selectedIds ?? (selected ? [selected.id] : [])) {
      const machine = factory.byId.get(id);
      if (!machine) continue;
      const bounds = size(machine); ctx.strokeStyle = "#eef7b2"; ctx.lineWidth = 2;
      ctx.strokeRect(machine.x * TILE + 1, machine.y * TILE + 1, bounds.width * TILE - 2, bounds.height * TILE - 2);
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
      const bounds = size(preview);
      ctx.fillStyle = error ? "#df796433" : "#dceaa73a"; ctx.strokeStyle = error ? "#ee9b89" : "#e3efa9"; ctx.lineWidth = 2;
      ctx.fillRect(preview.x * TILE, preview.y * TILE, bounds.width * TILE, bounds.height * TILE);
      ctx.strokeRect(preview.x * TILE, preview.y * TILE, bounds.width * TILE, bounds.height * TILE);
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
    ctx.restore();
  }
  const rendering = { TILE, visible, drawFloor, drawOverlay };
  if (typeof module !== "undefined" && module.exports) module.exports = rendering;
  else root.NoAmmoRenderer = rendering;
}(globalThis));
