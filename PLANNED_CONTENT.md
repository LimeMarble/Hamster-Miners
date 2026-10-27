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
- Shop cards sort once by ascending cash price. Equal prices retain their
  definition order; category filtering preserves card order and controls.
- Save identity/key are separate; legacy mine saves cannot be imported here or
  overwritten. Prototype export/import and explicitly confirmed reset are available.
- Plain labelled machine boxes and port markers; no cosmetic machine animation.
- Inventory retains separate Machines and Items sub-screens. Unplaced machines use
  category-filtered compact cards with details and Place beside them; the Factory
  has no permanent machine list. Types with no unplaced stock are hidden even
  when instances remain placed. Pickup makes them available again. Items hide unowned materials.
- Machines inventory includes Dismantle for one unplaced machine at a time, with
  a visible refund preview. Refunds use the current construction recipe, including
  component machines such as conveyors, and never return cash. Starter reserves
  cannot be dismantled: keep two total Leek Planters, one Leek Basket and one
  Sell Tube, counting placed machines plus stock without double-counting stored
  instances. Surplus units can be dismantled. Stored instances are consumed once; liquid contents
  are discarded with a visible notice, while unrecovered solid contents return
  once. Placed machines require pickup first. The last selected machine remains
  selected with its details hidden and controls disabled so repeated clicks cannot destroy
  a different machine after stock runs out. No historical purchase data is kept.
- Shift-click empty ground starts two-tap box selection; Shift can also be tapped
  before the first click for trackpad use. Occupied tiles use a defined quick
  action (Basket: collect all), or select normally if no action exists. Shift-click
  adds another building to an existing single/group selection, suppressing its
  quick action. A selected tree also suppresses a different target's quick action.
  The explicit Box Select button can start on occupied tiles.
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
- Two free Leek Planters, one Basket and one Sell Tube are supplied to new games.
  Existing saves with fewer than two total owned Planters receive the missing
  units once on load, counting placed machines plus stock (stored instances are
  already included in stock). Saves with two or more keep their counts. With clicking enabled,
  no free Logger is needed. Additional Planters cost $500, 50 Bricks and
  100 Leek Fiber and 200 Soil; the starter remains free and existing owned machines are kept.
- Planter: 3x3, no internal conveyors, one Leek/8 seconds, one centered facing-edge
  output. Leeks have $0.1 base value. Blocked output has a bounded two-item queue.
- Basket: 1x1, capacity 100, costs 5 Leek Fiber instead of raw Leeks.
  No direct selling or manual inventory deposits. Collection and movement empty
  it into inventory.
- Brick Resource Storage: implemented at $200, 100 Bricks and 15 Clay, with
  capacity for 600 total resources and no operating crew. Solid 2x2 footprint;
  its only input is on the lower-left cell, entering from the left in the
  default right-facing orientation. It has no conveyor or automatic output.
  Collect-all, Shift-click and movement/pickup recovery share Basket
  behavior; contents and capacity remain independent per instance. Existing
  saves receive an empty stock entry, not a free machine.
- Fiber Extractor: Ingot Molder-style footprint: 1 column x 2 rows facing right,
  with body above and input/output on the lower tile; no conveyor. Freely
  rotatable. Costs 30 Wood and 1 Leek, with no cash requirement. One Leek yields two
  Fiber, each retaining the full input unit value. It is hand-operated, without
  a kinetic connection. It has one buffered Leek and at most two waiting Fiber.
- Logger: 1x1, $0, 50 Wood, 5 Leek Fiber, one crew; one Wood/6 seconds.
  Old twelve-second Logger progress migrates proportionally once on load.
  It must be inside a tree's middle edge tile, facing outward. Wood sells for
  $0.10 and provides 30 heat units as Kiln fuel.
- Clay Pit: 2x2, $5 and 100 Wood, one crew. Manually produces one Clay every
  12 seconds without kinetic power. Its centered two-wide facing-edge output
  is one fractional-coordinate port, not two independent outlets. Both receiving
  conveyors must exist. If exactly one feeds the other, the front/downstream
  conveyor receives the item. Otherwise both must face the same direction,
  sharing one centered cargo object which reserves both cells. A lone conveyor,
  incompatible directions or two conveyors facing each other block the outlet.
  A full-width receiver such as Sell Tube can accept directly. At most one Clay waits when blocked.
  Clay has a $0.25 base value and weight 1. Four pits can sell directly into
  the four sides of the starter Sell Tube for $5/minute without conveyors.
