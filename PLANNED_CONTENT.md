# Content decisions and implementation status

Implemented entries are marked below; the remaining decisions are not yet content.

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
