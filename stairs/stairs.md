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
back support or rear upright. Every step above step 1 has a matching
left support. Step 1 omits both edge-on 1x4 side supports.
Its three ripped supports run fore-and-aft on flat 1x4 carrier cross-pieces: a 1x3 on the
left and two 2x4s beside and behind the newel on the right,
and a right 2x4 newel inner block extends toward step 2's upright.
The riser is a separate piece.
A half-inch tread sits on each top frame, with concentric curved sides,
a radial back edge, and a front edge flush with the front of the riser.
Most framing is pine, including every front and rear upright.
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
Home (`index.html`) has a full-width **WIDT Stairs Project** header.
The content pane has **Stairway**, **Part details**, and **Placement**
tabs, with a collapsible, Parts-only right sidebar. **Hide parts / Show parts**
changes the available content space without clearing selection or filters.
The page uses a simplified three-step staircase SVG favicon.
The Parameters page and its navigation have been removed. The design has
`STEP_COUNT = 9`, `MODULE_COUNT = 3`, and `RAILING_BOTTOM_ASCENT = 32` in
`model.js`. The app uses the source default width of 20 inches; there are no
runtime model controls. The reusable builder still accepts a source width.
Reset view affects the camera, not the model.

Legacy `width`, `steps`, `modules`, and `shoulderAscent` query settings are
ignored and removed. The URL still encodes the selected
content `tab` (`stairway`, `details`, or `placement`), Parts sidebar visibility
(`parts=hidden` or `parts=shown`), and the Module (`module`) and Material (`type`)
filters. `show` independently lists visible Stairway categories, for example
`show=foundation+uprights` or `show=castle+treads+siding`. All categories,
including Castle, are visible by default and the default omits `show`.
An explicit `show=` hides every category. Legacy `subset` is removed;
legacy `castle=shown/hidden` links are normalized to the new visibility state.
`part` identifies the exact installed occurrence,
including its module and step, rather than just its unique manufacturing group.
Default viewer settings are omitted: Stairway, Parts shown, all filters cleared,
and no selected part. Find text, drawing direction, camera position, and split
modules remain local state.

Changes replace the current history entry rather than pushing a new entry.
Refreshing or sharing a URL restores the same fixed model and view. Browser
history navigation also restores the encoded state, with missing viewer settings
returning to their defaults, without rebuilding the model.
Invalid or duplicate viewer settings likewise show an explanation and normalize
to defaults. A part that no longer exists in the model, or is excluded
by the restored filters, clears selection with a notice rather than selecting a
different instance.

The Parts sidebar's **Filter parts** section combines independent Module
and Material filters, initially showing all parts.
These filters narrow both the Parts list and visible model geometry.
Visibility changes preserve the framing scale based on the complete assembly,
so filtering does not rescale the remaining parts.
The Module filter also limits the footprint to that module and makes it the
orbit center. Changing the Module filter clears the pan offset; orientation and
zoom are retained. Material and Stairway visibility controls do not change the orbit center.

**Clear selection** beside the Parts heading removes the part highlight and
restores normal model brightness without changing the filters, Find text, camera,
or active tab. Clicking or tapping empty space in Stairway also clears selection,
as does Escape while the Stairway canvas or Parts list has focus. The button is
disabled when nothing is selected. Clearing removes `part` from the URL and
returns Details and Placement to their empty-selection prompt.

### Siding

Each module has one curved `1/8 in` plywood **Side panel - curved** covering its
right-hand outer side, from `1 in` above the floor to the stepped tread tops.
Step 1 follows a tangent rather than the arc, so it retains two flat pieces,
**Side panel - right front section** and **Side panel - right rear section**,
fitted against the newel's front and back faces. Module 1's curved panel starts
at the front of step 2. All panels use the **Siding** visibility category.

`BentPlywood` stores the developed flat outline and its installed bend. The
neutral surface is halfway through the thickness: the inner layers compress
as much as the outer layers stretch, and developed length is neutral radius
times sweep angle. Framing and treads are fitted inside the panel's inner
surface without the old artificial outward offset or accepted solid overlaps.
The two flat step-1
pieces have no outward clearance: their inner faces lie on the original straight
step edge.

Details' stock-aligned views show the flat cutting pattern; the rotatable
preview, Stairway, and Placement show the installed curve. Curvature is part
of the manufacturing specification, not its placement. Weight uses exact
flat-pattern area times thickness, independent of curved-mesh tessellation.
Curved panels do not supply planar Placement contact/dimension references;
Placement instead shows installed context and directs cutting to Details.
No rigid stock-aligned floor template is shown for a developed curved sheet.

Spindle openings are through-cuts down from the stepped top edge. Each has a
constant-height floor low enough to clear both sheet faces under the spindle's
sloped bottom, rather than a complex milled curved notch floor. These openings
are included in the flat outline, cutting drawings, inventory identity, and
wood-volume estimates. Installed cylinder facets have at most `0.001 in` sag.

### Bottom ribs

Each curved side panel has two stacked horizontal **Bottom rib - curved**
Pieces cut from `1/2 in` plywood, sharing a single Part design. Their outer arcs
follow the panel's inside face; their inner arcs are exactly `1 in` inward radially.
The stack runs from `1 1/4 in` to `2 1/4 in` above the floor; the upper Piece's
top meets the bottoms of the panel support blocks. Their radial ends match the
panel's angular span. Module 1's curved bottom ribs start behind step 1, just like its
curved side panel. Their inner and outer arcs are concentric.

Step 1's flat rear side-panel section uses matching doubled straight bottom ribs
at the same stack elevation, also `1 in` wide per layer. Their front ends meet
the newel post's back face. The tiny **Bottom rib - front section** part is
omitted in both layers; the flat front side-panel section remains.

Bottom ribs are ordinary shared plywood Parts with module-owned or step-owned
Pieces. They participate in inventory, Details, Placement, wood-weight estimates,
and clash checks. They share the **Ribs** category with the elevated panel ribs
and their dedicated support blocks, appearing at the **Ribs** construction stage.
Their legacy siding visibility is retained.

### Elevated panel ribs

Modules 2 and 3 have horizontal **Panel rib** segments cut from `1/2 in` plywood.
Module 1 has no elevated rib. Each segment fits between the facing broad
surfaces of two consecutive right uprights: three segments per level.
The outer arc matches the panel's inside face, with the
inner arc `3.5 in` inward radially. Each upper rib's top aligns with the underside of
the tread supports for its module's first step. In the default nine-step,
three-module layout, module 2's rib spans `29 1/2–30 in` above the floor and
module 3's spans `55–55 1/2 in`.

When the clear gap from a module's caster-beam top to the upper rib's
bottom exceeds `48 in`, a **Panel rib - intermediate** level is centered
halfway through that gap. It uses the same plywood thickness, radial width,
and three-bay segmentation. Module 1 remains excluded.
For the fixed nine-step, three-module layout, module 3's clear gap is `49 1/4 in`;
its intermediate rib spans `30 1/8–30 5/8 in` above the floor.

There are three elevated segments in module 2 and six in module 3 (three
middle and three upper). The doubled bottom ribs are unchanged.

Vertical pine 2x2 **Attachment block - panel rib** parts bear the segment ends.
Each is `3 1/2 in` long, with its top against the rib's underside.
Its `1 1/2 x 3 1/2 in` side face meets the upright's broad face facing the bay.
It sits flush with the upright's outer (right) edge, or as close as possible
while leaving `1/32 in` clearance from the curved side panel.
Interior uprights receive a block on each face where required.
At the upper rear corners of modules 2 and 3, the blocks meet the front faces
of the new rear cross-pieces instead. Those cross-pieces have `1/2 in` deep
top-edge seats for the ribs; the ribs are not notched around the cross-pieces.
At steps 4 and 7, the existing spindle supports instead end at the first
upper rib's underside: they are shortened by `1/2 in`, from `8.5` to `8 in`,
without moving their bottoms. This replaces two otherwise redundant rib blocks.
The upper levels each have five separate blocks; the middle level has six.
These 16 blocks belong to **Ribs**; the dual-purpose spindle supports belong
to **Step framing**. Module 1 has no elevated rib attachment blocks.

The ribs no longer need upright cutouts. Through-cut notches still allow
`1/32 in` clearance around spindles, tread framing, or risers crossing a rib.
Ribs retain analytic arcs and cut geometry in their shared Part definitions;
module-owned Pieces supply the installation and join/split transforms.
They share the Ribs category and construction stage with the bottom ribs,
retain legacy siding visibility, and participate in
inventory, Details, Placement, wood-weight estimates, and clash checks.

