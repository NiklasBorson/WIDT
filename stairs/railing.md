# Right-side modular banister: design options

## Objectives and scope

Add a banister on the right when ascending the stairs: the outside of the
curve in the current model. Each stair module owns one banister section.
When assembled, the sections should read as one continuous curved handrail,
with matching height, slope, tangent, and cross-section at the joints.

The highest module's complete banister must be removable as one unit:
handrail, spindles, and newel/end posts. Making the other sections removable
would simplify handling and storage, although the first section could remain
permanently attached. Temporary, reusable connections between neighboring
sections should improve alignment and stiffness without obstructing the grip.

This is a design study, not a construction specification or a claim of
structural adequacy. Post sizes, socket engagement, reinforcement, fasteners,
rail height, openings, and design loads need to be selected and checked
together for the intended use and applicable requirements. A handrail provides
a grip; a guard prevents falls. One assembly may do both, but satisfying one
function does not automatically satisfy the other.

## Fit with the current stairs

The stairs turn through 90 degrees, with concentric inner and outer reference
curves. The inner tread edges follow the fixed `INNER_RADIUS` cylinder.
The outer tread arcs and siding inner face use `INNER_RADIUS + stairWidth`;
step 1 instead has a straight outer edge tangent at step 2's front.
The treads are notched around the spindles. The design is fixed at nine steps
in three equal three-step modules, with radial boundaries. Railing bottom
ascent is fixed at 32 inches in source; there is no Parameters page.

Each step above the first has pine 1x4 front uprights, with additional
rear uprights at every module back. Their 3.5-inch faces point front/back;
their 0.75-inch thickness runs fore-aft. Most full ends bear on flat lower 2x4
cross-pieces at `7.25 in` above the floor. These cross-pieces bear directly
on the caster beams; there are no base rails.
Front posts are flush with the front frame face, immediately behind the riser,
and carry the front tread support directly, without bearing caps.
The front supports retain the lower halves of the front/side half-lap joints
and bear the side supports. Rear post tops bear beneath the upper rear frame.
At module backs, rear half-laps bear the rear supports on the side supports.
Elsewhere the sides bear on the rear supports. Intermediate side supports
stop at the following front uprights' front faces, without short tongues
or matching post notches.
In modules 2 and 3, the first left tread support instead extends onto a new
face-mounted rear 1x4 cross-piece. Its original rear support butts against
it without a left half-lap. The next two left front posts are shortened
from below and bottom-notched to bear on the extended support; their lower
attachment blocks are omitted. A half-inch top-edge seat in each new
cross-piece accommodates the upper panel rib without cutting that rib.
Modules 2 and 3 each have an 8-inch-high rectangular quarter-inch plywood brace against
its first-step upright fronts and front cross-beam, filling the quarter-inch
module-front setback. Its bottom aligns with the beam bottom at 5.75 inches.
The former rear-panel width is preserved and centered across the front posts.
These rectangles belong to the separate Risers visibility category immediately
before Treads, without changing their Uprights construction stage.
The rear treads of modules 1 and 2 each have two 7-inch-long vertical 1x4 blocks.
Their rear broad faces meet the rear uprights and tread supports flush; their
outer edges are beveled against the side supports, and their widths are ripped
to approximately 2.878 inches to align their inner edges with the rear uprights.
Their tops meet the tread undersides. Each front face carries a horizontally
centered, vertical threaded flange, with its mounting plate's bottom edge
1/8 inch above the block bottom. These blocks and flanges belong to Step framing.
Four vertical mending plates sit against the backs of the first-step front
uprights in modules 2 and 3, with their center holes aligned to the preceding
modules' flange axes at 19.5 and 45 inches. The plates are 4.33 x 1.22 x 0.12
inches with 9.8 mm center holes and also belong to Step framing.
Four additional threaded flanges attach to the front faces of modules 1 and 2's rear
uprights at 13.04 inches, aligned with four more mending plates on the backs of
the next modules' front uprights. The plates' bottom edges clear the lower upright
support blocks by 1/8 inch. These lower joints use the existing front brace
to fill the quarter-inch module-front gap; no square spacers are installed.
They are below the ribs, not on the extended-left-support cross-beam.
The adjacent rear spindle blocks are shortened inboard, retaining their spindle
mounting faces. The first risers of modules 2 and 3 extend downward to the new
blocks' bottoms, at 18 and 43.5 inches respectively, making both risers 15.5 inches high.
The front panels meet the preceding modules' rear uprights flush for removable
bolt attachment. Rear triangular gussets and lower rear panels are omitted to
leave attachment access clear; bolt holes, bolts, and threaded rods are not modeled.
The right-side plywood panel remains.
The first step instead has a newel and three fore-and-aft tread supports:
a ripped 1x3 on the left, and ripped 2x4s beside and behind the newel on the
right. All stand on edge from `6.5` to `8 in`, supported by flat 1x4 cross-pieces
on the caster beams.

