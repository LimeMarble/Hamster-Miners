# Hamster Miners regression scenarios

Run `npm test` after every change. The automated suite covers the deterministic
rules below; the manual cases cover browser layout, interaction, and rendering.

Only implemented mechanics are testable. Ideas intentionally deferred by design
(post-reality content, later ores, later casing/jacketing, reset mechanics, and
future pipe tiers) are not treated as current acceptance requirements.

## Shared machine contracts

### Separate noammo opening

- Fixed-terrain checks compare all 36 green centers from the revised workbook,
  including one-based center to zero-based 3x3 origin conversion. Every seed
  shares the map; footprints and all four Logger outputs remain unobstructed.
- Legacy/different terrain enforces that map and picks up all placed machinery
  once. Normal pickup conserves Basket, input, output, unfinished-job, conveyor
  and hauling quantities; machine identity/facing, cash and hires survive.
  Repeated imports/reloads cannot duplicate resources or pick up replacement
  machinery. Invalid cargo/routes still fail validation before migration.
  UI startup/import checks cover the notice, autosave and non-overwritten backup.
- `tests/noammo-opening.test.cjs` runs the real opening from zero to the $22
  powered setup using manual Wood, a cash-free Fiber Extractor, and four Clay
  Pits funding the cash costs, then verifies a powered Fiber sale line.
- Planters produce one Leek per eight seconds. One starter is free; repeat
  purchases enforce $500, 50 Bricks and 100 Fiber per unit. Old free Planters
  remain owned, without granting new free machines on reload.
- Fiber costs only 30 Wood and one Leek. Older Fiber construction quantities
  halve exactly (including 7.5 for the Drive); the new Planter price stays 100.
- Manual Clay Pits cost 100 Wood and use one crew each. Their twelve-second
  cycle and $0.25 Clay work without power, through either half of the two-wide
  output in every rotation. Four pits feed one Tube for $5/minute. Blocked
  queues are bounded, independent, and conserved through moves/pickups/saves.
  Old saves gain zero-valued new inventory keys, not free pits or resources.
  Invalid/overfull source buffers are still rejected. Shop, Inventory, recipes,
  shared lifecycle rendering, crew accounting and new prices are covered.
- Sell Tube cash feedback uses effective stack proceeds only after a sale,
  never during intake previews. Green texts rise/fade above their own Tube,
  use common notation, expire while off-screen, and stay bounded under bursts.
  Rendering does not mutate quantities/value and loading never replays texts.
- Clay Shaping Bench checks cover the $20/50 Wood/5 Fiber cost, one crew,
  three occupied cells in every rotation, and the free lower-left cell across
  placement, selection and rendering. Real Pit-to-Bench-to-Basket routes work
  without power. Brick/Pot modes take 2/4 seconds for 1/2 Clay; mixed upgraded
  Clay values combine correctly, with the Pot's additional x2 multiplier.
  Bounded input/output, sustained 0.5 Clay/s, read-only intake previews, mode
  changes during work, independent instances, moves, pickups and hydration
  preserve quantities and values. Older saves gain only the new zeroed keys;
  malformed current buffers/modes are rejected. UI tests exercise the real
  purchase/placement/mode handlers and ensure ticks do not remount the selector.
- Shared contracts cover every opening machine in every rotation through
  placement, move, pickup, replacement, save hydration and finite/read-only draws.
- Clay Kiln coverage includes its exact price, 2 crew, all six occupied cells
  and two interchangeable inputs in all rotations. Full 4-Brick/2-Pot batches
  require eight seconds and consume 40u once at start, with Wood providing 30u
  and a hard heat capacity of 250u. Invalid sides, partial batches, overfull or
  incompatible inputs and fuel overflow reject safely; intake previews do not
  mutate heat. Each ingredient retains its own upgraded value through firing.
  Blocked output cannot drain unlimited materials, stall another kiln, bank
  bursts or prevent normal overlap between firing and unloading. Actual powered
  belt tests maintain one output every two seconds, regardless of instance order.
  Single/bulk moves, pickups, terrain migration and hydration preserve identity,
  heat, cooldowns, values and quantities without leaving tile-owned contents.
  UI heat/status/control nodes stay mounted while jobs advance. Fired goods sell
  and serve construction costs; storage withdrawals use their base values.
