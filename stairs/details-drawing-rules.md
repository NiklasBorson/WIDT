# Details drawings: rules and geometric coverage prototype

## Purpose and status

This document records the drawing analysis, measurement/view-selection rules,
and analytical coverage prototype. The first measurement-driven Details
implementation is now in place; its behavior is documented in
[stairs.md](stairs.md). It is an incremental drawing aid, not a complete
shop-drawing or section-generation system.

The standalone `assess-feature-views.mjs` prototype enumerates actual model
parts and assesses whether their geometry can be communicated using the six
stock-aligned views. It does not render, modify the model, or change the UI.
Geometric coverage is distinct from a readable drawing: occlusion, dimension
placement, and collision avoidance are separate presentation concerns.

### Implemented first pass

`part-angles.js` shares the true-angle test between the analytical prototype
and browser annotations. `part-dimensions.js` assigns per-part feature IDs before
view filtering, names full-length edge bevels separately from local notches,
and produces individual stock-axis dimensions and reference-based angles.
`part-annotations.js` draws external dimension lanes, compact linked notes, and
enlarged angular plane constructions. These constructions are diagrams of
the two reference planes, not material sections, saw settings, or new outlines
on the shaded part.

Unequal broad-face depths are dimensioned on their respective faces; matching
dimensions refer back to the primary face instead of being repeated. End views
do not directly dimension longitudinal lengths. Nonzero angles appear only
in directions exposing the true plane angle. A deeper same-edge notch can
exclude an otherwise suitable end direction; the upright therefore shows the
notch-floor angle at Up and the full-length edge-bevel angle at Down.
Stopped cuts retain their finite start/extent dimensions rather than extending
their planes through the blank.

Plywood still has a single selectable broad-face view. Its notes retain the
other authored notch profile numerically, and its angular constructions name
the separate standard profile direction used. This avoids referring to
unselectable thumbnails or presenting a foreshortened face angle as a true bevel.
Square cuts have no zero-angle callouts. Ordinary views have no material
hatching or projected construction rectangles.

Feature IDs are stable across the views of one description, not global IDs
shared between unrelated parts. External lanes and separate note rows reduce
collisions, with minimum drawing dimensions and scrolling on small screens.
Leaders are not globally routed around every other line. Visibility checks
are conservative feature-specific checks, not ray-traced hidden-line removal.
Where no exposed standard end direction is available, a note explicitly
requests a section; the renderer does not invent a visible angle.
Cut-plane entries containing only cross-references are omitted from unrelated
views and do not mark their thumbnails. A square end opposite a bevel does not
need a callout about that bevel. Measured extents, true-angle constructions,
and required-section warnings on relevant exposed cuts remain.

Located material sections, section hatching, auxiliary views for compound
angles, complete hidden-line removal, and comprehensive drafting-layout
optimization remain deferred. Geometric coverage in the prototype does not
mean the first-pass UI renders all possible sections.

### Shape preview and proportional annotation

Details includes an independently rotatable, undimensioned 3D preview below
the thumbnails. It explains the finished shape without changing any of the
orthographic drawing cameras. Plywood keeps its single drawing alongside the
preview; purchased hardware retains its existing large rotatable view without
a redundant preview.

The rear-support attachment block is the simple-case acceptance example:
a six-inch rectangular 2x4 blank, square ends, and one full-length 5-degree
edge bevel. A full-length rebate record does not make this a locally notched
or compound-cut part. Face/edge views need overall dimensions; end views show
the actual bevel trace, a dashed continuation of the original square edge,
and a direct angle arc. Feature-ID notes, bevel-depth dimensions, cross-view
instructions, and separate angular constructions would add complexity without
defining another independent property, so they are omitted.