Lower 2x4 attachment blocks meet the posts' broad faces, not their narrow edges.
Each has a 3.5-inch cross-grain length and rests on the lower cross-pieces.
They sit behind the front posts and directly in front of the rear posts.
The rear blocks have no plywood setback. Most are
3.5 inches tall; the step-2 right block is ripped to 2.25 inches tall to
clear its spindle mount. Previous rear supports meet the next posts'
broad front faces directly, without separate upper cleats.

Steps 3-9 have vertical pine 2x2 spindle supports behind the right front
uprights, flush with their right edges. Five are 8.5 inches long and meet
the right tread supports. At steps 4 and 7, their tops are lowered half an
inch (8-inch lengths) so they also bear the first upper panel rib.
Step 2 and the rear uprights retain broad-face 2x4 spindle blocks.
These mounts retain substantial attachment area without projecting through
the risers or relying on narrow post edges.

The six front spindles on steps 4-9 now have paired threaded flanges for
removal with through bolts, without mending plates. Upper flanges mount on
fitted 1x4 backing blocks on the left/inboard faces of the right tread
supports, near the front and behind the half-laps. Small tapered pine shims
fill the angled outboard gaps for solid spindle bearing. Lower flanges mount
near the bottoms of the existing 2x2 supports, with plate bottoms 1/8 inch
above the support bottoms. Both mounting planes are 3 inches from the spindle
outside face for matched bolt reach. Flanges, backing blocks, and bearing
shims belong to Step framing; bolts and wood holes remain unmodeled. Rear
spindle-to-frame mounts do not yet have a modeled removable connection.

The separate spindle-to-spindle module joints each have one IRONCODE
1/4-20 x 10 mm threaded insert on the front face of modules 1 and 2's rear
spindles, centered across the face and at the fitted shim's mid-height.
The bolt is intended to enter from behind the next module's front spindle,
with an ordinary washer in an aligned shallow, flat-bottomed counterbore.
The installed model shows only each insert's flange; Details shows its full
illustrative body. These two inserts belong to Banister visibility.
Spindle holes, counterbores, bolts and washers remain unmodeled.

Module 1's spindles are permanently screw-fastened. Its front spindles at
steps 2 and 3 also have upper bearing shims, but no removable spindle flanges
or inboard backing blocks. Step 2 uses thin parallel-sided packing against
its already-angled spindle; step 3 uses the same tapered shim as steps 6 and 9.

Castle hard points are proposed for lateral
restraint but remain unmodeled, without bolt sizes or holes.

Those locations should not be assumed adequate as freestanding railing
connections. The posts are thin in the fore-aft direction. A tall
banister introduces lateral bending and torsion that the current gravity-load
framing was not specifically designed to resist.

The intended load path is:

```text
handrail / infill
        |
substantial end posts or structural cassette frame
        |
deep sockets or vertically separated bracket attachments
        |
reinforced module framing
        |
stable, restrained stair base
```

Do not terminate this load path at the half-inch tread, the thin riser, a
decorative spindle, or a single screw into the top of an existing upright.
The caster platforms, support beams, and cross-pieces are possible parts of
the load path, not automatically sufficient anchorages. Local reinforcement
and connections across the module may be needed.

## Option A: wooden cassette in reinforced sockets

Build each section as a complete wooden assembly: curved handrail,
substantial posts near both ends, a lower curved rail, and intermediate
spindles. A single prominent newel can be used at the stair entrance; the
other structural posts can be visually quieter.

The posts have lower extensions that enter sockets fixed to the module.
Both posts lift out together, taking the rest of the banister with them.
Spindles remain permanently joined to the removable assembly, not separately
inserted into the treads.

The lower rail ties the assembly together and supports the infill, but its
presence alone does not make ordinary spindle joints a rigid frame.
Post-to-rail joints and any concealed reinforcement must be designed for
racking resistance.

**Advantages:** traditional appearance; compatible with the existing woodwork;
all visible banister components come off together; the first section could
use the same upper design with permanently fastened posts.

**Tradeoffs:** wooden post extensions and sockets are vulnerable to wear,
splitting, and moisture-related fit changes. Metal-lined receivers or
reinforced post shoes are worth considering. A substantial wooden cassette
may be awkward to lift, especially on the highest module.

**Best fit:** a predominantly wooden appearance is the priority and the
required rigidity can be achieved without excessively bulky posts.