- Primitive belts and both Primitive Upgrader lanes take two seconds per tile
  (speed 5). Floating-point comparisons trigger the cash upgrade exactly once at
  the halfway mark, without changing source or shaping processing timers.
- Brick Seal tests compare the real legacy Rock Shack footprint, including its
  single upper conveyor and inactive lower cell in all rotations. Cash checks
  cover its exact price, zero crew, x1.15/9-use/$10/base-$0.50 rules, eligibility
  of a future non-clay material, unit values versus stack totals, and a last use
  crossing the ceiling without any clamp. Cash and grade caps stay independent;
  output blockage and saved mid-pass cargo cannot repeat an effect. Four repairs
  remove 20 absolute percentage points of Poor chance. Mixed repaired/untreated
  inputs, the quantity-blending helper's 4:1/9:1 arithmetic, partly consumed stacks and floating-point
  caps preserve the modifiers through shaping, firing, hauling and save/load.
  UI tests cover effect fields in Shop/Inventory, material-cost multiplication,
  repeat placement, independent identities and stable machine controls.
  Helper arithmetic does not establish mass/quantity weighting as a design rule
  for mixed-material recipes; those quality contributions remain undecided.
- Fiber matches the actual Ingot Molder's 1-column/2-row, right-facing layout:
  body above, input/output on the lower cell, without a conveyor. Real Planter
  feeds work in all rotations; the body rejects cargo. Earlier Fiber saves
  retain jobs, contents and (for version 2) occupied tiles through correction.
- Every Wheel long-edge port accepts the correct Drive intake, while short
  edges, gaps and wrong facing reject it. Losing the Wheel immediately stops power.
  Drives have no physical output port in any rotation; their output is the
  16×16 powered area, shared by previews and placed machinery.
- Tests cover global click limits, saved partial chops, RNG harvest bounds,
  limited machine buffers, blocked outputs, independent instances, collector
  capacity, real hauler timing, stale exports, and cash/material affordability.
- `tests/noammo-ui.test.cjs` executes the actual four browser scripts against a
  small DOM contract harness. It covers every tab, purchase handlers, quantity
  limits, category filtering, owned feedback, tap placement/rotation, stable
  hauling controls and preservation of corrupt saves. This is not a substitute
  for live-browser visual verification.
- Refresh starts at the factory grid's centre on both axes, including when
  layout dimensions arrive late. Tab switches preserve pan/zoom, clear edge
  panning, and ignore hidden viewport sizes. A changed viewport preserves the
  viewed world centre; Home recentres without resetting zoom.
- Opening Inventory has separate Machines/Items sub-screens, owned-only machine
  cards, category filtering, stable selected details and a Place action returning
  to the current camera. Machinery is not listed on the default Factory screen.
- Shift-click (or tap Shift then click) on empty ground arms two-tap selection;
  occupied tiles collect Baskets or select normally. Another selected machine,
  Basket, tree or group suppresses the target's quick action, including when a
  group contains that target. Repeated collection cannot duplicate cargo or sell
  it. Trees select without chopping under Shift. Placement/movement and explicit
  Box Select take precedence; pointer jitter cannot start an occupied-tile box.
  Shortcut help remains available regardless of selection.
- Box select can start on occupied tiles; reversed and additive boxes,
  ordinary drags, the eight-pixel intent threshold, input/repeat guards and Cancel
  are covered. Control-panel releases cannot select the background canvas.
- Bulk movement rotates full footprints and facing in either direction, ignores
  only the selected original footprints, and commits atomically. Invalid moves
  retain contents/positions; successful moves and pickups use normal per-instance
  recovery rules. Shared tests cover every opening machine in every orientation,
  including read-only group previews and selection outlines.
- Prototype saves have a different kind/key; importing a legacy mining save
  fails without mutating live state. Primitive tuning remains explicitly
  labelled as unsettled, not a canonical effect.
- Baskets have no selling action or sale API. Holding or collecting sellables
  gives no cash, while collection and hauling controls keep working.
- Primitive Conveyors cost $1 and 20 Wood each. Normal and bulk purchases require
  sufficient cash and Wood, show scaled costs, and cannot borrow free belts.
