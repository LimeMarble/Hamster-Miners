# Content decisions and implementation status

Implemented entries are marked below; the remaining decisions are not yet content.

## Reality cash capstone: four-gem Tiara (planning, not implemented)

- The final assembly must meaningfully use Ruby, Sapphire, Aquamarine and
  Emerald. It must not reduce progression to Emerald alone. A reality-era Orrery
  and broader paint industry are shelved; Malachite-painted decorative vases remain
  a separate early-product idea.
- Proposed value formula: Sterling Silver^0.5 × Emerald^0.3 × Aquamarine^0.3
  × Ruby^0.3 × Sapphire^0.3, using values delivered to assembly.
- Terminal-reality balancing benchmark: Sterling Silver 1e10, Emerald 1e22,
  Aquamarine 1e17, Ruby 1e19, Sapphire 1e19. The weighted metal contribution is
  1e5 and the combined weighted gem contribution is 1e23.1, giving a Tiara
  value of 1e28.1 (approximately 1.26e28).
- Do not further boost the metal input or the combined geometric gem
  contribution beyond this benchmark to keep inflating the Tiara chain.
  This is a balancing constraint, not a runtime clamp or a new implemented recipe.

## noammo opening prototype (2026-10-18)

- Entry: `noammo.html`, linked from the existing game. This is a separate playable
  opening slice on the `noammo` branch, not a migration of the mining game.
- Save identity/key are separate; legacy mine saves cannot be imported here or
  overwritten. Prototype export/import and explicitly confirmed reset are available.
- Plain labelled machine boxes and port markers; no cosmetic machine animation.
- Inventory retains separate Machines and Items sub-screens. Owned machines use
  category-filtered compact cards with details and Place beside them; the Factory
  has no permanent machine list. Items hide unowned materials.
- Shift-click empty ground starts two-tap box selection; Shift can also be tapped
  before the first click for trackpad use. Occupied tiles use a defined quick
  action (Basket: collect all), or select normally if no action exists. Selecting
  a different target suppresses its quick action when another machine, group or
  tree is selected. The explicit Box Select button can start on occupied tiles.
  A persistent collapsible shortcut guide and Basket hint explain these rules.
- Factory supports two-tap box selection and intentional dragging, including
  additive selection. Groups can move, rotate both ways, and be picked up. Invalid
  destinations change nothing; Cancel preserves the original layout and contents.
- Factory: 250x250, with 36 inexhaustible 3x3 trees at the fixed green-center
  positions from `Miners Starting Terrain.xlsx` (first 250 rows/columns).
  New saves share this layout. Loading/importing a different terrain picks up
  all placed machinery once, recovering Basket contents, buffers, unfinished
  inputs, conveyor cargo and carried items through normal pickup rules.
  Cash, inventory, hired crew and machine identities remain intact. The browser
  keeps the first pre-migration save as a local backup when storage permits.
  Re-placed machines survive subsequent refreshes. Refresh starts at the grid's
  centre; game tabs preserve the current camera position and zoom.
- Water is not implemented; groundwater pumps are a tentative later approach.
- Wood collection: five accepted chops give 1-5 Wood, uniformly distributed.
  Five chops/second maximum, shared across trees; clicks cannot be banked while idle.
- One free Leek Planter, Basket and Sell Tube are supplied. With clicking enabled,
  no free Logger is needed. Additional Planters cost $500, 50 Bricks and
  100 Leek Fiber; the starter remains free and existing owned machines are kept.
- Planter: 3x3, no internal conveyors, one Leek/8 seconds, one centered facing-edge
  output. Leeks have $0.1 base value. Blocked output has a bounded two-item queue.
- Basket: 1x1, capacity 100, costs 5 Leek Fiber instead of raw Leeks.
  No direct selling or manual inventory deposits. Collection and movement empty
  it into inventory; hauling remains available.
- Fiber Extractor: Ingot Molder-style footprint: 1 column x 2 rows facing right,
  with body above and input/output on the lower tile; no conveyor. Freely
  rotatable. Costs 30 Wood and 1 Leek, with no cash requirement. One Leek yields two
  Fiber, each retaining the full input unit value. It is hand-operated, without
  a kinetic connection. It has one buffered Leek and at most two waiting Fiber.
- Logger: 1x1, $0, 50 Wood, 5 Leek Fiber, one crew; one Wood/12 seconds.
  It must be inside a tree's middle edge tile, facing outward. Wood sells for
  $0.10 and has 50 heat units; fuel processing itself is outside this slice.
- Clay Pit: 2x2, $0 and 100 Wood, one crew. Manually produces one Clay every
  12 seconds without kinetic power. Its centered two-wide facing-edge output
  can feed either adjacent receiving tile. At most one Clay waits when blocked.
  Clay has a $0.25 base value and weight 1. Four pits can sell directly into
  the four sides of the starter Sell Tube for $5/minute without conveyors.