## Option B: structural metal cassette with a wooden handrail

Use a fabricated metal frame with two structural end stanchions, an upper
curved member, and a lower member. Add the wooden handrail as a grip/cap,
with wooden or metal spindles as infill. The frame, handrail, and infill
remain one removable unit.

The stanchions engage reinforced sockets or bolt to vertically separated
mounting points on the module. The frame can be visually discreet beneath
the wood, but must have its own designed joints and section sizes; a thin
metal strip should not be treated as structural merely because it is metal.

**Advantages:** separates the structural problem from decorative joinery;
offers replaceable metal bearing surfaces at removable connections; makes it
easier to integrate concealed section-to-section connectors. The wooden cap
does not have to carry all the connection forces.

**Tradeoffs:** requires metal fabrication and accurate three-dimensional
curves. Weight, corrosion protection, dissimilar-material movement, and
access to the connectors need attention.

**Best fit:** a robust, frequently removable assembly is more important than
all-wood construction. This is the leading candidate for further development,
subject to checking the complete load path and practical lifting weight.

## Option C: reinforced upright extensions with removable upper cassette

Replace or reinforce selected right-side foundation uprights and extend
them upward to form permanent mounting stubs. A complete upper banister
cassette fits over the stubs using sleeves, or attaches to their sides at
two vertically separated levels.

The removable part still includes the visible handrail, spindles, and full
upper newel/end-post bodies. Only the mounting stubs and foundation
reinforcement stay behind. This distinction should be explicit: extending
ordinary full-height newels permanently would not meet the request to remove
the entire banister.

**Advantages:** mounting loads can be introduced along more of the foundation
height; avoids concentrating the connection at the tread surface; can reuse
the positions of the existing front/rear upright assemblies.

**Tradeoffs:** simply lengthening the current 3/4-inch boards is not enough.
The extensions would need designed reinforcement or replacement posts.
Permanent stubs may obstruct access or become snag/trip hazards when the
banister is removed. Sleeves also need enough vertical clearance to lift off.

**Best fit:** low, outboard mounting stubs can remain without interfering with
the reason the highest banister must be removable.

## Removable mounting details

The mounting system can be developed separately from the choice of wood or
metal above it.

| Mount | How it works | Principal concern |
|---|---|---|
| Deep, keyed sockets | Post extensions lower into nonrotating receivers; positive retainers prevent lift-out | Fit, wear, socket-wall strength, and attachment to the foundation |
| Sleeve over reinforced stubs | Hollow post bases lower over permanent mounting members | Remaining obstructions and clearance to lift the whole section |
| Side-mounted brackets | Each post attaches at vertically separated bearing/bolt locations | Tool access, visible hardware, and maintaining a tight connection |

Socket engagement should provide separated bearing regions capable of
resisting post bending, rather than a shallow cup with one retaining pin.
A square/rectangular interface or another positive key can resist rotation.
A replaceable shim or adjustable bearing pad can remove play, but friction
from a set screw should not be the sole structural or lift-out restraint.

Distinguish the functions of the hardware: bearing surfaces resist lateral
loads, keys resist rotation, clamping removes looseness, and a positive
retainer prevents accidental withdrawal. A proposed pin or bolt may perform
more than one function only if it is designed for those combined demands.

Receivers should spread forces into substantial foundation members using
designed backing/reinforcement. Through-bolted plates or other engineered
connections are candidates; neither isolated wood screws nor unverified
threaded inserts should be assumed sufficient. Bolt clamping must not crush
the surrounding wood.

Keep mounting hardware outboard where practicable so it does not reduce the
already limited walking width. Check hand clearance independently: moving a
post outside the tread does not guarantee clearance around the handrail.

## Connecting neighboring sections

Each section should have its own support near both ends. Do not depend on a
neighbor's post to support an otherwise cantilevered section. Adjacent end
posts belong to different modules and must not occupy the same space.
Set them back from the seam as needed, leaving short, designed rail
overhangs to meet at the module boundary.

There are two useful levels of temporary connection:

**Handrail alignment and stiffening.** Use a concealed keyed spigot or
splice inside the rail ends, together with an accessible draw bolt or
another positively retained clamping connection. The key aligns the grip
surfaces; the clamp closes the seam. An unretained dowel or magnets alone
would not provide the required connection. In a wooden rail, reinforcement
around the splice must prevent end splitting.

**Frame-to-frame coupling.** Couple adjacent structural end stanchions with
removable splice plates or a designed two-level connector. This can resist
relative rotation more effectively than treating the handrail seam as the
only structural joint. It is especially attractive with Option B.