### Panel support blocks

Square-cut pine 2x4 blocks (`4 in` long, `1 1/2 in` thick and `3 1/2 in` tall)
run radially inward on edge beneath existing lower cross-pieces.
Their tops attach directly to the cross-piece undersides at `5 3/4 in`;
their bottoms meet the doubled bottom ribs at `2 1/4 in`. No separate ties
are used. The front block attaches beneath the second step's cross-piece,
behind the front caster; the rear block attaches beneath the last step's
front cross-piece, ahead of the rear caster.
Module 1 omits its front block because the rear newel block already reinforces
that area.

Both corners of each block's short outside end meet the panel's outer arc.
Its `4 in` length extends inward, giving nearly `6 sq in` of top-face contact
with the cross-piece. All blocks share a square-cut Part; they
belong to the Ribs category and construction stage and follow support-beam visibility.

### Rail-free foundation and plywood rib patterns

The inner and outer plywood base rails are removed. Lower cross-pieces bear
directly on the caster beams: beams occupy `4.25-5.75 in`, cross-pieces
`5.75-7.25 in`, and posts start at `7.25 in`. Tread elevations remain
unchanged. Caster mounting faces meet the beam undersides directly, without spacers.
Step 1 instead has two flat 1x4 carrier cross-pieces at `5.75-6.5 in`,
supporting its three ripped fore-and-aft boards at `6.5-8 in`.
The `innerBaseRail` and `outerBaseRail` installed roles no longer exist.

Unlike `BentPlywood`, `ProfiledPlywood` stays flat. Panel ribs are authored as a
construction recipe: start with a rectangular blank, trim the two upper corners
to form a trapezoid, cut the concentric arcs, then the rectangular clearances.
Cuts entirely outside the retained rib are omitted.
Each trapezoid side is authored as a radial guideline through C and a signed
perpendicular inset toward the retained material. Cut lines and corner coordinates are derived from those
inputs, rather than authored independently.
The original blank and trapezoid can extend beyond the finished outline's
tight bounds. The recipe generates the analytic line/arc perimeter, cutting
annotations, manufacturing identity, and exact material volume; these do not
depend on display tessellation. Arc facets have at most `0.001 in` sag.

Details shows the entire original blank with a dotted outline and overall
dimensions above and left. Callouts locate the two upper triangle-cut vertices
from the corresponding left/right blank edges. Each notch has one
authored reference corner in the cutting-face view (X right, Z down).
Clearance cuts are labeled N1, N2, etc.
Each callout locates that reference using offsets from the
nearest left/right and top/bottom blank edges; an offset on an exact blank edge
is omitted. The same callout gives width along its labeled direction,
height (cut depth) perpendicular clockwise from that direction, and signed angle
from +X toward +Z. A partially clipped notch retains its full rectangular cutting
guide; its reference can lie outside the blank, so coordinates retain their signs.
There are no piecewise dimensions, locating dimension lines, or per-vertex
coordinate lists.

A dotted radius chain starts on the un-notched outer arc and
continues through the shape to near the top of the diagram, with an arrow
toward the circle center **C**. Straight edges that pass through C have matching
dotted extensions, with arrowheads at the same height as the radius arrow.
Each shortened guide is labeled "To C"; labels are arranged around the
arrowheads to avoid overlaps. The recipe supplies both side guidelines directly:
the rear coincides with its cut; the front is parallel to its clearance-offset
cut. The front-cut callout adds "Cut 1/4 in inside radial guide."
The innermost radius sits beside the main arrowhead, not in a separate callout below
the part. Concentric arc cuts share a radial dimension chain wherever their
angular spans overlap: arrows measure the spacing from each outer arc to the
next inner arc, then the innermost radius toward C. Interrupted segments of the
same circle still receive only one radius annotation.
These guides stop short of the off-sheet
center, which does not expand the drawing. Guides break behind annotation
text to keep labels legible.
Small drawing stages retain readable annotation
scale; pan or zoom to inspect the full drawing. Placement uses the broad faces
and authored straight edges as planar references, never artificial arc facets.

The removed base rails have no installed Pieces or Parts category.

### Banister spindles

Each front right upright on steps 2 onward carries an oak 2x2 spindle
(`1.5 x 1.5 in` actual). Each module's rear right upright carries another.
Their inner faces meet the outside faces of separate pine mounts.
Steps 3-9 use vertical **Spindle support - front** 2x2s behind the front posts,
flush with each post's right edge. Five are `8.5 in` long and end beneath the
right tread support; the step-4 and step-7 supports are `8 in` long and end
beneath the first upper panel rib. Their lower ends are unchanged.
All seven vertical supports are classified as **Step framing**, not Banister.
Step 2 and the rear uprights retain fitted 2x4 **Spindle block - front/rear**
mounts, 3.5 inches high and 1.5 inches deep fore-aft.
Spindles meet these mounts' outside faces. No fasteners attach only to a thin post edge.
Bolt hardware and holes are not yet modeled.

The baseline joins the top front-right corners of consecutive front
cross-pieces (the front step supports). Ascent and descent are vertical
offsets from that line. It is continued at the same rise/run past the highest
step for the last spindle. The slope is projected along the upright's
front-to-back stock direction.

Front and rear spindles have different cutting patterns because their
mounting faces have different plan orientations. Each top follows the baseline
slope `2 in` above the spindle shoulder ascent;
matching left/right notches are `1/2 in` deep, leaving a `1/2 in` tongue.
Shoulder ascent is the source constant `RAILING_BOTTOM_ASCENT = 32 in`
(a `34 in` top), not a UI or URL setting.
At the front inner edge, the bottom descends `stepRise + 5 in` below the
baseline, one inch higher than the earlier spindle design without moving
the top or notch shoulders. Its 45-degree cut rises toward the outside, leaving the longer
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

Spindles and shims share the model's **Spindles** category and the Stairway
**Banister** checkbox, along with normal
Parts, stock views, cutting descriptions, and weight estimates.
Handrails are not yet modeled.

### Newel and boxed first-step connection

Step 1 carries an oak **Newel post** cut from actual `3.5 x 3.5 in` 4x4 stock.
Its side faces follow the first tread's straight right edge, tangent to step 2's
outer arc at the shared radial boundary. Its right face is `2 in` outside that line, measured
perpendicular to it. The post is shifted forward along that edge until
its front face passes through the front cross-piece's rear-right corner.
The pine 1x6 cross-piece stays parallel to the tread front; its right end
is flush with the tread's right-edge line, as is the edge-on rear step support.
The cross-piece has a straight, unnotched back edge. Instead, the newel's
front-inner corner has a stopped bevel flush with that back face, only
between the cross-piece's bottom and top elevations. This is a `10 deg`
bevel in the fixed nine-step layout, following the right-edge
orientation. The post remains square above
the joint, and below it wherever the cross-piece starts above the post bottom.
The original oak 4x4 stock blank is retained, with the bevel and shoulder
planes included in the manufacturing description.

The post's square, level bottom is `1 in` above the floor. Its square, level
top has ascent `spindleShoulderAscent + 3 in`, measured at the center of its
back face against the baseline between the actual top front-right corners
of steps 1 and 2's front cross-pieces. The level top has greater ascent at
the front. Changing **Railing bottom ascent** moves only its top, not its
footprint or bottom. This ascent is a source-only constant, not a UI control.

The boxed connection adds a pine 2x4 **Newel block - inner**, on edge against
the post's inner face. It extends from the front cross-piece toward
step 2's right upright, parallel to the reshaped tread's right edge.
Its front end is mitered against the straight front cross-piece.
Its rear end is square, stopping at the first
intersection with step 2's siding or front spindle across the block's
full thickness, or at the back of the upright if neither intersects.
It has no top notch and spans elevations `2.25` to `5.75 in`, meeting the
caster-beam top elevation.
The former **Newel beam block** beneath the right beam is omitted.

A separate pine 2x4 **Newel block - rear** runs on edge, parallel to
the newel's side faces. Its front end butts against the newel's back face,
and its square rear end stops before step 2's right upright's plan footprint.
The inner block retains its separate back-end position.
Its rear end also clears the shifted step-2 spindle and siding.
Its left face is against the inner block's right face. It shares the inner
block's `2.25` to `5.75 in` elevations and has square ends.