- Crew hiring costs $5 × 1.1^paid hires, excluding the ten starting hamsters.
  It deducts cash once, unlocks machine/hauler capacity and persists through
  placement, pickup and save/load. Old saves default to zero hires; invalid
  counts are rejected. The stable Hire button updates its price, affordability
  and available/total count on every screen, including after incoming sales.
- Wood sells for $0.10 through inventory and Sell Tube, retaining fresh
  upgraded cargo values and its 50 heat units. One starter Sell Tube is free;
  extra tubes require $250 and 200 Bricks each, with normal bulk costs and no
  borrowing bypass. Old saves receive a missing starter once, keep any tubes
  already owned, and price previously unvalued Wood without losing cargo.

- Shared checks iterate `MACHINE_LAYOUT`, so new machine definitions are covered
  automatically without copying another machine's smoke tests. Exceptions come
  from existing rules: fixed displays are not placeable; only repeat purchases
  require duplicate visual instances; pipes use symbols rather than text labels.
- Each movable type is checked in all four orientations for completed floor
  redraws, unchanged unrelated visuals, valid/blocked conveyor previews, and
  independent labels after movement and removal. Drawing cannot mutate saves.
- Real rotation, Move, placement, pickup and save hydration preserve instance
  identity, orientation, default mode and per-instance conveyor cargo. Pickup
  clears the former lanes, recovers their material quantity, and leaves another
  instance's cargo and placement unchanged.
- Recipes, ingredient limits, processing times, material compatibility and
  machine-specific recovery rules retain their dedicated tests. Do not assume
  these are identical just because machines share placement or rendering code.

## Save, notation, and state migration

- Values below 1,000, including fractional quantities and timers, display at
  most three significant figures; values at 1,000 and above retain the existing
  Hamster Cloners suffix notation.
- Suffix notation reaches scientific notation at the same threshold as Hamster
  Cloners; currency keeps the `$` prefix.
- Refresh and import/export retain the selected ammunition material.
- Saves containing legacy 2-damage Malachite ammo upgrade it to 3 damage.
- Saves containing annealed mineral ammo with normal damage repair it to 5.1
  damage without changing normal stacks.
- Saves with duplicate or missing machine instance IDs restore every machine as
  a unique instance.
- Legacy single kiln/molder jobs migrate to their per-instance job arrays.
- Tunnel progress, current layer, re-mine state, deposits, and drill HP remain
  separate for each tunnel when switching tunnels.

## Mine, tunnels, and drilling

- Tunnel 1 starts at 100 HP, Limestone host rock, and Malachite/Clay deposits.
- Tunnel 2 starts at 250 HP, Granite host rock, and five Native Copper plus
  five Clay deposits.
- Tunnel 3's Chert bands yield 20 Chert per layer at Band 2, increasing by 4
  per band (28 at Band 4 and 84 at Band 18). Normal mining and re-mining collect
  it progressively; Hematite yields stay unchanged and the Kimberlite cap gives
  no Tunnel 3 host-rock yield.
- Native Copper has three 8-HP segments; Malachite has three 3-HP segments;
  Clay has two 2-HP segments; Lead has five 10-HP segments.
- Clay deposit labels, the Mine legend, and Shop costs consistently call the
  material `Clay`.
- Tunnel 1 Bands 1–2 have half the starter deposits (four Clay and two
  Malachite before node doubling); Bands 3–4 use the full starter pool.
- Tunnel 1 Band 5 contains five Clay, four Malachite, and three Lead deposits.
- Tunnel 1 Band 10 introduces two Silver deposits; Band 9's milestone reveals
  Silver, while Band 4's milestone reveals Lead appearing in Band 5.
- Tunnel 1 Band 20's milestone reward label is `???`.
- Tunnel 1 keeps the Band 20 pool through Band 23; Zinc joins at Band 24.
- Re-mining uses the full deposit pool and has one-third of the normal layer HP.
- Mine information lists only deposit types in the active band’s spawn pool,
  while keeping a depleted type visible until the player changes band.
- Target information shows current and maximum HP for the active segment.
- Layer controls use the relative band layer number; the last layer says
  `Continue to Band N`.
- Mining Rights cost $1,000 and require Tunnel 1 Band 1 completion; the
  permanent unlock is controlled from mine progression rather than Shop.
- Tunnel 2 Band 5 unlocks auto re-mine and auto-continue. Re-mine selection is
  compact rather than one button per prior band.