- Limestone extraction remains deferred; no Quarry is implemented yet.
- Clay Shaping Bench: implemented at $20, 50 Wood and 5 Leek Fiber, with no
  Clay construction cost. Hand-operated by one crew member, without kinetic
  power. Brick mode shapes 1 Clay into 1 Unfired Brick in 2 seconds, preserving
  its value. Pot mode shapes 2 Clay into 1 Unfired Pot in 4 seconds, multiplying
  the sum of both inputs' actual values by 2. Unfired Brick base value/weight
  are $0.25/1; Unfired Pot base value/weight are $1/2.
  The default right-facing footprint is:

  ```text
  .       .
  (blank) Input/Output
  ```

  The lower-left tile remains free, including placement, selection and previews.
  The lower-right working tile takes input from the left and outputs right;
  rotation moves both ports and the three occupied cells together. Each bench
  holds at most 2 waiting Clay and 1 finished product. Partial pot ingredients
  wait for the second Clay. A mode change affects the next job, not the running
  one. Modes, remaining processing time and contents survive moves/saves; normal
  pickup recovers unfinished Clay and completed products once. Firing is not
  implemented in this noammo slice yet.
- Basic Hamster Wheel: 3x2, $8, 100 Wood, 25 Fiber, kinetic outputs on both long
  edges. New placement defaults to down (2 wide x 3 tall), a quarter-turn from
  its reference footprint; existing saved orientations are unchanged.
  Conveyor Drive: 1x2 horizontal, $4, 75 Wood, 7.5 Fiber; its facing side
  is the intake; it has no physical output port. Direct intake-to-Wheel
  connections work in all rotations. A powered Drive covers a 16x16 area.
- Primitive Upgrader: the existing 1-column/2-row, two-lane footprint; $5,
  50 Wood and 5 Fiber. Its belts require Drive coverage. The new effect was
  not settled: Options clearly labels editable +$0.1/up-to-$1 defaults as TEST
  values, rather than changing the old game's established effect.
- The older Fiber construction costs above were halved exactly; the new
  Planter's explicitly supplied 100-Fiber cost is not halved again.
- Baskets can assign hauling hamsters, each carrying one item. Loaded travel
  takes 0.5 seconds/tile/weight and empty return 0.5 seconds/tile. The prototype
  uses Manhattan centre distance; pathfinding is not implemented. Full
  destinations retain the carried item. Collector withdrawals reset cash value
  to base; in-process items retain their actual value. Crew is shared.
- Crew starts at 10. Hiring beside the crew counter costs $5 × 1.1^previous
  paid hires. Each hire adds one available hamster for machinery or hauling;
  both the count and the next price persist through save/load.
- Sell Tube costs $250 and 200 Bricks after the free starter. Old saves with no
  tube receive one once; existing owned tubes count as their starter. Bricks are
  registered as a construction material; firing them remains pending.
- Sell Tube sales show small green floating cash texts at the selling Tube,
  using actual upgraded stack proceeds and shared number notation. Feedback
  rises/fades, stays bounded, and is not part of saves or cash accounting.
- Primitive Conveyor costs $1 and 20 Wood per tile. One object per belt tile,
  weight capacity 5 and one-second transit; no multi-cargo belt redesign.
- Prototype assumptions, visibly disclosed in Options: Fiber takes 2 seconds
  and one operating hamster; the Wheel uses one hamster. These were not supplied
  as exact stats. Grades, connectors, heating/firing, further resource
  depots and all later chains remain outside this opening slice.
- The existing mining game and its simulation files are unchanged. Parent-level
  architecture/state documents predate both this slice and much of the mining game.

## Hot Fluid Pipe

- Implemented Early-Iron logistics item, occupying one tile.
- One purchasable inventory item, using one universal four-side configuration.
- Picking up a placed form returns the same pipe item.
- Cost per item: $25,000, 2 Ceramic, 2 Iron Ingots, 1 Tin Ingot, and 5 Aggregate.
- Presets: Straight, Left Turn, Right Turn, Junction, and Cap. Each side can be
  an entrance, exit, or absent port. Two-, three-, and four-port shapes use the
  same rules; a single entrance with no exits is a cap and accepts no fluid.
- Q/E rotates the whole configuration, with the facing identifying a main
  exit whenever one exists. Port controls are available before and after placement.
- Multi-input junctions merge matching liquid materials without changing their
  total quantity/value or eligibility tags. Different metals wait separately.
- Throughput: 30 fluid weight per second, using the cargo weight definitions.
- Blocked outlets are skipped; any open outlet stops the entire connected pipe
  network. Absent ports do not leak. Caps close unused outlets. Separate networks remain independent.
- Pipes carry the source liquid's material, value and eligibility tags. Contents
  belong to their pipe instance through moves, pickups, and save/load.
- No distance limit or additional temperature restriction at this tier.

## Aggregate Mixer