- Limestone extraction remains deferred; no Quarry is implemented yet.
- Pebble Sifter: implemented at $700, 150 Wood, 30 Bricks and 50 Leek Fiber.
  Solid 3x2 footprint, with Soil output at the upper-right cell and Chert output
  at the lower-right cell, both facing right by default. Its lower-middle cell
  has a downward-facing kinetic intake that must match a Hamster Wheel output;
  Conveyor Drive area coverage does not power the Sifter. No operating crew.
  A two-second cycle produces 0.1 Soil and 0.1 Chert together. Each material has
  its own port and at most one batch of waiting output; any uncleared output
  pauses further production without discarding resources or banking cycles.
  Chert base sale value is $0.10; Soil is unsellable. Both have unit weight 1.
  Fractional quantities, timer and buffers survive rotation/movement and saves;
  pickup returns waiting resources once. Older saves gain only the missing
  zero-valued inventory/stock keys. Primitive and Electric Rock Drills remain
  planning, not implemented.
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
  holds at most 2 waiting Clay and 1 buffered finished product while the next
  job runs. A ready job waits if that single finished slot remains full. Output
  unloads after downstream conveyors release, and newly arrived Clay can start
  the next job that same tick. Partial pot ingredients
  wait for the second Clay. A mode change affects the next job, not the running
  one. Modes, remaining processing time and contents survive moves/saves; normal
  pickup recovers unfinished Clay and completed products once.
- Clay Kiln: implemented at $30, 50 Unfired Bricks, 10 Clay and 15 Leek Fiber;
  no Limestone. Two crew and a solid 2x3 right-facing reference footprint:

  ```text
  Input .
  Input Output->
  .     .
  ```

  The upper four cells are the Kiln; the lower two are the operating hamsters.
  Both left inputs accept either fuel or unfired products. Full batches only:
  4 Unfired Bricks -> 4 Bricks or 2 Unfired Pots -> 2 Fired Pots in 8 seconds.
  Each product keeps its own incoming value multiplied by 4, without averaging
  different input values. Fired Brick base value/weight are $1/1; Fired Pot
  base value/weight are $4/2. New-material cash eligibility starts fresh.
  Fuel converts immediately to abstract heat, capacity 250ku; whole fuel items
  are accepted only if their heat fits. Wood provides 30ku, so it is accepted
  at 220ku and rejected above 220ku. Starting a full batch consumes 10ku times the
  recipe duration in heat (80ku), once, together with all ingredients.
  Each instance holds one pending input batch, one firing/ready job and one
  finished output batch. Solid output releases one product at the receiving
  conveyor's transit cadence (currently two seconds on primitive belts), rather
  than a fixed furnace delay. Direct non-conveyor outputs retain two-second
  pacing. An individually overweight product stays blocked. Blocked time cannot
  bank bursts. Firing and unloading overlap.
  Heat, separate input values, remaining time, output and unloading cooldown
  survive movement/saves while placed. Pickup recovers solid inputs and products
  once, then clears heat, fluid contents, jobs and unloading timers. Spent fuel
  is not refunded. Loading also clears runtime contents in stored furnaces.
  Copper extraction and smelting are implemented by the Copper Drill and
  Primitive Furnace described below, with direct Ingot Molder connections.
- Basic Hamster Wheel: 3x2, no cash, 100 Wood, 25 Fiber, kinetic outputs on both long
  edges. New placement defaults to down (2 wide x 3 tall), a quarter-turn from
  its reference footprint; existing saved orientations are unchanged.
  Conveyor Drive: 1x2 horizontal, no cash, 75 Wood, 7.5 Fiber; its facing side
  is the intake; it has no physical output port. Direct intake-to-Wheel
  connections work in all rotations. A powered Drive reaches seven tiles beyond
  each footprint edge: 15x16 when vertical, 16x15 when horizontal. Coverage is
  tile-aligned and rotates with the Drive; previews use the same bounds.
