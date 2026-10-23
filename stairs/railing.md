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
curves. The outer radius is `INNER_RADIUS + stairWidth`. Modules contain
consecutive steps, and their boundaries are radial planes. The design should
follow actual module boundaries, not assume that every module contains three
steps or that all sections have equal lengths.

The present foundation has right-front uprights at each step and an additional
right-rear upright at each module's back. All of these uprights are pine, based on
`0.75 x 3.5 in` stock, with existing notches and dados. Their outer faces now
align with the step sides. There are no side boards.

Those uprights provide useful attachment locations, but they should not be
assumed adequate as freestanding railing posts. They are thin in one bending
direction, and some of their section is already removed for joints. A tall
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
the rise is `TOTAL_HEIGHT / (stepCount + 1)`, not total height divided by
the number of modeled treads. Endpoint returns, extensions, and any
transition to a landing need separate treatment.

All sections must share this global definition. Do not independently fit a
curve through each module's posts: small differences in height or tangent
would become visible at the seams. Mounting brackets can accommodate the
difference between a true circular rail and the stair's straight-sided tread
edges.

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
A change of stair width, step count, or grouping can require different rail
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