- Automatic drilling cycles Off, After ores, and Ignore Ores. Ignore Ores
  starts the drill immediately on entering a layer; any deposits left when it
  clears the layer are destroyed as usual.
- Mine progress shows clear milestone requirements and rewards, has a thin
  outline, and fills to the next visible milestone.
- Mine tiles sit left and mine information sits right at normal, narrow, and
  133% browser zoom. No host-rock gradient reveals the tile grid; host-rock
  color is visible behind ore without turning mined backgrounds gray.
- The mapped-ore summary uses one full-width line per ore, with its deposit
  count and per-deposit yield kept on the same line.

## Ammunition and the gun

- Basic Bullet Core Caster mode turns Leeks into basic rounds.
- Coated mode pauses Leeks before the transformer until linked liquid metal is
  available, then makes 25 mineral bullet cores per Leek and half a liquid unit.
- Jacketing consumes half a liquid Native Copper unit per 25 core rounds;
  excess liquid remains owned by its source.
- Malachite-coated rounds deal 3 damage before Annealer processing.
- Both Malachite and Lead are valid liquid-metal coatings; Leek remains the
  mandatory core material.
- The Mine ammo selector shows type/material visuals, damage, and separate
  counts. The Factory gun display shows the active material’s remaining rounds.
- Scheduled Rapidfire and Buckshot steps preserve each gun’s selected ammo
  composition across switches and save/load, even when the scheduled gun differs
  from the manual gun selection.
- Normal and annealed Malachite stacks never merge. Normal stacks are 3 damage;
  annealed stacks are 5.1 damage and remain distinct across refreshes.
- Ammo does not enter Material Storage and never has its damage or annealed
  state reset by material-storage rules.

## Value flow

- Route unmodified Malachite Ore through a Sell Tube: it sells for `$5`.
- Route unmodified Native Copper through a Sell Tube: it sells for `$5`.
- Route Malachite Ore through a Leek Duster and then a Sell Tube: it sells for `$6.25`.
- Route Native Copper through a Leek Duster and then a Sell Tube: it sells for `$6.25`.
- Send Duster-processed Malachite into a Clay Kiln and Ingot Molder: the resulting ingot has value `$25` (`$6.25 × 4`).
- Send unmodified Malachite or Native Copper through the Clay Kiln and Ingot Molder: either ingot has value `$20` (`$5 × 4`).
- Send a fresh `$10` Copper Wire through the Annealer and Sell Tube: it sells for `$17` (`$10 × 1.7`).
- Fresh Wires, pressed metal Plates, and all Contact types each receive one ×1.7 value pass; raw ores and ingots are not accepted.
- Contact Maker keeps its 100 Leek Fiber purchase requirement. Five Copper Wires plus 0.5 Silver or Contact Alloy Ingots produce five matching Contacts; Silver Contacts use ×2 and alloy Contacts use ×3. It preserves an annealed wire's value once without carrying its multiplier onto the new Contact. Legacy buffered Leek Fiber is discarded on load; buffered metal inputs remain instance-specific.
- Each Contact Maker can flip its ingot input across the wire lane. Only the
  selected side accepts ingots, in all four orientations; recipes, buffers,
  cargo value and wire routing are unchanged. The per-instance setting survives
  movement, pickup/replacement and save/load. The flip button stays mounted as
  production changes and supports both tapping and keyboard activation.
- Mineral ammo still receives ×1.7 damage from the Annealer; Leek ammo is not accepted.
- Put an ingot into Material Storage, then output it to a Sell Tube: it resets to the `$20` minimum before later upgrades.
- Route annealed Wire through Duster and verify the ×1.25 and ×1.7 effects are each applied once, not twice.
- Lead cannot be sold.
- Rock Shack remains crew-free and applies its additive value effect only on
  its built-in conveyor tile.
- Bronze Pillars accepts sellables with base value at least `$20` and current
  value below `$50k`, multiplies by ×1.4 once per item, and can cross `$50k` on
  that application.
- Bronze Stamp and Bronze Pillars keep per-item use tags through same-product
  remelting, but reset those tags when processing changes a sellable's material
  type; the already-earned value remains, and the new product can qualify anew.
- Primitive Upgrader is 1×2 like Granite Processor, with two independent
  horizontal speed-4 lanes. It costs $45, 10 Leek, and 10 Clay; uses no crew;
  requires at least $1 base value; adds $0.50 per pass; and stops at $15.
