# Curved Stairway Model

## Scope and components

The project is a standalone WebGL viewer whose JavaScript constructs a model
programmatically from reusable, parameterized components. All dimensions are in
inches.

The initial prototype was a single 12-inch 1x4. Its reusable components remain
available:

- `Board({ thickness, width, length })` describes a rectangular board.
- `OneByFour(length)` specializes it with thickness `0.75` and width `3.5`.
- The initial board therefore measures `0.75 x 3.5 x 12`.

The viewer now displays the named `bottomFrame`, `uprights`, `topFrame`, `riser`, and `tread`
parts for each step, replacing the earlier simplified solid. Each bottom
frame contains support cross-pieces and caster hardware, with no lower front
cross-pieces or side boards. The separate uprights part
contains two front uprights on every step except step 1, including the highest step,
and two full-width rear uprights on each module's last assembly.
Each top frame has a front cross-piece and a back step support. Above the
lowest step it also has a right step support bridging the upright and the
back support or rear upright. Non-module-last steps above step 1 have a matching
left support. Step 1 omits both edge-on 1x4 side supports.
Its flat front and rear supports extend to the tread's left edge,
and a right 2x4 newel inner block extends toward step 2's upright.
The riser is a separate piece.
A half-inch tread sits on each top frame, flush with its side
and back edges and extending forward to the front of the riser.
Most framing is pine, including every front, rear, and combined upright.
The support cross-pieces are also pine. Risers, treads, and siding are plywood,
shown in a slightly lighter wood tone than the pine framing.
Subtle procedural grain follows each board's length, with slightly
darker, diagonal-patterned cut ends. Plywood veneers have quieter grain, and
their cut edges have striping through the thickness to suggest three plies in
the risers and five in the treads; these are illustrative, not stock specifications.
Grain coordinates and material colors stay attached to each piece when meshes
are combined or transformed and share the same directional lighting. Where
supported, shader derivatives fade out patterns too small to resolve on screen.
The viewer supports drag-to-orbit, two-finger drag to pan, wheel or pinch zoom,
and resetting the view. Two-finger gestures can pan, pinch to zoom, and twist
around the camera's depth axis together, with the view following the fingers'
rotation. Twisting applies to the stairway and rotatable part previews, not the
fixed-axis Details and Placement drawings.
Keyboard arrows orbit, Shift+arrows pan, and +/- zoom.
Both orbit directions use the camera's current axes: horizontal movement rotates
around camera-up and vertical movement around camera-right. The view can tumble
freely through the poles rather than preserving world-up or clamping its tilt.
Reset restores the original upright orientation. This also applies to part previews.
The directional light follows the camera, keeping illumination from the same
upper-left direction on screen as the camera orbits. Its direction is fixed
relative to the camera; there are no manual lighting controls.
This second draft uses a single, constant stair width. Every tread starts with
the same radial outline; the first has an additional newel cutout.
The inner and outer reference curves are concentric circular arcs.
Home (`index.html`) has a full-width **WIDT Stairs Project** header and a
**Configure parameters** link. The content pane has **Stairway** and **Part details**
tabs, with a collapsible, Parts-only right sidebar. **Hide parts / Show parts**
changes the available content space without clearing selection or filters.
Both Home and Parameters use a simplified three-step staircase SVG favicon.

The separate Parameters page (`parameters.html`) has a full-width
**WIDT Stairs Project - Parameters** header and a **Home** link. Its right-hand
panel provides live sliders for stair width, step count, module count, and
spindle shoulder ascent; its content pane always shows the complete 3D stairway.
Changes preserve the camera's viewing angle, zoom, and pan; Reset view clears
the pan as well as resetting rotation, zoom, and lighting, without changing the model.

Both pages read and retain the four model parameters in the URL query:
`width`, `steps`, `modules`, and `shoulderAscent`. Home also encodes the selected
content `tab` (`stairway`, `details`, or `placement`), Parts sidebar visibility
(`parts=hidden` or `parts=shown`), and the Module (`module`), Subset (`subset`),
and stock-Type (`type`) filters. `part` identifies the exact installed occurrence,
including its module and step, rather than just its unique manufacturing group.
Default viewer settings are omitted: Stairway, Parts shown, all filters cleared,
and no selected part. Find text, drawing direction, camera position, and split
modules remain local state.

Links between Home and Parameters carry all these settings; Parameters retains
the Home settings without applying its filters to the full-model preview.
Changes replace the current history entry rather than pushing a new entry.
Refreshing or sharing a URL restores the same model and Home view. Browser
history navigation also restores the encoded state, with missing viewer settings
returning to their defaults. Missing model parameters use defaults; invalid, duplicate, out-of-range,
or off-increment values show an explanation and are replaced with defaults.
Invalid or duplicate viewer settings likewise show an explanation and normalize
to defaults. A part that no longer exists for the model parameters, or is excluded
by the restored filters, clears selection with a notice rather than selecting a
different instance. This validation also runs when returning from Parameters.
**Reset defaults** on Parameters restores all four model settings, controls,
and URL values while retaining the Home view settings; it is independent of
**Reset view**.

The Parts sidebar's collapsed **Filters** section combines independent Module,
Subset, and stock-Type filters, initially showing all parts.
These filters narrow both the Parts list and visible model geometry. Parameters
always shows the complete model, without applying Parts visibility or selection.
Visibility changes preserve the framing scale based on the complete assembly,
so filtering does not rescale the remaining parts.
The Module filter also limits the footprint to that module and makes it the
orbit center. Changing the Module filter clears the pan offset; orientation and
zoom are retained. Subset and Type filters do not change the orbit center.

**Clear selection** beside the Parts heading removes the part highlight and
restores normal model brightness without changing the filters, Find text, camera,
or active tab. Clicking or tapping empty space in Stairway also clears selection,
as does Escape while the Stairway canvas or Parts list has focus. The button is
disabled when nothing is selected. Clearing removes `part` from the URL and
returns Details and Placement to their empty-selection prompt.

### Siding

Each step has flat `1/8 in` plywood siding covering its right-hand,
outer side, from `1 in` above the floor to the tread top. Together, a module's
segments follow its stepped tread/riser outline, with mitered vertical joints
around the curve. Each segment is a separate physical part named **Side panel - right** in
Parts, with its own **Siding** visibility category rather than
the general plywood category. Step 1 has separate front and rear pieces fitted
against the newel's front and back faces, leaving an opening around the post.
These are named **Side panel - right front section** and
**Side panel - right rear section**.

The model offsets the siding's inner face `1/16 in` outward from the step side
to clear small framing protrusions. This intentionally leaves it floating in
the model; the physical framing corners will be sanded flush before fitting
the siding. Existing framing is not trimmed in the model.

Spindle openings are cut down from the top edge, with their floors following
the spindles' 45-degree bottom cuts through the sheet thickness.
The openings are included in stock views, cutting descriptions, inventory
patterns, and wood-volume estimates.

### Banister spindles

Each front right upright on steps 2 onward carries an oak 2x2 spindle
(`1.5 x 1.5 in` actual). Each module's rear right upright carries another.
Their inner faces are flush against the upright's outside face. Both front
and rear spindles are centered front-to-back on their upright's stock span.
Bolt hardware and holes are not yet modeled.

The baseline joins the top front-right corners of consecutive front
cross-pieces (the front step supports). Ascent and descent are vertical
offsets from that line. It is continued at the same rise/run past the highest
step for the last spindle. The slope is projected along the upright's
front-to-back stock direction.