Overall extents remain at the top/left; bottom/right chains dimension the
stock-axis spans between distinct visible-outline corners. For the block's
end profile, the shorter face and bevel setback read 3 3/8 in and 1/8 in.
Outline extraction unions the front-facing projected triangles, preserving
concavities while excluding covered edges and collinear triangulation splits.
Extension lines start at actual material corners, not original blank corners
removed by a recess. Short spans use outside arrows. Right-side labels use
horizontal elbow callouts, staggered outward and spaced vertically by at
least one label-sized unit. Sufficiently separated callouts reset inward when
their connectors remain clear. Bottom chains reuse the same code under a
90-degree clockwise transform, rotating their labels too. Top/left overall
dimensions also share transformed drawing code. Margins reserve space for
the callout fans. Specialized dimensions whose two stock-axis endpoints are
already established by a chain are suppressed using raw coordinates, not
rounded text. Different face-specific depths and internal recess measurements
not established by that outline remain. Numeric full-thickness bevel
relationships remain in the feature callout when they are not the dimensions
of the remaining end profile. Angle annotations remain independent.
Finite corner notches have dashed shoulder traces in edge views, using the
actual shoulder position on each face rather than a square-blank approximation.
The callout anchor remains at the trace midpoint; full-length rebates have no
internal shoulder trace.
Feature notes sit near their projected anchors, clearing the measured bounds
of previous annotations and notes rather than occupying fixed distant rows.
Their text and angle construction move as one block. Each angle's paragraph
includes its dashed reference beside a fixed-size diagram on the left.
The diagram is vertically centered beside the heading and angle text with a
small fixed gap; text wrapping reserves this diagram column.
Standalone angled cuts fold
the redundant heading into this paragraph without losing named-edge identity.

This presentation is selected from the complete manufacturing description,
not a part name or the features visible in just one view. It requires rectangular
blank profiles, square ends, no width rip, no other joinery or finite surface
cuts, and one planar bevel running the full length, with one untouched original
corner. Stopped patches, two-sided bevels, local notches, and full-length rebates
removing material at both original corners retain the detailed rules. Their
dimensions and unsupported-section notes must not disappear merely because a
particular projection looks simple.

## Problems demonstrated by the original spindle shim

These screenshots depict the original shim with sloping, compound-faceted
ends. The model now uses level square-cut ends, anchored at the lower adjoining
spindle shoulder, while retaining the two flush-fitting side bevels. The
screenshots remain a useful historical counterexample for annotation design.

The Up end screenshot shows two large notes for the compound top facets, but
does not dimension the perimeter bevels whose angles are exposed by that view.
The Left face screenshot mixes facet angles, edge bevels, and an uninformative
"Inner face cut" note. Leaders identify surfaces without establishing the
reference directions for the angles. Crosshatching makes exposed surfaces look
like sections. Overall extents are not clearly distinguished from finished-edge
lengths or required blank dimensions.

The previous implementation selected a surface-cut annotation when its outward
normal faces the camera, then includes both stored miter and bevel values.
Surface visibility is not a test of whether a measurement is shown in true
shape. Moving those same notes into better boxes would not fix that problem.

## Case study: front-right upright

The six `upright-*.png` screenshots show a complementary case to the shim.
The 16 1/4-inch blank matches the default model's front-right upright at step 3.
Its independent bevel angles have standard Up/Down end directions; auxiliary
directions are not needed for these measurements. Nevertheless, the former
annotations make the part difficult to interpret.

The analytical description contains four joinery records:

| Feature identity for this case study | Actual definition | Suggested presentation |
|---|---|---|
| B1: full-length front-edge bevel | Length 16.25 inches; removal depths 0.1312329953 / 0 inches at the negative/positive Y faces; signed bevel -5 degrees | End profile or transverse section with a 5-degree arc and explicit square-edge reference. Show its full-length extent in a face view. Do not describe it merely as a 16 1/4-inch "notch." |
| N1: beveled front notch at the Up end | Length 3.5 inches from the Up end; face-specific depths 0.8840978734 / 0.7528648782 inches; signed bevel -5 degrees | Face views locate the shoulder and show each face's depth; an end view or transverse section exposes the sloping floor. |
| N2: square back notch at the Up end | Length 3.5 inches from the Up end; depth 0.75 inches on both faces, within numerical precision | Direct length/depth dimensions in a broad-face view; no bevel annotation. |
| N3: broad-face recess opening at the Down end | Negative-Y / Left face; 1.5 inches along X, 0.5 inch deep through Y, spanning the 3.5-inch blank width | Opening extent in the Left face view and a Front/Back edge view or section for depth. The Right face may identify it with hidden lines, not another full dimension set. |

These labels are explanatory identifiers, not new model IDs or proposed fixed
names for every part. The model retains two distinct `endNear` records (N1 and
B1); they must not be collapsed into a single feature just because their corner
keys match. Dimensions above retain analytical precision for identification,
not a proposed display precision or a list of independent dimensions to repeat.

### What the screenshots expose

- **Wrong measurement in the otherwise useful view.** Up/Down provide the
  transverse directions for the two 5-degree slopes, but the current notes
  repeat longitudinal notch lengths rather than draw angles against reference
  lines. A length parallel to the viewing direction cannot be directly
  dimensioned in that view; it belongs in a face/edge view or a linked note.