- Three Primitive Upgrader passes take Silver from $8.50 to exactly $10, while
  Malachite Ore remains ineligible and non-sellables pass through unchanged.
- Granite-Copper Annealer retains its existing cash, Granite, and Copper Ingot
  costs and additionally requires 50 Copper Wires, gating purchase after wire
  production is available.
- The smelting value marker survives remelting, so an already-smelted ingot
  does not receive the ×4 ore-to-ingot value increase again.
- The Stacker keeps sellables with different cash-upgrader use tags in separate
  batches. Material-specific eligibility flags remain controlled by their own
  processing machines.

## Ammunition

- Casing Machine has no hidden ammo or casing buffers: ammo travels on its three physical conveyor tiles, the center transformer waits in place for linked liquid metal, and a mode change affects uncased cargo already on the line.
- Casing Machine matches `. LiquidInput . / -> X-> -> / . LiquidInput .`: jacketed Rapidfire must move through the real input and transformer tiles, consume 1 liquid unit per 25 rounds, and leave through the output tile. Partial stacks and incompatible ammo are rejected rather than merged into a machine buffer.
- Legacy saves with the former Casing Machine buffers restore buffered ammo to the ammo inventory and return casing liquid to its smelter output queue; neither resource is discarded and the obsolete buffer state is removed.
- Send a normal Malachite bullet stack to the Gun Deposit: it remains a separate normal stack at 3 damage.
- Send a fresh Malachite bullet stack through the Annealer to the Gun Deposit: it becomes a separate annealed stack at 5.1 damage.
- Repeat the previous case with an existing normal Malachite stack present: the two stacks must not merge.
- Verify the annealed stack remains annealed after refresh, save/load, and selection changes.
- Verify ammunition never enters Material Storage and its damage is never reset by storage output.

## Machine concurrency and routing

- Every new buffered input needs an explicit capacity and tests for filling
  that capacity, rejecting further intake, retaining oversized-stack overflow,
  and reopening space after consumption. Cover blocked production/output,
  separate instances, and save/load; accepting the right material alone is
  not a sufficient input contract.

- Aggregate Mixer costs $800k, 50 Iron Heavy Gears, 100 Iron Plates, 50 Ceramic,
  and 150 Copper Wires. Its 4x3 footprint has inputs at both left corners and
  its output at the right-center cell, with no crew requirement.
- Either Mixer input accepts Limestone or Chert, buffering at most 40 and 20
  respectively. A ten-second cycle produces ten Aggregate, released in
  capacity-safe stacks. Overflow stays on the feeding belt; blocked output
  preserves pending product. Instances and jobs survive moves/save/load.
- Hot Fluid Pipe is one $25k Logistics item, costing 2 Ceramic, 2 Iron Ingots,
  1 Tin Ingot, and 5 Aggregate. Its six forms and left/right turn choice persist
  through pickup, placement, rotation, and save/load.
- Pipes have 30 fluid weight/s throughput and no distance limit. Blocked/capped
  exits are skipped, but one open outlet stops the entire connected network.
  Separate networks keep running. Topology is cached until layout/form changes.
- Pipes feed all existing liquid-metal consumers and preserve material, value,
  tags and instance ownership. Two connected side inputs remain usable when
  the first source is empty. Fluid credit is shared across records, and casing
  consumes exactly the required quantity without deleting buffered remainder.
- Hidden cargo weight is quantity times per-unit weight: default 1, wires 0.2,
  contacts 0.3, cut gems 1, Aggregate 3, Heavy Gears 2, and Fine Gears 0.5. A cutter's 0.4-gem
  output weighs 0.4 because of its quantity, not an additional weight discount. Ammo bundle
  weights are 1/1.5/2/3 for basic/coated/jacketed/cased rounds.
- Ordinary belts carry up to weight 5. Built-in Iron-tier belts only use weight
  30 when their machine's construction cost also includes Aggregate. Transit
  speed and the one-object-per-tile limit are unchanged.
- Aggregate fits one unit per ordinary belt stack, or ten units at weight
  capacity 30. The Mixer retains the remainder until its output clears.
- Overweight cargo splits in whole units without losing value/tags, overwriting
  a retained source stack, or rounding away fractional leftovers. Outputs which
  gain weight split by whole recipes. Legacy output buffers and Stacker batches
  drain safely, including the last chunk of a partly emitted configured batch.