The former right 1x4 side support is omitted. Both module-1 beams have
front ends mitered to butt against the front cross-piece's back face.
The right beam shifts inward so its outer front corner meets the
cross-piece immediately to the left of the inner block, or farther inward
if required by the right uprights' projected footprints. It retains the
module's beam heading and a square rear cut fitted within the module.
Both front caster plates clear the cross-piece by at least `1/8 in`.
The right front caster is set back an additional `1 in` along its beam.
The left beam retains its lateral position and rear end.

The tread has an exact through cutout for the post. Two separate ripped
2x4 tread supports run beside the post's inner face and behind its back face,
so neither needs a newel notch or an oversized blank with a cutout. The
step-1 siding is fitted around the post, retaining a short front piece and a
rear piece. Both clear the front cross-piece and the fore-and-aft supports.
The post retains the model's **Newel** category and follows the Stairway
**Banister** checkbox. All new pieces participate
in Parts, stock views, mesh export, and wood-weight estimates.

This models the timber arrangement, not a rated railing connection.
Fasteners, holes, and metal connectors are not modeled; fastening details,
connection capacity, and overall stair stability still require verification.

### Rear plywood gussets

Modules 2 and 3 each have one `8 x 8 in` right-triangular, `1/4 in` plywood
gusset at the upper-left rear framing corner. Its back face meets the front
faces of the left rear upright and rear tread support, with its top flush
with the support top. It is inset one inch from the upright's outer edge
to clear the side-support half-lap. Both plates remain inside the existing
module footprints and share one cutting pattern; together they add about
`0.37 lb`. There is no gusset in module 1 and no lower rear gusset.

The gussets follow **Step framing** visibility. There is no rear particle-board
panel. The right-side plywood panel remains; castle attachments are still
conceptual and unmodeled.

Modules 2 and 3 also each have a rectangular `1/4 in` plywood **Rear brace - lower**,
`8 in` high, spanning exactly between the outer edges of their rear uprights
(`19.656 in` at the default stair width). Its bottom bears on the rear cross-beam
at `7.25 in`, and its rear face meets both upright front faces. The two rear
upright attachment blocks move forward `1/4 in` to meet the brace's front face,
retaining full lower cross-beam bearing. These rectangles follow **Uprights**
visibility; the triangular upper gussets still follow **Step framing**.
Module 1 is unchanged.

### Module support beams

Every module has two individual parts,
**Beam - caster left** and **Beam - caster right**, stored in `module.boards`
and listed under its Foundation alongside the uprights and lower framing.
Every module uses pine 2x4s with an actual cross section of `1.5 x 3.5 in`,
laid flat with the 1.5-inch dimension vertical. Every pair spans its entire
module, including step 1 in the lowest module. Their direction bisects the
module's angular span. In module 1, both fronts are mitered against the
`1 in` back plane of step 1's 1x6 front cross-piece. The newel and beam
fronts move forward with that thinner member.
Other modules' square-cut front ends
extend forward until their foremost corner meets the module's first-step
front boundary, with no part projecting outside the footprint.
The rear ends approach the rear radius. Lengths round down to whole inches:
module 1 initially shortens both ends equally by less than half an inch,
then receives the front miters for the cross-piece.
Other modules keep their front ends at the boundary and take all rounding trim at the rear.

The lowest module's beams have no front-top recesses or narrow tongues.
The former matching beam-clearance cuts in step 2's riser are also absent.
Step 1 omits the ordinary upper rear cross-piece; its three separate
fore-and-aft tread supports bear on two flat 1x4 carrier cross-pieces.

Casters mount directly beneath both ends of each beam. The beam bottoms remain
at the modeled caster mounting-face elevation, `4.25 in`, and their tops are at
`5.75 in`. Lower cross-pieces bear directly on these beams.
Left and right front/rear uprights start on the cross-piece tops at 7.25 inches.
Right support beams are inset an additional `3/4 in` toward
the inside of the curve to give their casters more clearance from the siding,
except in module 1 where the newel inner block determines the right beam position.
Each right beam retains its fitted inward placement relative to the
right uprights' plan footprints.
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
lying flat across both caster beams. Its lower face rests at the beam tops,
`5.75 in` above the floor; its upper face is at `7.25 in`.
Its front edge is at local North `0.25 in`, flush with the upper
front step support's front face; its rear edge is at `3.75 in`. This seats both
the plain posts and the full depth of their rear-face attachment blocks.
The beam and posts remain clear of the upper framing.
This includes the module fronts and step 2, where caster platforms formerly sat.
The lowest lower 2x4 cross-piece remains omitted. Step 1 instead uses three
fore-and-aft boards on edge, spanning the `1.5 in` from the flat carriers to its
tread underside: a ripped 1x3 on the left and two ripped 2x4s on the right.

Each cross-piece spans the actual step side boundaries. Its flat top at
`7.25 in` supports the full plain post ends; there are no half-inch post notches.
The overhang beyond each caster beam varies with the step and curvature.

Each module also has a **Beam - cross rear** between its rear uprights.
This is another flat pine 2x4, resting at the same caster-beam-top elevation. Its rear
edge follows the module's rear boundary, with the board extending forward.
Both rear posts bear on its top, without bottom notches. The board is trimmed along the front
cross-piece's rear edge wherever they would overlap, leaving that front piece
unchanged.

These parts replace the load-transfer blocks. **Beam - cross** and
**Beam - cross rear** entries follow the left and right caster beams
in each module's part list. They have individual stock views, cutting dimensions, and wood weights,
and move rigidly with their module when modules are split.

Pine 2x4 **Attachment block - upright left** and **Attachment block - upright right** parts
sit behind the front uprights, with their broad faces against the posts'
broad rear faces. Each is a `3.5 in` length of 2x4, with grain running
left/right, `1.5 in` thickness fore-aft, and `3.5 in` vertical height.
The usual post-contact area is `3.5 x 3.5 in`, not a narrow-edge joint.
Blocks span `7.25-10.75 in` above the floor and have full bearing on the
lower cross-pieces. Small end bevels fit the step side boundaries; there
are no upper clearance notches or tiny three-quarter-inch cut lengths.
Spindle mounts also sit behind the front posts. Only the step-2 right lower
block is ripped to `2.25 in` tall (`7.25-9.5 in`) to clear its spindle mount,
retaining the full `3.5 in` cut length and a `3.5 x 2.25 in` contact face.

On each module's last step, separate **Attachment block - upright rear left**
and **Attachment block - upright rear right** parts meet the rear posts'
broad front faces. They have the same stock dimensions and height, and bear
on the lower cross-pieces. The former long inward-edge blocks spanning front
and rear posts are gone; every post has its own face-contact attachment.
Step 1, which has no lower support cross-piece, has no such blocks.

### Bearing-ended framing

All risers above step 1 have height `stepRise`, running between the undersides
of consecutive treads. This gives `1/2 in` of overlap with the lower tread;
module boundaries do not change the panel height. Step 1 retains its existing
one-inch floor clearance. There are no extended module-last riser panels.

Every step above step 1 has two rotated pine 1x4 front posts: their
3.5-inch faces point front/back and their 3/4-inch edges point left/right.
Most start on the lower cross-pieces at 7.25 inches and finish directly beneath
the upper front 1x4. There is no bearing cap. Posts have no top seats, lower
face notches, or full-height bevels. Their front faces are flush with the
front support at local North `0.25 in`, immediately behind the riser.
The left front posts for steps 5, 6, 8, and 9 instead start at the bottoms
of the extended left supports described below.

Each upper tread frame above step 1 is closed with left and right on-edge
1x4 side supports, including module backs. At the front, each side support
extends into a half-lap with the front cross-piece. Both are cut `1.75 in`
deep: the front cross-piece retains the lower half and bears the side support's
upper half.
At each module's last step, side supports retain their lower halves and
bear the rear cross-piece's upper halves. Rear post ends still bear directly
beneath these rear cross-pieces, without new post notches.
At intermediate steps, rear cross-pieces retain their lower halves and bear
the side supports' upper halves. Both stop at the following post's broad
front face; there are no short side-support tongues or matching post notches.
The front half-laps are unchanged, including on steps 4 and 7: each front
cross-piece overlaps the left support's full thickness rather than butting
against its right/inside face.

Modules 2 and 3 each have a pine 1x4 **Beam - extended left support** in front
of their rear uprights, with its back broad face against both post faces.
Its top is at `30 in` or `55.5 in`, matching the bottom of the module's first
left tread support. That support extends back onto the cross-piece, retaining
only its front half-lap. Its rear tread support is shortened on the left to
butt against the extended support, with no lap or notch at that corner.
The cross-piece's right end has a `1/2 in` deep seat beneath the upper panel rib.
The two later left front posts start at the extended support's bottom and
have fitted `3.5 in` high bottom-edge notches around it, bearing on its top.
Their now-unused lower 2x4 attachment blocks are omitted. These four bottom
seats are the only remaining upright notches.
Fasteners, connection strength, and structural capacity are not modeled.