- Primitive Upgrader: the existing 1-column/2-row, two-lane footprint; $2,
  10 Wood, 5 Fiber and two Primitive Conveyors. Its belts require Drive coverage. The new effect was
  not settled. The existing effect and saved values remain unchanged, but the
  debug balance editor and test-only UI copy have been removed from the prototype.
- Brick Seal: implemented at $115, 35 fired Bricks and one Primitive Conveyor, with no crew. Exactly the
  old Rock Shack footprint: one column, two rows; upper cell is the sole
  conveyor/upgrade tile, lower cell is the body. Right-facing by default, speed
  5 (two seconds/tile), requires Conveyor Drive coverage like other primitive
  conveyors. Cash effect +$1.25, 9 uses across all Seal instances, incoming value
  below $15, base value at least $0.50. Generic sellable/base-value eligibility,
  not clay-only, not hardcoded ore/ingot distinctions. The last eligible use may
  cross $15; never clamp a product's value down to the limit.
  On clay products, each grade-repair pass converts 5 percentage points of Poor
  chance to Standard, capped at four repair passes / 20 percentage points.
  Grade repair is separate from cash-use counts and still applies when cash
  eligibility fails. Clay, unfired/fired Bricks and Pots share the clay family.
  Repairs carry through shaping/firing while cash-use tags reset on material
  changes. Combining the same-material Clay ingredients uses a shared
  quantity-weighted average, with untreated ingredients contributing zero.
  This helper can be reused, but quantity/mass weighting is NOT a settled
  universal rule for future mixed-material products. Small but important
  components (especially Tiara gems) must not become irrelevant beside a heavy
  body. Mixed-material contribution weights, including solder's role, remain
  undecided and must be specified with the relevant recipe.
  Differently repaired cargo remains separate in collector contents.
  Aggregate inventory collection/pickup still follows the opening prototype's
  material-count-only inventory model. Grade repairs modify the Grading Bench's
  first roll; they do not directly multiply cash or change an already rolled grade.
- Grading Bench: implemented at $1.25k, 100 Wood, 50 Leek Fiber and 10 Chert.
  Uses one crew, with exactly the Clay Shaping Bench's sparse footprint and
  lower-right input/output cell. Processing takes 1 second per total cargo
  weight, including fractional stacks; one incoming stack receives one roll.
  Clay and its unfired/fired products start at 20% Poor / 60% Standard / 20% Fine.
  Stone (currently Chert) starts at 100% Standard. Other current materials,
  including Soil, have no table and are rejected rather than assigned one.
  Multipliers are Poor x0.75, Standard x1.5, Fine x2.5, Remarkable x8 and
  Exceptional x25. Ordinary base tables cannot roll Remarkable or Exceptional;
  manufactured quality profiles such as spun pottery can. Grades multiply actual incoming value,
  never the material's declared base value.
  The Bench has one queued input stack (up to primitive-belt weight), one job
  and one finished output stack. Blockage cannot reroll or accumulate output.
  A grade's multiplier is baked into actual value; only a boolean graded flag
  is retained, not a grade category or internal portions. The flag survives
  shaping/firing, saves and moves. Already graded stacks cannot roll again.
  Explicit same-material stack formation sums quantities and averages actual
  unit values and pre-grading repair modifiers by quantity. Cash-use counts take
  the maximum for each upgrader, while one-off tags combine by union. Combining
  different upgrade histories deliberately sacrifices remaining eligibility;
  it never refunds uses. If any ingredient is graded, the whole merged stack
  becomes graded, including any formerly ungraded quantity. No reroll follows.
  Splitting copies unit value, graded flag, modifiers and all upgrade history
  unchanged; only quantity and derived total weight/value change. Overweight
  stacks wait intact instead of automatically splitting to fit belts. Cash
  eligibility resets on a new material as before. This is not a new Stacker.
  Existing portion-based saves migrate without changing actual cash/quantity;
  any graded portion marks the whole stack graded, and old fractional cash-use
  counts round upward rather than refunding eligibility.
  Collecting into aggregate inventory still retains counts only. Factory cargo and
  collector details indicate Graded without assigning a persistent category.