- Casing mode controls remain mounted while pipe fluid quantities change.
- Adjacent Stackers hand cargo directly to each other, including perpendicular
  and partly filled saved buffers. Ordinary Stackers use belt weight capacity 5
  and one output per normal belt transit cycle; each hop has its own timer.
- Sustained full-factory updates emit one stack per second after startup, with
  direct or belt-fed inputs, one- or three-item batches, all orientations, and
  either machine order in a chain. Ready downstream batches leave first instead
  of forcing unnecessary partial handoffs. Incoming belts can stage at the
  entrance, but transfers still respect capacity, compatibility and blockage.
- A ready output is retried without added time after its outgoing belt vacates.
  Conveyor completion tolerates fractional tick rounding, avoiding an extra
  tick at nominal one-second transit. Freshly received cargo gains no old transit
  time, blocked outputs cannot bank bursts, and quantities remain conserved.
  Full blocked loops, mixed materials/tags, oversized legacy batches, save/load,
  speed cheats and blocked-time bursts are covered. Buffer/timer changes do not
  rebuild the machine controls. Browser scripts share a cache version so old
  callers cannot leave newly timed outputs permanently at zero progress.
- Gear Press costs $400k, 100 Iron Ingots, 50 Iron Plates, and 100 Copper Wires;
  its 2x3 occupied footprint and two speed-5 conveyors match Metal Press.
- Heavy Gear is the default mode: two consecutive matching plates make one
  gear. Fine mode makes two gears per plate. All six existing plate metals
  retain their identity, and total effective input value is conserved.
- Odd plate stacks retain only their unmatched plate per instance. Blocked
  output stops further intake; finished gears are never reprocessed on mode
  changes. Gear Press modes and pending plates survive moves/save/load, while
  single/bulk pickups return pending plates to storage.
- Direct Metal Press -> Gear Press -> Sell Tube works in both modes, without
  pre-transformation input rejection or an extra output tile. Gear controls
  remain mounted during conveyor animation, and multiple instances render
  independently. Both recipes appear in the Recipes screen.
- Feed two Clay Kilns at once with at least four available crew: both smelt concurrently.
- Block one kiln's liquid output while leaving another kiln's output clear: the clear kiln continues working.
- Feed multiple Ingot Molders: each job, output lane, and crew assignment stays associated with its own instance.
- The Ingot Molder accepts Clay on its other tile and buffers it per instance. Each Iron ingot consumes one Clay when molding starts; without Clay, Iron liquid remains buffered. Other metals and the Refractory Caster do not consume Clay.
- The Clay buffer holds at most two Clay, including while production or output
  is blocked. Incoming stacks transfer only the available whole units and
  keep overflow on the belt. Consuming one mold reopens one slot. Legacy saves
  return excess buffered Clay to storage exactly once instead of deleting it.
- Refractory Caster costs $1.5M, 50 Iron Ingots, 25 Iron Plates, and 25 Ceramic; it occupies a 2×2 footprint with its liquid input and ingot output on the lower row.
- Refractory Caster accepts all liquid-metal/alloy types supported by Ingot Molder and converts up to four available matching liquid units into the same number of ingots per two-second cycle, without crew.
- Place a machine preview in every orientation: all internal conveyors and arrows match the eventual placed machine.
- Ingot Molder previews and placed machines visibly mark the separate Clay input tile and the shared liquid/output tile.
- Preview invalid placements in every orientation: footprint, internal belts,
  arrows, liquid ports, and upgrade tiles use the invalid state consistently.
- Holding placement continues to place owned machines until inventory is empty;
  right-click or Escape cancels it.
- The tutorial’s pre-placed conveyor becomes removable after tutorial completion.
- Multiple instances of every machine retain distinct labels, input/output
  state, collision bounds, hitboxes, job queues, and conveyor-item ownership.
- A blocked kiln/molder/annealer output blocks only that machine instance, not
  a parallel line.
- Liquid-metal output belongs to one live or stored smelter instance, survives
  moving/saving that instance, and cannot be claimed by another line;
  orphaned/conflicting old output is cleaned on load for both Clay Kilns and
  Mini Electric Arc Furnaces.