The former separate upper rear-support cleats are omitted: moving the posts
forward closes that joint directly and leaves no space for those front-face blocks.
Except for the shortened rear supports on steps 4 and 7, the upper front/rear
cross-pieces span the full footprint width, with angled ends matching those
boundaries. Lower cross-pieces support the unraised posts' full end grain.
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
can be detached from one another. The fixed nine steps form exactly
`3 + 3 + 3` in three modules. Other module layouts are no longer supported.
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
unmodeled connections are excluded. Source geometry changes update the estimates;
hiding parts or separating assemblies does not affect them.

**Reset view** and **Split modules** float over the upper-left corner of the
3D panel, above independent **Show** checkboxes and a **Show all** button.
There is no bottom View panel.
Step dimensions and interaction instructions occupy a full-width information
panel below the 3D canvas instead of floating over the model.
Modules are joined by default. Clicking **Split modules** changes its label to
**Join modules** and rotates each module as a rigid unit about the
stairway's world origin, spreading around the fixed 45-degree center of the
arc. Each module's extra rotation is its angular midpoint minus 45 degrees:
front modules rotate clockwise and rear modules counter-clockwise. For the
default three equal modules, the extra rotations are -30, 0, and +30 degrees.
Each module also moves radially outward along its rotated angular midpoint,
traveling one stair-width at full separation. This moves every module away
from the castle, including the middle module, while increasing the gaps
between modules. Clicking **Join modules** restores the assembled quarter-turn stairway.

The **Castle** checkbox toggles a gray cylinder centered at the world origin, with radius
`INNER_RADIUS`, bottom at the floor, and top at `TOTAL_HEIGHT`. It is checked
by default, and visibility is retained in `show`. The cylinder
stays fixed during Split/Join animation. It is not a part, cannot be selected,
and does not appear in Details, Placement, inventory, or weight estimates.
It occludes picking of parts hidden behind it. It is included in clash checks
regardless of the viewer's visibility setting.

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

Part-visibility controls remain live during transitions; geometry settings are fixed.
The camera retains its orientation and relative zoom while fitting the moving
full assembly, including hidden parts. Reset view affects only the camera and lighting.
The increased angular spacing is a visualization, not a change to the stairway's
specified quarter-turn layout or fabrication dimensions.

## Part-browser UI

The script retains a named object tree independently of the combined WebGL
mesh. Home's side panel is a Parts-only inventory, replacing both the former
hierarchical Assemblies browser and grouped Parts inventory. The Parameters
page and its controls have been removed.
The internal tree and manufacturing identity remain
available without exposing assembly navigation in the UI.

In Stairway, clicking or tapping a visible piece selects and scrolls to its
unique-part row, highlighting all matching pieces in the current filter scope.
Picking uses the nearest front-facing triangle in the displayed geometry,
including separated-module positions. Empty space leaves selection unchanged.
Orbit drags, multi-touch gestures, and cancelled touches do not select parts.

The Parts panel starts with an always-visible **Filter parts** section containing:

- **Module:** All modules, then Module 1, Module 2, and Module 3.
- **Material:** All materials, or a stock/material category such as pine 2x4, oak 4x4,
  a particular plywood thickness, or a hardware category. These are not
  manufacturing-specification groups.

The former cumulative Subset selector is removed. Instead, the left side of
the Stairway canvas has independent checkboxes. Any combination can be selected;
none includes another category. All are checked by default, including Castle.
**Show all** checks every box without resetting Parts filters or selection.

| Stairway checkbox | Included parts |
|---|---|
| Foundation | Caster beams, front/rear support cross-pieces, casters, and the special first-step front cross-piece, flat carriers, and edge-on ripped tread supports. |
| Uprights | Front and rear upright posts, their lower face attachment blocks, and lower rear plywood braces. |
| Step framing | Upper cross-pieces, half-lapped tread side supports, rear plywood gussets, vertical 2x2 spindle supports, and framing blocks shared with ribs. |
| Treads | Treads and risers. |
| Banister | Newel post, spindles, spindle mounting blocks, spindle shims, and newel blocks. |
| Ribs | Upper and bottom ribs and their dedicated attachment/support blocks. |
| Siding | Curved and flat side panels. |
| Castle | The fixed castle cylinder, not an inventory part. |

Classification belongs to installed Pieces, not shared manufacturing Parts:
identical blocks can belong to different categories when their installed roles differ.
Dedicated rib blocks belong to Ribs; blocks shared with step framing belong
only to Step framing. Visibility affects only Stairway rendering and picking,
not the Parts rows, counts, weights, Find, selection, Details, or Placement.
Selecting a hidden part in the Parts list remains valid.

**Clear filters** resets Module and Material to All,
updating the list, model, quantities, and weight. It preserves Find
text, valid part selection, Stairway checkbox states, and camera framing. **Clear selection** sits beside
it on the same action row.

The two Parts filters combine. Below the actions, the fixed summary reads **N unique parts (M total)**
and **Weight ~N lb (wood only)** for the matching occurrences. Unique parts
means distinct manufacturing specifications, including stock, finished cut
geometry, and joinery; total counts individual physical pieces, including
hardware. Wood weight excludes hardware and unmodeled items.
Both Parts filters affect these quantities and the wood-weight summary;
Stairway checkboxes do not.

The filter section has a bottom divider rather than a surrounding border.
Below it, **Find** searches within the filtered list,
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
filtered occurrences rather than retaining whole-model step ranges.
Wooden parts also show their estimated total weight in pounds to two decimal
places: the computed weight per piece times the visible item count. Filters
update this row total; hardware says **Weight unavailable (hardware)** rather
than displaying a zero estimate.
Identical parts share a row, with **x N** appended when more than one occurrence is
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
The filters, actions, summary, and Find controls stay fixed; only the results
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
cameras. Empty Parts scopes show no stair pieces, while Castle remains governed
by its checkbox and full-stairway camera bounds are retained.

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
including width, module count, and railing ascent. No static
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

## Part and Piece model

`model.js` retains the construction helpers that calculate blanks, cuts, and
installation positions. Once those cuts are final, `createPieces()` creates or
reuses each canonical **Part** before creating the **Piece** that references it.
These construction helpers are not the installed objects used for rendering.
`part-design.js` owns manufacturing identity, the `PartCatalog`, shared Part
geometry, and rigid-transform helpers. `parts.js` provides `Piece`, `PieceTree`,
manufacturing-description helpers, and a headless `PartBrowser`.
`main.js` connects it to the tabs and occurrence selection, while `part-description.js`
formats manufacturing data independently of the DOM.

Each Part owns an immutable manufacturing specification and description, material,
optional curvature, flat cutting geometry, and finished local geometry. Straight
Parts share the same flat and finished mesh; bent Parts have both representations.
Mesh buffers are shared and treated as read-only; applying a transform allocates
new positions and normals rather than modifying the shared mesh.
`model.parts` is the canonical Part list. Every `module.pieces` entry references
one of these existing Parts and owns its module-relative installation transform,
occurrence ID, role, visibility category, and optional step metadata.

The rendering hierarchy is **Stairway -> Modules -> Pieces**. There are no
step/frame assembly nodes. Rendering composes a module's installed orientation
and join/split transform with each Piece's installation transform, then applies
that result to the Part's finished geometry. The optional step-explosion angle
is also applied during this composition; it never changes Part identity or meshes.

`part-list.js` lists the existing Parts and counts Pieces referencing each Part;
it does not infer or coalesce manufacturing definitions from installed Pieces.
Each inventory entry's `part` is the actual shared Part, not a representative
component. Occurrence metadata supplies quantities, location names, and role aliases.
`inventory.filter({ moduleNumber = null, subset = "", stockKey = "" })`
returns sorted `{ entry, location }` occurrences, `{ entry, locations, title }`
groups, and a `uniqueCount`. Module, subset, and stock filtering happens
at occurrence level before counting referenced Parts;
it does not mutate the inventory. Each group retains only the matching
occurrences and a scoped title, which drive row quantities, model visibility,
selection highlighting, and Details. `group.entry.quantity` retains the
whole-model count. Find operates on these groups without invoking filtering.
`PART_SUBSETS` and immutable location `subsets` memberships remain available
for source-level cumulative inventory queries, but there is no Subset UI.
Unknown subset keys are rejected. `PART_VISIBILITY_CATEGORIES` and
`partVisibilityCategory(piece)` define the independent Stairway categories
using the same installed-role classification; these do not filter inventory.
The controller sums `model.estimateNodeWeightLb(location.id)` for the matching
occurrences to produce the filtered wood-weight summary.

