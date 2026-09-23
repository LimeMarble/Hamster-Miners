# Hamster Miners regression scenarios

Run `npm test` after every change. The automated suite covers the deterministic
rules below; the manual cases cover browser layout, interaction, and rendering.

Only implemented mechanics are testable. Ideas intentionally deferred by design
(post-reality content, later ores, later casing/jacketing, reset mechanics, and
future pipe systems) are not treated as current acceptance requirements.

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
  available, then makes 25 mineral bullet cores per mineral input.
- Malachite-coated rounds deal 3 damage before Annealer processing.
- Both Malachite and Lead are valid liquid-metal coatings; Leek remains the
  mandatory core material.
- The Mine ammo selector shows type/material visuals, damage, and separate
  counts. The Factory gun display shows the active material’s remaining rounds.
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
- Fresh Wires, pressed metal Plates, and Silver-Copper Contacts each receive one ×1.7 value pass; raw ores and ingots are not accepted.
- Contact Maker keeps its 100 Leek Fiber purchase requirement, but Contacts use only five Copper Wires and 0.5 Silver Ingots per batch of five. It preserves an annealed wire's value once without carrying its multiplier onto the new Contact. Legacy buffered Leek Fiber is discarded on load; Silver buffer is preserved.
- Mineral ammo still receives ×1.7 damage from the Annealer; Leek ammo is not accepted.
- Put an ingot into Material Storage, then output it to a Sell Tube: it resets to the `$20` minimum before later upgrades.
- Route annealed Wire through Duster and verify the ×1.25 and ×1.7 effects are each applied once, not twice.
- Lead cannot be sold.
- Rock Shack remains crew-free and applies its additive value effect only on
  its built-in conveyor tile.
- Bronze Pillars accepts sellables with base value at least `$20` and current
  value below `$50k`, multiplies by ×1.4, tracks three uses per item, and lets
  the final output exceed `$50k`.
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

- Send a normal Malachite bullet stack to the Gun Deposit: it remains a separate normal stack at 3 damage.
- Send a fresh Malachite bullet stack through the Annealer to the Gun Deposit: it becomes a separate annealed stack at 5.1 damage.
- Repeat the previous case with an existing normal Malachite stack present: the two stacks must not merge.
- Verify the annealed stack remains annealed after refresh, save/load, and selection changes.
- Verify ammunition never enters Material Storage and its damage is never reset by storage output.

## Machine concurrency and routing

- Feed two Clay Kilns at once with at least four available crew: both smelt concurrently.
- Block one kiln's liquid output while leaving another kiln's output clear: the clear kiln continues working.
- Feed multiple Ingot Molders: each job, output lane, and crew assignment stays associated with its own instance.
- Place a machine preview in every orientation: all internal conveyors and arrows match the eventual placed machine.
- Preview invalid placements in every orientation: footprint, internal belts,
  arrows, liquid ports, and upgrade tiles use the invalid state consistently.
- Holding placement continues to place owned machines until inventory is empty;
  right-click or Escape cancels it.
- The tutorial’s pre-placed conveyor becomes removable after tutorial completion.
- Multiple instances of every machine retain distinct labels, input/output
  state, collision bounds, hitboxes, job queues, and conveyor-item ownership.
- A blocked kiln/molder/annealer output blocks only that machine instance, not
  a parallel line.
- Clay Kilns use 2 crew, Ingot Molders use 1, Leek Dusters use 1 while working,
  and Rock Shacks use 0. The factory crew display reports available / total.
- Mini Electric Arc Furnace alloy mode accepts five copper inputs and one Tin
  through either side alloy inlet, consumes exactly those recipe quantities,
  and produces six liquid Bronze in twelve seconds.
- Picking up, moving, saving, and re-placing machinery preserves per-instance
  modes, orientation, and identity.
- Selected machine action buttons stay mounted while process countdowns tick;
  only their status text updates during the job.
- Factory marquee selection requires at least 8 pixels of pointer travel;
  releasing over the floating machine controls cancels the marquee, and Move
  activates on pointer-down before any underlying grid interaction.
- During bulk movement, Q/E rotate both the group's positions and each
  machine/conveyor facing clockwise or counterclockwise; the preview matches
  the committed layout, and opposite rotations cancel each other.
- Material chunks render oval, ingots render half-height, and plates can remain
  visually distinct later.
- Clay Kiln arrows and all rotated internal-conveyor arrows remain visible.
- Bronze Pillars uses its asymmetric occupied footprint: top-right, center, and
  bottom-left tiles only; blank cells remain available for placement.
- Splitter is a 1×1 Logistics machine with the Stacker's $2k, 5 Bronze Plate,
  10 Copper Wire, and 10 Silver-Copper Contact cost.
- Splitter accepts a single rear-fed line and round-robins whole stacks over
  forward/left/right conveyors; it skips occupied or item-incompatible exits,
  does not consume its turn when all exits are blocked, and preserves its
  per-instance cursor across save/load.

## Storage, inventory, Shop, and tutorial

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

- Edge panning can move the camera up to three tiles beyond each edge of the
  unchanged 50×30 placement grid, including after zoom and viewport resizing.
- Panning stays within those bounds throughout the full 45%–200% zoom range;
  changing zoom immediately reclamps the current view.
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