- **Unassigned paired depths.** "7/8 in to 3/4 in" does not say which value
  belongs to Left or Right. "1/8 in to 0 in" makes the same omission for B1.
  Dimension each face explicitly or name the two faces in a linked feature
  definition. Round the exact values consistently only when displaying them.
- **Internal feature names obscure the shape.** "4 notches (with bevels)"
  conflates a full-length edge bevel, two local corner notches, and a broad-face
  end recess. Drawing terminology should describe the resulting feature, not
  simply repeat the implementation's record type.
- **Feature extent and line of sight are conflated.** The Front edge is almost
  entirely crosshatched, and some hatching extends into an apparent opening.
  These are not identified section views. Never use a projected cut-region box
  as material hatching; empty space must remain unhatched. An end projection can
  also combine features at different X positions: geometric angle suitability
  alone does not identify which floor is actually exposed.
- **The views lack a shared feature identity.** Repeated "Notch" notes do not
  establish which face, edge, and end annotations describe the same cut.
  Persistent feature identifiers should connect complementary measurements
  without requiring the reader to reconcile several generic boxes.
- **Leader targets can be ambiguous.** Some leaders terminate in removed
  space or in the middle of a region. For a surface angle, target the relevant
  boundary/trace; for an opening, direct extension lines should establish its
  limits rather than relying on an isolated point in the void.

### Resulting presentation rules

Give each feature a stable identity across views, then assign each of its
measurements a primary view. Retain the option to inspect all six views without
repeating every dimension in each one. Face views should establish longitudinal
positions, shoulders, and face-specific depths. End views or explicitly located
transverse sections should establish the two sloping floors and their square
references. Edge views or sections should establish the Left-face recess depth.

Choose section locations from the feature's finite extent: a section through
the middle of the upright and one through its Up-end notch region need not
show the same profile. Label the section location and viewing direction in a
parent view. If a whole-part end view already exposes the required boundary
clearly, do not add a redundant section.

This case does not change the prototype's geometric coverage result. Instead,
it demonstrates the next layer of work: semantic feature naming, cross-view
identity, dimension ownership, finite-region visibility, and section selection.
The six-view feasibility test is necessary but not sufficient for readable
drawings.

## Drawing principles

1. Separate the 3D explanation of construction from the dimensioned 2D
   definition of the part.
2. A feature owns several measurements. Each measurement, rather than the whole
   feature, has suitable views and an explicit reference.
3. Use direct linear dimensions and angular arcs for geometric measurements.
   Reserve leader notes for identification and information not expressed well
   by dimensions.
4. Distinguish visible outlines, hidden edges, dimension/extension lines, and
   section boundaries by line style and weight, not color alone. Hatch actual
   sections, not ordinary exposed cut surfaces.
5. Prefer dimensions outside the object. Place local dimensions closer to the
   object and overall dimensions farther out. Use enlarged details or sections
   instead of overcrowding a whole-part view.
6. Keep stock coordinates authoritative: X along length/grain, Y through
   thickness, Z across width. Use assembly-relative names from `getStockViews()`;
   "Up" is not necessarily stock +Y.
7. Distinguish cutting-blank extents, finished outline coordinates, and actual
   edge lengths. Name the reference end/edge or coordinate origin. Do not call a
   projected bounding extent an edge length.
8. Keep geometry at full precision. Round only displayed measurements. For an
   interactive drawing, state units and "Do not scale from screen" rather than
   claiming a fixed paper scale.
9. Do not label a geometric angle as a saw setting. Setup conventions and
   machine-specific signs require separate, explicit instructions.

## Measurement and view-selection rules

The six standard views look along stock +X, -X, +Y, -Y, +Z, and -Z.
Their assembly-relative names vary between parts.

