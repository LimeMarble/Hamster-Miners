const A = require('../../noammo-simulation.js');
function place(factory, type, x, y, facing = 'right') {
  factory.state.stock[type]++;
  const result = factory.place(type, x, y, facing);
  if (result.error) throw new Error(`${type}: ${result.error}`);
  return result.machine;
}
// Real powered front-priority merge feeding a one-cell machine intake.
function attachPitFeed(factory, input, facing) {
  const v = A.DATA.vectors[facing], p = { x: -v.y, y: v.x };
  const front = { x: input.x - 2 * v.x, y: input.y - 2 * v.y };
  const belts = [place(factory, 'belt', front.x, front.y, facing),
    place(factory, 'belt', front.x - p.x, front.y - p.y, A.turn(facing, 1)),
    place(factory, 'belt', input.x - v.x, input.y - v.y, facing)];
  const local = A.ports({ type: 'clayPit', x: 0, y: 0, facing })[0];
  const pit = place(factory, 'clayPit', front.x - v.x - p.x / 2 - local.x,
    front.y - v.y - p.y / 2 - local.y, facing);
  for (const [dx, dy] of [[3, 3], [-4, -4], [3, -4], [-4, 3], [5, 0], [0, 5]]) {
    const wheel = { x: input.x + dx, y: input.y + dy };
    const drive = { type: 'drive', x: wheel.x + 1, y: wheel.y - 2, facing: 'down' };
    if (factory.placement('wheel', wheel.x, wheel.y, 'right') || factory.placement('drive', drive.x, drive.y, drive.facing)) continue;
    const area = factory.powerArea(drive);
    if (belts.some(b => b.x + 0.5 < area.x || b.x + 0.5 >= area.x + area.width
      || b.y + 0.5 < area.y || b.y + 0.5 >= area.y + area.height)) continue;
    place(factory, 'wheel', wheel.x, wheel.y);
    place(factory, 'drive', drive.x, drive.y, 'down');
    return pit;
  }
  throw new Error('No room for the integration fixture power source.');
}
module.exports = { attachPitFeed };