Parts expose `createStockGeometry()` for the shared flat cutting mesh and
`createGeometry()` for the shared finished mesh. Flat coordinates are normalized
to the cutting blank's origin. Details uses these Part meshes directly; Placement
and clash exports use transformed Piece geometry. Curvature belongs to the Part:
a different bend radius or sweep produces a different manufacturing definition.
Stock-view names retain the selected Piece's installation context, but are
computed from its transform rather than a placed component's geometry.

Every `buildStairway()` result retains the `partTree` navigation property, now a
`PieceTree`. Its physical leaves are immutable `Piece` objects exposing
`id`, `key`, `name`, `kind`, `part`, `transform`, `parentId`, `stepNumber`, and empty
`children`. Module navigation nodes reference their `module`; the root and modules
are not manufacturing Parts. IDs remain deterministic paths
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
    step-3-leftRearSupportBlock    Attachment block - upright rear left
    step-3-rightRearSupportBlock   Attachment block - upright rear right
    step-2-leftUpright             Upright - front left
    step-2-rightUpright            Upright - front right
    ...                            Remaining front and rear uprights
    step-1-southCrossPiece          Tread support - front
    step-1-frontStepLeftSupport     Tread support - first-step left
    step-1-frontStepRightSupport    Tread support - first-step right
    step-1-frontStepRightRearSupport Tread support - first-step right rear
    step-1-riser                    Riser (plywood leaf)
    step-1-tread                    Tread (plywood leaf)
    step-2-southCrossPiece          Tread support - front
    step-2-northCrossPiece          Tread support - rear
    step-2-rightStepSupport         Tread support - right
    step-2-leftStepSupport          Tread support - left
    step-2-riser                    Riser (plywood leaf)
    step-2-tread                    Tread (plywood leaf)
    step-3-leftSupportBlock         Attachment block - upright left
    step-3-rightSupportBlock        Attachment block - upright right
    ...                            Remaining physical parts
```

Display names put the part family first, followed by qualifiers after ` - `,
so related parts sort together (for example, **Beam - caster left** and
**Beam - cross**). A single upright spanning the front and rear positions is
named **Upright - full left**. Generated step/module context follows the name;
role keys, occurrence IDs, and manufacturing grouping are independent of names.

The outline shows the default three-step first module. Every module directly
owns all its installed Pieces, with no foundation or step-assembly nodes.
Geometry and step numbering are unchanged. Step-owned leaves retain their step
number in their occurrence keys, while module beams have no step number.
Front and rear casters belong to the module's first and last steps.
Rear uprights occur only on the last step, with one rear support cross-piece
per module; front support cross-pieces occur on every step except step 1. The full ID is the
slash-separated path, not the indentation or the display name. IDs identify
roles in a particular topology; they are not permanent inventory identifiers
across redesigns.
The construction helpers still organize their cut calculations under
`Step.parts.uprights.boards`; these groups only supply Piece roles and legacy
visibility keys during construction. Installed rendering does not traverse them
or call their geometry methods.
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
their own stock: 1x4 for upper horizontal framing and plain uprights,
1x3 for the ripped first-step left support, 1x6 for the deep first front member,
2x2 for spindles, 2x4 for pine support beams, lower support cross-pieces,
attachment blocks, and oak spindle shims, and
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
  planar perimeter cuts for polygonal plywood pieces. Each records a name,
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
- `outline`: for flat arc-cut plywood, an ordered, closed, counterclockwise
  perimeter in stock `[X, Z]` coordinates. Lines are
  `{ type: "line", from, to }`; arcs are
  `{ type: "arc", center, radius, startAngle, sweepRadians }`, with angles in
  radians. This analytic perimeter replaces planar `edgeCuts`; the blank
  remains rectangular. Bounds include arc extrema and volume integrates
  circular segments exactly.
- `construction`: optional recipe for a flat arc-cut panel rib, containing
  `blank: { length, width }`,
  `trapezoid: { left: { angleRadians, inset }, right: { angleRadians, inset } }`,
  `arc: { center, radius }`, optional `innerRadius`, `notches`, and optional
  `openings`. The inner arc shares the outer arc's center. Each trapezoid side has a radial
  guideline from the arc center C, with its direction measured from +X toward
  +Z in the cutting-face view. `inset` is a signed perpendicular distance:
  positive moves the actual cut toward retained material; zero cuts on the
  guideline; negative moves it outward. Both directions point toward +Z.
  The generated cut lines must meet the corresponding bottom corners of the
  original blank and trim nonoverlapping top corners. Top-corner coordinates
  are calculated, not additional recipe inputs. Each
  rectangular cut is `{ reference: [X, Z], width, depth, angleRadians, name? }`,
  using its marked reference corner. Width follows
  `[cos(angle), sin(angle)]`; depth follows `[-sin(angle), cos(angle)]`.
  Rectangular cuts may form enclosed holes, cross the perimeter, or overlap;
  overlapping cuts are subtracted as a union. `ProfiledPlywood` accepts
  either this recipe or a direct `outline` with optional clockwise `holes`,
  not both. Holes must be disjoint and strictly inside the perimeter.
  The manufacturing description includes the recipe, generated outline, and
  hole contours. Exact volume subtracts the holes, and meshes include their
  inner walls without adding walls across triangulation bridges. Blank dimensions
  describe the original rectangle, not a refitted finished bounding box.

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

For example, the default lowest front step support reports 1x3 pine
stock, ripped from 2.5 inches to a 1.5-inch finished width. Tread cutting descriptions retain
analytic concentric arcs, radial ends, and fitted post notches in an enclosing
rectangular plywood blank. Their stock length and veneer grain follow the
step's mid-angle tangent. Step 1 substitutes a straight tangent for the outer arc.
Combined meshes and Float32 vertex buffers are not the source of manufacturing dimensions.

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
retained but reference the new component instances. Regrouping modules
or removing the current assembly resets to the module list.
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
const TOTAL_HEIGHT = 85;
const STEP_COUNT = 9;
const INNER_ARC_LENGTH = 60.5;
const INNER_RADIUS = INNER_ARC_LENGTH * 2 / Math.PI;
const FRAME_THICKNESS = 0.75;
const FRAME_WIDTH = 3.5;
const RISER_THICKNESS = 1 / 4;
const TREAD_THICKNESS = 1 / 2;
const FLOOR_CLEARANCE = 1;
const CASTER_HEIGHT = 4.25;
const SUPPORT_BEAM_BOTTOM_HEIGHT = CASTER_HEIGHT;
const SUPPORT_NOTCH_DEPTH = 1 / 2;
const UPRIGHT_THICKNESS = 1.5;
const SUPPORT_BEAM_THICKNESS = 1.5;
const SUPPORT_BEAM_TOP_HEIGHT = SUPPORT_BEAM_BOTTOM_HEIGHT + SUPPORT_BEAM_THICKNESS;
const SIDING_RIB_THICKNESS = 1 / 2;
const SIDING_RIB_WIDTH = 4;
const SIDING_RIB_BLOCK_LENGTH = 3.5;
```

The stairway turns exactly 90 degrees. Its reference inside edge is a
quarter-circle with an arc length of exactly `60.5`, so:

$$
R = \text{INNER_RADIUS}
  = \frac{60.5}{\pi/2}
  = \frac{121}{\pi}
  \approx 38.5155
$$

The corrected measured height from the floor to the castle top is exactly `85 in`.
The earlier `77 in` measurement was incorrect. The castle
is another stage prop, previously called the upper landing; it is not part
of the modeled stairway.
`INNER_RADIUS` is the radius of every tread's curved left edge and the castle's
reference cylinder. The model exposes `innerRadius` and
`outerRadius = INNER_RADIUS + stairWidth`. The latter is also the curved
siding's inner-face radius. Straight left framing is placed on or outside
the castle's tangent plane at each step's mid-angle; the tread outline and
framing envelope are separate geometric datums.

## Stairway parameters

The assembly is described by:

```js
buildStairway(stairWidth = 20)
```

| Source setting | Meaning | Value |
|---|---|---|
| `stairWidth` | Constant radial width; optional builder argument, not a UI setting | Default `20 in` |
| `STEP_COUNT` | Number of modeled treads | `9` |
| `MODULE_COUNT` | Number of equal three-step modules | `3` |
| `RAILING_BOTTOM_ASCENT` | Spindle notch-shoulder ascent above the step-support baseline; tops are 2 inches higher | `32 in` |

