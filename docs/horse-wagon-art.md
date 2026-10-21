# Horse and ore wagon (Gold Depot road)

The Gold Depot is joined to its mine by a dirt cart road, and a horse pulls a
loaded ore wagon along it. Until it is painted, the game draws a plain stand-in.

## What to paint

- One picture: a horse in harness pulling a wooden ore wagon heaped with gold.
- Side-on, slightly from above (the same 3/4 view as the buildings).
- **The horse on the right, facing right.** The game flips it for roads that run left.
- Transparent background, about 600 × 300 px, nothing cut off at the edges.

## Optional second picture

The same horse with the wagon **empty**, for the trip back to the mine. Same
size and facing. Until it exists the stand-in makes the trip home; if only the
loaded picture is painted, wagons skip the trip home so the two styles don't mix.

## Where it goes

Save it as `src/assets/horsewagon.png` (and the empty one as `src/assets/horsewagon_empty.png`). The game picks it up on its own;
there is no code to change.