Every spindle in a stair configuration has the same cutting pattern:
the top follows that slope `2 in` above the spindle shoulder ascent;
matching left/right notches are `1/2 in` deep, leaving a `1/2 in` tongue.
Shoulder ascent defaults to `32 in` (a `34 in` top), with a slider allowing
`25 in` through `37 in` in one-inch increments. Adjusting it changes the
spindle tops and notch shoulders without changing their mounting or bottom cuts.
At the front inner edge, the bottom descends `stepRise + 6 in` below the
baseline. Its 45-degree cut rises toward the outside, leaving the longer
edge against the upright, and does not slope front-to-back.
At each joint between modules, a separate **Spindle shim** fills the wedge
between the rear spindle and the next module's front spindle. It belongs to
the preceding module. It is cut from vertical oak 2x4 stock (`1.5 x 3.5 in`
actual): centering the spindles leaves a gap too wide for 2x2 stock.
Its top and bottom are level, square-cut ends, `4 in` apart vertically.
The top meets the notch shoulder of the spindle in front of the shim (the
preceding module's rear spindle). Its back edge stays at that same elevation,
meeting the next module's front spindle below its higher notch shoulder.
Both adjoining side faces remain beveled to fit flush against the spindles;
the shim does not follow the banister slope.
There is no shim after the last module.

Spindles and shims share independent **Spindles** visibility and normal
Parts, stock views, cutting descriptions, and weight estimates.
Handrails are not yet modeled.

### Newel and boxed first-step connection

Step 1 carries an oak **Newel post** cut from actual `3.5 x 3.5 in` 4x4 stock.
Its side faces follow the first tread's right edge, which continues step 2's
right-edge line. Its right face is `2 in` outside that line, measured
perpendicular to it. The post is shifted forward along that edge until
its front face passes through the front cross-piece's rear-right corner.
In the default layout its uncut front-inner corner above the joint is
approximately `1.3618 in` behind the tread front.
The pine 2x6 cross-piece stays parallel to the tread front; its right end
is flush with the tread's right-edge line, as is the flat rear step support.
The cross-piece has a straight, unnotched back edge. Instead, the newel's
front-inner corner has a stopped bevel flush with that back face, only
between the cross-piece's bottom and top elevations. This is a `15 deg`
bevel in the default nine-step layout; its angle follows the right-edge
orientation when the step count changes. The post remains square above
the joint, and below it wherever the cross-piece starts above the post bottom.
The original oak 4x4 stock blank is retained, with the bevel and shoulder
planes included in the manufacturing description.

The post's square, level bottom is `1 in` above the floor. Its square, level
top has ascent `spindleShoulderAscent + 3 in`, measured at the center of its
back face against the baseline between the actual top front-right corners
of steps 1 and 2's front cross-pieces. The level top has greater ascent at
the front. Changing **Railing bottom ascent** moves only its top, not its
footprint or bottom.

The boxed connection adds a pine 2x4 **Newel block - inner**, on edge against
the post's inner face. It extends from the front cross-piece toward
step 2's right upright, parallel to the reshaped tread's right edge.
Its front end is mitered against the straight front cross-piece.
Its rear end is square, stopping at the first
intersection with step 2's siding or front spindle across the block's
full thickness, or at the back of the upright if neither intersects.
It has no top notch and spans elevations `3` to `6.5 in`.
The former **Newel beam block** beneath the right beam is omitted.

A separate pine 2x4 **Newel block - rear** runs on edge, parallel to
the newel's side faces. Its front end butts against the newel's back face,
and its square rear end stops before step 2's extended right upright.
The inner block retains its separate back-end position.
The rear block's default length is approximately `6.2043 in`.
Its left face is against the inner block's right face. It shares the inner
block's `3` to `6.5 in` elevations and has square ends.

The former right 1x4 side support is omitted. Both module-1 beams have
front ends mitered to butt against the front cross-piece's back face.
The right beam shifts inward so its outer front corner meets the
cross-piece immediately to the left of the inner block, or farther inward
if required to clear the extended right uprights. It retains the
module's beam heading and a square rear cut fitted within the module.
Both front caster plates clear the cross-piece by at least `1/8 in`.
The right front caster is set back an additional `1 in` along its beam.
The left beam retains its lateral position and rear end.

The tread and, where present, flat front step support have exact through
cutouts for the post. Their original stock blanks are retained, with the
new cut-face coordinates included in manufacturing descriptions. The
step-1 siding is fitted around the post, retaining a short front piece and a
rear piece. Both clear the front cross-piece and relocated rear step support.
The post has independent **Newel** visibility. All new pieces participate
in Parts, stock views, mesh export, and wood-weight estimates.

This models the timber arrangement, not a rated railing connection.
Fasteners, holes, and metal connectors are not modeled; fastening details,
connection capacity, and overall stair stability still require verification.

### Back panels

Each module has a `RISER_THICKNESS = 1/4 in` particle-board back panel attached
outside its rear boundary. Its vertical side edges align with the outside
edges of the rear uprights, including the combined left upright where present.
The bottom is flush with the bottom of the rear support cross-piece (`6.5 in`
above the floor); the top is `1.5 in` above the bottom of the back step support.
The panel is named **Rear panel** in Parts.

The following module's front attachment blocks are moved rearward to clear the
panel: `1/8 in` on the left and `1/4 in` on the right, measured perpendicular
to the module's front plane. Their lengths are unchanged. The first module's
blocks are unaffected.

### Module support beams

Every module has two individual parts,
**Beam - caster left** and **Beam - caster right**, stored in `module.boards`
and listed under its Foundation alongside the uprights and lower framing.
Every module uses pine 2x4s with an actual cross section of `1.5 x 3.5 in`,
laid flat with the 1.5-inch dimension vertical. Every pair spans its entire
module, including step 1 in the lowest module. Their direction bisects the
module's angular span. In module 1, both fronts are mitered against the
`1.75 in` back plane of step 1's 2x6 front cross-piece.
Other modules' square-cut front ends
extend forward until their foremost corner meets the module's first-step
front boundary, with no part projecting outside the footprint.
The rear ends approach the rear radius. Lengths round down to whole inches:
module 1 initially shortens both ends equally by less than half an inch,
then receives the front miters for the cross-piece.
Other modules keep their front ends at the boundary and take all rounding trim at the rear.

The lowest module's beams have no front-top recesses or narrow tongues.
The former matching beam-clearance cuts in step 2's riser are also absent.
Step 1's back step support remains temporarily omitted; its low framing still
needs a separate support solution.

Casters mount directly beneath both ends of each beam. The beam bottoms remain
at the modeled caster mounting-face elevation, `5 in`, and their tops are at
`6.5 in`. Left uprights start at that elevation; right front and rear uprights
extend down to the siding bottom, `1 in` above the floor.
Right support beams are inset an additional `3/4 in` toward
the inside of the curve to give their casters more clearance from the siding,
except in module 1 where the newel inner block determines the right beam position.
Each right beam moves farther inward only as needed to clear the extended
right uprights, accounting for their front bevels and the half-inch material
removed from their inward faces by the bottom-open notches.
Left beam placement is unchanged. Casters follow their supporting beams. End rounding does
not change either beam's lateral position. Apart from the newel blocking,
there are no caster platforms, reinforcement blocks, links, or extra step-2 casters.
Their intended purpose is rigidity and transferring intermediate
upright loads to the wheels through the support cross-pieces described below.
Beam weights are included in the module and stairway wood totals.
Laying the beams flat reduces their vertical bending stiffness substantially;
geometric fit does not establish equivalent structural capacity.

The beams have normal part details, stock views, and dimensions. They move
rigidly with their module when modules are split.

### Support cross-pieces

Every step except step 1 has a pine 2x4 support cross-piece
lying flat across both support beams. Its lower face rests at the beam tops,
`6.5 in` above the floor; its upper face is at `8 in`.
Its front edge follows the upper front step support's front face.
If it would intersect the upper frame's front cross-piece, only that support
cross-piece moves back to clear the framing. This applies to the lowest module
as well as the upper modules.
This includes the module fronts and step 2, where caster platforms formerly sat.
The lowest front support cross-piece remains deliberately omitted for now.
With quarter-inch rises and nine steps, a lower 2x4 cross-piece would extend
above the first tread's underside at `7.25 in`; the beams themselves clear
that tread by `0.75 in`.

Each end extends `1/2 in` into the corresponding front upright, with a matching
`1/2 in`-deep notch across the upright's inward face, open at its bottom end.
The left notch is `1.5 in` high; the extended right notch is `7 in` high.
Both keep their shoulders at the cross-piece's `8 in` top elevation.
The overhang beyond
each beam varies to bridge the gap to its upright. The ends are mitered to match
the upright faces. Where the front board reaches the left-rear upright, its
existing through corner clearance notch is retained.

Each module also has a **Beam - cross rear** between its rear uprights.
This is another flat pine 2x4, resting at the same beam-top elevation. Its rear
edge follows the module's rear boundary, with the board extending forward.
Both ends seat `1/2 in` into bottom-open face notches matching those of the
front cross-pieces. A combined left front/rear upright shares its existing notch;
there is no duplicate cut. The new board is trimmed along the front
cross-piece's rear edge wherever they would overlap, leaving that front piece
unchanged.

These parts replace the load-transfer blocks. **Beam - cross** and
**Beam - cross rear** entries follow the left and right caster beams
in each module's part list. They have individual stock views, cutting dimensions, and wood weights,
and move rigidly with their module when modules are split.

Pine 2x4 **Attachment block - upright left** and **Attachment block - upright right** parts rest on the
pine cross-pieces against the uprights' inward faces. These attachment blocks
stand on their narrow edges: `1.5 in` thick and `3.5 in` high, from `8 in`
to `11.5 in` above the floor. Ordinary blocks match the upright's front-to-back
width, not its vertical height, with front ends trimmed where needed to clear
the riser behind the upright's full-height bevel.

On each module's last step, one continuous block per side joins both the front
and rear uprights. Its front end aligns with the riser's back plane,
and its rear end aligns with the rear upright's back. The block
bears on both pine cross-pieces. Ends are beveled where needed to stay inside
the step footprint and clear the riser; upper-front notches clear low risers
or front cross-pieces without shortening the block's full bearing span.
Step 1, which has no lower support cross-piece, has no such blocks.

### Open-sided framing

All risers above step 1 have height `stepRise`, running between the undersides
of consecutive treads. This gives `1/2 in` of overlap with the lower tread;
module boundaries do not change the panel height. Step 1 retains its existing
one-inch floor clearance. There are no extended module-last riser panels.

Every step above step 1 has two front uprights with
full-height front-edge bevels flush with the panel's back plane,
`RISER_THICKNESS = 0.25 in` behind the step front. The panel can fasten directly
to these 1.5-inch-thick pine uprights; the former vertical 2x2 riser cleats
are removed. The bevels replace stepped riser rebates rather than adding
full-height notches. Existing rear endpoints are preserved except on step 2,
where they move slightly forward to retain 2x4 stock instead of requiring 2x6s.
The adjoining supports are refitted to those endpoints. Combined left
front/rear uprights retain their rear ends in place. A separate module-wide
stiffening piece is deferred and is not yet modeled.
Fasteners, connection strength, and structural capacity are not modeled.

Neither foundations nor steps retain the former full-length side boards.
Above the lowest step, a shorter right step support bridges the gap behind
the right-front upright. Except at module backs, a matching left support
fits the shorter inner edge. Both supports extend to a back step support
shifted `RISER_THICKNESS` behind the tread's rear boundary, flush with the
next step's beveled upright fronts. Their rear half-laps retain bottom
notches in the side supports and top notches in the back support.

Each non-first step of a module except global step 2 has vertical pine 2x4
**Attachment block - rear support left** and **Attachment block - rear support right** parts on its
front uprights' inward faces. These separate six-inch-long blocks have
matching front bevels and bear against the preceding step's shifted back
support. They are centered vertically on that support unless existing
woodwork requires the smallest upward or downward adjustment. In the default
nine-step layout, step 3's blocks move up `1.25 in` to clear the horizontal
attachment blocks; the others stay centered. They belong to **Top frames**,
not **Uprights**, for visibility control. There are no blocks behind step 1's
absent back support or across module boundaries.
All front and rear uprights
have their outer broad faces on the step's side boundaries, 3/4 inch outward
from the former inset positions. The upper front/rear
cross-pieces span the full footprint width, with angled ends matching those
boundaries. Support cross-pieces fit the uprights' inward faces
with half-inch engagement in their bottom-open face notches.
Support beams fit farther outward beneath the raised uprights, while retaining
the existing square-end setbacks and whole-inch lengths.

### Board materials

Boards carry a `material` with a name, density in pounds per cubic foot, and
rendering color. The exported materials are `PINE`, `OAK`, `PLYWOOD`, and
`PARTICLE_BOARD`. Particle board uses the same plywood sheet-stock kind for
geometry, cutting descriptions, inventory grouping, and part views, but has
its own material identity and visibility category. Its darker brown surface
uses isotropic procedural mottling and speckles, without grain or ply stripes,
including on cut faces.
`Board` and `NotchedBoard` accept `material` alongside their stock dimensions;
`OneByFour(length, material)` accepts it as an optional second argument.
All default to pine. For example:

```js
new Board({ thickness: 0.75, width: 3.5, length: 12, material: OAK });
new OneByFour(12, OAK);
```

The density assumptions are pine `30 lb/ft^3`, oak `45 lb/ft^3`
(`OAK_DENSITY`), plywood `40 lb/ft^3`, and particle board `45 lb/ft^3`.
Materials do not change stock dimensions or notch geometry.

### Notched-board and dado helper

`NotchedBoard(dimensions, notches, dados = [], rebates = [])` starts with the same stock dimensions as
`Board` and removes up to four through-thickness corner notches and optional
shallow, through-width dados on either broad face. Stock length
is local X, thickness is local Y, and width is local Z, centered at the origin.
The corner names are `startNear`, `endNear`, `endFar`, and `startFar`:
start/end select negative/positive X, and near/far select negative/positive Z.

```js
new NotchedBoard({ thickness: 0.75, width: 3.5, length: 12 }, {
  startNear: { length: 3.5, depth: [0.75, 0.85] },
  endNear: { length: 3.5, depth: 0.75 },
});
```

Each notch's `length` runs inward from its stock end. `depth` runs inward from
its selected width edge and can be a single value for a square cut or a pair
`[negativeYFaceDepth, positiveYFaceDepth]` for a beveled cut. The cut depth varies
linearly through the thickness. Dimensions describe the original stock, not
the remaining solid; `notches` records the normalized cut description.
No notches or dados produces the original `Board` geometry. An empty dado list
preserves the existing notch-only geometry.

Optional `rebates` are additional corner cuts, each with `corner`, `length`,
and a two-face `depth` pair. They can overlap deeper corner notches without
turning the original rectangular blank into a width rip, and can reach the
full stock length. This represents the shallow riser rebate alongside an
upright's deeper cross-piece notch. Their union with notches and dados is
used for meshes and weights; manufacturing descriptions include the rebates
as additional corner notches. Copying a notched board preserves its rebates.

Each dado specifies a `face` (`negativeY` or `positiveY`), a `start` distance
from the negative-X stock end, an opening `width` along X, and a `depth` into Y.
The cut runs across the full stock width Z. For example, this pine upright stock
has a 3/4-inch opening, 1/4 inch deep, starting 5.5 inches above its lower end:

```js
new NotchedBoard({ thickness: 0.75, width: 3.5, length: 12, material: PINE }, {}, [
  { face: "positiveY", start: 5.5, width: 0.75, depth: 0.25 },
]);
```

The helper creates a closed surface, triangulates concave broad faces, and
preserves lengthwise grain, with end grain on notch ledges and dado shoulders
across the stock's length. Intersecting dados and beveled notches remove their
union, without internal faces or double-counted volume. Weight estimates use
the remaining wood volume. This is not a general Boolean-cutting helper:
enclosed pockets and overlapping dados on the same broad face are unsupported.
Invalid dimensions, cuts that sever the board, and meeting bevels that cross
one another inside its thickness are rejected explicitly. Cuts from opposite
ends along the same width edge may meet, including when one broad-face edge
collapses. Overlap is supported only when both notches share the same cut
plane (identical depths on both broad faces). During construction, continuous
same-edge cuts are converted into a narrower, possibly beveled blank, retaining
only any deeper stepped notch. The resulting board never retains merging
notches; its original stock size and assembled placement are preserved.
Other same-edge overlaps remain unsupported. Dados must stay within the stock length, be
shallower than its thickness, and retain a connected thickness of wood where
opposite-face cuts overlap or meet.

### Modules and view modes

A module is a permanently joined group of consecutive step assemblies. Modules
can be detached from one another. `moduleCount` sets the exact number of groups.
The normal group size is derived as `stepsPerModule = Math.floor(stepCount / moduleCount)`;
any remainder goes into the bottom module rather than making a smaller group.
For example, ten steps with three modules form `4 + 3 + 3`; the default nine
steps and three modules form `3 + 3 + 3`. The model requires at least two modules
and defaults to `Math.min(3, Math.floor(stepCount / 2))` modules. Every module
must contain at least two steps so its front and rear caster supports fit.
The API rejects fewer than four steps or more than `Math.floor(stepCount / 2)`
modules, with an overall module-count limit of four.
The model exposes `modules`, each containing its `startIndex` and
references to its `steps`. Rough front and rear casters and their supporting
woodwork and banister spindles are included; module connections and handrails
are not modeled yet.

The footer estimates the heaviest module's weight and the total stairway weight,
rounded to whole pounds. Estimates use each board's actual modeled wood volume
and material density: pine at `30 lb/ft^3`, oak and particle board at `45 lb/ft^3`,
and plywood at `40 lb/ft^3`. Module weights are calculated from
their constituent steps; the largest value is used, not necessarily the highest
module. These are wood-only estimates: casters, fasteners, handrails, and
unmodeled corner reinforcement are excluded. Width, step count, and module count
update the estimates; hiding parts or separating assemblies does not affect them.
Changing module count also changes rear-upright quantities and the support beam
lengths, so it can change the total weight even when
step count and width stay fixed.

Two buttons float over the upper-left corner of the 3D panel: **Reset view**
on top and **Split modules** below. There is no bottom View panel.
Step dimensions and interaction instructions occupy a full-width information
panel below the 3D canvas instead of floating over the model.
Modules are joined by default. Clicking **Split modules** changes its label to
**Join modules** and rotates each module as a rigid unit about the
stairway's world origin, spreading around the fixed 45-degree center of the
arc. Each module's extra rotation is its angular midpoint minus 45 degrees:
front modules rotate clockwise and rear modules counter-clockwise. For the
default three equal modules, the extra rotations are -30, 0, and +30 degrees,
so the middle module stays stationary. Clicking **Join modules** restores the
assembled quarter-turn stairway.

Individual step assemblies cannot be separated in the UI because module-level
parts connect them. Dimensions, elevations, materials, and component positions
within each module do not change.

`createGeometry(visibility, explosion, moduleExplosion)` accepts independent
step and module explosion progress from `0` to `1`, both defaulting to `0`.
The model retains step-explosion support, but the viewer leaves step assemblies
joined. It interpolates module-separation progress over 600 ms
with smooth easing. Switching again during a transition starts from the current
position rather than jumping. Reduced-motion preferences make the change immediate.

The Stairway renderer retains separate indexed vertex/index buffers for each
module and draws each visible module with its own model-matrix uniform.
`getModuleTransforms(moduleExplosion)` supplies these rigid transforms.
Animation updates only transforms and camera framing from cached positions:
it does not rebuild meshes or upload geometry each frame. Normals rotate with
the module; picking inverse-transforms the ray into each module's cached mesh.
Each module's render-only footprint follows the same transform. Filters and
selection update the retained batches, while parameter changes invalidate the
cached assembled meshes. Details and Placement keep their single-mesh draw path.

Width, step-count, module-count, shoulder-ascent, and part-visibility controls remain live during transitions.
The camera retains its orientation and relative zoom while fitting the moving
full assembly, including hidden parts. Reset view affects only the camera and lighting.
The increased angular spacing is a visualization, not a change to the stairway's
specified quarter-turn layout or fabrication dimensions.

## Part-browser UI

The script retains a named object tree independently of the combined WebGL
mesh. Home's side panel is a Parts-only inventory, replacing both the former
hierarchical Assemblies browser and grouped Parts inventory. Parameters lives
on its own page with the existing sliders.
The internal tree and manufacturing identity remain
available without exposing assembly navigation in the UI.

In Stairway, clicking or tapping a visible piece selects and scrolls to its
unique-part row, highlighting all matching pieces in the current filter scope.
Picking uses the nearest front-facing triangle in the displayed geometry,
including separated-module positions. Empty space leaves selection unchanged.
Orbit drags, multi-touch gestures, and cancelled touches do not select parts;
picking is inactive in Parameters.

The Parts panel has a bordered **Filters** disclosure, collapsed by default, containing:

- **Module:** All modules, then Module 1 through the current module count.
  A two-module model does not offer Module 3.
- **Subset:** All parts, Framing, Foundation, Step framing, Treads and risers,
  Cladding, Banister, or Without cladding.
- **Type:** All types, or a stock/material category such as pine 2x4, oak 4x4,
  a particular plywood thickness, or a hardware category. These are not
  manufacturing-specification groups.

Subsets are curated by each physical occurrence's functional role, independently
of its manufacturing specification or material:

| Subset | Included parts |
|---|---|
| All parts | Everything in the module/type scope. |
| Framing | Structural wood: foundation beams and cross-pieces, uprights, step supports, and blocking. No sheet goods, newel post, spindles, shims, or casters. |
| Foundation | Caster beams, front/rear support cross-pieces, casters, and the special first-step front cross-piece and flat tread supports. |
| Step framing | Uprights, upper cross-pieces, tread supports, and associated support and newel blocks. |
| Treads and risers | The plywood walking surfaces and riser panels. |
| Cladding | Side siding, including the separate first-step front piece, and particle-board back panels. |
| Banister | Newel post, spindles, spindle shims, newel inner/rear blocks, the step-1 front cross-piece supporting the newel, and front/rear right uprights supporting the spindles. |
| Without cladding | Everything except siding and back panels; retains treads, risers, banister, and casters. |

Membership can overlap: newel blocks belong to both Framing and Banister, and
the first-step flat supports belong to both Foundation and Step framing.
Banister also includes the supporting right uprights and step-1 front cross-piece
without removing them from their framing subsets; other front cross-pieces and
all left uprights remain excluded from Banister.
Foundation's wooden pieces also belong to Framing, but its casters do not.
These are inspection subsets, not an assembly hierarchy. The former Hide plywood
and Hide siding controls are replaced by the Subset dropdown.

**Clear filters** resets Module, Subset, and Type to All,
updating the list, model, quantities, and weight. It preserves Find
text, valid part selection, camera framing, and the disclosure's open state.

All visibility filters combine. The collapsed disclosure shows a brief summary,
such as **Show all parts** or **Showing module 1, framing**.
An active Type filter is included in that description.
The fixed summary reads **N unique parts (M total)**
and **Weight ~N lb (wood only)** for the matching occurrences. Unique parts
means distinct manufacturing specifications, including stock, finished cut
geometry, and joinery; total counts individual physical pieces, including
hardware. Wood weight excludes hardware and unmodeled items.
All three filters affect these quantities and the wood-weight summary.

**Find** stays outside the disclosure and searches within the filtered list,
without removing rows, changing their quantities, or hiding model geometry.
Matching is case-insensitive against scoped titles and functional role names,
with surrounding whitespace ignored. Typing a query selects and scrolls to the
first matching unique-part row without taking focus from the input.
Matching rows receive a gold edge marker, and a live counter identifies the
current match. Previous/Next and Shift+Enter/Enter navigate matches with
wraparound, selecting each match and highlighting its scoped occurrences.
An unmatched query reports **No matches** without clearing the existing
selection. Clearing Find removes match markers but preserves selection.

The results are a single listbox with one row per unique manufacturing
specification, without stock-category headings. Each row shows its inventory
title, matching module/step context, stock, and dimensions. Titles describe the
filtered occurrences rather than retaining whole-model step ranges. Identical
parts share a row, with **x N** appended when more than one occurrence is
visible. When filtering excludes some identical pieces, show the visible and
whole-model quantities, even if only one remains: **Tread (steps 2-3) x 2
(of 8)** or **x 1 (of 8)**. With all eight visible, the title is **Tread
(steps 2-9) x 8**, without a redundant global count.
Identical rear-support attachment blocks with left and right role names share
the title **Attachment block - rear support**. Identical front and rear spindles
share the title **Spindle**. These are the only merged role-name pairs;
occurrence names and placement details retain their positional qualifiers.
When filtering leaves only one role, its positional name is shown.
Searching for either "front" or "spindle" matches the shared **Spindle x 11**
row; selecting it highlights all 11 within the unfiltered
scope, not just the occurrences whose role names matched Find.
The Filters disclosure, Find controls, and summary stay fixed; only the results
area scrolls. Empty results show
**No matching parts**. Manufacturing issues remain explicit rather than
inventing descriptions.

Clicking a row highlights all its matching occurrences within the active filters
in cyan-blue and dims the other visible parts in the 3D model, while preserving
grain, shading, and occlusion.
The selected row uses a matching blue background and `aria-selected`; the
listbox retains keyboard focus and exposes its active option using
`aria-activedescendant`. Up/Down arrows move selection, and Home/End select the
first/last result, scrolling that row into view. Clicking the selected row
again leaves it selected. Selection replaces the old Show locations actions;
there are no buttons nested inside listbox rows.

Filters narrow both the list and visible geometry. If filtering removes the selected
specification entirely, selection and model highlighting are cleared and Details
returns to its empty prompt. If matching occurrences remain, selection is retained and its
highlight updates to that filtered subset.
Switching content tabs preserves selection, visibility, Find settings, and
cameras. Empty scopes show an empty model, retaining the full stairway's camera
bounds. The separate Parameters page does not use Home's filters or selection tint.

**Part details** replaces the former dialog and Show details button. Before
selection it shows **Select a part from the Parts list.** Selecting a part never
switches the active content tab; selecting another part while Details is active
updates its contents immediately. Details has a compact top pane containing a
representative matching part's unique name and a brief stock and feature summary;
a scrolling left sidebar with six selectable
stock-view thumbnails in three rows (Up/Down, Left/Right, Front/Back) and a
rotatable 3D preview below them; and a large render of the selected view filling the
remaining space.
Identical-part counts and occurrence locations remain in the Parts list rather
than being repeated in Details.

The six fixed views are ordered Top, Bottom, Left, Right, Front, Back (internally
Up and Down retain their existing identifiers) and named
for the outward-facing direction in the normal assembled stairway. Up/Down are
vertical; Left points radially inward toward the curve center and Right outward;
Front points clockwise toward the bottom approach and Back counterclockwise
toward the upper landing. The owning step's angular midpoint supplies the radial
and tangential frame. Stock axis pairs are matched one-to-one to this frame,
so angled boards retain six distinct names. Camera orbit and exploded views
never change these labels. For example, a left upright's positive stock-thickness
face is its Right face, while its positive length end faces Up.
For lumber, the two broad stock-thickness surfaces are **faces**, the two
stock-width surfaces are **edges**, and the two length/grain extremities are
**ends**. Plywood has two broad **faces** and four **edges**, never ends.
These terms describe the original stock regardless of trimming or joinery:
an upright therefore has a **Top end**, not a Top face.

The renders remain stock-aligned: X follows length/grain, Y passes through
thickness, and Z spans width. Labels and ordering change to match the assembly,
not the part's stock-aligned cameras. Thumbnail labels use just **Top**,
**Bottom**, **Left**, **Right**, **Front**, or **Back**; the main-view heading
and accessible button names retain the surface, for example **Top end** or
**Right face**.
A fixed SVG compass above the main drawing shows the four in-plane
stair-relative directions. Its four-pointed star, surrounding labels, and
translucent circular background remain visible when the drawing pans or zooms;
the compass does not intercept pointer input. It is hidden in the rotatable
hardware Details view. Thumbnail images have no annotations; their titles show a
small cyan diamond with a "Measurements in this view" tooltip when the view has
cut or joinery callouts beyond overall dimensions. This is an attention marker,
not a warning. Cross-references and the compass also use Top/Bottom, not Up/Down.
Cut-plane callouts are omitted when they offer only a cross-reference to a
measurement in another view. For example, the inner newel block's bevel marks
Top/Bottom, not its opposite square Back end or the other reference-only views.
Warnings requiring a section remain with relevant exposed cuts and their
located dimensions.
Each view fits its own projected
bounds, maintaining aspect ratio without perspective distortion; the six views
do not share a drawing scale. Finished cuts, notches, and dados remain present.
Up is initially selected for lumber. Thumbnail buttons identify the selected view
visually and with `aria-pressed`; native keyboard activation is supported. Lumber
view selection is preserved by stair-relative direction when returning to Details or inspecting
another part, even when that direction needs a different stock-axis camera. The six
thumbnail viewers and the large-view renderer are created when first needed and
reused, rather than allocating new WebGL contexts when switching views or parts.
The small preview shows the finished part in its assembled orientation, starts
obliquely, and has no dimensions. Its camera is independent of both the large
stock view and the stairway. Drag or arrow keys orbit; two pointers or Shift-arrow
keys pan; scroll, pinch, or plus/minus zoom; two-finger twist rotates around the
camera's depth axis. **Reset** or Home restores its initial
view. Thumbnail selection and resizing preserve the preview camera; opening
another part resets it. A single lazily created preview renderer is reused.
Plywood parts use just one drawing beside the preview, without the thumbnail strip:
the Top face for treads and the Front face for risers. Opening a plywood part
does not change the remembered view direction for lumber. Thumbnail renderers
are only created when inspecting lumber.

The measurement/view-selection rules, case studies, implementation boundaries,
and non-rendering geometric assessment are documented in
[Details drawing rules](details-drawing-rules.md).

The drawing's SVG overlay supplies two explicitly labeled cutting-blank
extents in the displayed plane, external feature dimensions, and linked feature
notes. Dimensions use extension lines and arrowheads; each has its own lane,
with blank extents outside the local dimensions. Stock-axis spans are not
sloping-edge lengths. The blank width says **cut to** when a lumber part is
narrower than its original stock; this is not applied to length or plywood.
The drawing states inches/degrees and **Do not scale from screen**.

Overall dimensions stay at the top and left. Where distinct visible-profile
corners subdivide a stock-axis span, chained partial dimensions appear below
or to the right, with extension lines from the actual corners. The profile is
the projected outline of the rendered material, not a convex hull or a list
of mesh vertices: triangulation splits, covered edges, and collinear points
do not add dimensions. Short spans use outside arrowheads. These
measurements describe the visible outline, not an invented material section.
Right-chain labels are horizontal and left-aligned at the end of an elbow
connector. A unit fits the longest label plus a gap. Default callout origins
are one unit right and above the segment midpoint; top-to-bottom segment N
moves another N-1 units right while crowded. Baselines are resolved bottom-to-top so each
label is at least one unit above the next, or higher if its default requires
it. A callout resets to the default column when its baseline is at least one
unit below the previous one and its elbow clears the previous segment's
connector. Bottom chains use this exact layout and renderer through a
90-degree clockwise SVG transform, including rotated labels. Overall top/left
dimensions likewise share a renderer through a transform. Reserved margins
keep the callout fans clear of notes and prevent clipping.
Specialized feature dimensions are omitted when both of their actual
stock-axis endpoints already occur in the corresponding profile chain.
Comparison uses unrounded coordinates with mesh-precision tolerance, not
matching fraction labels. Face-specific depths and internal recess measurements
absent from the silhouette remain; a visible opposite-face depth must not
silently replace a different depth on the named face.
Full-thickness bevel measurements involving a locally recessed-away edge stay
in their explicitly named feature callouts.

Presentation is proportional to the cut geometry. A rectangular lumber blank
with square ends and exactly one full-length edge bevel needs only overall
dimensions in face/edge views, partial end-profile dimensions, and a direct
angle arc on its actual end profile.
The dashed line continues the original square edge; the solid line follows the
finished bevel. There are no feature-ID notes, repeated bevel depths, cross-view
instructions, or separate plane constructions for this simple case. The summary
identifies a full-length edge bevel rather than calling its internal rebate
record a notch. Both ends remain available; only those two thumbnails carry
the annotation marker. Ripped blanks, local/stopped cuts, multiple bevels, and
other joinery retain the detailed presentation below.

Each feature has a per-part ID, assigned before view filtering: N for local
notches/recesses, B for bevels/rebates, M for miters, C for compound cuts, and D
for internal dados. IDs connect complementary measurements across the six
views. A full-length edge bevel is named as such, not as another local notch.
Same-plane end notches that meet or overlap to remove an entire width edge are
represented as a width rip, not two notch callouts. Their bevel is preserved
as a rip-edge cut, and stock-coordinate geometry is normalized to the narrower
cutting blank without changing the assembled shape. This normalization happens
when the board is constructed, not in the manufacturing description or viewer.
Different-depth meeting cuts become a width rip plus the remaining deeper notch.
Notch lengths and depths use exact face-specific measurements rather than
averages. Matching dimensions are owned by one broad face and referenced from
the other; differing depths are dimensioned separately on their respective
faces. References identify original blank edges and ends. Longitudinal lengths
are not directly dimensioned in an end view. Sheet cutouts have nearest-end
position, opening, and separate displayed depths where needed. The plywood
view also retains the opposite authored floor profile in named numeric notes.
Dado/recess openings are outlined on the cut face and dashed on the opposite
face, without dimensions on that hidden face. Edge views establish depth normal
to the named broad face; plywood gives depth numerically in its single view.
Internal dados hidden behind solid end grain and local notches on occluded
edges/ends are omitted.

Angles use enlarged plane-profile constructions with a solid cut ray, dashed
reference ray, an arc, and a named reference. Only directions in which both
planes are edge-on expose a true bevel; miter trace angles use the broad-face
plane separately. These are geometric angles, not saw settings. A deeper
same-edge notch excludes a shadowed end direction, and stopped patches must
reach a viewing boundary before being promoted to an exposed end profile.
The upright's notch-floor angle consequently appears at Up, while its
full-length edge-bevel angle appears at Down.
An exposed full-length bevel's end-view callout also gives the widthwise setback
between its two broad-face edges, naming the shorter face and the reference
face. This measures their width difference, not the sloping bevel length or
total removal from the blank. It describes the full-thickness bevel even when
an end recess removes one face edge locally; no profile dimension is drawn to
that missing edge. Shadowed bevels do not receive the extra measurement.
The stopped newel bevel is
located by its finite start/extent on a broad face. Single-view plywood can
include a separately named standard plane-profile direction for an angle that
the main face view cannot expose. These angular constructions are not located
material sections or additional projected outlines on the shaded part.
Square cuts have no zero-angle callouts. Ordinary views have no hatching or
projected cut-region construction rectangles.
Edge views of finite corner notches show a dashed shoulder trace between the
two face-specific shoulder positions, giving the callout anchor a visible
target even when the shaded render does not expose that edge.

Feature notes are ordered left-to-right above/below the part and placed near
their projected anchors. Their measured text and angle-diagram bounds clear
existing dimensions, profile callouts, and previously placed notes with a small gap;
nearby clear columns are considered before pushing a note farther out.
Broad-face corner notches whose profile and dimensions already describe the cut
omit redundant prose and leaders; actual angle constructions, section requests,
and zero-removal explanations remain. Hidden recesses retain their dashed
outlines without repeating the opening-face note. Their useful opening and
depth notes remain in the appropriate views; single-view plywood drawings
retain opposite-face explanations. Full-length bevel notes remain explicit.
Angle descriptions include their dashed reference in the same paragraph,
for example `B1 Bevel 35.43 deg from square Top end (dashed)`. Fixed-size angle
diagrams sit immediately to the left of their text with a 9-pixel gap,
vertically centered alongside the feature heading and angle paragraph.
A standalone cut's redundant heading is folded into that paragraph; named
edges and additional manufacturing notes remain. Space is reserved for notes,
angle constructions and dimension lanes. Vertical depth labels use clear gaps
between feature and profile extension lines, moving outside the part's projected
height with short leaders when necessary. Note leaders turn close to the part
before heading outward, keeping clear of nearby opening labels. Extra corner clearance
separates labels from horizontal dimensions on shallow views. Minimum logical drawing
dimensions preserve usable diagram space on small windows; the initial display
transform fits the complete drawing into its pane. Details uses compact
9-pixel annotation text with proportionate line spacing and angle diagrams;
pan/zoom enlarges the entire drawing when needed. Adjacent depth measurements
retain separate lanes, and short dimension spans use outward arrows rather
than squeezing overlapping arrowheads inside the gap.
Leaders are not globally collision-routed. Visibility checks are
feature-specific, not complete hidden-line removal; unsupported exposure
explicitly requests a section rather than inventing a visible angle. Located
sections, their material hatching, and compound-angle auxiliary views remain
future work.

`WebGLViewer.setViewportInsets()` reserves CSS-pixel margins for annotation
layout without shrinking the drawing canvas. Fixed-view rendering and
`projectPoint()` share the same orthographic matrices, keeping SVG anchors
aligned with the wood across view changes, resizes, and pixel densities.
These margins apply only to the large stock view; thumbnail and main stairway
camera behavior are unchanged.

The large Details drawing caption describes the viewing direction and visible
surface (for example, "View from top, showing top face"), followed by navigation
instructions in the same small font.
The drawing supports drag/arrow-key panning, wheel/pinch or
plus/minus zoom, and Home to restore its default framing, without rotation or
scrollbars. This also applies to the large hardware view; the separate small 3D
preview still rotates. The wood and drawing annotations share one display transform:
pan/zoom changes neither the underlying camera nor callout wrapping, size, or
placement in the logical drawing. Labels, leaders, angle diagrams, and the part
therefore move and scale together; the separate compass remains fixed above them.
Selecting another part or stock view, resizing
the window, or changing the drawing pane's dimensions recomputes the default
layout and resets pan/zoom. Switching content tabs without a size change preserves
the current drawing transform. The thumbnail/preview sidebar still scrolls
independently.

The main view and Details include a solid-gray, lit floor footprint copied
from the actual tread top triangles at floor height, including the first
tread's different outline. It is visible only from above, cached per model
build. In Stairway, each module's footprint rotates with that module during
Split/Join animation. Details and Placement always use the assembled footprint,
independent of the Stairway Split/Join state. In the footprint
only, vertices on each tread's front/back radial boundaries move inward by
1/16 inch perpendicular to that boundary, leaving 1/8-inch seams between treads.
The first tread's front boundary and last tread's back boundary remain uninset.
The physical tread geometry and interior cutout vertices are unchanged. Details
transforms this same footprint into the selected part's preview/stock frame.
It is render-only context: selection, part framing, dimensions, inventory,
and weights exclude it. A larger one-sided floor plane and distant sky dome
remain possible future orientation cues.
The planned top-down drawing replacement, shared by Details and Placement,
uses exact uninset SVG tread regions with stroked seams rather than this WebGL
footprint; see [Drawing and footprint conventions](#drawing-and-footprint-conventions).
The lit, inset footprint remains the design for the rotatable 3D views.

The brief summary retains nominal/material and actual stock dimensions (or
plywood thickness) and lists features to look for: width rips, mitered/beveled
cuts, notch counts with a bevel hint, and dado counts. Length and finished width
are shown in the drawing rather than repeated in the summary. Parts without
these features say **Square cuts only**. The top pane omits detailed cuts and
the stock-coordinate explanation. Notch and dado details appear in the
drawing dimensions and linked notes; complete cut planes, plywood outlines, and the detailed text
formatter remain available for later presentation.
All displayed inch measurements, including parameter readouts, use mixed
fractions rounded to the nearest 1/32 inch, reduced to denominators 2, 4, 8, 16,
or 32 (or whole inches). A leading `~` marks lengths whose rounded value differs
from the unrounded length by more than 0.01 inch, for example `~4 5/8 in`.
Angles remain decimal, rounded to 0.01 degree;
fractions use raised numerators and lowered denominators around a diagonal slash,
with extra space after whole inches. Each mixed number stays together on a line,
while its underlying text remains ordinary fractions for reading and copying.
The retained data and physical geometry are not rounded. Future hardware leaves
without a woodworking description are identified honestly rather than given
invented stock data.
The footer always shows the stairway summary and interaction instructions, and
sizes to fit that content. Part selection no longer changes its content or height.
The thumbnail/preview sidebar scrolls independently while the large view fits its available
pane. On short windows the top pane is capped at 35% of viewport height and can
scroll independently, leaving room for the selected view.

The tabs support Left/Right arrows, Home, and End with automatic activation.

Navigation does not recenter or automatically fit the selection: rendering keeps
the whole-stairway bounds for the current module-separation progress. Orbit, pan,
manual zoom, lighting, and ongoing view transitions are preserved.

### Object-model implementation plan

The original object-model phase below was limited to model data, geometry access,
and headless navigation. The tabbed UI now uses those APIs without changing
physical geometry or ownership.

**Architecture.** Retain a lightweight tree of nodes referencing the existing
component instances. Do not replace the geometry classes with a new inheritance
hierarchy, copy the physical parts, or reconstruct ownership from triangles.
The root owns modules, modules own steps, steps own their named parts, and
subassemblies own boards. The flat `model.steps` list remains a convenience
index of those same steps, not a second ownership path. Internal
`notchedStock` objects describe cuts in an upright; they are not extra physical
parts and must not appear as children or be counted twice.

Each node needs a structural ID, a stable role key, a display name, a kind,
a reference to its component, a parent ID, and an ordered child list. The
implicit stairway root makes upward navigation possible; the initial UI shows
its children, not a redundant root row. Modules use one-based display numbers;
step assemblies use one-based whole-stairway numbers so their identities are
unambiguous outside a module. Names are not IDs.

**Manufacturing data.** Preserve the source stock explicitly at construction.
Finished dimensions are not sufficient to recover it: upper-frame cross-pieces
can be ripped narrower, `FrameBoard.length` describes a particular reference
edge, and a tread's existing dimensions are not its full sheet-aligned bounding
rectangle. Use conventional dressed dimensions: 1x4 stock is `0.75 x 3.5 in`,
2x4 stock is `1.5 x 3.5 in`. Wider 1x6/1x8/1x10 and 2x6/2x8/2x10 stock
has widths of `5.5`, `7.25`, and `9.25 in`, respectively, with 1x stock
`0.75 in` thick and 2x stock `1.5 in` thick.
Plywood stock specifies thickness, not an assumed purchased sheet size.

Describe shapes analytically in part-local stock coordinates: X along grain
or length, Y through thickness, and Z across width. Measure the rectangular
cutting blank before notches and dados, using the extrema of all its corners,
including both thickness faces. Report that maximum long-point length as the
cut length; retain the exact end planes and profiles so short points and
asymmetrical cuts remain recoverable. Sheet bounds use these authored axes,
not a world-axis box or an optimized nesting rotation.

Keep numeric dimensions in inches and angles in degrees, without display
rounding. Exact profiles and cut planes are authoritative; prose and rounded
fractions can be generated later. Distinguish miters across a broad face from
bevels through thickness, with angles measured from a square cut and signs
defined in stock coordinates. Reuse the existing normalized notch/dado data,
including face-specific beveled depths and intersections; do not infer joinery
from a Float32 render mesh or double-count intersecting cuts.

| Task | Work and deliverable | Prerequisites | Acceptance criteria |
|---|---|---|---|
| P1: Retain the hierarchy | Add node/tree types, explicit functional names, deterministic role-based IDs, lookup, parent/ancestor traversal, and leaf enumeration. Attach one tree to each built stairway, referencing its actual modules, steps, subassemblies, and boards. | None | Every modeled physical leaf occurs exactly once. Modules and steps are ordered and correctly named for all grouping options. Plywood leaves and optional caster-mount boards appear at their actual levels. Helper stock objects do not appear. |
| P2: Preserve source stock | Add explicit stock metadata to boards and annotate construction sites for pine/oak 1x4, oak 1x6, and plywood. Retain nominal identity separately from actual stock cross section and finished dimensions. | None | A trimmed upper-frame member still reports 1x4 stock; mounts report 1x6 oak with 5.75-inch actual width. Risers and treads report their respective plywood thicknesses. Geometry, grain, material, and weights remain unchanged. |
| P3: Describe lumber and joinery | Supply analytic stock-coordinate blank vertices/faces for ordinary boards, fitted frame members, flat mounts, and uprights. Derive long-point length, trimmed width, end/edge planes, miter/bevel angles, and normalized notch/dado descriptions. | P2 | All lumber leaves have finite, unrounded descriptions. Asymmetric ends and mirrored dados remain distinguishable. The upright's helper contributes its cuts without creating a second part. Invalid descriptions fail explicitly. |
| P4: Describe plywood | Use the same analytic description machinery for risers and treads, exposing the sheet-aligned bounding rectangle, both broad-face outlines, and exact edge cuts. | P2, P3 | Every profile corner fits the stated blank. Tread bounds include the outer edge and back-corner offsets; riser ends preserve cuts through thickness. Descriptions do not assume that all plywood is rectangular or every edge is square. |
| P5: Isolate any subtree | Add a model-level geometry entry point for a node, selecting only its descendant physical leaves. Reuse the existing step-to-world transforms and explosion logic. | P1 | Root selection matches the full model; module, step, subassembly, lumber, and plywood selections contain only their own geometry. Parts stay in the correct assembled/exploded positions. Existing rendering and full-model bounds remain available unchanged. |
| P6: Support headless navigation | Add selection state, child listing, ancestor path, up/root navigation, and access to the selected leaf's description. Reconcile selection when the stairway is rebuilt. | P1, P3, P4 | Navigation works without DOM or WebGL. Width-only rebuilds preserve a valid structural selection; regrouping or changing step count resets to the module list rather than silently selecting a different part. Invalid IDs fail explicitly. |
| P7: Verify and document the API | Add focused tests for tree ownership, names/IDs, stock-versus-finished dimensions, analytic profiles and cut conventions, subtree geometry, navigation, rebuilds, and all current leaf types. Document the implemented API separately from the future UI. | P1, P2, P3, P4, P5, P6 | Existing model/viewer regressions pass unchanged except where API coverage is added. Descriptions and geometry agree at supported slider extremes. Selection never mutates the model, alters weights, or loses cut data. |

P1 and P2 are independent foundations. P3 then P4 complete woodworking
descriptions; P5 can follow P1 without waiting for descriptions. P6 joins those
capabilities, and P7 completes the implementation. No dependency installation,
general-purpose CAD kernel, cut-sheet nesting, fastener modeling, or browser
presentation is required.

The stopping point is a retained, inspectable tree with complete descriptions
for current wooden leaves, correct subtree geometry, and tested headless
navigation. A later task can bind these APIs to the chosen browser UI.

## Part Placement

**Status: an initial bounded geometric planner and views are implemented.**
The following design describes the intended feature; the algorithm document
below records the supported references and remaining limitations.
Part Placement is another Home content tab beside Stairway and Part details. Details explains how to
make a part; Placement explains where to put the finished part relative to
the assembly. It must provide enough information to locate and orient the
piece without repeating its cutting drawing or dimensioning every visible gap.
This is a placement aid, not a fastening specification or assembly sequence.

The implemented finite-reference rules are documented in
[`placement-algorithm.md`](placement-algorithm.md). In particular, Top-view
contact locations measure from an actual neighbor corner along the contact
edge to the joint. Exact tread-template intersections measure along a named
seam from its corner to the selected part's edge. The frontmost and backmost
crossed seams have priority over intermediate seams, and both can be retained
alongside one joint-location dimension. Shared-corner fits need no redundant
number. Template distances are horizontal plan references, never height or
evidence that the part physically rests on a tread.

Top-view references must fix left-right, front-back, and rotation. Prefer
well-separated point references to angle measurements. When a straight edge
has too few useful template crossings, extend its line beyond both ends to
the outer footprint perimeter and dimension those crossings from tread
corners; draw virtual extensions dashed. Prune a redundant middle crossing.
Two points locate the line, not the part's position along it: use a clear
corner/seam alignment or end stop for that, otherwise prefer a direct setback
to a nearby template edge. Short, near-perpendicular crossings outrank long,
shallow-angle ones. Between parallel edges, measure normally from the center
of their finite overlap, even if the part's end is mitered, with a small
right-angle square where space allows. Actual edge extensions and
template-corner measurements remain fallbacks. Exact corner hits need only an
alignment mark. The planner checks three-column planar constraint rank and
reports missing references explicitly instead of implying that one point,
two parallel measurements, or mere contact fully locates the piece.

Measurements along the same or nearby parallel datum edges share an annotation
axis. Reuse Details' segment measurement arrows and perpendicular, fanned label
leaders instead of centering crowded text over each dimension. Placement uses
smaller glyphs; pan and zoom enlarge the whole drawing without relaying it out.

### View content and selection

Retain the Parts list, selection-preserving tab behavior, and the empty prompt
**Select a part from the Parts list.** Placement needs an explicit occurrence:
identical manufactured pieces can have different neighbors and installation
positions. Details remains a per-unique-part manufacturing view, with the same
unique name used in the Parts list. Placement is a per-individual-part view:
its title is the **location-specific occurrence name**, including its role and
module/step context, for example **Spindle - front (Module 2 / Step 4)**,
not the grouped inventory title **Spindle x 11**.

Put a dropdown arrow beside the Placement title. It opens a list of other
instances of the selected unique part, each named by its actual location.
Here "same kind" means the same manufacturing-specification inventory group,
not all lumber, all spindles with different cuts, or all parts of the same
stock size. Limit choices to the group's occurrences in the active Parts
filters and mark the current instance. Hide the arrow when only one matching
instance exists. Support keyboard operation and an accessible instance-selector
label; a compact title must not conceal which occurrence is selected.

Selection has two coordinated identities: the unique inventory entry and the
specific occurrence used by Placement. Preserve the selection source:

| Selection source | Unique-part selection | Placement occurrence |
|---|---|---|
| Parts-list row, including keyboard/Find navigation | Select that inventory entry | Choose its default instance: the first matching occurrence in the inventory's deterministic occurrence order |
| Clicking/tapping a physical piece in Stairway | Select/reveal its inventory entry as usual | Retain the exact hit occurrence, even if another instance of the same unique part was already current |
| Placement title dropdown | Keep the same inventory entry | Use the chosen instance and update the location-specific title, neighbors, preview, and annotations |

A Stairway hit must retain its occurrence ID, not merely route through a
group-selection action that replaces it with the default. Record this even
while Placement is inactive, so opening that tab shows the piece actually
clicked. None of these selections automatically switches content tabs or
changes filters/Find. The existing unique-group highlighting in Stairway
otherwise remains unchanged.

Clicking or tapping a physical neighbor in the Placement drawing or its 3D
preview opens a popup with that instance's name as a link, without changing
selection or filters. Activate the link to select that exact occurrence and
stay in Placement; click outside or press Escape to dismiss it. Picking uses
the current view's visible physical triangles, excluding the footprint and
elided neighbors, and accounts for drawing pan/zoom. Drags and multi-touch
gestures do not open the popup. If Parts filters exclude the linked neighbor,
clear those filters only when navigating; preserve the Find query.

Do not superimpose every identical piece or imply that one placement drawing
applies to them all. Changing occurrence resets Placement framing and
annotation layout; switching tabs preserves the exact current occurrence.
If a filter removes it but leaves other matches in the selected inventory
entry, choose the first remaining instance and update the title. If no matches
remain, clear selection and show the empty prompt. Neither a tab switch nor a
resize should rerun default-instance selection.

Provide six selectable views named Top, Bottom, Left, Right, Front, Back, a large
annotated drawing, and an independently rotatable, undimensioned 3D preview.
Unlike Details, Placement needs all six views for plywood too: its edge and
reverse views can explain support, clearance, and elevation.

Use the same direction names as Details but **assembly-aligned cameras**, not
stock-aligned cameras. Up/Down look vertically down/up; Left/Right follow the
owning step's inward/outward radial frame; Front/Back follow its tangential
frame. Use the angular midpoint of the module for module-level parts.
This deliberately differs from Details: squaring an angled board to its
cutting stock can tilt the apparent floor or foreshorten a placement offset.
Assembly-aligned views give a true horizontal plan and true vertical elevations.
The selected part keeps its assembled angle. Every neighbor uses the same
camera and assembled coordinate frame; never independently straighten them.
Keep the compass and describe the view direction in the caption.
As in Details, the compass is a fixed, pointer-transparent SVG overlay outside
the drawing's pan/zoom transform, using the Placement assembly-aligned directions.
A **Show details** disclosure beside the view caption is initially collapsed.
It contains current-view notes, measurement IDs with their full reference
descriptions, and unresolved-placement limitations. The open/closed choice is
retained while inspecting other views; the contents follow the current view
and selected occurrence. A concise placement status and omitted-context count
remain visible outside the disclosure. This prose does not consume drawing
space or move with the measurements.

The six thumbnails show **only the selected occurrence**, without neighbors,
footprint, or annotations, using the corresponding Placement cameras. The
large drawing and 3D preview show the selected occurrence normally and its
useful physical context dimmed, retaining lighting and material cues. Dimmed does
not mean transparent. In the Up drawing, include an exact gray SVG tread plan
behind the 3D parts, with thin black seam lines and no geometric insets.
This shared Details/Placement template can also provide named horizontal
placement datums. In the rotatable preview and other non-top-down drawings,
retain the normally rendered, lit, one-sided WebGL footprint with its inset
seams, visible only from above. The template/footprint is not a physical
neighbor or an occlusion-removal candidate.

Neighbors may be outside the Parts filters or across a module boundary.
Filters choose selectable occurrences, not which locating context is allowed
to exist. Identify these as context, without changing inventory selection or
counts. Placement always uses the joined, unexploded assembly, independently
of the Stairway tab's module-separation setting.

Choose neighbors and annotations together for each fixed view; do not require
every discovered nearby part to appear in every drawing. Retain a neighbor
when it supplies a selected datum, explains a locating seat/stop/alignment, or
provides essential orientation context. Mere proximity is insufficient.
Different views can use different subsets of the same candidate neighborhood.

In each fixed view, elide an entire neighbor if it would occlude a nontrivial
area of the selected part. Test overlapping projections **and depth**, not just
overlapping bounding boxes; ignore numerical contact noise, but not a narrow
real obstruction. A neighbor behind the selected part stays visible where
normal depth testing permits it. Whole-part elision is preferable to clipping
fragments or drawing the selected piece through apparently solid wood.
The rotatable preview uses a stable useful-context set: the union of physical
references chosen across the six drawings plus essential mating/support
pieces, including ones elided from fixed views. Do not perform view-dependent
occlusion removal in the preview; orbiting explains their actual relationship.
Changing the active drawing must not make preview neighbors pop in and out.
Indicate when relevant context has been elided and make the other views/preview
available, rather than suggesting the displayed neighbors are the complete
assembly. Nearby parts rejected as irrelevant do not each need an omission
warning.

Do not dimension to an elided or otherwise hidden physical reference. An
explicitly shown and named tread-plan reference is an exception for horizontal
placement: its exact plan coordinates remain usable even when the elevated
physical tread is elided. It establishes neither height nor physical contact.
Otherwise assign the relationship to another view where its anchors are
visible. If none of the six views can explain it, say **Placement needs a
section or additional reference**; do not fabricate a projected dimension.

Fit the selected part, useful local neighbor context, and any dimensioned
template references, not the full stairway or the complete footprint.
Prefer complete datum-bearing neighbors where
practical; any context clipped by the viewport must not appear to have a
physical end there. The footprint may extend beyond the frame. Reuse Details'
pan/zoom interaction, default-layout resets, and common render transform for
geometry and SVG; gestures must not reselect measurements or relayout labels.

### Neighbor discovery alternatives

Clash-tool preprocessing is an option, not a requirement. Separate three
questions: which parts might be relevant, what relationships actually locate
the selected piece, and which context makes a particular drawing useful.
One all-purpose "neighbors" list cannot answer all three.

| Approach | Benefit | Problem | Decision |
|---|---|---|---|
| Offline clash/proximity analysis with baked adjacency | Reuses robust solid-analysis infrastructure; no browser discovery cost | Requires a new proximity mode, regeneration/versioning, and coverage of parameter changes; geometric adjacency still does not identify useful datums | Optional validation or later optimization, not a prerequisite |
| Explicit role-based neighbor lists | Captures intended supports, stops, and references cheaply | Can miss incidental or cross-module relationships; manually maintaining a complete adjacency graph is brittle | Author locating hints, not every nearby pair |
| Runtime JS bounds/proximity search | Simple, parameter-aware, and cheap for one selected occurrence | Conservative bounds admit false positives and cannot prove contact or give exact measurements | Recommended broad phase |
| Runtime exhaustive triangle/solid analysis | Can discover detailed relationships without baked configuration data | Costly and numerically complex; still cannot infer construction intent from distance alone | Avoid all-pairs analysis; use targeted geometric checks only when needed |
| Runtime discovery plus semantic datum hints and joint view planning | Adapts to the actual model while retaining practical reference choices | Requires candidate validation, caching, and honest unsupported cases | **Recommended starting point** |

Start in JS with retained assembled geometry and a world-space bounding box
per occurrence. On selecting an occurrence, scan the other boxes for likely
local context and combine those results with model-provided support/stop/datum
hints. An O(N) scan for one selected part is the simplest initial broad phase;
there is no need to build every pair's adjacency. Add a spatial index only if
profiling the actual model shows that this scan matters.

Compare box separation rather than center distance: a long beam can be a
relevant support even when its center is far away. Bounds give a conservative
lower bound on separation, not actual contact. A narrow near-contact band can
find likely mating pieces, but must not exclude intentionally spaced supports,
non-touching reference edges, or named tread-template datums. Search assembled
occurrences across module boundaries and independently of the Parts filters.
Broaden the local candidate search if the first set cannot provide a complete
placement, without accepting an unrelated distant piece merely because a
mathematical dimension to it is possible.

Validate only promising relationships against the original finished geometry,
using analytical model datums or suitable face/edge checks where available.
Perform more detailed mesh proximity checks only for candidates whose
usefulness or contact classification depends on them. Do not dimension from
bounding boxes, treat a box overlap as a butt joint, or infer a true face
distance from an arbitrary closest pair of vertices. Keep deliberate
clearances distinct from exact mating relationships.

Retain these distinct data products:

- **Candidate context:** occurrence IDs and inexpensive spatial/role evidence
  that a part might be useful. Membership does not require rendering it.
- **Locating relationships:** intended support/seat, stop, flush, centered,
  offset, or orientation relationships with named finite edges, planes, and
  outline points. Resolve parameterized role hints from construction intent
  and verify them against the finished geometry; proximity supplements rather
  than replaces these hints.
- **Per-view plans:** selected relationships, required physical neighbors,
  named SVG-template references, occluded relevant context, and annotation
  ownership. These are outputs of the joint planner, not a copy of every
  candidate. Do not recursively include all neighbors' neighbors.

Use role/occurrence references rather than inventory-group identity or
unstable triangle numbers. Cache geometry/bounds for the current model and
candidate relationships/view plans for the selected occurrence. Reuse retained
part meshes and transformations; neither switching views nor rendering a
frame should rerun discovery or regenerate all physical geometry.
Invalidate geometry-dependent data when model parameters or topology change,
including width, step count, module count, and railing ascent. No static
configuration catalog is required. Missing locating intent or an unverified
reference still requires an explicit limitation, not a guessed measurement.

Keep the clash tool available for independent verification. Its current CLI
rejects negative insets; any future offline proximity mode should be explicit
and leave interference-check defaults unchanged. If expanded meshes are used,
define the maximum pair separation rather than an ambiguous per-part inset,
and check original geometry before claiming a contact or gap. Expanded meshes
never become production or rendered geometry.

### Annotation strategies considered

| Approach | Benefit | Problem | Decision |
|---|---|---|---|
| Dimension all outline-to-outline gaps | Mechanically straightforward; unlikely to omit a visible distance | Most distances are irrelevant, dependent, or between unrelated pieces; produces dense chains without installation guidance | Reject as the default |
| Use the nearest edge or corner for each offset | Usually short dimension lines and little metadata | Tiny notches, corner tips, and changing parameters can select unstable or inaccessible references; nearest does not mean useful | Use distance only as a late tie-breaker |
| Locate everything from the stairway origin, axes, and floor | Consistent mathematical coordinate system | Requires builders to recreate remote datums; coordinate sets obscure obvious seats and butt joints | Reserve for explicitly authored site datums, not ordinary placement |
| Fully author every part/view drawing | Can match practical construction intent exactly | Large maintenance cost; repeated occurrences and parameter changes make hand-positioned drawings brittle | Author relationship hints and exceptions, not complete SVG drawings |
| Infer a minimum rigid-body constraint set from mesh contacts alone | Potentially automatic and sparse | Touching surfaces do not identify intended seats, assembly access, or a suitable measuring edge; a numerical solution can still be unreadable | Use constraint reasoning, but not geometry alone |
| Combine locating relationships with geometric visibility and a minimal dimension set | Preserves construction intent while adapting to geometry, parameters, and view | Needs small semantic metadata and honest unsupported cases | **Recommended** |

The recommendation is **constraint-first, datum-led, and view-aware**. Find out
what remains free after the obvious locating relationships, then show the
smallest readable set of independent instructions that removes that ambiguity.
A full rigid-body pose has three translations and three rotations, but most
parts do not need six numbers: mating faces, stops, and finished geometry
already determine much of the pose. Conversely, one butt joint does not
necessarily prevent sliding or rotation.

### Recommended annotation rules

1. **Start with the finished part and intended interfaces.** Use real finite
   outline edges/corners and their identifiable support planes. A visible
   mating shoulder may serve as a placement reference without repeating its
   notch dimensions. Exclude triangulation edges, hidden corners, bounding-box
   corners outside the material, and original blank edges removed by a cut.
   An infinite edge extension is a dashed construction reference, never a new
   physical corner.

2. **Recognize location already established by the joint.** A seated face fixes
   its normal position and tilt, but can still permit sliding in its plane
   and rotation about its normal. A second alignment or stop may remove those
   freedoms. Treat an exact, visually clear butt/seat/flush fit as a locating
   relationship, not a zero-inch dimension. Do not suppress the remaining
   offsets merely because some part of the joint touches. Nor does apparent
   contact in projection prove that the parts actually meet in 3D.

3. **Choose practical, stable datums.** Prefer the intended supporting or mating
   piece, a visible long straight finished edge, and a reachable end/stop.
   When foundation pieces are laid out against treads arranged on the floor,
   a named exact tread-plan edge is a practical horizontal datum too.
   Use one primary neighbor where possible; add another only to supply a
   missing independent reference. Prefer references on pieces that can
   reasonably be positioned first. If locating A from B would also require
   locating B from A, choose an independently established support or state
   the missing datum. Mesh adjacency is not an assembly-order specification.

4. **Use the simplest relationship that resolves the freedom.** Prefer an
   obvious seat/stop, then flush alignment, then an explicit centered
   relationship, then a measured setback/overhang/offset, and an installation
   angle only when needed. A symmetric part centered across its support should
   say **Centered on [named support]** with linked center marks, not have two
   equal edge-clearance dimensions. Centering must be intentional and
   geometrically verified, not guessed from matching bounding boxes. It fixes
   only the indicated direction, not the entire placement.

5. **Dimension the unresolved offset, not the part's size.** A parallel-edge
   separation uses a perpendicular dimension. Along-edge location uses an
   identifiable end/stop and a dimension parallel to that direction. Name
   which side is inset or projects beyond the reference, so a positive number
   cannot describe two mirrored installations. If no interface determines
   rotation, prefer two identifiable, widely separated points fixed both
   left-right and front-back. This also fixes rotation and is easier to lay
   out accurately than an angle. Straight-edge extensions to named template
   datums can supply those references, with an independent end location to
   prevent sliding along that line. Use a true installation angle only when
   practical point references cannot do the job; do not repeat fabrication
   bevel/miter angles or substitute unexplained distances to arbitrary corners.

6. **Measure only what the projection truthfully shows.** The dimension
   direction must lie in the view plane. Edges must expose the true
   relationship being measured; a foreshortened spatial gap is not its actual
   clearance. A plan offset between edges at different elevations is valid
   when identified as a plan offset, not a 3D distance. Angles require a view
   showing their true plane angle. If a required measurement is not
   representable by the six views, report that limitation rather than give
   a number next to a misleading construction.

7. **Select a minimal sufficient set across all views.** First account for
   verified locating relationships; then choose independent measurements for
   the remaining translations/rotations, allowing symmetries of the finished
   part. Rank eligible candidates by datum reliability, visibility/true
   measurement, new locating information, and drawing readability, in that
   order. Short leaders and numerical tie-breaks come last. Do not add a
   dimension that can already be derived from the selected instructions and
   the finished part. Contact-constraint counting is a useful check, not
   proof that a builder can identify or reach the reference.
   Select the required neighbors with these instructions: a candidate's
   contribution to a clear placement drawing matters more than its distance.
   Keep a self-locating seat/stop neighbor even when it needs no numeric label;
   discard nearby pieces that explain no selected relationship.

8. **Give each relationship a primary view.** Prefer Up for horizontal
   placement and the clearest Front/Back or Left/Right elevation for height.
   Choose an opposite view when it exposes a better datum. Assign stable
   placement IDs such as P1/P2 when cross-view identification is necessary;
   do not reuse Details' cut-feature IDs. Show each numerical instruction
   once, with a short cross-reference only where ambiguity would otherwise
   remain. A view with no additional placement information needs no numeric
   annotation.

9. **Keep the drawing sparse, but never silently incomplete.** Aim for one or
   two annotation groups per useful view, not a hard cap that drops required
   information. Move independent instructions to another suitable view before
   stacking many lanes. If contact or alignment is not visually obvious, a
   short linked **Seat against...**, **Flush with...**, or **Centered on...**
   note is better than a chain of zeros. If required anchors or label space
   remain unavailable, state which placement relationship cannot be shown.
   Distinguish **Located by the shown seats/stops** from **No additional
   measurements in this view; see [view]** and **Placement analysis
   unavailable**. An annotation-free view must not imply an unsupported
   placement is self-locating.

### Joint neighbor and annotation planning

Plan all six drawings for an occurrence together, then render the selected
view's plan. A practical deterministic first pass is:

1. Gather candidate context and intended locating relationships. Establish
   which placement freedoms the known fits remove and which still need an
   instruction. An unmeasured self-locating joint still needs its useful
   support/stop context shown clearly somewhere.
2. For each view, classify candidate occluders and generate eligible visible
   datum/measurement alternatives, including exact tread-plan references in
   Up. Each alternative names both the locating information it supplies and
   the physical neighbors or template references needed to explain it.
3. Choose independent relationships and primary views that cover the remaining
   placement needs. Prefer reliable, visible references; then fewer distinct
   datum pieces, fewer annotation groups, and clearer layout. A useful simple
   joint should beat several short dimensions to different nearby objects.
   Use stable occurrence/feature ordering to break equivalent choices.
4. Form each view's neighbor subset from the chosen references and the
   interfaces explaining already established fits. Add a context-only part
   only when it resolves an actual orientation or support ambiguity. Do not
   add a numeric dimension just to justify displaying an otherwise irrelevant
   neighbor, or remove a required locating instruction to meet a part-count
   limit.
5. Validate the combined scene: a retained neighbor may hide another
   neighbor's datum even though neither hides the selected part. Remove
   optional context, choose another valid reference/view, or revise the
   layout as needed. Recheck anchor visibility and placement coverage after
   pruning; if no valid plan remains, report the specific limitation.
6. Cache the six plans and the stable preview-context union. Resize recomputes
   framing and annotation layout, not spatial discovery; pan/zoom changes
   only the shared display transform. View switching selects an existing plan
   rather than introducing new neighbors based on the current viewport.

This is a constrained selection problem, not necessarily a general-purpose
optimization engine. Start with explicit relationship priorities and a small
deterministic selection pass. If competing choices remain, compare a bounded
set of alternatives rather than performing an unrestricted search. Never
trade truthful, complete location information for a superficially cleaner
drawing.

### Drawing and footprint conventions

Keep a visible distinction between the selected outline, dimmed neighbor
outlines, and annotation lines. Label a datum-bearing neighbor with its
occurrence role/context when it could be mistaken for another piece. Anchor
extension lines to the actual visible references; put dimensions outside
material where practical. Avoid crossing the selected silhouette or unrelated
neighbors, and use the existing dimension/leader conventions rather than
introducing a second drafting language.

Do not draw cutting-blank extents, feature/cut notes, full perimeter chains,
or overall dimensions merely because Details would show them. Placement
dimensions describe relationships *between* parts or to an explicitly named
site datum. They do not independently redefine a component's manufactured shape.
Continue the existing inch/fraction and angle formatting, keeping unrounded
geometry for selection and redundancy checks. Numerical contact tolerance is
not a construction allowance. Never turn an intentional nonzero clearance
into **Flush** or a displayed zero merely because it rounds down; identify a
precision limitation if the required clearance cannot be expressed honestly.

**Use an exact SVG tread-plan underlay in the top-down drawing of both Details
and Placement.** The builder can arrange the actual treads on the floor and
position foundation pieces over them, so their projected edges are useful
horizontal placement datums, not merely orientation cues.

Use three co-registered drawing layers, back to front:

1. An SVG underlay filling the exact tread-plan regions gray and stroking
   their seams with thin black lines.
2. The WebGL selected part and, in Placement, the visible dimmed physical
   neighbors.
3. The SVG dimensions, leaders, and Details feature notes.

The fixed compass is a separate SVG above these layers, outside their shared
transform. Placement's explanatory metadata belongs in the caption disclosure,
not the co-registered drawing.

Generate the underlay from the original, unmodified tread top surfaces,
including tread 1's different outline and actual cutouts. Project them into
plan without any 1/16-inch offsets or artificial gaps. Extract the true
boundaries rather than stroking triangle edges; draw shared seams once.
The black line is only a stroke centered on the exact shared edge, not a
strip removed from either tread. Preserve holes and concavities.

Use the same camera projection, coordinate transforms, and default drawing
layout for all three layers, including Details' occurrence-to-stock transform.
Pan/zoom moves them together without changing datum selection or annotation
layout. The WebGL canvas must composite with a transparent background for this
layered drawing; it currently requests an opaque context and clears opaquely,
so simply inserting an SVG behind it would not work. Keep the existing opaque
background behavior in other viewers. The underlay and annotation overlay do
not intercept the drawing's pan/zoom input.

In these top-down drawings, omit the WebGL floor-footprint mesh to avoid a
second, inset representation. This does not remove a selected tread's physical
3D geometry: Details must still show the part being inspected. Physical tread
neighbors in Placement follow the ordinary visibility/elision rules. The
underlay is a labeled plan template behind all parts, not a claim that the
elevated treads are physically beneath the foundation. Placement thumbnails
remain selected-part-only.

Placement may dimension from a selected outline reference to a named template
edge or corner using its exact, unrounded coordinates. Identify the tread and
which edge is intended; do not dimension to an anonymous gray region, the
width of a black stroke, or the inset WebGL shadow. A named template reference
does not require adding the elevated tread as a physical neighbor. Use exposed
template references or clearly identified dashed extensions, not unexplained
anchors hidden under the selected part. Details shares the accurate underlay
but keeps its manufacturing annotations; it does not acquire placement
dimensions.

Template dimensions are horizontal plan offsets only. Laying treads on the
floor is a layout technique, not a change to the modeled foundation heights:
the tread material thickness must not silently become an elevation offset.
A floor elevation may separately be an explicitly authored site datum.
The lit WebGL footprint remains useful in rotatable previews and other
non-top-down drawings, but its inset seams never define measuring coordinates.

### Representative placement decisions

| Situation | Recommended information | Information to omit |
|---|---|---|
| A block is seated on a beam, flush with a side, and against a visible stop | The joint visuals alone, or a short alignment note if the intended interfaces are ambiguous | Zero clearances, the block's length, and offsets already fixed by those interfaces |
| A block sits on a broad support but can slide | A plan setback and/or end offset for each unresolved in-plane direction; orientation only if no mating edge fixes it | Its seat elevation and both complementary gaps to opposite edges |
| A spindle mounts against an upright and is centered front-to-back | The verified centered relationship; one elevation reference if the mount leaves vertical sliding free | Equal centering gaps, another flush-face dimension, and all spindle cutting features |
| A shim fits between two beveled spindles | Let the matching faces explain horizontal fit; identify the intended shoulder alignment if vertical sliding remains ambiguous | Bevel angles already defined by the finished shim or an unrelated overall railing height |
| Foundation pieces are laid out over treads arranged on the floor | Only the independent plan offsets to named exact edges in the SVG tread template | A tread-thickness elevation adjustment, seam-stroke width, or a measurement to the inset 3D shadow |
| A post or support has a setback from a tread edge | One true plan offset to the named physical tread edge or its exact SVG plan reference, plus only independent elevation/orientation information still needed | A measurement to the inset footprint edge or every authored construction parameter |
| A caster plate is fixed beneath a beam but can move along it | Plate-to-beam-end setback and any unresolved lateral alignment | Wheel outline distances, an already established mounting-face height, or unmodeled bolt/hole positions |
| All suitable references are hidden or the relationship is compound | An explicit request for a section/additional datum, with the 3D preview available for context | Guessed hidden anchors, projected "true" angles, or a success-shaped empty drawing |

These are decision examples, not part-name-specific drawing templates. In
particular, a stopped notch or shaped mating joint may already establish an
offset that would need a dimension on a simple rectangular part. Do not repeat
all authored coordinates just because they exist in the model.

The design is successful when a builder can identify the selected occurrence,
find the named physical references, and establish every otherwise ambiguous
position/orientation using the finished part and the displayed instructions.
It should also be clear which fits need no measurement, which context has been
elided, and which relationships the available views cannot yet explain.

## Retained part-model API

`model.js` retains the physical geometry classes; `parts.js` provides tree
nodes, manufacturing-description helpers, and a headless `PartBrowser`.
`main.js` connects it to the tabs and occurrence selection, while `part-description.js`
formats manufacturing data independently of the DOM.

`part-list.js` retains manufacturing-based inventory identity internally.
`inventory.filter({ moduleNumber = null, subset = "", stockKey = "" })`
returns sorted `{ entry, location }` occurrences, `{ entry, locations, title }`
groups, and a `uniqueCount`. Module, subset, and stock filtering happens
at occurrence level before counting unique specifications;
it does not mutate the inventory. Each group retains only the matching
occurrences and a scoped title, which drive row quantities, model visibility,
selection highlighting, and Details. `group.entry.quantity` retains the
whole-model count. Find operates on these groups without invoking filtering.
`PART_SUBSETS` exports the dropdown keys and labels; each inventory location
retains its immutable `subsets` memberships. Unknown subset keys are rejected.
The controller sums `model.estimateNodeWeightLb(location.id)` for the matching
occurrences to produce the filtered wood-weight summary.

Wooden components expose `createStockGeometry()` for finished geometry in their
manufacturing coordinate system. Positions are normalized to the cutting blank's
origin; normals are rotated with the geometry, while material, grain, and physical
shape remain unchanged. Footprint boards use their own length edge to undo step
placement. Uprights use their original notched/dadoed stock before its assembly
transform. This API does not change assembled geometry, bounds, or weights.
`getStockAxes()` returns the stock X/Y/Z unit axes expressed in the owning
step's local renderer coordinates, before any world placement or explosion.
The same footprint basis is used to normalize stock geometry and name its views.

Every `buildStairway()` result has a `partTree`. Each `PartNode` exposes
`id`, `key`, `name`, `kind`, `component`, `parentId`, and ordered `children`.
Nodes and child arrays are immutable views, but `component` refers to the
actual modeled object rather than a copied part. IDs are deterministic paths
of role keys, for example:

```text
stairway
  module-1                         Module 1
    step-1-leftCaster              Caster (hardware leaf)
    step-1-rightCaster             Caster (hardware leaf)
    step-3-leftRearCaster          Caster (hardware leaf)
    step-3-rightRearCaster         Caster (hardware leaf)
    leftSupportBeam                Beam - caster left
    rightSupportBeam               Beam - caster right
    step-2-supportCrossPiece       Beam - cross
    step-3-supportCrossPiece       Beam - cross
    step-3-rearSupportCrossPiece   Beam - cross rear
    step-2-leftSupportBlock        Attachment block - upright left
    step-2-rightSupportBlock       Attachment block - upright right
    step-3-leftSupportBlock        Attachment block - upright left
    step-3-rightSupportBlock       Attachment block - upright right
    step-2-leftUpright             Upright - front left
    step-2-rightUpright            Upright - front right
    ...                            Remaining front and rear uprights
    step-1-southCrossPiece          Tread support - front
    step-1-frontStepSupport         Tread support - first-step front (eight or nine steps only)
    step-1-rearStepSupport          Tread support - first-step rear (eight or nine steps only)
    step-1-riser                    Riser (plywood leaf)
    step-1-tread                    Tread (plywood leaf)
    step-2-southCrossPiece          Tread support - front
    step-2-northCrossPiece          Tread support - rear
    step-2-rightStepSupport         Tread support - right
    step-2-leftStepSupport          Tread support - left
    step-2-riser                    Riser (plywood leaf)
    step-2-tread                    Tread (plywood leaf)
    step-3-leftBackSupportBlock     Attachment block - rear support left
    step-3-rightBackSupportBlock    Attachment block - rear support right
    ...                            Remaining physical parts
```

Display names put the part family first, followed by qualifiers after ` - `,
so related parts sort together (for example, **Beam - caster left** and
**Beam - cross**). A single upright spanning the front and rear positions is
named **Upright - full left**. Generated step/module context follows the name;
role keys, occurrence IDs, and manufacturing grouping are independent of names.

The outline shows the default three-step first module. Every module directly
owns all its physical parts, with no foundation or step-assembly nodes.
Geometry and step numbering are unchanged. Step-owned leaves retain their step
number in their occurrence keys, while module beams have no step number.
Front and rear casters belong to the module's first and last steps.
Rear uprights occur only on the last step, with one rear support cross-piece
per module; front support cross-pieces occur on every step except step 1. The full ID is the
slash-separated path, not the indentation or the display name. IDs identify
roles in a particular topology; they are not permanent inventory identifiers
across redesigns.
The flat hierarchy includes `Step.parts.uprights.boards` without changing the
model's separate upright geometry and visibility grouping.
Modules above the first also own `leftSupportBeam` and `rightSupportBeam`
lumber leaves, for example `stairway/module-2/leftSupportBeam`.

| API | Result |
|---|---|
| `tree.root` | Implicit stairway node; its children are the top-level module list |
| `tree.getNode(id)` / `tree.hasNode(id)` | Resolve an ID, or check whether it exists; resolution throws for unknown IDs |
| `tree.getChildren(id = tree.root.id)` | Immediate children in construction order |
| `tree.getAncestors(id)` | Ancestors ordered from root to immediate parent |
| `tree.getLeaves(id = tree.root.id)` | Descendant physical leaves, including the selected node itself if it is a leaf |
| `tree.getStockViews(id)` | Six `{ name, direction, surface }` records in `PART_VIEW_NAMES` order; each direction is a signed stock-axis unit vector, with `surface` identifying a `face`, `edge`, or `end` of the original stock; throws for groups or parts without stock axes |
| `node.getDescription()` | Fresh manufacturing data for a wood leaf or product details for hardware with `getPartDescription()`; `null` for groups or leaves without a description provider |
| `board.getManufacturingDescription()` | The same manufacturing data without the node's functional name and ID |
| `model.createNodeGeometry(id, explosion = 0, moduleExplosion = 0)` | Geometry of exactly that subtree, with existing world placement and view transformations |

`createNodeGeometry()` ignores global checkbox state. The lower-level
`createGeometry(visibility, explosion, moduleExplosion, nodeId = null)` can
intersect a subtree with the existing visibility filters when explicitly
requested. Omitting the fourth argument preserves the original whole-model
behavior. Neither operation changes selection state, dimensions, weights,
or camera framing; full-model geometry remains available for bounds.

### Stock and manufacturing descriptions

`Board` accepts optional `stock` metadata in addition to its dimensions and
material. Lumber stock records `kind: "lumber"`, actual `thickness` and
`width`, and optionally `nominalSize`. Plywood stock records
`kind: "plywood"` and `thickness`. Standard component constructors supply
their own stock: 1x4 for upper horizontal framing, 2x2 for spindles,
2x4 for separate uprights, pine support beams, lower support cross-pieces,
and spindle shims, wider 2x stock for combined uprights, and
plywood of the appropriate thickness for risers, treads, and siding. A plain, nonstandard
`Board` defaults to its supplied actual cross section without guessing a
nominal lumber size. Stock cannot be thinner or narrower than the board.

A description contains:

- `stock`: source dimensions, nominal size when supplied, and material name.
- `units`: inches for lengths and degrees for angles.
- `cutLength` and `finishedWidth`: analytic cutting-blank extents along X/Z.
  `widthTrim` is `null` unless lumber has been ripped narrower; otherwise it
  reports `from`, `to`, and `removed`.
- `blank`: `length`, `thickness`, `width`, exact stock-coordinate `vertices`,
  planar `faces`, and the two broad-face `profiles` (`negativeY`/`positiveY`).
  Profiles contain `[X, Z]` points and describe the blank before joinery cuts.
- `boundingRectangle`: `{ length, width }` for plywood, otherwise `null`.
- `edgeCuts`: end cuts for lumber, any additional angled width-edge cuts, and
  all four perimeter cuts for current plywood pieces. Each records a name,
  reference axis, exact points, outward plane, `angleFromSquare`,
  `miterDegrees`, and `bevelDegrees`. Parallel width ripping is recorded by
  `widthTrim`, not repeated as an angled cut. Additional finished face
  patches, such as shim side bevels, have `surfaceCut: true`; their exact outlines
  also appear in cutting descriptions and visible-face annotations.
- `notches`: original corner, length, the normalized two-face depth pair, and
  the bevel angle of that depth change.
- `dados`: broad face, start, opening width, depth, and `acrossWidth`.
  Cuts opening at either stock end also have `endNotch: true` and are labeled
  as end notches in part details and annotations. They reuse the broad-face
  cut geometry rather than the edge-corner notch primitive.
- `edgeNotches`: top-opening sheet cutouts, with corresponding two-point
  floor profiles on the negative/positive Y broad faces. Profiles use `[X, Z]`
  stock coordinates and capture bevels through the sheet thickness.

The blank's minimum coordinate on each stock axis is zero. A plane uses
`normal dot point = offset`; the remaining blank lies on its lesser-or-equal
side. Finished surface-cut planes apply only to their outlined patches,
allowing multiple facets rather than a single cut through the entire blank.
Faces have outward vertex winding. Angle zero means a square cut.
Miter sign follows the outward normal's component on the other broad-face
axis (Z for a length cut, X for a width cut); bevel sign follows its Y
component. Notch bevel sign instead follows increasing cut depth from
negative Y to positive Y, matching the normalized notch depth pair.
The exact planes/profiles disambiguate mirrored and compound cuts.

For example, the default lowest front step support reports 1x4 pine
stock and its full 3.5-inch finished width. The default first tread's bounding
blank is approximately 13.3304 by 25.0745 inches. Its stock length and veneer
grain follow its right edge; the nonparallel left edge also needs an angled cut.
Later treads retain parallel left and right sides, leaving those edges
square and requiring only two miter cuts, at the front and back.
The API retains full precision; these numbers are
rounded here only for illustration. Combined meshes and Float32 vertex
buffers are not the source of manufacturing dimensions.

These are descriptions of the modeled pieces, not a fabrication-ready cut
schedule. Kerf, allowances, stock purchase lengths, sheet nesting, fastening
details, and unmodeled construction are not inferred.

### Headless navigation

```js
import { createInitialModel } from "./model.js";
import { PartBrowser } from "./parts.js";

const model = createInitialModel();
const browser = new PartBrowser(model.partTree);
browser.children; // Module 1 through Module N.
browser.navigate(browser.children[0].id); // Module 1.
browser.navigate(browser.children[0].id); // Step assembly 1.
browser.childrenAreParts; // false; frame subassemblies and plywood parts are mixed.
browser.select(browser.children.find(node => node.key === "tread").id);
browser.navigate(browser.children.find(node => node.key === "bottomFrame").id);
browser.childrenAreParts; // true; boards, uprights, and hardware are selectable.
browser.select(browser.children.find(node => node.key === "leftUpright").id);
const description = browser.description;
const assembly = model.createNodeGeometry(browser.currentNode.id); // Bottom frame including uprights and casters.
const part = model.createNodeGeometry(browser.selectedNode.id); // Selected upright only.
browser.up(); // Step assembly 1; clears part selection.
browser.reset(); // Stairway root; children are modules again.
```

`currentNode`, `children`, `childrenAreParts`, and `path` describe the current
assembly. `children` orders internal nodes before leaf parts, preserving order
within each group. `path` includes the root and current assembly, but does not change
when selecting a part. `selectedNode` is the selected part or `null`;
`description` is that part's report or `null`. `navigate(id)` supports direct
navigation and clears selection. `select(id)` only accepts parts in the current
child list, whether mixed or parts-only; internal nodes cannot be selected.
`clearSelection()` clears the selected part without navigating.
Invalid IDs or out-of-context selection throw without changing state.
`up()` at the root remains at the root.

For a navigated leaf, `children` returns that leaf itself and
`childrenAreParts` is true, implementing the virtual one-part assembly without
modifying its actual tree children. Any list containing an internal node has
`childrenAreParts` false, but its direct leaf children are still selectable.

Call `browser.setTree(rebuiltModel.partTree)` after a parameter rebuild.
If the step/module topology and IDs still match, navigation and selection are
retained but reference the new component instances. Changing step count,
regrouping modules, or removing the current assembly resets to the module list.
Removing only the selected part clears selection but retains the assembly.
No DOM, WebGL context, or implicit model regeneration is needed for navigation
and descriptions. Selection colors are applied only to copies of render
geometry in the controller; model stock colors, geometry, and weights are
unchanged.

Future leaf components can supply `partKind`, an explicit `name`, and
`createGeometry()` without pretending to be lumber or plywood. An optional
`getManufacturingDescription()` supplies their detail data; its absence does
not fabricate wood stock properties. Current subassembly ownership uses
`boards`; future assembly kinds should register their ownership/names in the
tree builder rather than being inferred from mesh geometry.

## Fixed requirements

```js
const TOTAL_HEIGHT = 77;
const INNER_ARC_LENGTH = 60.5;
const INNER_RADIUS = INNER_ARC_LENGTH * 2 / Math.PI;
const FRAME_THICKNESS = 0.75;
const FRAME_WIDTH = 3.5;
const RISER_THICKNESS = 1 / 4;
const TREAD_THICKNESS = 1 / 2;
const FLOOR_CLEARANCE = 1;
const CASTER_HEIGHT = 5;
const SUPPORT_NOTCH_DEPTH = 1 / 2;
const UPRIGHT_THICKNESS = 1.5;
const SUPPORT_BEAM_THICKNESS = 1.5;
```

The stairway turns exactly 90 degrees. Its reference inside edge is a
quarter-circle with an arc length of exactly `60.5`, so:

$$
R = \text{INNER_RADIUS}
  = \frac{60.5}{\pi/2}
  = \frac{121}{\pi}
  \approx 38.5155
$$

The total height from the floor to the castle top is exactly `77`. The castle
is another stage prop, previously called the upper landing; it is not part
of the modeled stairway.
`INNER_RADIUS` is the required distance from the arc center to the nearest
point of every tread: the midpoint of its straight left edge. Each left edge
is tangent to the castle's reference cylinder, rather than a chord through it.
For `n` steps, the builder derives the inner-corner radius
`cornerRadius = INNER_RADIUS / Math.cos(Math.PI / (4 * n))`.
The model exposes both `innerRadius` (fixed clearance) and `cornerRadius`
(step-count-dependent geometry); `outerRadius` is `cornerRadius + stairWidth`.

## Stairway parameters

The assembly is described by:

```js
buildStairway(stairWidth, stepCount, moduleCount, spindleShoulderAscent)
```

| Parameter | Meaning | Default | Slider range |
|---|---|---|---|
| `stairWidth` | Constant radial width of every step | `24` | `20` to `36`, in `0.25`-inch increments |
| `stepCount` | Number of modeled steps, an integer of at least four | `9` | Integers `7` to `9` |
| `moduleCount` | Number of modules; normal group size is derived and the bottom module takes any remainder | `3` | Integers `2` to `3` |
| `spindleShoulderAscent` | Vertical ascent of spindle notch shoulders above the step-support baseline; spindle tops are 2 inches higher, and level shim tops meet the lower adjoining shoulder with bottoms 4 inches below | `32` | `25` to `37`, in `1`-inch increments |

`stepCount` and the term `stairCount` used in discussion refer to the same
quantity. This document uses `stepCount` consistently.
The module slider is capped at three throughout the seven-to-nine-step range.
Each module needs at least two steps; the lowest module has no additional
minimum-size restriction.

## Casters and mounting woodwork

The stairway is a movable stage prop. Each module has four casters mounted
directly beneath the ends of two flat pine 2x4 support beams. Flat pine 2x4
support cross-pieces transfer front-upright loads onto those beams, except at
the unresolved lowest step. The pine rear uprights follow the side boundaries,
with their back corners meeting the rear radius. The outside faces of the right-hand uprights provide the modeled banister
spindle mounting surfaces. Their bolts and the handrails are not yet modeled.

### Selected reference hardware

[Castrek 4-inch locking swivel casters, Amazon ASIN B0C2Q7NY31](https://www.amazon.com/dp/B0C2Q7NY31).
The following specifications were supplied by the user from the listing's
size guide and screenshot; they have not been independently verified.
The nominal 4-inch size refers to wheel diameter, not installed height.

| Specification | Value |
|---|---|
| Overall installed height, floor to top mounting face | `5.11 in` (`13 cm`) |
| Wheel diameter | `3.93 in` (`10 cm`), nominally 4 inches |
| Wheel tread width | `1.25 in` (`3.2 cm`) |
| Top mounting plate | `3.74 x 2.48 in` (`9.5 x 6.3 cm`) |
| Bolt-hole center spacing | `2.95 x 1.77 in` (`7.5 x 4.5 cm`) |
| Advertised load capacity | `2,200 lb`, interpreted as the four-caster set rating |

On that set-rating interpretation, nominal capacity is `550 lb` per caster,
or `1,650 lb` counting only three supporting casters. The latter allows for one
caster being unloaded on an uneven floor; it is not a separate manufacturer
rating or a complete dynamic-load/stability assessment.

For context, the current default wooden stairway is approximately `248 lb`,
with the heaviest module approximately `100 lb`. These estimates include the
support cross-pieces, attachment blocks, flat beams, siding, back panels,
newel blocking, and oak spindles, shims, and newel but exclude all caster hardware weight. The working planning allowance
is up to `200 lb` for a finished module including cladding and banister, and
approximately `800 lb` with two people. Those are estimates, not measured
finished weights. Do not credit adjacent modules with carrying part of that
load when choosing caster capacity.

### Mounting elevations and estimated clearances

For planning, `CASTER_HEIGHT` is deliberately rounded to **5 inches**, rather
than the reference hardware's 5.11 inches. Tread heights and wood dimensions
use this modeled floor datum. Installing 5.11-inch casters instead raises the
entire assembly by 0.11 inch, including the uprights and beam tops;
no compensating cuts are needed or modeled.

All elevations below are measured from the modeled flat floor, using this
5-inch caster height. `FLOOR_CLEARANCE = 1` applies to the first riser,
siding bottoms, and extended right uprights.

| Feature or clearance | Nominal value |
|---|---|
| Caster mounting face / underside of flat support beam above floor | `5 in` |
| Top of flat support beam above floor | `6.5 in` |
| Top of support cross-piece / bottom-notch shoulder above floor | `8 in` |
| Bottom of left uprights above floor | `6.5 in` |
| Bottom of right front/rear uprights above floor | `1 in` |
| Bottom of left uprights above caster mounting face | `1.5 in` |
| Wheel axle above floor, estimated as half the wheel diameter | `1.97 in` |
| Top of wheel above floor | `3.93 in` |
| Mounting face above top of wheel | `1.07 in` |

The flat support beam sits above the modeled `5 in` mounting face, so its
thickness and fastening access require additional space. The modeled `1.07 in` above
the wheel is occupied in part by the fork and swivel head; it is not free
clearance for framing. The wheel also overlaps the base framing's vertical
height range, so horizontal clearance from the framing must be provided.

The caster's swivel-axis-to-axle offset, full swivel/brake sweep, plate
thickness, hole diameters, and brake operating clearance are not specified.
Wheel dimensions alone therefore do not establish a safe corner setback or
clearance from neighboring modules. Any initial visualizer representation of
the fork, swivel, brake, and their clearance envelopes will be approximate;
confirm those measurements before finalizing the corner construction.
Allow room for the actual bolts, washers, nuts, and tool access, with mounting
block dimensions and fastener edge distances determined separately.

### Rough caster geometry

`Caster(east = 0, north = 0, heading = 0)` creates an illustrative hardware mesh with its
wheel touching the floor and its plate's top at `CASTER_HEIGHT = 5`.
`CASTER_DIMENSIONS` holds the documented installed height, wheel diameter and
tread width, and plate length/width. A faceted orange torus represents the tire;
a silver disc represents the hub. Two triangular metal fork sides, an axle,
a short swivel cylinder, and a rectangular mounting plate complete the model.
Zeroed grain attributes give the hardware solid colors without wood texture.
Bolt holes, brake details, and swivel motion are omitted.

The unknown plate thickness (`0.12 in`), swivel height (`0.30 in`), fork thickness
(`0.12 in`), and axle offset (`0.55 in` toward the module back) are visual estimates,
not fabrication or swept-clearance dimensions. Cached local meshes are copied,
rotated by the heading in radians, and translated for each caster.

Each module has four casters, one beneath each end of each flat pine beam.
The plate length follows the beam; its width is centered across the
3.5-inch beam width, leaving `0.51 in` at each side. The nearest plate edge
is inset `1/8 in` from its beam end. Front and rear headings point the estimated
wheel offsets inward along the beam. The wheels touch elevation zero, while
the plate tops meet the beam undersides at the modeled `5 in`. These positions are
illustrative, not approved fastening locations or edge distances. Regrouping
modules relocates all four module-end casters; there is no extra step-2 pair.

The bottom frame keeps `hardware.leftCaster`, `hardware.rightCaster`,
`hardware.leftRearCaster`, and `hardware.rightRearCaster`
separate from `boards`, so wood-volume weight estimates remain unchanged.
Casters are selectable hardware leaves alongside the mounting woodwork and
follow all step/module transforms and the Parts module/type filters.
They do not offer woodworking stock views or manufacturing annotations.
Their part-details page instead shows the reference product's specifications,
an Amazon link, and an isolated interactive 3D view. Drag or use arrow keys to
rotate; scroll, pinch, or use plus/minus to zoom; Home resets the view.
`Caster.getPartDescription()` supplies this product information separately from
woodworking manufacturing descriptions.

### Direct mounting and first-step support

The former front/rear caster platforms, upright reinforcement blocks, four
oak links, and extra step-2 casters are removed. All modules now use the same
flat-beam and directly mounted caster arrangement. All uprights are pine,
including at module fronts and backs.

Step 1's lower support cross-piece and upper back step support remain omitted.
With eight or nine steps, a separate **Tread support - first-step front** lies flat beneath
the first tread, extending to both side edges. Its front edge butts against the riser's
back face at local North `RISER_THICKNESS = 0.25` inch; its back edge is at
`3.75` inches. Its angled left end follows the tread's side plane without dados.
Its angled right end follows the tread's right-edge plane and is notched around the newel.
It rests on both beam tops at `6.5` inches and meets the tread underside:

| Step count | Pine source stock | Thickness | Upper face |
|---|---|---|---|
| 9 | 1x4 | `0.75 in` | `7.25 in` |
| 8 | 2x4 | `1.5 in` | `8 in` |

Both sizes have an actual face width of `3.5` inches. A matching pine
**Tread support - first-step rear** lies flat across the same beams, parallel to the
front support. Its front edge is immediately behind the newel's rearmost
corner, and its back edge is `3.5 in` farther North. In the default layout
these are approximately `5.6484` and `9.1484 in`.
Its right end follows the tread's right-edge plane, flush with the front
2x6 cross-piece's right end.
Its left end extends to the tread's left edge and is mitered clear of
step 2's pine support cross-piece wherever their height ranges overlap.
That pine cross-piece and step 2's riser remain unchanged. Both pine supports rest at
`6.5` inches and meet the first tread's underside. Other step counts and all
later steps omit these two parts.

The on-edge **Tread support - front** uses pine 2x6 stock, with an actual
`1.5 x 5.5 in` cross section. Its top retains its previous elevation.
For eight or nine steps it spans `1` to `6.5` inches, with its top against
the flat front support's underside.
Without a front step support its top remains flush with the tread underside.
Its straight back face is at local North `RISER_THICKNESS + 1.5 = 1.75` inches,
fitting a stopped bevel on the newel's front-inner corner. The cross-piece
has no V-shaped notch.
The left beam begins behind this
cross-piece; the right beam also butts against that cross-piece.

Step 1 has no vertical uprights or edge-on 1x4 side supports in any
step-count configuration. The **Newel block - inner** remains alongside
the post, ending square at the first step-2 siding or spindle obstruction.
It is a top-frame part, not a member of the Uprights visibility category.

Step 2's riser ends at step 1's tread underside, giving `1/2` inch of overlap
measured from the tread top. Its uprights
sit behind the riser without riser rebates. Rounded regular rises make both
heights quarter-inch measurements. In the default nine-step layout its lower
edge is at `7.25` inches, clearing the flat beams by `0.75` inch. The step slider remains capped
at nine; a tenth step would leave no clearance between the first tread and
the beam tops.

The support cross-pieces and overall load transfer still need structural review.
This is an incomplete structural model, not construction approval.
Final caster positions will be determined experimentally with actual hardware;
bolt holes, fasteners, and swivel clearance envelopes are not modeled.

### Modeled rear uprights

Only the last step assembly of each module receives rear supports.
Separate `leftRearUpright` and `rightRearUpright` parts are full-width pine 2x4s, with their
broad outer faces following the step's corresponding outer side boundaries.
Their backmost corners meet the rear radial boundary without extending beyond it.
If the untrimmed left front and rear uprights meet or overlap along their
common side plane, replace both with one **Upright - full left**, retaining
the `leftUpright` role key and omitting the separate `leftRearUpright` part.
Its thickness and height are unchanged; its width is the rectangular union
of the original footprints. It is pine, cut from the smallest fitting dressed
2x6, 2x8, or 2x10 (`5.5`, `7.25`, or `9.25 in` wide). Manufacturing details
report the finished-width rip from that source stock. A real gap leaves both
full-width pine boards separate.
The default nine-step layout combines each module-back left pair into a
2x8; seven- and eight-step layouts keep the pair separate. The front-right
upright remains full width.

Both rear uprights have a beveled upper `endFar` notch for the top
frame's back step support, fitted to its front plane. The right rear upright
also has a three-quarter-inch-deep upper `endNear` seat for the right step support.
Separate rear uprights have bottom-open face notches, but no inward platform dados.
The combined board retains the front upright's upper-front notch, fitted
front-edge bevel and inward support notch, and the rear upright's upper-back notch.
Its support notch crosses the combined board's full finished width and opens at the bottom end.
It is counted and weighed only once. Separate rear uprights have matching
half-inch-deep bottom notches for the rear pine support cross-piece. The rear casters mount directly beneath the
beam ends instead of a transverse platform.

## World coordinates and direction

The world origin is the center of the circle containing the inside reference
arc. Horizontal directions are North, South, East, and West; vertical directions
are Up and Down.

Viewed from above:

- The stairway occupies the quadrant between East and North.
- Ascending follows the arc counterclockwise, curving up and to the left.
- Step `0` is the bottom step, at the clockwise end.
- Step `stepCount - 1` is the top step, at the counterclockwise end.
- The front edge of the bottom step lies on the eastward radial boundary.
- The back edge of the top step lies on the northward radial boundary.

Each step's front and back edges follow radial lines from the origin. Left and
right are defined while facing uphill: the left edge is the inside edge, and
the right edge is the outside edge.

## Step footprints

Each step has a straight-sided quadrilateral footprint. The inside and outside
boundaries of the complete stairway are polylines, each containing exactly
`stepCount` segments and `stepCount + 1` vertices.

Use equal angular spacing and a common nominal radial width. Let:

$$
n = \text{stepCount}, \qquad w = \text{stairWidth}, \qquad
\Delta\theta = \frac{\pi}{2n}
$$

The radius used for the vertices is:

$$
R_c = \frac{R}{\cos(\Delta\theta/2)}
$$

For boundary index $j = 0,\ldots,n$:

$$
\theta_j = j\Delta\theta
$$

Using horizontal coordinate pairs `(East, North)`, define the inside and
outside vertices at each boundary:

$$
I_j = (R_c\cos\theta_j,\ R_c\sin\theta_j)
$$

$$
O_j = ((R_c+w)\cos\theta_j,\ (R_c+w)\sin\theta_j)
$$

Step $i$ has the footprint $I_i,\ O_i,\ O_{i+1},\ I_{i+1}$. This vertex
construction defines the intended shape as well as the edge lengths below.

The inside vertices lie on the radius-$R_c$ circle; the outside vertices lie on
the concentric circle of radius $R_c+w$. The straight inside edges are tangent
to the radius-$R$ castle cylinder at their midpoints. Neither boundary uses
curved board edges. Steps 2 onward have identical horizontal
footprints, differing only in elevation and rotation.

Step 1 is an exception: its front-right corner is moved outward along the
unchanged front-edge line until its right edge lies on the line through
$O_1$ and $O_2$. Its other three corners are unchanged. Thus its front, back,
and left edge directions stay the same, while its right edge continues
step 2's right edge. The first tread is wider at the front; with the default
dimensions its front width is approximately `25.9636 in` instead of `24 in`.

The hard `60.5` requirement applies to the reference circular arc. The tangent
inside polyline has total length `2 * n * R * tan(pi / (4 * n))`, slightly
greater than `60.5`; it is not rescaled to have that length.

## Step component parameters

A reusable step is described by:

```js
new Step({ width, leftDepth, rightDepth, height, stepRise })
```

Every step uses the same nominal horizontal dimensions:

$$
\text{width} = w
$$

$$
\text{leftDepth} = 2R_c\sin(\Delta\theta/2) = 2R\tan(\Delta\theta/2)
$$

$$
\text{rightDepth} = 2(R_c+w)\sin(\Delta\theta/2)
$$

These depths are horizontal straight-line distances, not arc lengths or sloping
distances. They describe the regular footprint before the first-step exception.

The step component reconstructs the radial footprint using
`sin(angle / 2) = (rightDepth - leftDepth) / (2 * width)`. This replaces the
variable-width quadratic calculation and does not depend on the stairway's
global radius constant.
It also reconstructs `cornerRadius = leftDepth / (2 * sin(angle / 2))`
for local component and neighboring-step transforms.
The builder passes `extendRightEdge: true` only for step 1, rotating its
outer-edge direction one step angle around the unchanged back-right corner
and intersecting that line with the front edge before constructing any parts.
`stepRise` is the vertical difference between adjacent step-top elevations;
the stairway builder passes the same value to every step.

## Local coordinates and assembly

Each step's local origin is its inside/front/bottom corner. For an unplaced
step, East points across the front edge toward the outside, North points toward
the back, and Up is vertical. Coordinates remain in inches; no unit scaling is
applied.

To place step $i$:

1. Translate its local geometry East by the model's computed `cornerRadius`.
2. Rotate the translated geometry left about the world origin by
   $i\Delta\theta$.

The rotation changes both position and orientation. It is not a rotation about
the step's translated local origin. The local vertical origin remains floor
level; the lower support cross-pieces and left uprights start at the `6.5 in`
beam tops. Right uprights start at the siding bottom, `1 in` above the floor.

The implementation maps East to `+X`, Up to `+Y`, and North to `-Z`. The camera
orbits the assembled model's bounding-box center; the geometry retains its
specified world coordinates.

## Named part: bottomFrame

`Step.parts.bottomFrame` contains the appropriate flat boards for each assembly,
without lower front cross-pieces:

| Board | Cross section | Placement |
|---|---|---|
| `supportCrossPiece` | `1.5 in` by `FRAME_WIDTH`, laid flat | Every step except step 1; pine 2x4 on both beams, fitted into the front upright bottom notches |

Support cross-pieces span `6.5` to `8` inches vertically. Caster hardware
is stored separately from `boards`, on each module's first and last steps;
the flat beams themselves belong to `module.boards`. There are no platforms,
blocks, links, or lower front/rear frame cross-pieces, and the uprights have
no lower-front corner notches.

Future cut plans must specify finished lengths and separate front/back cut
angles for these boards, with angles explicitly measured relative to a square cut.

The frame boards retain their stock dimensions as `Board` components, with
quadrilateral footprints for the angled end cuts. Unnotched cross-pieces
are closed, six-faced solids.
The open interior is not filled by the old simplified solid.
Frames too small to accommodate the specified stock are rejected
explicitly.

`RISER_THICKNESS` defines the separate riser thickness.
`TREAD_THICKNESS` defines the half-inch tread thickness.

## Named part: uprights

Above step 1, `Step.parts.uprights.boards` includes the two front vertical 2x4s, `leftUpright`
and `rightUpright`, and adds `leftRearUpright` and `rightRearUpright` on each
module's last assembly, except when the left pair combines into one board as
described above. Separate uprights have rectangular uncut stock cross sections,
measuring `UPRIGHT_THICKNESS` by `FRAME_WIDTH`, or `1.5 x 3.5`.
All front, rear, and combined uprights use pine.

| Board | Stock cross section | Placement |
|---|---|---|
| `leftUpright` | `1.5 x 3.5 in`, or the combined width from 2x6/2x8/2x10 | Vertical, with its outer face on the left step edge |
| `rightUpright` | `UPRIGHT_THICKNESS` by `FRAME_WIDTH` | Vertical, with its outer face on the right step edge |
| `leftRearUpright` | `UPRIGHT_THICKNESS` by `FRAME_WIDTH` | Module backs only when separate; full-width pine, along the left step edge at the rear radius |
| `rightRearUpright` | `UPRIGHT_THICKNESS` by `FRAME_WIDTH` | Module backs only; full-width pine, along the right step edge at the rear radius |

The left upright's broad west face lies on the left step boundary; the right
upright's broad east face lies on the right step boundary. Each upright's
width follows that boundary's direction. Every front upright has a continuous
full-height bevel at the riser's back plane, local North
`RISER_THICKNESS = 0.25`. There is no additional stopped riser-clearance notch.
Rectangular cutting blanks include the bevel waste. Ordinary and module-last
uprights preserve their former rear endpoints. Step 2's rear endpoints move
slightly forward so its beveled uprights still fit 2x4 stock; adjoining
side supports are refitted to their new rear planes. The uncut stock
outline remains rectangular.

Left uprights start at the beam tops, `CASTER_HEIGHT + SUPPORT_BEAM_THICKNESS`,
or `6.5` inches above the floor. Right front and rear uprights start at
`FLOOR_CLEARANCE`, or `1` inch, flush with the siding bottom. Their
tops are at `height - TREAD_THICKNESS`, level with the tread's underside.
Each upright's vertical length is therefore:

```js
height - TREAD_THICKNESS - bottomHeight
```

Each front upright uses `NotchedBoard` with an `endNear` cut for the upper
front cross-piece and no lower `startNear` cut. Stock length is mapped vertically.
The upper notch runs from the upright top down to the cross-piece's bottom.
It matches the cross-piece's vertical width when that cross-piece meets the
tread underside. Step 1 instead has the notched side supports described above.
The depths on the two broad faces are calculated by intersecting the upright
stock with each cross-piece's back plane. This removes the actual intersecting
wood rather than merely hiding it or shortening the cross-piece. The upper
cut is parallel to the full-height front bevel and extends farther into
the upright for the cross-piece. Depths are derived on each broad face,
accounting for the angled sides.

The first step's upper front cross-piece has its full 5.5-inch vertical width.
For eight or nine steps it sits
below the flat front step support. The beams start behind its back face.

Every remaining front upright and each separate rear upright has an inward-facing
bottom-open face notch for its support cross-piece. Combined left uprights share one notch between
the front and rear cross-pieces. The left openings span floor elevations
`6.5` to `8` inches; the right openings span `1` to `8` inches,
are `SUPPORT_NOTCH_DEPTH = 1/2` inch deep, and leave `1` inch of stock thickness.
The left upright uses its positive-Y stock face; the right uses its negative-Y
face. There are no remaining caster-platform dados.

Separate rear uprights also retain an
upper `endFar` notch meeting the front plane of the back step support,
as well as the lower face notch. The right rear upright also has an upper `endNear`
seat for the right step support. Their full-width placement and conditional
left-pair combination are described in the rear-upright section.

There is no dedicated Uprights hide checkbox. In Parts, upright visibility
follows the module/type filters; Parameters always shows them.
Visibility changes preserve joints, material assignments, full-model wood
weight estimates, and full-assembly framing.

## Named part: riser

`Step.parts.riser` is a separate board included in **Treads and risers** and
**Without cladding** in Parts.
It is edge-on, `RISER_THICKNESS` deep in local North. Its front face is
on the front radial boundary, local North `0`, and its back face is on local
North `RISER_THICKNESS`. It spans the complete front width, from the inside
footprint edge to the outside edge; its ends follow those straight side edges.

Its top remains:

```js
riserTop = height - TREAD_THICKNESS;
```

Step `0` is unchanged: it starts at `FLOOR_CLEARANCE`, one inch above the floor.
Every higher riser has height `stepRise`, regardless of module placement:

```js
riserBottom = height - stepRise - TREAD_THICKNESS;
riserHeight = stepRise;
```

Its bottom meets the preceding tread's underside, giving exactly `1/2 in`
of overlap with that tread. Its back face meets its own step's front cross-piece.
No panel extends down over the preceding back step support or to the beam tops.
Module-last front uprights retain their fitted front-edge bevels; the
vertical 2x2 riser cleats remain absent. Separate stiffening is deferred.

The lowest module's beams pass underneath the second riser without
lower-edge clearance notches.

## Named part: topFrame

`Step.parts.topFrame` contains `southCrossPiece` (Tread support - front) and
`northCrossPiece` (Tread support - rear). Every step except the lowest also has
`rightStepSupport` (Tread support - right). Non-module-last steps above step 1 also
have `leftStepSupport` (Tread support - left). Eligible following steps carry
`leftBackSupportBlock` and `rightBackSupportBlock`, the six-inch vertical
blocks described above. The existing `northCrossPiece` key
and part IDs are retained; its displayed name changes.
Step 1's back step support remains temporarily omitted pending its support redesign.
The cross-pieces and side supports have their tops at
`height - TREAD_THICKNESS`, aligned with the upright and riser tops, to support
the tread.

### End cross-pieces

Both cross-pieces extend to the step's outer side boundaries. Each is
`FRAME_THICKNESS` thick with its broad vertical dimension normally
`FRAME_WIDTH`, making it an edge-on 1x4:

- `southCrossPiece` has its south face against the riser's north/back face,
  at local North `RISER_THICKNESS`. Its north face is `FRAME_THICKNESS` farther
  north, except on step 1, whose pine 2x4 is `1.5 in` thick.
- `northCrossPiece` has its rear face `RISER_THICKNESS` behind the back radial
  boundary except at module backs, where its original position is retained.
  Its front face is offset `FRAME_THICKNESS` toward the step front, so it
  follows the next riser's plane rather than a constant local North coordinate.

Their angled ends follow the side boundaries. The shifted back support extends
past the tread footprint, while the front cross-piece stays inside it.

The usual vertical board width is `FRAME_WIDTH`. The existing lower elevation
limit is retained:

```js
top = height - TREAD_THICKNESS;
rearBottom = Math.max(top - FRAME_WIDTH, FLOOR_CLEARANCE + FRAME_WIDTH);
rearHeight = top - rearBottom;
```

Only step `0` requires this rear reduction with eight to ten steps; with seven
steps, the rear board retains full width. The front cross-piece has
its own floor-clearance limit, independent of the module beams:

```js
frontTop = top - (frontStepSupportStock?.thickness ?? 0);
frontBottom = Math.max(frontTop - FRAME_WIDTH, FLOOR_CLEARANCE);
frontHeight = frontTop - frontBottom;
```

The front cross-piece retains its full width in the slider range. Only step 1
in eight- and nine-step configurations receives `frontStepSupportStock`; its
cross-piece top moves down by that flat board's thickness. Otherwise its top
remains at `top`. Rear board elevations are unchanged. On the lowest step the
front cross-piece ends at local North `1.75` inches. The left beam starts
behind it and the right beam starts behind the newel.

Matching notches in the front uprights accommodate `southCrossPiece`.
These members no longer occupy the same solid volume as their uprights.
Fastener holes and fastening hardware are not modeled.
The next riser ends at the north cross-piece's top elevation, overlapping
only the half-inch tread above it.
At a module back, the cross-piece instead seats in the rear upright notches;
the next module's riser likewise overlaps only the preceding half-inch tread,
without attaching to the preceding module.
The preview is not yet a fabrication-ready joint or cut plan.

### Left and right step supports

All steps except the lowest receive a pine 1x4, on edge, with a
`0.75 x 3.5 in` cross-section. Its outside broad face lies on the step's
straight right edge, and its top meets the tread underside. Its front end
extends three-quarters of an inch into the back of the right-front upright. An upper
`endFar` upright notch removes that three-quarter-inch stock depth over the
support's height, leaving a bearing seat beneath the support.

For steps without rear uprights, the support reaches the back radial
boundary plus the `RISER_THICKNESS` setback. A matching left support follows
the shorter inside edge, with the same stock and front bearing seat.
A top-right (`endFar`) notch in the back step support and a
bottom-back (`endNear`) notch in the right step support make a half-lap.
The left support has the same bottom-back notch, paired with a top-left
(`startFar`) notch in the back support. The half-lap orientation is unchanged.
Each removes half the common `3.5 in` height, so their remaining wood meets
at the same horizontal plane. Notch shoulders follow the actual intersecting
faces, including the angled lengths on both broad faces.

At each module's last step, the right support instead ends three-quarters of an inch
inside the front of the right-rear upright. An upper `endNear` notch in
that upright provides the rear bearing seat. Neither step support needs
a half-lap there; the back step support retains its original rear-upright
joint. No new left support is added at module backs.

Step 2's pine support cross-piece remains at beam-top elevation. Its right step
support therefore needs no bottom-front clearance notch, and the upright's
front bearing seat remains at the normal support elevation.

These cuts appear in stock views, manufacturing descriptions, inventory
patterns, and remaining-wood weight estimates. Both side supports are
step-owned physical parts listed directly under their modules and move with
them. No former full-length lower side boards are restored.

## Named part: tread

`Step.parts.tread` is a separate `Tread` board included in **Treads and risers**
and **Without cladding** in Parts.
It is `TREAD_THICKNESS` thick vertically, with its underside at
`height - TREAD_THICKNESS` and its top at `height`. It rests on the
top-frame members, including the right step support above the lowest
step and matching left supports except at module backs, and covers the riser's top edge.
Its front edge is at local North `0`, flush with the front radial boundary
and the riser's front face.
Its remaining edges follow the step's side boundaries and back radial boundary,
except for step 1's through cutout around the newel.

## Heights and risers

`height` means the vertical distance from the common floor to the horizontal top
of a step. It is not the height of an individual riser or the thickness of a
board.

All regular stair rises, including the rise from the floor to the first tread,
use the same height. Start with `TOTAL_HEIGHT / (stepCount + 1)` and round it
to the nearest quarter inch, rounding halfway cases upward:

$$
\text{stepRise} = \frac{\operatorname{round}(4 \cdot 77/(n+1))}{4}
$$

For step $i$:

$$
\text{height}_i = (i+1)\text{stepRise}
$$

| Surface | Height above the floor |
|---|---|
| Floor | `0` |
| Bottom step, index `0` | `stepRise` |
| Step at index `i` | `(i + 1) * stepRise` |
| Top step, index `n - 1` | `n * stepRise` |
| Castle top, a separate stage prop | `77` |

The castle top is not an additional step in `stepCount`. Only the transition
from the top tread onto the castle can differ from the regular stair rise.
The model exposes this remaining height as `landingRise`, retaining the
earlier landing terminology internally:

```js
landingRise = TOTAL_HEIGHT - stepCount * stepRise;
```

| Step count | Regular stair rise | Rise onto castle top | First tread underside above beams |
|---|---|---|---|
| 7 | `9.75 in` | `8.75 in` | `2.75 in` |
| 8 | `8.5 in` | `9 in` | `1.5 in` |
| 9 | `7.75 in` | `7.25 in` | `0.75 in` |

With the initial nine steps, `77 / 10 = 7.7` rounds to `7.75`. The last tread
is `69.75` above the floor, leaving `7.25` inches onto the castle.
The page reports the regular rise and castle transition separately rather
than displaying a rounded fraction for an unrounded model dimension.
The current preview renders bottom-frame
assemblies, top frames, separate risers, and treads at these step-top heights.
The upright and top-frame tops are `TREAD_THICKNESS` below those heights.
The castle is not rendered.

## Command-line interference checks

From `stairs2`, with Node.js and Rust/Cargo installed:

```powershell
npm run check:intersections
```

This builds the Rust checker once in release mode, exports the six supported
combinations of 7-9 steps and 2-3 modules at the default 24-inch width, and checks
every configuration even if an earlier one fails. Passing XML files are deleted;
failed/error cases remain in `.clash-results` for investigation. An optional
results directory can be supplied with `npm run check:intersections -- DIRECTORY`.

To export and check one configuration:

```powershell
node export-meshes.mjs .clash-results\scene.xml 9 3
cargo run --release --locked --manifest-path mesh-clash\Cargo.toml -- .clash-results\scene.xml
```

The exporter calls `buildStairway()` and uses each retained part's existing
production mesh, including hardware, fully assembled and unexploded. XML contains
`scene` version `1`, `units="inches"`, `space="world"`, and
`axes="east-up-south"`: coordinates are `[East, Up, -North]`. Each `part` has a
stable `id`, readable `name`, and `kind`, with whitespace-separated XYZ triples in
`vertices` and zero-based vertex-index triples in `triangles`. Rust does not
reimplement woodworking shapes or modify the JavaScript/exported geometry.

The checker creates temporary inward-inset meshes with a default **0.001-inch
inset per part**. Append `--inset 0.01` to the checker command to increase it, or
`--inset 0` to disable it. This intentionally ignores tiny overlaps: opposing
flat faces have approximately twice the inset as their allowance. Vertices remain
shared, with at least the requested clearance from their incident original face
planes; sharp corners can lose more material. An inset that collapses or reverses
a triangle is reported as an error rather than silently skipping that part.

Bounding boxes and a tetrahedron hierarchy prune comparisons; signed solid-volume
integration detects overlap and containment while preserving concave notches and
through-holes. Interference reports identify both parts and an approximate overlap
location in world coordinates. The reported effective overlap thickness describes
the inset meshes, not the original parts. A separate numerical roundoff guard
suppresses cancellation residue.

Exit codes are `0` for clear, `1` for interference, and `2` for input/calculation
errors; the sweep returns `2` if any configuration errors. Mesh shells must be
closed, manifold, consistently outward-oriented, and have positive volume after
exact duplicate-position welding. Disconnected shells within a part are supported;
separate inward-oriented cavity shells and self-intersection certification are not.
These checks detect modeled interference, not structural strength or hardware
accuracy.

Run focused exporter, orchestration, geometry, and CLI regressions with
`npm run test:intersections`.

### Test scope

`npm test` runs focused generic board/notch/dado geometry, inventory-grouping,
and camera/input logic tests. These tests use small fixtures rather than encoding
the current stairway design.

For framing changes, use `npm run check:intersections`. Part presence, placement,
dimensions, materials, and visual presentation are reviewed manually; do not add
design-specific regression assertions for them. The collision-tool regressions
remain separate and should run when changing the exporter or checker.
