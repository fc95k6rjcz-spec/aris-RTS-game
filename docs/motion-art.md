# Motion and camp artwork

Generated with the imagegen skill; production files are in `src/assets/motion-v2/` (WebP, original pixel dimensions and alpha). Original generated PNGs remain in the local generated_images folder and local asset folder.

## Walking and chopping prompts

### walkPrompt

Create a production RTS sprite animation atlas, 1536x1024 PNG with genuine transparent alpha background. Reference image shows the EXISTING character identity: rugged bearded medieval peasant, brown cap, blue short-sleeve tunic, leather belt, brown trousers and boots. Preserve that identity, painted realistic Warcraft-like game art, no redesign. Exactly 6 equal columns and 3 equal rows (18 sprites), no text, no labels, no lines, no shadows, no scenery, no selection rings. Every cell exactly same scale, character feet at 88% cell height and body centered horizontally. Character occupies 65% cell height. Row 1: six sequential frames of a full natural WALK cycle facing screen RIGHT in side profile. Row 2: same walk cycle facing AWAY from viewer (north/up), back visible. Row 3: same walk cycle facing TOWARD viewer (south/down), face visible. Frames show left contact, left passing, left high, right contact, right passing, right high; opposite arms counter-swing, grounded feet, modest knee bend, no sliding, no body scale changes. Empty hands while walking; axe sheathed at belt. Orthographic elevated RTS camera identical for all sprites. Wide gutters so limbs never cross cell edges. The input is identity/style reference only; clean up its rough transparency and do not repeat its pose.

### chopPrompt

Production medieval RTS WOODCUTTING animation atlas matching the reference peasant exactly (brown cap, brown beard, blue tunic, leather belt, brown trousers and boots). Reference image is identity reference only. 1536x1024 PNG, genuine transparent alpha background NOT painted checkerboard. EXACT 6 columns x3 rows, 18 distinct animation frames, no text no grid no tree no scenery no shadows no selection ring. Every cell 256x341, feet anchored at same height 88%, same body scale and center; whole figure and axe inside each cell with generous margins. Row1 side profile facing RIGHT: six sequential frames: ready axe low, both hands raising axe, axe cocked behind shoulder, powerful forward downstroke, impact at chest height to RIGHT, follow-through/recovery. Row2 BACK view facing NORTH/up, same six phases with axe swung at target ahead, both hands on handle. Row3 FRONT view facing SOUTH/down same phases. TWO-HANDED wood axe with iron head and wood handle in every frame. Torso twists subtly and knees flex, feet remain planted, face focuses on target. Same character dimensions all frames, stable camera and lighting, polished hand-painted game sprite rendering. Transparent gutters separate each cell; no items behind figure.

### soldierPrompt

Create an RTS sprite WALK animation atlas for the EXACT armored blue human soldier in reference, used for footman and king (crown added by game). Identity reference only. 1536x1024 PNG with true transparent background. Exactly 6 columns by3 rows,18 figures. No text, no lines, no backdrop, no ground, no shadows. Row1 six consecutive natural walking poses facing RIGHT side profile, row2 walking AWAY north with back visible, row3 walking TOWARD viewer south with face/front visible. Same six-frame full alternating step loop each row, left foot contact/passing/lift then right foot contact/passing/lift. Subtle movement sword and shield securely held, no attack. Silver plate armor, blue plume, blue cloth trim, brown leather boots, existing sword/shield design. Same scale, fixed camera, fixed feet baseline within equal cells, center of hips consistent, no oversized changes, all equipment fully inside each cell. Painted realistic fantasy RTS game sprite style, elevated orthographic view.

## Other artwork

Grunt, dire wolf and dragon atlases were extracted from the user's supplied sheets. Cow artwork uses idle and walking cycles. Camp artwork replaces the procedural campfire, wall and shelter with painted medieval log fire, weathered stone masonry and a thatched timber shelter with warm lantern light. `tools/prepare-camp-art.mjs` records the crop coordinates; `tools/encode-motion-art.mjs` records WebP encoding at quality 0.92.

The exact camp/extraction generation prompts were not retained in this document.