- Conveyors hold one full-sized stack per tile, including internal machine lanes.
  Occupied outputs block arrivals; storage emits when its output tile becomes free.
- Saves from the retired four-stack system return extra cargo to inventory once,
  retaining ammunition damage and composition and keeping the original cargo.
- In-flight furnace batches from those saves retain already-consumed resources,
  but their remaining recipe cycles take the original sequential processing time.
- Clay Kilns use 2 crew, Ingot Molders use 1, Refractory Casters use no crew, Leek Dusters use 1 while working,
  and Rock Shacks use 0. The factory crew display reports available / total.
- Mini Electric Arc Furnace uses a manual recipe selector. Bronze consumes five
  Copper and one Tin through either side inlet, producing six liquid Bronze in
  twelve seconds; Copper Contact Alloy consumes four Silver and one Copper,
  producing five liquid alloy in ten seconds; Tin Contact Alloy consumes nine
  Silver and one Tin, producing ten liquid alloy in twenty seconds. Both
  contact alloys can be cast by the Ingot Molder.
- Picking up, moving, saving, and re-placing machinery preserves per-instance
  modes, orientation, and identity.
- Selected machine action buttons stay mounted while process countdowns tick;
  only their status text updates during the job.
- Factory marquee selection requires at least 8 pixels of pointer travel;
  releasing over the floating machine controls cancels the marquee, and Move
  activates on pointer-down before any underlying grid interaction.
- Single/group selection panels and Cancel/Rotate overlays capture the entire
  pointer/mouse/touch gesture. Their text, padding, buttons, dropdowns and
  scrollbars cannot select, place, pick up, or box-select anything underneath,
  even if an action hides the panel before Phaser handles queued events.
  CSS-scaled canvas coordinates and touch coordinates use screen-space bounds.
  The next genuine canvas click still works normally.
- In the noammo opening, Shift starts contextual input: empty first corners
  start a box, occupied first corners use quick actions/selection. Explicit Box
  Select permits occupied first corners. The legacy mining Factory retains
  its original Shift two-tap behavior. Reversed/one-tile boxes work, and holding Shift on a
  corner adds to the selection. Normal mouse dragging remains supported.
- Visible Cancel and Rotate controls stay outside Phaser and mounted across
  unchanged ticks. Cancel stops placement or group movement without consuming
  inventory; cancelling an unfinished box preserves the previous selection.
  Rotate turns a placement preview, movable selected piece, or moving group
  clockwise. Escape/right-click still cancel; controls never activate tiles
  underneath, and Shift ignores text fields, repeats, and other screens.
- During bulk movement, Q/E rotate both the group's positions and each
  machine/conveyor facing clockwise or counterclockwise; the preview matches
  the committed layout, and opposite rotations cancel each other.
- Material chunks render oval, ingots render half-height, and plates can remain
  visually distinct later.
- Clay Kiln arrows and all rotated internal-conveyor arrows remain visible.
- Bronze Pillars uses its asymmetric occupied footprint: top-right, center, and
  bottom-left tiles only; blank cells remain available for placement.
- Splitter is a 1×1 Logistics machine with the Stacker's $2k, 5 Bronze Plate,
  10 Copper Wire, and 10 Silver Contact cost.
- Splitter accepts a single rear-fed line and round-robins whole stacks over
  forward/left/right conveyors; it skips occupied or item-incompatible exits,
  does not consume its turn when all exits are blocked, and preserves its
  per-instance cursor across save/load.
- Splitters feed rotated Mini Electric Arc Furnace inputs without changing
  the input material, skip full inputs, and preserve the four-second Clay
  and Hematite cycles. The bottom-row side-feed layout is covered directly.
- Furnace Ceramic outputs feed adjacent Stackers through their real buffers,
  respecting facing, weight capacity, blockage, and normal Stacker transit.
  Oversized queued outputs retain their untransferred remainder.
- Single and bulk furnace pickups return unprocessed input cargo and completed
  Ceramic to storage, clearing those hidden buffers before replacement.
  Move keeps those contents with their original instance instead; neither
  moving nor replacing another furnace inherits contents from its old tile.

## Storage, inventory, Shop, and tutorial

- Every Recipes entry supplies its real input, output, and processing note.
  Aggregate displays 40 Limestone + 20 Chert -> 10 Aggregate in 10 seconds.