These approaches can be combined: a discreet upper splice gives a smooth
grip, while a lower, less visible frame connection provides additional
stiffness. Connector sizes, spacing, and capacities remain design work.

The stair modules must first be positioned and secured by their own
foundation-level connections. Do not use a banister splice to pull misaligned
stair modules into place or substitute for those connections. Conversely,
do not assume an otherwise loose section is safe merely because its
neighbor's rail is connected.

Provide assembly adjustment at the mounts and repeatable locating surfaces
at the rail seam. Account for fabrication tolerances and wood movement
without leaving an abrupt edge, snag, pinch point, or projecting fastener in
the hand path. Hardware should be captive where practical and accessible
from a safe working position.

## Making the curve continuous

The handrail is curved in plan **and rises as it turns**. A flat circular arc
tilted as one piece will not produce the required constant-pitch curve.

Define a common rail centerline for the entire stairway, then split it at
the actual module boundaries. For the pitched portion, a useful starting
point is:

```text
theta = angular position around the stair's existing center
R     = selected handrail radius, based on the outer radius and rail offset
a     = angle per step
r     = rise per step

plan position(theta) = center + R * [cos(theta), sin(theta)]
height(theta)        = referenceHeight + (r / a) * (theta - referenceTheta)
```

Choose the reference point from the finished tread-nosing pitch line and
the selected handrail height. Use the model's actual `stepRise` and `angle`;
the rise is `TOTAL_HEIGHT / (stepCount + 1)` rounded to the nearest quarter inch,
not total height divided by the number of modeled treads. The corrected
`TOTAL_HEIGHT` is `85 in`; the default nine-step rise is `8.5 in`.
Endpoint returns, extensions, and any
transition to a landing need separate treatment.

All sections must share this global definition. Do not independently fit a
curve through each module's posts: small differences in height or tangent
would become visible at the seams. Mounting brackets can accommodate the
difference between a true circular rail and the posts' straight framing chords.

Possible fabrication approaches are:

- **Bent-laminated wood:** form thin laminations on a three-dimensional jig.
  Lamination orientation, adhesive system, springback, and grain need to suit
  the required curve; an oval grip also needs controlled cross-section orientation.
- **Fabricated metal with wood grip:** obtain the pitched curved frame from
  a suitable fabricator, then fit a matching laminated or segmented wooden cap.
  Bending a flat ring and tilting it is not a substitute.
- **Short joined wooden segments:** more accessible fabrication, but a
  faceted rail will not look like a smooth continuous curve unless there is
  sufficient material to shape it. More joints also mean more structural
  and finishing work.

Use common full-size templates or a master jig for the selected stair
configuration, with mating ends checked together before final finishing.
A change of stair width or module grouping can require different rail
geometry or section lengths; the physical rails are not automatically
interchangeable just because the viewer is parametric.

## Recommended direction and next decisions

Develop **Option B with reinforced, keyed receivers** as the baseline, and
retain **Option A with metal-reinforced post/socket interfaces** as the
all-wood-appearance alternative. Option C is useful if its permanent stubs
are acceptable, but is less attractive when removal needs to leave the
highest module completely unobstructed.

Use the same removable mounting concept on all modules initially. The first
section can later be made permanent without changing the common rail curve
or the boundary connectors. Favor both a smooth handrail splice and an
accessible structural end-frame connection, rather than asking the wooden
grip seam alone to stiffen the complete assembly.

Before detailing dimensions:

1. Establish intended use and the applicable handrail/guard requirements:
   loads, height, graspability, openings, returns, and any protection needed
   on other exposed sides.
2. Fix post locations, walking and hand clearances, and the space available
   for sockets, reinforcement, and inter-module connectors.
3. Check the whole stair's resistance to sliding, rolling, and overturning.
   A stiff banister can still tip a narrow, caster-supported module;
   caster brakes alone should not be assumed to solve this.
4. Select receiver engagement, post/frame sections, and structural
   connections as one verified system, including repeated assembly wear.
5. Make a full-size fit/handling mock-up of the highest section and an
   adjacent seam. Confirm lifting clearance, weight, connector access,
   storage, and that the complete section really comes off as one unit.

The mounting layout should permit vertical withdrawal without spreading or
individually dismantling the spindles. Disconnect boundary splices before
lifting, and secure each section independently during installation.
Removing an entire stair module also requires releasing its foundation
connections; it is a separate operation from removing its banister.

Structural verification and any controlled load testing should follow a
reviewed plan, not informal testing by leaning on an occupied stair.
Do not use the stairs with a required banister/guard removed. No hardware
sizes or load ratings are specified here because those decisions depend on
the complete design, including the stability of the stairs underneath it.