- The older Fiber construction costs above were halved exactly; the new
  Planter's explicitly supplied 100-Fiber cost is not halved again.
- Hauling is removed. Collectors have no route assignment or automatic withdrawal.
  Loading older saves removes routes and returns only their already-carried
  materials to inventory, once. Their former crew becomes available immediately.
- Crew starts at 10. Hiring beside the crew counter costs $5 × 1.1^previous
  paid hires. Each hire adds one available hamster for machinery;
  both the count and the next price persist through save/load.
- Sell Tube costs $250 and 200 Bricks after the free starter. Old saves with no
  tube receive one once; existing owned tubes count as their starter. Bricks are
  obtainable by firing and remain usable both for construction and cash.
- Sell Tube sales show small green floating cash texts at the selling Tube,
  using actual upgraded stack proceeds and shared number notation. Feedback
  rises/fades, stays bounded, and is not part of saves or cash accounting.
- Primitive Conveyor costs 10 Wood and four Wooden Gears per tile, with no cash. One object per belt tile,
  weight capacity 2 and two-second transit (speed 5). Primitive Upgrader and
  Brick Seal belts share this speed; no multi-cargo belt redesign.
- Prototype assumptions, visibly disclosed in Options: Fiber takes 2 seconds
  and one operating hamster; the Wheel uses one hamster. These were not supplied
  as exact stats. Connectors, further resource
  depots and all later chains remain outside this opening slice.
- The existing mining game and its simulation files are unchanged. Parent-level
  architecture/state documents predate both this slice and much of the mining game.

## Settled noammo additions (2026-10-22)

- Leek Infuser: implemented at $20, 20 Leeks, 15 Leek Fiber and one Primitive Conveyor. Same 1x2
  footprint as Brick Seal: upper conveyor and lower body. Adds $0.40 while
  incoming value is below $2, without ingredient consumption or a use cap.
- Primitive Shack: implemented at $5k, 880 Wood, 200 Fiber, 50 Chert,
  20 Fired Pots and six Primitive Conveyors. Solid 3x4: body row, two independent three-tile conveyor
  paths, body row. Multiplies actual unit value by 2 once per material stage,
  requiring base >=$1.20 and incoming value <$2.5k. Upgrade cells are the middle
  conveyor cells; crossing the whole building never applies more than once.
- Primitive Conveyor Bridge: implemented at $10 and four unplaced
  Primitive Conveyors. Three conveyor tiles; only the center can overlap an
  ordinary Conveyor. Ramps cannot overlap machines or trees. Can be built in
  either order with its underlying belt. Upper and lower cargo are separate;
  moves, group rotation, pickup and saves retain that ownership. Shop multi-buy
  accounts for machine ingredients, including picked-up conveyor instances.
- Primitive Rock Drill: implemented at $5k, 40 Chert and 50 Wood. Solid 3x2
  reference footprint: six occupied cells with one centered front-edge output,
  following Clay Pit's shared geometry/rules. Neither pits nor drills have internal conveyors.
  Select Chert (default) or Granite; produces a stack of two every 5 seconds.
  One waiting batch, no accumulated blocked cycles. Mode and contents survive
  moves and saves; changing mode does not rewrite existing output.
- All new machines use zero crew. Primitive conveyors retain two-second tile
  transit, weight capacity 2 and Conveyor Drive power; multi-cell conveyors
  advance one tile at a time, without instantaneous internal transfers.
- Basic stone base values: Chert/Granite/Limestone $0.10, Corundum $1;
  stones use the Standard-only base grading table. Native Copper base $1.50.
  Only Chert/Granite extraction is implemented here; the other definitions do
  not invent new sources, smelting chains or construction requirements.
- Content migration adds only missing zero inventory/stock entries. Existing
  cargo's actual value and upgrade history are preserved by the balance change.
- Still unsettled: later Stacker cost/specification, revised Rock Shack,
  final Granite Processor, and later mineral extraction/smelting machinery.

## Manual Overflow and primitive belt capacity (implemented, 2026-10-25)

