# Hamster Miners regression scenarios

Run `npm test` after every change. The automated suite covers the deterministic
rules below; the manual cases cover browser layout, interaction, and rendering.

Only implemented mechanics are testable. Ideas intentionally deferred by design
(post-reality content, later ores, later casing/jacketing, reset mechanics, and
future pipe systems) are not treated as current acceptance requirements.

## Save, notation, and state migration

- Whole values below 1,000 use comma-separated numbers; values at 1,000 and
  above use Hamster Cloners suffix notation with three significant digits.
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
- Native Copper has three 15-HP segments; Malachite has three 5-HP segments;
  Clay has two 4-HP segments; Lead has five 10-HP segments.
- Tunnel 1 Band 5 contains five Clay, four Malachite, and three Lead deposits.
- Mine information lists only deposit types in the active band’s spawn pool,
  while keeping a depleted type visible until the player changes band.
- Target information shows current and maximum HP for the active segment.
- Layer controls use the relative band layer number; the last layer says
  `Continue to Band N`.
- Mining Rights cost $1,000 and require Tunnel 1 Band 1 completion; the
  permanent unlock is controlled from mine progression rather than Shop.
- Tunnel 2 Band 5 unlocks auto re-mine and auto-continue. Re-mine selection is
  compact rather than one button per prior band.
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
- Send a fresh `$20` ingot through the Annealer and Sell Tube: it sells for `$34` (`$20 × 1.7`).
- Send a Duster-processed `$25` ingot through the Annealer and Sell Tube: it sells for `$42.50` (`$25 × 1.7`).
- Put an ingot into Material Storage, then output it to a Sell Tube: it resets to the `$20` minimum before later upgrades.
- Route an ingot through Duster after Annealer and verify the ×1.25 and ×1.7 effects are each applied once, not twice.
- Lead cannot be sold.
- Rock Shack remains crew-free and applies its additive value effect only on
  its built-in conveyor tile.
- Bronze Pillars accepts sellables with base value at least `$20` and current
  value below `$50k`, multiplies by ×1.4, tracks three uses per item, and lets
  the final output exceed `$50k`.

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
