const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../noammo-simulation.js');
const R = require('../noammo-renderer.js');
function drawing() {
  const calls = [], stack = []; let contours = [], current;
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() { stack.push([this.fillStyle, this.strokeStyle, this.lineWidth]); },
    restore() { [this.fillStyle, this.strokeStyle, this.lineWidth] = stack.pop(); },
    beginPath() { contours = []; },
    moveTo(x, y) { current = [{ x, y }]; contours.push(current); },
    lineTo(x, y) { current.push({ x, y }); }, closePath() {},
    fill() { calls.push({ method: 'fill', color: this.fillStyle, contours: JSON.parse(JSON.stringify(contours)) }); },
    stroke() { calls.push({ method: 'stroke', color: this.strokeStyle, contours: JSON.parse(JSON.stringify(contours)) }); },
    fillRect(x, y, width, height) { calls.push({ method: 'fillRect', color: this.fillStyle, x, y, width, height }); },
    strokeRect() {}, clearRect() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
  };
  return { ctx, calls };
}
function inside(contours, x, y) {
  let winding = 0;
  for (const points of contours) for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
    if (a.y <= y && b.y > y && cross > 0) winding++;
    if (a.y > y && b.y <= y && cross < 0) winding--;
  }
  return winding !== 0;
}
function fixture(api, type, facing, mode) {
  const f = new api.Factory(api.createState(1)); f.state.stock[type]++;
  const m = f.place(type, 40, 40, facing).machine; assert.ok(m);
  if (mode) assert.equal(f.setOverflowMode(m.id, mode).error, undefined);
  return { f, m, camera: { x: 38, y: 38, zoom: 1 }, viewport: { width: 400, height: 400 } };
}
function verifyFootprint(api, m, contours, fullTiles) {
  const bounds = api.size(m), occupied = new Set(api.cells(m).map(p => api.key(p.x, p.y)));
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const present = occupied.has(api.key(m.x + x, m.y + y));
    const samples = fullTiles ? [0.5, 8.5, 16.5, 24.5, 31.5] : [4, 16, 28];
    for (const sx of samples) for (const sy of samples) {
      assert.equal(inside(contours, (m.x + x) * 32 + sx, (m.y + y) * 32 + sy), present, `${m.type} ${m.facing} tile ${x},${y} point ${sx},${sy}`);
    }
  }
  for (const p of api.cells(m)) for (const [dx, dy] of [[1, 0], [0, 1]]) {
    if (!occupied.has(api.key(p.x + dx, p.y + dy))) continue;
    assert.equal(inside(contours, (p.x + 0.5 + dx * 0.5) * 32, (p.y + 0.5 + dy * 0.5) * 32), true, 'shared tile edges have no gap');
  }
}

function contracts(api, renderer, type, mode) {
  for (const facing of api.DATA.directions) test(`${type} ${mode ?? ''} ${facing}: joined floor body, perimeter-only selection and full-tile placement/group previews`, () => {
    const { f, m, camera, viewport } = fixture(api, type, facing, mode), before = f.exportSave();
    const floor = drawing(); renderer.drawFloor(floor.ctx, f, camera, viewport);
    const bodies = floor.calls.filter(c => c.color === api.DATA.machines[type].color && c.method === 'fill');
    assert.equal(bodies.length, 1, 'one fill avoids seams or overlapping alpha');
    assert.equal(floor.calls.filter(c => c.color === api.DATA.machines[type].color && c.method === 'fillRect').length, 0);
    verifyFootprint(api, m, bodies[0].contours, false);
    for (const interaction of [
      { selected: m.id },
      { tool: { type, facing, mode }, hover: { x: 40, y: 40 } },
      { group: { ids: [m.id], turns: 0 }, hover: { x: 40, y: 40 } },
    ]) {
      const overlay = drawing(); renderer.drawOverlay(overlay.ctx, f, camera, viewport, interaction);
      const outlines = overlay.calls.filter(c => c.method === 'stroke' && ['#eef7b2', '#ee9b89', '#e3efa9'].includes(c.color));
      assert.equal(outlines.length, 1);
      const preview = overlay.calls.filter(c => c.method === 'fill' && ['#df796433', '#dceaa73a'].includes(c.color));
      if (interaction.selected) assert.equal(preview.length, 0);
      else { assert.equal(preview.length, 1); verifyFootprint(api, m, preview[0].contours, true); }
      for (const contour of outlines[0].contours) {
        for (const p of contour) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      }
    }
    // Also exercise the valid placement colour, not only a preview over the original.
    const overlay = drawing(), preview = { type, x: 45, y: 40, facing, mode };
    renderer.drawOverlay(overlay.ctx, f, camera, viewport, { tool: { type, facing, mode }, hover: { x: 45, y: 40 } });
    const valid = overlay.calls.find(c => c.method === 'fill' && c.color === '#dceaa73a'); assert.ok(valid);
    verifyFootprint(api, preview, valid.contours, true);
    assert.equal(f.exportSave(), before, 'rendering never changes occupancy or simulation');
  });
}

for (const [type, d] of Object.entries(A.DATA.machines)) {
  if (d.modeFootprints) for (const mode of Object.keys(d.modeFootprints)) contracts(A, R, type, mode);
  else if (d.footprint) contracts(A, R, type);
}

// The same renderer must handle future holes and diagonal/disconnected shapes.
const data = JSON.parse(JSON.stringify(A.DATA));
data.machines.testRing = { name: 'Ring', width: 3, height: 3, color: '#abc123', category: 'Material', ports: [],
  footprint: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]] };
data.machines.testDiagonal = { name: 'Diagonal', width: 2, height: 2, color: '#abc124', category: 'Material', ports: [], footprint: [[0, 0], [1, 1]] };
const context = vm.createContext({ NoAmmoData: data });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'noammo-simulation.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'noammo-renderer.js'), 'utf8'), context);
for (const type of ['testRing', 'testDiagonal']) contracts(context.NoAmmo, context.NoAmmoRenderer, type);