- Manual Overflow costs $2, 20 Wood, two owned Primitive Conveyors and two
  Wooden Gears. Logistics category, one crew. The two middle cells are the
  ordinary straight conveyor route. If its input cargo cannot proceed, the
  hamster carries one stack to the selected left or right output, relative to
  the machine's facing, in exactly
  two seconds, without weight/distance adjustments or an extra unload delay.
- Reference footprint is two columns by three rows. Both outer-left output
  cells, middle-left input and middle-right normal output are always occupied.
  Only the selected outer-right hamster cell is occupied; the other is free.
  Left is the initial mode. All cells and ports rotate together. Saved mode
  keys remain `up` (Left) and `down` (Right) for compatibility.
- Changing mode requires the new hamster cell to be free. Refusal is atomic;
  successful changes preserve carried cargo and the remaining transfer time.
  Normal downstream releases are resolved before overflow, including adjacent
  Overflow machines. Blocked hand deliveries hold their single stack and do
  not accumulate extra transfers. Manual carrying continues if belt power is
  removed; the ordinary conveyors retain their normal power requirement.
- Selection, previews, single/group movement, pickup and save/import use the
  selected footprint. Carried cargo, normal belt cargo and all metadata remain
  instance-owned. Pickup recovers each item once and preserves the stored mode.
- Noammo primitive belts and built-in primitive conveyor lanes now carry at
  most two weight, including Stackers and Bridges. Transit remains two seconds
  per tile. Older five-weight belt stacks split on import: the legal front
  portion stays on the belt and its remainder waits on that same instance,
  releasing legal portions at normal transit speed. Material quantity, value
  and upgrade/grade metadata are preserved. Pickup also recovers remainders.
- Existing saves gain zero Overflow stock, not a free machine. No legacy
  mining-game capacity or production balance is changed.

## Copper Drill and Primitive Furnace (implemented, 2026-10-26)

- Copper Drill: $75k, 100 Granite, 50 Chert, 20 Wooden Gears and 40 Wood.
  Solid 3x2 footprint, four rear cells and a centered two-cell outlet, without
  internal conveyors. Kinetic intake is below the middle column, as on Pebble
  Sifter. One Native Copper ($1.50 base, weight 1) every 15 seconds; no extra
  crew beyond the connected Wheel. Production pauses without kinetic power
  or when its single-item output is full; no banked cycles.
- Primitive Furnace: $250k, 200 Bricks, 100 Granite and 50 Clay; two crew.
  Uses Clay Kiln's solid 2x3 footprint and ports: two left inputs at the top
  and middle rows, and one right output in the middle row. Both inputs work
  identically, with bounded whole-item feed/fuel acceptance.
- Selected Charcoal mode: 4 Wood -> 2 Charcoal in 12 seconds, requiring zero
  external heat. Wood is recipe feed in this mode, never accidentally burned
  as fuel. Total incoming cash value is preserved ($0.20 base per Charcoal).
  Charcoal weighs 1 and provides 240ku of heat.
- Selected Copper mode: 4 Native Copper -> 4 Molten Copper in 20 seconds,
  consuming 500ku once at start (25ku/s). The finished batch averages its
  input values and multiplies by 4; new-material cash-use tags reset.
  Molten Copper has $6 nominal base value and weight 1; it is a fluid, not
  solid collector/conveyor cargo, inventory material or a direct sellable.
  It feeds an adjacent Ingot Molder; fluid transfer follows the receiver's
  bounded capacity, independently of the solid-output unloading timer.
- Furnace heat capacity is two copper firings (1Mu). It holds one pending
  full input batch, one running/ready job and one finished batch. Solid output
  unloads one product at receiving-belt cadence, like the Kiln. Mode changes return only waiting inputs to
  inventory; the running recipe, heat and finished output remain intact.
  Moves and saves retain placed instance state. Pickup recovers solid
  ingredients/output once and clears remaining molten metal, heat, jobs and
  unloading timers. Replacing a picked-up furnace starts with empty buffers.
- Thermal units are scaled by 1000 across the noammo prototype: Wood 30ku,
  Clay Kiln 250ku capacity and 10ku/s (80ku per eight-second firing).
  Old placed furnace heat migrates exactly once; stored furnace runtime contents
  are cleared. New machines/materials
  receive zero stock/counts. Legacy mining-game thermal values are unchanged.