- Recipes can filter by machine. Modes share one full machine-name option;
  typed search is case-insensitive and matches any part of that name, so `arc`
  includes both Mini Electric Arc Furnace and future Industrial Arc Furnace
  entries when they are added. Exact/prefix matches appear first.
- Search updates both machine options and recipe cards. A selection that no
  longer matches resets to all matches; an empty result has an explicit status,
  clearing search restores results, and unchanged ticks do not rebuild controls.
- Inventory has separate Machines and Items sub-screens. Items lists material
  storage; Graphite-Copper Annealer is the final machine card.
- Shop shows current cash. Every individual cash/material requirement turns red
  when insufficient; the purchase button stays disabled until all requirements
  are satisfied.
- Material Storage is shared by all placed storage machines. Its active outputs
  have independent filters and correct numbering.
- Taking any material from storage uses its minimum value; ingots specifically
  reset to $20. Ammunition remains outside this system.
- Sell Tube creates a green floating cash amount for each sale.
- The extended tutorial teaches physical Leek storage, Duster usage, and the
  Leek + liquid-metal Bullet Core Caster combination without an unnecessary
  Leek Planter warning in the ammo selector.

## Factory and visual layout

- Universal pipe routing covers all 54 valid port-role configurations (50 with
  entrances/exits and four one-port caps) in every rotation. Presets and custom
  shapes use the same port map; preview arrows agree with actual routing.
- Multi-input junctions conserve liquid quantity, effective value, and tags;
  incompatible metals wait, blocked outputs are skipped, outgoing throughput
  stays shared at 30 weight/s, and an open output stops the connected network.
  Absent ports do not leak, caps accept no fluid, and closed loops conserve liquid.
- Old turns keep their physical connections on migration. Custom maps remain
  independent through movement, pickup, replacement and repeated save loads.
  Port selectors remain mounted during fluid and unrelated machine updates.

- Every placeable machine completes the full factory floor redraw in every
  orientation: existing machines, belts, and gun labels remain visible. Labels
  sit above the cached floor and do not linger on old footprints after movement
  or pickup. Repeat purchases include independent duplicate-instance visuals.
- One shared lifecycle test keeps the live floor and cargo layer attached through
  fresh/stored placement, Move, replacement and pickup for every movable machine.
  Unrelated cargo must visibly advance afterwards without rebuilding the static
  floor or drawing on a destroyed surface. Pipe forms cover every orientation,
  both turn directions, and valid/blocked placement previews; pipe walls stay thick.
- Furnace recipe selectors stay mounted through their own input, job, liquid,
  and Ceramic output updates, and through other machines' production cycles.
  Focus and action-panel scrolling survive those updates. Status text updates
  in place without rewriting identical text, while actual recipe, facing, and
  selected-instance changes still refresh the controls.
- Furnace dropdowns do not lift on hover; status space and scrollbar width stay
  stable as production starts, finishes, or becomes blocked.
- Edge panning can move the camera up to three tiles beyond each edge of the
  unchanged 50×30 placement grid, including after zoom and viewport resizing.
- Panning stays within those bounds throughout the full 45%–200% zoom range;
  changing zoom immediately reclamps the current view.
- Bounds use Phaser's centre-based zoom transform rather than treating scroll
  as the visible top-left. Tests check the actual visible edges across window
  sizes, scroll limits, zoom changes, and edge-panning ticks. Returning to Factory
  at a saved zoom centres the starter area and starts at the top; panning stops
  outside the canvas. An axis centres when its entire factory extent fits.
- Factory crew text appears in the reserved inert rows beside the gun.
- The Clay Kiln, Bullet Core Caster, Ingot Molder, and Annealer liquid ports use
  the temporary blue conveyor styling until pipes exist.
- Bullet Core Caster liquid inputs are the two side-center inputs, not the
  Leek line or front/back tiles.
- Graphite-Copper Annealer keeps the intended layout:

  ```text
  . X^ .
  -> ^ .
  . . .
  ```

- All machine previews include the same internal conveyor arrows as their live
  factory instances.
- Splitter previews and placed instances show one rear inlet and three
  orientation-correct output arrows; placement uses the same 1×1 occupied tile.
- Stacker and Splitter routing-port guides are faint and sit behind real
  conveyors and moving items, so they never obscure live factory traffic.