| Property | Reference and presentation |
|---|---|
| Blank length, thickness, width, width rip | Stock-axis dimensions; any view perpendicular to the measured axis. Distinguish original stock from cutting blank. |
| Cut boundary and position | Exact outlined patch/blank vertices, located from stock-coordinate references. Multiple coordinate views can define a 3D boundary without showing it all in one view. |
| Miter trace | Angle of the cut-plane trace in a plane parallel to the broad face, relative to the square-cut trace. Broad-face view (+/-Y). For compound cuts this may require an explicit section/construction trace, not an arbitrary projected silhouette edge. |
| True bevel of a length/width cut | Angle between the cut plane and its unbeveled reference plane. The reference has the same XZ normal direction but zero Y component. View along the intersection of these two planes. |
| Cut inclination from nominal square | Angle between the cut-plane normal and the nominal stock-axis normal. This is a derived diagnostic, not an additional independent manufacturing requirement. |
| Thickness-face inclination | Angle against the original broad-face plane. Do not apply the length/width miter decomposition to it. |
| Corner notch | Length and depth on each broad face, including unequal face-specific values. Use the broad-face profiles for dimensions and an end/edge section for sloping floors or shoulders. |
| Dado / broad-face end notch | Opening width and position from X=0 on the cut face; depth from the named broad face, normal to it. A section exposes depth when a whole-part end view would hide it. |
| Sheet edge notch | Both authored broad-face floor profiles, opening location/width/depth, and connecting floor/shoulder planes. Do not replace differing profiles with their average. |
| Stopped cut | Exact patch boundary or start/stop positions as well as the cut angle. Do not extend a local patch's plane through the whole blank. |
| Square/uncut face | Coordinate/outline information as needed; no angle callout merely because a face record exists. |

An end view exposes a bevel along a board's long edge; a width-edge view can
expose a bevel across its end. A fixed "bevel -> end view" rule is insufficient.

### True plane angles

For unit normals `n` and `r` of a cut plane and its reference plane:

```text
acute inclination = acos(abs(dot(n, r)))
intersection direction = normalize(cross(n, r))
```

A standard view with unit viewing direction `v` exposes their true dihedral
angle when both planes are edge-on:

```text
abs(dot(v, n)) <= tolerance
abs(dot(v, r)) <= tolerance
```

For nonparallel planes, this means looking along their intersection. If no
stock-axis direction satisfies both conditions, record an auxiliary viewing
direction rather than attach the true angle to a misleading standard view.
Parallel planes have zero inclination and need no nonzero angular dimension.
Use the acute inclination here; the reference vectors and signed manufacturing
data retain orientation. This is not a prescription for an interior corner angle.

For a compound length/width cut, the miter is a broad-face **trace** angle,
whereas its bevel is a true inclination against an already-mitered reference
plane. Neither should be confused with the overall inclination from nominal
square. These are different measurements with potentially different views.

### What counts as covered

- `standard`: a true-length coordinate dimension, true trace angle, or true
  plane angle has a suitable standard direction.
- `auxiliary`: a nonzero true plane angle has no suitable standard direction;
  the prototype must supply the computed auxiliary direction.
- Invalid, incomplete, or unsupported geometry is an error, not "covered."
- A standard direction may require an explicit section/detail. Coverage does
  not assert that the measured feature is visible in the current shaded view.
- Exact boundary coordinates plus plane definitions provide a coordinate-based
  description even when a direct angular dimension needs an auxiliary view.
  "Requires auxiliary" does not mean "cannot manufacture from this data."

## Prototype scope and outputs

Assess every unique wooden manufacturing pattern and retain its occurrence IDs,
role names, and a representative occurrence's assembly-relative view names.
Report purchased hardware separately: it has no authored woodworking features.
Read analytical descriptions and stock views, not Float32 render triangles and
not the current annotation-selection output.

Cover blank dimensions/rips, all edge and surface-cut patches, corner notches
and their beveled floors/shoulders, dados/end notches, and sheet edge notches.
Preserve exact coordinates and signed angle metadata alongside derived
measurements. This is geometric feasibility, not a proposed dimension for
every vertex on the eventual drawing.

The default run assesses `buildStairway()` (20-inch width, nine steps, three
modules, 32-inch shoulder ascent). A matrix run samples source/API widths
20/24/36 inches while retaining nine steps, three modules, and the fixed
32-inch ascent. The Parameters page has been removed. This is a finite
sample, not proof over every width accepted by the lower-level model API.

The report should distinguish independent bevel/trace measurements from the
derived total-inclination diagnostic, list actual auxiliary-view cases, and
explicitly state the visibility/section limitation. JSON should retain the
underlying vectors and coordinates for further inspection.

For corner notches, the floor and shoulder planes are derived from the two
face-specific profiles. Shoulder slopes use absolute X positions, including
any difference between the blank's two end profiles, not merely the difference
between notch lengths. The plane-construction rectangles are explicitly marked
as construction geometry, not finished outlines; the original blank and parent
notch dimensions define the finite cut. Sheet-notch shoulder construction is
similarly distinguished from the authored floor profiles. A collapsed joinery
boundary retains its defining dimensions but has no independent surface angle.
Nonplanar or inconsistent authored cut patches fail the assessment explicitly.

### Running the prototype

From `stairs`:

```powershell
node assess-feature-views.mjs
node assess-feature-views.mjs --json
node assess-feature-views.mjs --matrix
node --test assess-feature-views.test.js
```

`--matrix --json` provides the full geometry report for all sampled models.
Unknown arguments and invalid/incomplete geometry produce an error and a
nonzero exit code, rather than a successful partial-coverage report.
The script is import-safe; its analytical functions can also be used in tests.

### Findings from the actual model

**After simplifying the shim, all assessed independent measurements have
standard-direction coverage.** Its top and bottom are now square-cut,
horizontal ends, four inches apart, rather than compound facets. Its top
meets the lower adjoining spindle's notch shoulder and remains at that same
elevation toward the higher spindle, meeting that spindle below its shoulder.
The current shim plan follows the actual gap between the spindles after
adding their front-face mounting blocks.

For the default model:

| Shim measurement | Result |
|---|---|
| Top/bottom ends | Square cuts; 4-inch blank length; no miter or bevel angle annotation |
| Front/back perimeter bevels | Approximately 2.796 / 7.204 degrees; Up/Down end views |
| Inner/outer faces | Small nonzero inclinations, approximately 0.227 / 0.286 degrees; standard-direction coverage |
| Newel corner bevel | 10 degrees; standard end views, with its finite stopped outline retained |

The default assessment covers **73 unique wooden patterns / 205 physical
wooden parts**, with all 42 purchased hardware occurrences reported separately.
The fitted spindle backing blocks and bearing shims retain full-thickness
1x4 blank descriptions with authored surface cuts: 5-degree tapers except for
the thin parallel-sided packing at step 2.
It accounts for every cutting blank, width rip, and authored machining feature.
Derived joinery planes are additional assessment records, not additional
manufactured parts or operations. Synthetic fixtures retain notch/dado and
broad-face end-notch coverage in addition to the installed post bottom-seat cases.

There are no independent angle measurements or derived total-inclination
diagnostics requiring auxiliary directions in the current default model.
Standard-direction coverage may still require a section or construction trace
rather than a visible outline.

The **three sampled configurations** use widths 20/24/36 inches, nine fixed steps,
three modules, and a 32-inch shoulder ascent. Every sample completed
without unsupported or nonplanar feature errors. Each now has zero independent
or diagnostic angles requiring auxiliary directions. Exact plane and boundary
definitions remain expressible in stock coordinates.

### Historical counterexample: sloping shim ends

Before this simplification, the original shim was the only pattern requiring
auxiliary directions in all 54 samples. In the default model its top/bottom
facet-1 bevel was 2.696677 degrees with auxiliary direction
+/-[0.538363, 0, 0.842713]; facet 2 was 2.907500 degrees with direction
+/-[0.580522, 0, 0.814245]. Their miter traces were 32.572282 / 35.487233 degrees
and had standard broad-face directions. The four independent facet bevels
and four derived total-inclination diagnostics had no suitable stock-axis view.

Those results describe the old geometry, not current prototype output. They
demonstrated that the auxiliary-view case is real, rather than merely
theoretical. Synthetic compound-plane tests retain coverage of that case.
Auxiliary vectors use stock XYZ coordinates; either sense along the same line
exposes the true angle, although visibility may make one preferable.

This establishes feasibility for the sampled authored feature descriptions,
not a proof over every parameter value. It does not enumerate every possible
pairwise dihedral between neighboring surfaces or prescribe saw setup, joint
clearances, tolerances, label placement, occlusion handling, or a minimal set of
shop drawings. The prototype itself does not render or control the Details UI.

## Sources and qualifications

- [John A. Nelson, Quick Reference for Using Technical Drawings](https://scrollsawer.com/quick-reference-for-using-technical-drawings/):
  line conventions, orthographic projection, and complementary views. The
  article was originally published in 2004; it is not a current standards text.
- [Millwork Drawing Scale and Conventions](https://millwork-drawings.com/blog/millwork-drawing-scale-and-conventions):
  practitioner guidance on line weights, dimensions, sections, and details.
  Its architectural sheet scales and feet/inches prescriptions are not
  requirements for this interactive individual-part viewer.
- [ASME Y14.5 public overview](https://www.asme.org/codes-standards/find-codes-standards/y14-5-dimensioning-tolerancing):
  scope of the formal dimensioning/tolerancing framework. This prototype does
  not claim ASME/ISO compliance, and no paid standards text was consulted.

The per-feature rules and analytical tests above are this project's proposed
design, informed by those references, not quotations of a formal standard.