`STEP_COUNT = 9` fixes the design at nine modeled treads; the returned model
retains `stepCount` as reported design information rather than a parameter.
Three modules contain `3 + 3 + 3` steps. Neither module count nor railing
ascent is an API argument or URL setting.

## Casters and mounting woodwork

The stairway is a movable stage prop. Each module has four casters mounted
directly beneath two flat pine 2x4 caster beams. Lower cross-pieces rest
directly on those beams, without plywood base rails or caster spacers.
Two casters support each beam, with centers on its longitudinal centerline.
The full plate remains at least `1/8 in` inside every beam edge
in the fixed nine-step layout.
Flat pine 2x4
support cross-pieces transfer front-upright loads onto those beams. The lowest
step's edge-on ripped supports bear on two flat 1x4 carriers. The pine rear uprights follow the side boundaries,
with their back corners meeting the rear radius. Blocks on the fronts of the
right-hand rear uprights and backs of the front uprights provide the modeled banister spindle mounting surfaces.
Their bolts and the handrails are not yet modeled.

### Selected reference hardware

[CWfutureparts 3-inch swivel casters, Amazon ASIN B0GM477Q4M](https://www.amazon.com/dp/B0GM477Q4M).
The following specifications were supplied by the user from the listing's
size guide and screenshot; they have not been independently verified.
The nominal 3-inch size refers to wheel diameter, not installed height.
The four-caster set includes two braked casters.

| Specification | Value |
|---|---|
| Overall installed height, floor to top mounting face | `4.3 in`, modeled as `4.25 in` |
| Wheel diameter | `3 in` |
| Wheel tread width | `1.25 in` |
| Top mounting plate | `3.62 x 2.5 in` |
| Bolt-hole center spacing | `2.75 x 1.75 in` |
| Mounting slots | `0.44 x 0.33 in` |
| Advertised load capacity | `1,400 lb` for the four-caster set |

Nominal capacity is `350 lb` per caster,
or `1,050 lb` counting only three supporting casters. The latter allows for one
caster being unloaded on an uneven floor; it is not a separate manufacturer
rating or a complete dynamic-load/stability assessment.

For context, the current default wooden stairway is approximately `192.2 lb`,
with modules approximately `59.3`, `61.0`, and `71.9 lb`. The earlier design
was approximately `265 lb`. These estimates include the
support cross-pieces, attachment blocks, flat beams, siding, panel support blocks,
newel blocking, and oak spindles, shims, and newel but exclude all caster hardware weight. The working planning allowance
is up to `200 lb` for a finished module including cladding and banister, and
approximately `800 lb` with two people. Those are estimates, not measured
finished weights. Do not credit adjacent modules with carrying part of that
load when choosing caster capacity.

### Mounting elevations and estimated clearances

For planning, `CASTER_HEIGHT` is deliberately rounded to **4.25 inches**, rather
than the reference hardware's 4.3 inches. Beam bottoms meet the caster mounting
faces at `SUPPORT_BEAM_BOTTOM_HEIGHT = CASTER_HEIGHT`; the flat beams finish at
`5.75 in`. Cross-pieces start at that beam-top datum and their tops support the posts at
`7.25 in`. Newel blocking finishes at the beam-top elevation, `5.75 in`.
Installing 4.3-inch casters with the same beams raises the
entire assembly by 0.05 inch, making the bottom rise slightly greater and
the final rise to the castle slightly smaller.

All elevations below are measured from the modeled flat floor, using this
4.25-inch caster height. `FLOOR_CLEARANCE = 1` applies to the first riser
and siding bottoms.

| Feature or clearance | Nominal value |
|---|---|
| Caster mounting face above floor | `4.25 in` |
| Underside of flat support beam above floor | `4.25 in` |
| Top of flat support beam above floor | `5.75 in` |
| Top of support cross-piece / bottom of plain posts above floor | `7.25 in` |
| Bottom of left uprights above floor | `7.25 in` |
| Bottom of right front/rear uprights above floor | `7.25 in` |
| First-step carrier underside / top above floor | `5.75 in` / `6.5 in` |
| Bottom of left uprights above caster mounting face | `3 in` |
| Wheel axle above floor, estimated as half the wheel diameter | `1.5 in` |
| Top of wheel above floor | `3 in` |
| Mounting face above top of wheel | `1.25 in` |

The flat support beam sits directly on the modeled `4.25 in` mounting face,
with the lower cross-piece directly on top of the beam. The modeled `1.25 in` above
the wheel is occupied in part by the fork and swivel head; it is not free
clearance for framing. The wheel also overlaps the base framing's vertical
height range, so horizontal clearance from the framing must be provided.

The caster's swivel-axis-to-axle offset, full swivel/brake sweep, plate
thickness and brake operating clearance are not specified.
Wheel dimensions alone therefore do not establish a safe corner setback or
clearance from neighboring modules. Any initial visualizer representation of
the fork, swivel, brake, and their clearance envelopes will be approximate;
confirm those measurements before finalizing the corner construction.
Allow room for the actual bolts, washers, nuts, and tool access, with mounting
block dimensions and fastener edge distances determined separately.

### Rough caster geometry

`Caster(east = 0, north = 0, heading = 0)` creates an illustrative hardware mesh with its
wheel touching the floor and its plate's top at `CASTER_HEIGHT = 4.25`.
`CASTER_DIMENSIONS` holds the documented installed height, wheel diameter and
tread width, and plate length/width. A faceted red annular cylinder represents the flat-tread tire;
a silver disc represents the hub. Two broad metal fork sides with rounded lower ends, an axle,
a short swivel cylinder, and a rectangular mounting plate complete the model.
Zeroed grain attributes give the hardware solid colors without wood texture.
Bolt holes, brake details, and swivel motion are omitted.

The unknown plate thickness (`0.12 in`), swivel height (`0.30 in`), fork thickness
(`0.12 in`), and axle offset (`0.55 in` toward the module back) are visual estimates,
not fabrication or swept-clearance dimensions. Cached local meshes are copied,
rotated by the heading in radians, and translated for each caster.

Each module has four casters, two beneath each straight caster beam.
Each center lies on its beam's longitudinal centerline. The plate's long axis follows the
local arc tangent, except the two front casters assigned to step 1 retain
their original headings. Rear casters face backward along that tangent.
A circumscribed disk around each plate provides conservative clearance from
the beam's actual front/rear cut planes. Tangent plates move inward along
the beam until their projected width fits the beam's `3.5 in` width with
`1/8 in` clearance on both sides. The step-1 right-front caster retains its
additional one-inch end setback. The two plates on each beam remain separated.
The wheels touch elevation zero, while
the plate tops meet the beam undersides at `4.25 in`. These positions are
illustrative, not approved fastening locations or edge distances. Regrouping
modules relocates all four module-end casters; there is no extra step-2 pair.

The bottom frame keeps `hardware.leftCaster`, `hardware.rightCaster`,
`hardware.leftRearCaster`, and `hardware.rightRearCaster`
separate from `boards`, so wood-volume weight estimates remain unchanged.
Casters are selectable hardware leaves alongside the mounting woodwork and
follow all step/module transforms and the Parts module/material filters.
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

Step 1's ordinary lower support cross-piece and upper rear cross-piece remain omitted.
Three separate tread supports run fore-and-aft on edge. All bear
on the flat 1x4 carriers and meet the first tread's underside:

| Support | Pine source stock | Thickness | Lower face | Upper face | Gap above carriers |
|---|---|---|---|---|---|
| First-step left | Ripped 1x3 | `0.75 in` | `6.5 in` | `8 in` | `0 in` |
| First-step right | Ripped 2x4 | `1.5 in` | `6.5 in` | `8 in` | `0 in` |
| First-step right rear | Ripped 2x4 | `1.5 in` | `6.5 in` | `8 in` | `0 in` |

The left support is ripped from `2.5 in` to `1.5 in` high and follows the
inner tread-side tangent. The two right supports are ripped from `3.5 in`
to `1.5 in` high and run parallel to the newel: one against its inner face,
the other behind its back face and alongside the first board.
The left and inner-right supports start at local North `1 in`, immediately
behind the deep front 1x6. The right-rear support starts at the newel's back
face. All three end on step 1's rear radial plane, clear of step 2's lower
cross-piece. Their fitted blanks need only straight end cuts, not a newel
notch. Step 2's pine cross-piece and riser remain unchanged.
All later steps omit these three special supports.

The on-edge **Tread support - front** uses pine 1x6 stock, with an actual
`0.75 x 5.5 in` cross section. Raised `0.75 in` from the previous revision,
it spans `2.5` to `8` inches and directly meets the tread underside.
Its straight back face is at local North `RISER_THICKNESS + 0.75 = 1` inch,
fitting a stopped bevel on the newel's front-inner corner. The cross-piece
has no V-shaped notch.
The left beam begins behind this
cross-piece; the right beam also butts against that cross-piece.

Step 1 has no vertical uprights or edge-on 1x4 side supports.
The **Newel block - inner** remains alongside
the post, ending square at the first step-2 siding or spindle obstruction.
It is a top-frame part, not a member of the Uprights visibility category.

Step 2's riser ends at step 1's tread underside, giving `1/2` inch of overlap
measured from the tread top. Its uprights
sit behind the riser without riser rebates. Rounded regular rises make both
heights quarter-inch measurements. In the default nine-step layout its lower
edge is at `8` inches, clearing the ordinary lower cross-pieces by `0.75` inch.

The support cross-pieces and overall load transfer still need structural review.
This is an incomplete structural model, not construction approval.
Final caster positions will be determined experimentally with actual hardware;
bolt holes, fasteners, and swivel clearance envelopes are not modeled.

### Proposed castle attachment hard points

The left side will be attached to the castle during use. The attachment concept
assumes a curved plywood castle wall with wood bracing; both faces are accessible,
and 2x4 backing blocks can be added inside. The lighter framing is modeled;
these castle connections are not yet implemented.

Provide independently removable attachments for each module, with separation
both vertically and along the inside arc to resist sway and rotation. Low
attachment zones should connect to the caster-beam/cross-piece structure; higher
zones should connect to reinforced inner upright/tread-support joints. Do not
attach only to a thin panel or to the narrow edge of a 1x4 upright.
Local blocking or brackets should distribute the bolt loads into the frame.

Use accessible through-bolts, bearing plates or adequately sized washers, and
fitted bearing blocks/spacers at the curved wall. The spacers must bridge the
actual gap without pulling the plywood flat or shifting the stairway into the
castle. Inside backing blocks must transfer loads into the castle's wood bracing,
not merely be fastened to its plywood skin.

The intended restraint path is stair framing to hard point, bolt and backing
block, castle bracing, and castle base. Vertical stair loads should continue
through the stair frame and casters unless a separate bearing connection is
designed. The castle's own stability is part of this load path.
Detached modules still need handling rigidity. Castle restraint can reduce
left-side bracing needed during use, but does not by itself establish the
capacity of thinner posts, their tread-support joints, or the right-side railing.
Final locations, bolt sizes, edge distances, and backing details require the
actual castle framing and connection loads; they are not specified by this model.

### Modeled rear uprights

Only the last step assembly of each module receives rear supports.
Separate `leftRearUpright` and `rightRearUpright` parts use rotated plain pine
1x4 stock. Their backmost corners meet the rear boundary. Both left posts stay
separate; there are no installed combined 2x8 posts. They bear on the rear
cross-piece at 7.25 inches and finish below the rear upper frame. The right rear
post has a separate front-face spindle block. There are no upper seats or
bottom notches.

The alternative of removing each module-back front pair is not modeled.
That would require extending the preceding step's side beams to the rear
posts and supporting the upper front cap with approximately 4.25-inch short
posts. The outer beam needs a new inward chord, not a straight extension of
the current tangent, plus fitted rear bearing connections.

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

Each tread has concentric curved sides and radial front/back ends, with the
step-1 outer-edge exception below. `Step.footprint` is instead a straight-sided
quadrilateral used to fit framing; its inner side is a tangent plane rather
than the tread's inner chord.

Use equal angular spacing and a common nominal radial width. Let:

$$
n = \text{stepCount}, \qquad w = \text{stairWidth}, \qquad
\Delta\theta = \frac{\pi}{2n}
$$

For boundary index $j = 0,\ldots,n$:

$$
\theta_j = j\Delta\theta
$$

Using horizontal coordinate pairs `(East, North)`, define the inside and
outside vertices at each boundary:

$$
I_j = (R\cos\theta_j,\ R\sin\theta_j)
$$

$$
O_j = ((R+w)\cos\theta_j,\ (R+w)\sin\theta_j)
$$

Step $i$ has radial front and back boundaries through these vertices, a curved
inner side at $R$, and a curved outer side at $R+w$. The outer side meets the
siding's inner face; the siding top meets the corresponding tread top, except
at the existing spindle slots. Tread notches fit the actual spindle footprints.

Step 1 substitutes the tangent to the outer circle at $O_1$ for its outer arc.
Its front-right corner lies at radius $(R+w)/\cos(\Delta\theta)$ on the front
radius. The default front width is approximately `20.9027 in` rather than `20 in`.
Its inner edge remains curved, and its newel cutout remains exact.

The combined inner tread arcs have length exactly `60.5`. Straight framing does
not follow their inner chords: the left uprights' outer faces are constrained to
the mid-angle tangent plane, whose distance from the castle center is $R$.

## Step component parameters

A reusable step is described by:

```js
new Step({ width, angle, height, stepRise })
```

Every step uses the same nominal horizontal dimensions:

$$
\text{width} = w
$$

$$
\text{leftDepth} = 2R\sin(\Delta\theta/2)
$$

$$
\text{rightDepth} = 2(R+w)\sin(\Delta\theta/2)
$$

These derived depths are chord lengths between the arc endpoints, not arc
lengths, framing side lengths, or sloping distances. The component receives its
angle explicitly and uses the fixed `INNER_RADIUS` for all placement transforms.
The builder passes `extendRightEdge: true` only for step 1, intersecting the
outer-circle tangent at its back-right corner with the front radius before
constructing the framing and newel.
`stepRise` is the vertical difference between adjacent step-top elevations;
the stairway builder passes the same value to every step.

## Local coordinates and assembly

Each step's local origin is its inner tread arc's front point at floor level. For an unplaced
step, East points across the front edge toward the outside, North points toward
the back, and Up is vertical. Coordinates remain in inches; no unit scaling is
applied.

To place step $i$:

1. Translate its local geometry East by `INNER_RADIUS`.
2. Rotate the translated geometry left about the world origin by
   $i\Delta\theta$.

The rotation changes both position and orientation. It is not a rotation about
the step's translated local origin. The local vertical origin remains floor
level; lower support cross-pieces start at the `5.75 in` caster-beam tops, and the
plain left/right uprights start on their tops at `7.25 in`.

The implementation maps East to `+X`, Up to `+Y`, and North to `-Z`. The camera
orbits the assembled model's bounding-box center; the geometry retains its
specified world coordinates.

## Named part: bottomFrame

`Step.parts.bottomFrame` contains the appropriate flat boards for each assembly,
without lower front cross-pieces:

| Board | Cross section | Placement |
|---|---|---|
| `supportCrossPiece` | `1.5 in` by `FRAME_WIDTH`, laid flat | Every step except step 1; pine 2x4 spanning the side boundaries beneath both plain posts |
| `rearSupportCrossPiece` | Same | Module backs, supporting both rear posts |

Support cross-pieces span `5.75` to `7.25` inches vertically. Caster hardware
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

Above step 1, `Step.parts.uprights.boards` includes the two front vertical 1x4s, `leftUpright`
and `rightUpright`, and adds `leftRearUpright` and `rightRearUpright` on each
module's last assembly. All 22 posts are pine 1x4s, with canonical
stock thickness 0.75 inches and width 3.5 inches. `BearingUpright` maps
stock length vertically, stock width across the step, and stock thickness
fore-aft; stock dimensions are not swapped to fake the installed orientation.

| Board | Stock cross section | Placement |
|---|---|---|
| `leftUpright` | `0.75 x 3.5 in` | Front, near the castle tangent |
| `rightUpright` | `0.75 x 3.5 in` | Front, inside the outer side frame |
| `leftRearUpright` | `0.75 x 3.5 in` | Module backs, separate from the front post |
| `rightRearUpright` | `0.75 x 3.5 in` | Module backs, with a front-face spindle block |

Most posts start at 7.25 inches on the lower cross-pieces. The left front
posts on steps 5 and 6 start at 30 inches; those on steps 8 and 9 start at
55.5 inches, with bottom-edge notches bearing on their modules' extended
left tread supports. Front post tops meet
the front upper cross-piece underside directly; rear post tops meet the rear upper frame
underside. Post length is that bearing elevation minus 7.25 inches. Front faces
are flush with the step framing at local North 0.25 inch.
Four `3.5 in` high bottom-edge openings fit the extended left supports.
There are no intermediate side-support tongue seats.
Rear posts and module-front posts remain
unnotched; there are no post dados or full-height bevels.

The Stairway **Uprights** checkbox controls all posts, their base attachment blocks,
and the lower rear plywood braces independently
of Foundation and Step framing. Parts module/material filters also constrain
which installed pieces are shown, but visibility checkboxes do not filter Parts.
Visibility changes preserve joints, material assignments, full-model wood
weight estimates, and full-assembly framing.

## Named part: riser

`Step.parts.riser` is a separate board added at the **All parts**
construction stage in Parts.
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
No panel extends down over the preceding back step support or to the lower cross-pieces.
The riser attaches to the front upper cross-piece, not a thin post edge;
vertical 2x2 riser cleats remain absent.

The lowest module's beams pass underneath the second riser without
lower-edge clearance notches.

## Named part: topFrame

`Step.parts.topFrame` contains `southCrossPiece` (Tread support - front) and
`northCrossPiece` (Tread support - rear). Every step except the lowest also has
`rightStepSupport` (Tread support - right). All steps above step 1 also
have `leftStepSupport` (Tread support - left). The preceding rear support
meets the next step's front post faces directly, without separate upper cleats.
The existing `northCrossPiece` key
and part IDs are retained; its displayed name changes.
Step 1 omits this ordinary rear cross-piece and instead has the separate
edge-on ripped rear support described above.
The cross-pieces and side supports have their tops at
`height - TREAD_THICKNESS`, aligned with the riser tops, to support
the tread. Front cross-pieces retain their lower halves at the side-support
half-laps; side supports retain their upper halves, with 1.75-inch cut depths.
Rear half-laps bear rear cross-pieces on sides at module backs and sides on rear
cross-pieces elsewhere. Intermediate ends stop at the next posts' front faces,
without tongues or side notches.
The exceptions are the first left supports in modules 2 and 3: these extend
to the new rear cross-pieces, and their original rear supports butt against
them without left-side half-laps.
There are no front bearing caps. Modules 2 and 3 have small front-mounted
upper-left rear plywood gussets. Vertical 2x2 spindle supports
belong to Step framing; retained 2x4 spindle mounting blocks belong to Banister.

### Historical notched-joint implementation

The detailed algorithm notes below describe the former notched-post and
half-lapped frame, not the current bearing-ended design. The current frame
uses the front/rear half-laps described above, with bottom seats only in the
four raised left posts, not the former cross-piece end seats.

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

At the corrected height, no rear reduction is needed with nine steps.
Step 1's back support remains omitted. The front cross-piece has
its own floor-clearance limit, independent of the module beams:

```js
frontTop = top;
frontBottom = Math.max(frontTop - FRAME_WIDTH, FLOOR_CLEARANCE);
frontHeight = frontTop - frontBottom;
```

The front cross-piece top remains at `top`. Step 1 replaces that default
member with a full-width 1x6 whose upper face is also at `top`, from
`2.5` to `8 in` above the floor. Its rear face is at local North `1 in`;
the caster beams and separate fore-and-aft tread supports start behind it.
Rear board elevations are unchanged.

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
`0.75 x 3.5 in` cross-section. Its outside broad face follows the straight
right framing line, and its top meets the tread underside. Where its rear lap
extends beyond the rear radius, the right support and rear cross-piece end
are inset just enough to keep their corners inside the siding's inner circle.
Its front end
extends three-quarters of an inch into the back of the right-front upright. An upper
`endFar` upright notch removes that three-quarter-inch stock depth over the
support's height, leaving a bearing seat beneath the support.

For steps without rear uprights, the support reaches the back radial
boundary plus the `RISER_THICKNESS` setback. A matching left support follows
the inner framing tangent, with the same stock and front bearing seat.
Its right face aligns with the left upright's right face, placing its outer
face `0.75 in` away from the castle tangent. Its upright seats and rear half-lap
are recomputed from that position. The left caster beam's inner face is
independently constrained to be at least `INNER_RADIUS` from the castle center
in the beam's mid-angle frame.
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

Step 2's pine support cross-piece remains at rail-top elevation. Its right step
support therefore needs no bottom-front clearance notch, and the upright's
front bearing seat remains at the normal support elevation.

These cuts appear in stock views, manufacturing descriptions, inventory
patterns, and remaining-wood weight estimates. Both side supports are
step-owned physical parts listed directly under their modules and move with
them. No former full-length lower side boards are restored.

## Named part: tread

`Step.parts.tread` is a separate `Tread` board added at the **All parts**
construction stage in Parts.
It is `TREAD_THICKNESS` thick vertically, with its underside at
`height - TREAD_THICKNESS` and its top at `height`. It rests on the
top-frame members, including the right step support above the lowest
step and matching left supports except at module backs, and covers the riser's top edge.
Its front edge is at local North `0`, flush with the front radial boundary
and the riser's front face.
Its inner edge is an analytic arc at `INNER_RADIUS`; its outer edge follows
the siding's inner radius, except for step 1's straight tangent. The back edge
is radial. Through notches fit the newel and spindles without moving their
framing attachments. Cutting drawings, stock meshes, and volume calculations
share the same analytic outlines rather than deriving cuts from tessellation.

## Heights and risers

`height` means the vertical distance from the common floor to the horizontal top
of a step. It is not the height of an individual riser or the thickness of a
board.

All regular stair rises, including the rise from the floor to the first tread,
use the same height. Start with `TOTAL_HEIGHT / (stepCount + 1)` and round it
to the nearest quarter inch, rounding halfway cases upward:

$$
\text{stepRise} = \frac{\operatorname{round}(4 \cdot 85/(n+1))}{4}
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
| Castle top, a separate stage prop | `85` |

The castle top is not an additional step in `stepCount`. Only the transition
from the top tread onto the castle can differ from the regular stair rise.
The model exposes this remaining height as `landingRise`, retaining the
earlier landing terminology internally:

```js
landingRise = TOTAL_HEIGHT - stepCount * stepRise;
```

| Step count | Regular stair rise | Rise onto castle top | First tread underside above carriers |
|---|---|---|---|
| 9 | `8.5 in` | `8.5 in` | `1.5 in` |

With the fixed nine steps, `85 / 10 = 8.5` is already a quarter-inch
measurement. The last tread is `76.5` above the floor, leaving `8.5` inches
onto the castle.
The page reports the regular rise and castle transition separately rather
than displaying a rounded fraction for an unrounded model dimension.
The current preview renders bottom-frame
assemblies, top frames, separate risers, and treads at these step-top heights.
The top frames meet the tread undersides; plain posts stop beneath their
front or rear upper cross-pieces.
The optional castle cylinder can be shown in Stairway view.

## Command-line interference checks

From `stairs`, with Node.js and Rust/Cargo installed:

```powershell
npm run check:intersections
```

This builds the Rust checker once in release mode, exports the fixed
nine-step, three-module design at the default 20-inch width, and checks it.
Passing XML files are deleted;
failed/error cases remain in `.clash-results` for investigation. An optional
results directory can be supplied with `npm run check:intersections -- DIRECTORY`.

The scene includes every physical piece, including curved siding, treads,
flat step-1 siding, first-step carriers, panel support blocks, and hardware, plus the castle cylinder. The curved-tread framing and post
reliefs eliminate the former accepted siding overlaps. The Rust analysis inset
remains `0.001 in` per part.

To export and check one configuration:

```powershell
node export-meshes.mjs .clash-results\scene.xml
cargo run --release --locked --manifest-path mesh-clash\Cargo.toml -- .clash-results\scene.xml
```

The standalone exporter includes every piece by default, including curved
panels, and the castle (`id="castle"`, `kind="environment"`). The castle uses the
same production mesh as the viewer and cannot be excluded through part filters.
Add repeatable `--exclude-piece ID` options to omit specific physical
pieces, for example `--exclude-piece stairway/module-1/siding`. Unknown IDs
are errors; exclusions never silently expand to all curved parts.

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

`npm test` runs generic board/notch/dado geometry, inventory, placement,
and camera/input tests, plus focused structural regressions for the current
bearing-ended framing, front half-laps, first-step carrier bearing, and direct panel-block/cross-piece contact. Synthetic fixtures retain
machining coverage for joint types no longer present in the installed posts.

For framing changes, also use `npm run check:intersections` and
`npm run test:intersections`. These check modeled fit and mesh validity,
not connection strength or structural capacity.