## Ingot Molder and Copper Chimes (implemented, 2026-10-26)

- Ingot Molder: $25k, 40 Bricks, 20 Clay and 10 Leek Fiber. One crew;
  same 1x2 vertical footprint and lower-tile left input/right output as Fiber
  Extractor. One liquid unit -> one ingot every second with no cash bonus,
  fuel or consumable Clay. Copper Ingot base value $6, weight 1.
- One waiting liquid unit, one working/ready job and one finished ingot.
  Fractional arrivals of matching liquid can fill the one-unit input buffer.
  Working can overlap finished output waiting; solid belts clear before
  unloading, and new liquid deliveries can start work in that same step.
  Direct Furnace-to-Molder transfer sustains 1/s in every facing and either
  machine order, without pipes or a two-second liquid release throttle.
- Liquid-to-solid mappings belong to material definitions. Refractory-only
  materials, including future Cast Iron, are excluded from basic molding.
  Pickup collects finished ingots once and retains liquid inputs/jobs with
  that owned Molder. Moves, group moves and saves retain work and values.
- Copper Chimes: $100k, 200 Leek Fiber, 50 Wood, 10 Copper Ingots and its
  standard one purchased Primitive Conveyor component. Zero crew. Three
  occupied cells in a vertical column with a right-facing middle conveyor;
  kinetic power and two-second transit, rotating normally.
- Cash effect: x1.25 once across all Chimes instances, incoming value strictly
  below $5k, no base-value minimum. Eligibility is per item, and the final
  result can exceed $5k. New-material transformations renew cash eligibility.
  Uses and other cargo metadata persist through ordinary moves and saves.
- Older noammo saves gain zero stock/counts for these additions. Shop,
  Inventory, Recipes, stable machine controls and recent output history use
  the real definitions. Legacy mining-game machinery is unchanged.

## Granite Processor (implemented, 2026-10-23)

- Cost: $35k, 300 Granite, two owned Primitive Conveyors. Cash category,
  zero crew, the original 1-column/2-row footprint with two independent
  right-facing primitive conveyor lanes. Rotates normally, requires Conveyor
  Drive coverage and uses two-second transit with normal belt capacity.
- Cash effect: x1.3, up to 12 uses across all Processor instances. Declared
  per-item base value must be at least $3.50; incoming per-item actual value
  must be below $500 (rebalanced 2026-10-26). No incoming lower bound. This is not a result clamp.
- Uses travel with cargo through saves and moves, follow existing stack merge
  rules and are validated against each upgrader's declared limit. Existing
  grade/repair metadata and other upgrader tags remain intact.
- Shop/Inventory effects, bulk costs, rotated previews, Recipes and output
  diagnostics use the shared systems. Older saves gain only zero Processor
  stock; no machine is awarded and no old mining-game balance changes.

## Machine output diagnostics (implemented, 2026-10-23)

- Upgraders and the Grading Bench show the last five processed stack results,
  newest first, both in the selected-machine panel and via Shift-hover. No
  settings toggle. Help lists the hover shortcut alongside existing Shift actions.
- Entries show actual cash value; stacks show total, quantity and unit value.
  Grading entries additionally show the actual rolled grade. Already-graded
  inputs say "Already graded" rather than inferring a grade from averaged cash.
- Each processing event records once, including an unchanged capped pass.
  Blocked outputs never flood the list. Diagnostics do not affect RNG, cargo
  grades, upgrades, quantities or sale values. Lists are per-instance, follow
  moves, clear on pickup and refresh/import, and are not part of save data.
- History text changes only when results change. Existing machine controls are
  not remounted. Hover tooltips do not intercept clicks, hide on release/leave/
  blur/tab changes, and are suppressed during placement and active box selection.

## Wooden Gears and construction components (implemented, 2026-10-23)

- Crude Gear Bench: 25 Wood, no cash, one crew. Solid 1-column/2-row reference
  footprint, upper body and lower working tile. Input from the left and output
  to the right of that lower tile; both rotate with the machine. No conveyor or power.
- 2 Wood become 1 Wooden Gear in 12 seconds, preserving total incoming value
  and weight (base $0.20, weight 2). Two waiting Wood, one running recipe and
  one finished Gear maximum. A blocked output stops further jobs.
