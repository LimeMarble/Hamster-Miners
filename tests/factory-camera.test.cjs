const assert = require("node:assert/strict");
const test = require("node:test");
global.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const game = require("../game.js");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const width = game.FACTORY_COLUMNS * 32, height = (game.FACTORY_ROWS + 3) * 32, margin = 96;
const camera = (w, h, zoom) => ({ width: w, height: h, zoom, scrollX: 0, scrollY: 0,
  setScroll(x, y) { this.scrollX = x; this.scrollY = y; } });

// Phaser 3.90 Camera.preRender uses scroll + half viewport as its midpoint;
// zoom changes display width/height around it. Scroll is NOT worldView.x/y.
const view = (c) => ({
  left: c.scrollX + c.width / 2 - c.width / c.zoom / 2,
  right: c.scrollX + c.width / 2 + c.width / c.zoom / 2,
  top: c.scrollY + c.height / 2 - c.height / c.zoom / 2,
  bottom: c.scrollY + c.height / 2 + c.height / c.zoom / 2,
});

test("Phaser centre-zoom geometry reaches every factory edge across window sizes and the full zoom range", () => {
  for (const [w, h] of [[320, 256], [815, 684], [1200, 760], [1920, 1080]]) {
    for (const zoom of [0.45, 0.59, 0.7, 0.81, 0.9, 1, 1.33, 1.5, 2]) {
      const c = camera(w, h, zoom);
      game.clampFactoryCameraScroll(c, -1e6, -1e6);
      const low = view(c);
      game.clampFactoryCameraScroll(c, 1e6, 1e6);
      const high = view(c);
      if (w / zoom < width + margin * 2) {
        close(low.left, -margin);
        close(high.right, width + margin);
      } else {
        close((low.left + low.right) / 2, width / 2);
        close(low.left, high.left);
        assert.ok(low.left <= -margin && low.right >= width + margin);
      }
      if (h / zoom < height + margin * 2) {
        close(low.top, -margin);
        close(high.bottom, height + margin);
      } else {
        close((low.top + low.bottom) / 2, height / 2);
        close(low.top, high.top);
        assert.ok(low.top <= -margin && low.bottom >= height + margin);
      }
    }
  }
});

test("zoomed-out edge panning reaches both ends, uses screen coordinates, and stops outside the canvas", () => {
  for (const zoom of [0.45, 0.7, 0.81, 1, 1.5, 2]) {
    const c = camera(815, 480, zoom);
    game.clampFactoryCameraScroll(c);
    for (const [x, y, sign] of [[1, 1, -1], [814, 479, 1]]) {
      for (let tick = 0; tick < 100; tick++) {
        game.panFactoryCameraAtEdges(c, { x, y, worldX: -1e6, worldY: 1e6, withinGame: true }, 100, true);
      }
      const actual = view(c);
      if (c.width / zoom < width + 2 * margin) close(sign < 0 ? actual.left : actual.right, sign < 0 ? -margin : width + margin);
      if (c.height / zoom < height + 2 * margin) close(sign < 0 ? actual.top : actual.bottom, sign < 0 ? -margin : height + margin);
    }
    const before = [c.scrollX, c.scrollY];
    for (const [pointer, inside] of [[{ x: 1, y: 1 }, false], [{ x: -1, y: 1 }, true],
      [{ x: 816, y: 1 }, true], [{ x: 1, y: 481 }, true], [{ x: 1, y: 1, withinGame: false }, true],
      [{ x: 400, y: 240 }, true]]) {
      assert.equal(game.panFactoryCameraAtEdges(c, pointer, 100, inside), false);
      assert.deepEqual([c.scrollX, c.scrollY], before);
    }
  }
});

test("returning to Factory at a saved zoom keeps the starter area centered and starts at the top", () => {
  for (const zoom of [0.7, 0.81, 1, 1.5, 2]) {
    const c = camera(815, 684, zoom);
    const start = game.getFactoryCameraStartScroll(c.width, c.height, zoom);
    game.clampFactoryCameraScroll(c, start.scrollX, start.scrollY);
    const visible = view(c);
    close((visible.left + visible.right) / 2, (game.FACTORY_STARTER_COLUMN_OFFSET + 8) * 32);
    close(visible.top, 0);
  }
});