- Implemented recipe: 40 Limestone + 20 Chert -> 10 Aggregate in 10 seconds.
- Purchase cash cost: $800,000.
- Uses Heavy Gears in its construction cost.
- Approved material quantities: 50 Iron Heavy Gears, 100 Iron
  Plates, 50 Ceramic, and 150 Copper Wires.
- Footprint: 4x3, all cells occupied. Either left corner input accepts Limestone
  or Chert; the output is at the right-center cell. No crew required.

  ```text
  Input . . .
  . . . Output->
  Input . . .
  ```
- Aggregate production is needed to purchase Hot Fluid Pipes at the agreed cost.

## Gears

- Heavy Gear recipe: 2 Plates -> 1 Heavy Gear.
- Fine Gear recipe: 1 Plate -> 2 Fine Gears.
- Implemented for Copper, Brittle Copper, Silver, Tin, Bronze, and Iron Plates.
- Both gear types are sellable; processing preserves the total input plate
  value, split over the produced gears.

## Gear Press

- Implemented with Heavy Gear (default) and Fine Gear modes.
- Cost: $400,000, 100 Iron Ingots, 50 Iron Plates, and 100 Copper Wires.
- No Ceramic construction cost.
- Uses the Metal Press's speed-5 conveyors, with no separate processing timer
  and no crew requirement.
- Heavy mode combines consecutive matching plates. An odd leftover plate is
  retained per instance; modes, pending input, and value survive moves/saves.
- Copy Metal Press's existing footprint exactly: 2 columns by 3 rows, all
  occupied, with the input and transformer/output on the middle row.

  ```text
  .  .
  -> X->
  .  .
  ```

## Cargo weight and Heavy Stacker

- Cargo weights and automatic capacity splitting are implemented; Heavy Stacker
  and the Industrial Conveyor purchase remain pending.
- Ordinary Stackers can feed adjacent Stackers directly. They use ordinary
  conveyor capacity (weight 5) and transit timing, with one buffered cargo object
  per instance and no instantaneous chain transfers or banked output bursts.
- Weight is a hidden per-item value; stack weight is quantity times item weight.
- Most items have weight 1 unless explicitly assigned another weight.
- Switch weight is undecided and will depend on the choice of switch faces.
  Relays tentatively weigh 4, potentially depending on their materials;
  Switchgear tentatively weighs 20-30.
- Heavy Gears weigh 2, Fine Gears weigh 0.5, Cabochons weigh 1, Copper
  Wires weigh 0.2, and Contacts weigh 0.3 (not 0.2).
- The cutter's 0.4 gem yield is a fractional quantity, not a per-gem weight:
  0.4 Cabochons weigh 0.4, while one whole Cabochon weighs 1.
- Tier 1 conveyors accept stacks weighing up to 5; Tier 2 conveyors accept
  stacks weighing up to 30, without faster transit than Tier 1.
- The Tier 2 belt is named Industrial Conveyor.
- Built-in machine conveyors use generic Tier 1 weight capacity unless the
  machine is Iron tier or later and includes Aggregate in its construction
  recipe; machines meeting both conditions use Tier 2 conveyor capacity.
- A basic Leek bundle weighs 1; a coated bundle weighs 1.5; a jacketed bundle
  weighs 2; a fully cased bundle weighs 3. Basic bundles have 10 rounds, mineral
  bundles have 25 Rapidfire rounds, and Buckshot bundles have 5 rounds.
- Coating and jacketing each consume half a liquid ingot per bundle.
- Preserve one stack/object per conveyor tile. This design increases material
  density through stacking, not simultaneous stack count or rendering count.
- Heavy Stacker assembles stacks by configured weight rather than item count,
  with a maximum output stack weight of 20.
- This is intended to support loops of smaller products without allowing large
  stacks of massive items such as Switchgear.
- Heavy Stacker and Tier 2 conveyor costs and any new footprints are not settled.
- Overweight cargo splits into whole-item portions, preserving value, tags,
  and any fractional remainder. Contact recipes and ammo bundles stay intact.
- An indivisible item heavier than a destination belt stays blocked rather than
  being discarded or split into fractions. Heavy Stacker settings are unsettled.

## Cast Iron and Steel

- Cast Iron is the earlier, coal-using material that fills the machinery role
  previously planned for early Steel. It is not a rename of ordinary Iron.
- Steel comes later, including its reinforced-concrete role.
- The ordinary Ingot Molder needs a Clay mold for each Iron or Cast Iron ingot;
  its Iron behavior is already implemented, but Cast Iron is not implemented.
- Cast Iron's recipe quantities and Coal's deposit definitions are not settled.

## Refractory Caster and gems

- Refractory Caster: $1.5M, 50 Iron Ingots, 25 Iron Plates, and 25 Ceramic.
- Preserve its established 2x2 footprint, with input/output on the lower row.
- Further Quartz Wheel Cutter and jewellery work is shelved for now; existing
  content has not been removed.