- Primitive Conveyors require 10 Wood and four Wooden Gears, with no cash. Every existing
  belt-equipped machine requires one purchased conveyor per internal belt tile,
  subtracting 20 Wood per tile from its old raw Wood cost, down to zero.
  The Bridge retains its already-specified four-conveyor requirement (three
  physical belt tiles); its remaining 50 Wood is removed by this deduction.
- Pits and drills have no internal belts, no conveyor component costs and no
  fake belt visuals. Centered output and receiver compatibility are unchanged.
- Existing machines are not picked up or charged retroactively. Older saves
  gain only zero-valued Wooden Gear inventory and Gear Bench stock keys.

## Pot Spinner (implemented, 2026-10-23)

- Cost: $2,500, 150 Wood, 60 Bricks, 30 Granite and 15 Leek Fiber.
- Solid 2x3 right-facing footprint: middle-left material input from the left,
  middle-right output to the right, top-left kinetic intake facing up, and
  bottom-left kinetic intake facing down. Either intake accepts a directly
  adjacent long-edge Hamster Wheel output. Area power alone is insufficient.
  The complete footprint and all ports rotate together. No extra operating
  crew beyond the Wheel; no cosmetic animation.
- Two Clay -> one Unfired Pot in 12 powered seconds, preserving the shaping
  bench's pot recipe/value: twice the combined actual Clay value. Firing still
  takes place in the Kiln. Power loss pauses the same job without consuming
  more ingredients. One pending batch of 2 Clay, one job and one finished Pot
  bound intake/production; a blocked output does not bank cycles.
- Before Brick Seal repairs, spun pots have 20% Poor / 10% Standard / 40% Fine /
  25% Remarkable / 5% Exceptional. Four repairs move 20 percentage points from
  Poor to Standard, yielding 0/30/40/25/5 and an average grading multiplier of
  4.70 (4.55 without repairs). The fifth tier is Exceptional at x25.
- This is a carried pre-roll probability profile, not a rolled grade category
  or a new inventory material. The Grading Bench rolls once as usual. Firing,
  moves, saves and splitting preserve the profile. Combining
  same-material cargo averages profiles by quantity, with ordinary cargo
  contributing its ordinary table. Already graded inputs remain graded and
  cannot roll again; cash-use tags reset at the normal material transformation.
  Profiles and Seal repair modifiers are independent. Inventory collection
  retains counts only, as before. Ordinary pot/brick/stone chances are unchanged.
- Shop/Inventory show base chances, the inspector updates input/output counts
  without remounting controls, and Recipes documents the same real recipe.
  Older saves gain only a zero Pot Spinner stock entry, not a free machine.
- Painting remains unimplemented. Settled revised transfers are 15 percentage
  points Standard -> Fine, 20 Fine -> Remarkable and 10 Remarkable -> Exceptional,
  limited by the available source chance; shortfalls are discarded. Fully
  repaired spun pots would become 0/15/35/35/15 (mean x7.65), while unrepaired
  ones become 20/0/30/35/15 (mean x7.45). This does not add a Painter or recipe.

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

- The noammo Primitive Stacker is implemented: $1,000, 80 Wood, 50 Chert,
  80 Granite and one Primitive Conveyor. Uses the old Splitter's 1x1 footprint, with three input sides
  and an output in the facing direction. No crew; requires Conveyor Drive
  power and uses primitive conveyor timing (two seconds per outgoing stack).
- Stack size is a typed whole number from 1 to 2, default 1, rather than a
  dropdown. One matching-material buffer fills only to the selected size,
  subject to belt weight capacity; blocked/full buffers reject further input.
  Fractional inputs can accumulate into a complete stack. Reducing the setting
  does not discard already buffered items. Settings, cargo and progress persist
  through moves and saves; pickup returns buffered resources once.
- Combining uses the shared value/grade averaging, maximum upgrader use counts
  and tag union rules. Adjacent Stackers transfer directly but never instantly.

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

The following are legacy mining-game settings. Noammo uses direct-working
iron blooms and reserves Cast Iron for the Refractory Caster; its basic Molder
does not consume Clay during operation.

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
