# Placement planner: bounded finite-face implementation

`placement.js` exports `new PlacementPlanner(model).plan(occurrenceId)`.
This is a working geometric reference planner, **not** a general automatic
installation-specification generator. The current model exposes finished meshes
and occurrence ownership, but no authored support/stop/orientation intent API.
Consequently every result is `partial` or `unresolved`, never an unsupported
claim that a piece self-locates or has a complete six-degree-of-freedom recipe.

## Supported result

The planner finds finite, opposing planar face patches which actually overlap
in their common plane. It distinguishes a local surface contact from a positive
face-to-face clearance. Three independent maintained plane contacts can explain
a block seated against a side face and end stop. One horizontal seat alone
constrains vertical translation, roll and pitch, **not** two horizontal slides
or yaw. Zero-fit geometry is explained by retained dimmed context and contact
notes, without numeric zero dimensions.

Contact alone does not necessarily locate the finite joint along either part.
The Top view also supplies finite corner-to-joint and template-intersection
locations, using the rules below; it does not treat "touching" as "located."

Positive clearances are measured normal to actual finite faces, between
corresponding physical boundary edges in an actual overlap region. Labels say **Face clearance**, not an
unverified instruction to install at this offset. Dimensions are not measured
to bounds, arbitrary triangulation vertices, inferred stock corners, a remote
coordinate origin, or an automatically invented centerline.

There are no part-name templates or baked configurations. Rebuilt model meshes
provide parameter-dependent values naturally, across module boundaries and
outside Parts filters.

## Inputs, retained data, and frame

The actual APIs used are `partTree.getLeaves()`, `getAncestors(id)`,
`createNodeGeometry(id, 0, 0)`, `createFootprintGeometry()`,
`createFootprintGeometry(null, false, false)`, `steps[0].angle`, and the module
component's `startIndex`/`steps`. There is no invented semantic-datum API.

The constructor retains each assembled occurrence mesh, triangles and world
bounds, plus the two footprint variants. It does not build an all-pairs graph.
Selection scans retained bounds once: Euclidean box separation must be at most
6 inches. This is only broad-phase evidence, never evidence of contact.
All potentially useful finite faces in that band are examined; it is a bounded
local search, not an expanding search that eventually chooses unrelated remote
parts. Missing references remain unresolved.

Let the owning step's angular midpoint be
`theta = (stepNumber - 0.5) * stepAngle`. For module-owned leaves use
`theta = (module.startIndex + module.steps.length / 2) * stepAngle`.
All scene positions and normals are rotated about global +Y by `-theta`:

```
x' = cos(theta) x - sin(theta) z
y' = y
z' = sin(theta) x + cos(theta) z
```

Thus +X is radially outward, -Z uphill/Back, and +Y up. No stock straightening,
translation or independently transformed neighbor is used. The exact SVG tread
template and inset lit footprint use this same transform; their metadata
(including `treadRanges`) is preserved. Generic fixtures without stair angular
metadata use the identity frame.

The six `standardView` strings are the renderer's `Top`, `Bottom`, `Left`,
`Right`, `Front`, `Back`; their public names are `Up`, `Down`, `Left`, `Right`,
`Front`, `Back`. The renderer's directions, not alternative camera conventions,
drive visibility and dimension assignment.

## Finite references

1. Read triangles from the actual indexed finished mesh, ignoring non-finite
   and degenerate triangles. Derive outward normals from their winding.
2. Weld edge keys to `1e-4` inch precision; merge edge-connected triangles only
   when their normals differ by at most `1e-5` and every point lies within
   `1e-4` inch of the seed plane. Plane compatibility is tolerance-tested rather
   than binned, avoiding a quantization boundary splitting a planar face.
   A reference remains the union of its triangles, not a convex hull across a
   notch, concavity or disconnected coplanar area.
3. For selected plane `n·p = dA` and opposing candidate plane
   `(-n)·p = dB`, require `|nA + nB| <= 1e-5`.
   Signed normal separation is `g = -dB - dA`. Reject negative separation
   below tolerance and separation above 6 inches.
4. Project both finite faces into an orthonormal basis in the plane. Intersect
   actual triangle pairs with convex polygon clipping. Require positive area,
   not touching outlines or a bounding-box intersection.
5. Contact reasoning uses overlap polygon points. For clearance annotations,
   count merged-face triangle edges: shared internal edges cancel; count-one
   edges are physical boundaries. Find collinear overlapping boundary segments
   after projecting the neighbor face back along its normal. The midpoint of
   a shared segment is a practical selected edge anchor `a`; the neighbor
   anchor is `b = a + max(0,g)n`. Try actual boundary midpoints in deterministic
   order (higher Y, then higher X, then higher Z), not arbitrary triangulation
   vertices. If no corresponding physical edge is available, the finite-face
   relationship can still be reported as unresolved but gets no number label.
6. `g <= 1e-4 inches` is local surface-contact evidence. A larger gap is an
   offset candidate. Reject offset segments intersecting either occurrence's
   other triangles before reaching the target face. This avoids measuring a
   supposed clearance through either piece. Before assigning an annotation,
   also test its physical boundary-anchor segment against all broad-phase
   local physical triangles, not just the two datum-bearing parts.

The broad-phase scale and tolerances are constants, not dimensions based on a
part's name. Bounds are used only for scanning, scene fitting and numerical
conditioning. An AABB overlap alone cannot produce a reference.

## Independent constraints and sparse measurements

For an infinitesimal displacement `(t, omega)` about selected origin `o`,
maintaining a point-to-plane relationship gives

```
n·t + ((p-o) × n)·omega = 0.
```

Rows are `[n, ((p-o) × n)/R]`, where `R` is the selected extent, at least one
inch; scaling improves numerical conditioning without changing rank. A
contact patch supplies rows at its finite overlap polygon vertices. A measured
clearance supplies one row at its displayed interior anchor. This deliberately
does not pretend that a distance label imposes a complete parallel-plane joint.

Contacts sort before clearances; clearances with corresponding physical boundary
edges precede unsupported interior-only ones. Remaining ties use gap, occurrence ID,
reference name and anchor coordinate. Gaussian elimination with pivoting keeps
a relationship only when it increases the six-column row rank. At most six
rank-increasing relationships are chosen; redundant contact neighbors are still
retained as essential mating context. There is no dimension chain for every
gap. `evidence.contactRank` describes maintained-contact geometry;
`evidence.measuredRank` includes only actually displayed clearance rows.
Candidate selection uses prospective rows; changing to a visible boundary
anchor can change the reported displayed rank. Neither is a proof of a
mechanical fixture, unique finite pose, intended assembly, or fastener design.
Hardware leaves are explicitly approximate in this model: they may provide
mesh-contact context, with an approximation warning, but are excluded from
exact clearance dimensions. Real mounting/fastener dimensions require product
verification.

This implementation **does not infer** intentional flush alignment between
non-contacting same-facing planes, centering from bounding boxes, an orientation
angle from arbitrary edges, or joint intent from mere proximity. A flush side
stop with actual opposing contact is supported as plane-contact evidence.
Free rotation/sliding and missing authored angular references are reported.
There is no angle candidate that is silently discarded or represented by a
foreshortened offset; non-axis-aligned relationships without a true-length
standard view explicitly require a section/additional reference.

## Joint view planning and physical visibility

Useful context is the union of independent references and other finite surface
contacts. It is opaque, dimmed by changing material colors, and retains normals,
grain and lighting. The footprint is not a physical neighbor.

For each camera:

* Project front-facing actual triangles. Triangle-polygon clipping, followed by
  clipping to positive **depth difference**, detects a neighbor actually in
  front of a nontrivial selected surface area. AABB overlap is insufficient.
* Elide the **whole** offending neighbor. Keep context behind the selected part.
  An obstruction is not ignored just because it is narrow.
* A nonzero offset requires `|n·cameraDirection| < 1e-5` so the normal segment
  has true orthographic length, a retained physical reference, and both anchors
  visible. Test anchors against projected retained triangles and depth.
* Assign a clearance once, to the first eligible view with a visible pair of
  actual finite boundary-edge anchors, in fixed
  Up/Down/Left/Right/Front/Back order. Contact notes may appear in multiple
  eligible views, without duplicate numeric labels.
* If the physical datum is elided, never dimension to it. If no view works,
  emit **Placement needs a section or additional reference**.

Occlusion is conservative for concave/self-occluding selected meshes: it may
remove context intersecting the projection of a selected front-facing surface
that is itself hidden. It does not knowingly leave an obscuring neighbor
because of sparse sample points. Coplanar contacts within depth tolerance
do not count as front obstruction. This is a surface algorithm, not a
solid-kernel visibility proof.

The preview is a stable union of useful context, selected geometry and
footprint, with **no camera-dependent removal**. Each `renderGeometry` contains
selected plus its retained dimmed context and the inset footprint, except Up,
whose SVG template is supplied separately. `boundsGeometry` contains selected
and complete retained physical references (including dimension endpoints), not
the full footprint. Thumbnails use `plan.geometry` alone.

## Top-view finite locations

These are horizontal plan measurements, not distances through space or
assertions of tread contact. They complement finite-face evidence without
silently increasing its six-degree-of-freedom rank.

1. Project upward-facing finished triangles into the assembly XZ plane.
   Extract their union's silhouette: split candidate edges at crossings and
   collinear endpoints, reject segments with filled area on both sides, then
   merge collinear degree-two junctions. Triangulation vertices, bevel seams,
   bounding corners and face-interior centroids are not reference corners.
2. For each retained non-hardware neighbor with verified vertical-face contact,
   find collinear overlap of its plan silhouette and the selected silhouette
   on that contact plane. If their corners coincide, omit a redundant location.
   Otherwise measure along the neighbor's actual finite edge from its nearest
   exposed corner to the selected edge's endpoint. The approach must be outside
   the selected silhouette, not through the part to its opposite edge.
   Keep one short, deterministic contact-location measurement.
3. Extract each exact, uninset tread-template outline separately using its
   `treadRanges`, retaining concave corners and merging straight subdivisions.
   Deduplicate shared edges and name them by both tread/step numbers.
   Intersect these finite segments with the selected plan silhouette. Require
   a genuine interior crossing of both segments; corner-on-corner or tangent/
   collinear matches need no nonzero distance. Measure from the nearest template
   corner to the part edge along the template edge, approaching from outside
   the selected silhouette.
4. Group crossings by the **same actual straight selected edge**. Never combine
   two different sides of the part and pretend they establish one line. Prefer
   a usable separated pair, then a long physical edge and widely separated
   stations; break ties deterministically by actual crossings, small offsets,
   and edge coordinates. Within that edge, prefer shared tread seams over
   perimeter edges. Order crossings along the line (assembly Z first):
   **frontmost and backmost take priority over intermediate seams**.
5. If that edge crosses fewer than two useful seams/outlines, cast outward
   along its actual direction beyond each end to the nearest **outer union
   perimeter** of the tread template, not the next internal seam. Reject a
   virtual extension that runs through the selected silhouette. Measure the
   intersection from an actual tread corner along the named finite datum.
   Draw the extension dashed. A hit exactly at a template corner is an
   explicit **corner aligned** mark, not a numeric zero-length dimension.
   Prefer the two separated perimeter hits over a redundant intermediate
   crossing; use a real crossing as fallback if both extensions are unavailable.
6. Check independent **planar pose coverage**, not annotation count:

   ```
   row(n, p) = [n.x, n.z, ((p-o) cross n).y / R]
   ```

   These three columns represent left-right translation, front-back translation
   and rotation about Up. A template offset fixes a crossing point on the
   template and requires the selected straight edge's line to pass through it;
   use that edge's perpendicular normal `n`. Two separated crossings fix this
   line's position and direction, but still allow the part to slide along it.
   Prefer these measurable point references to angle annotations; no angle
   candidate is generated.

   Count clear, visible implicit references too: selected outline corners on
   finite template edges, coincident corners, and finite outline overlaps on
   verified non-hardware physical contacts. A coincident corner supplies both
   planar coordinates. A contact's interior patch or an elided neighbor alone
   does not establish a visible outline fit. Existing displayed face-clearance
   measurements contribute their actual projected rows. An entirely obvious
   three-freedom fit needs no added location annotations.

   Compute rank with complete pivoting and the planar angular tolerance:
   near-parallel Float32 edges must not acquire an independent constraint
   through amplification of a small coordinate component. Each opposite view
   should try to establish its own planar placement; having to switch to its
   counterpart is a fallback, not a reason to suppress an available reference.

   Otherwise retain the useful finite joint location and a separated pair of
   straight-edge stations as practical construction references. Prune
   intermediate same-line stations by rank. Then, only while rank is below
   three, generate direct part-to-template setbacks. Extend actual straight
   edges to the nearest perimeter, measuring the gap from the physical corner
   rather than from a remote template corner. Also consider a perpendicular
   gap between parallel selected and template edges, centered in their finite
   projected overlap. This remains useful when a mitered end is parallel to the
   step edge but not square to the part's long edge. Reject paths through the
   selected silhouette, across intervening perimeter edges, or beyond finite
   datums.

   Rank direct setbacks by `gap / sin(crossingAngle)`: shorter gaps and
   near-perpendicular crossings are easier to measure than distant or
   shallow-angle references. For effectively equal costs prefer a squarer
   crossing, then a centered parallel-edge gap, then more room between the
   target and its datum corners. Use the template edge's normal at the target
   for this constraint row: unlike a
   template-corner-to-line station, the measured distance now starts on the
   selected part. Keep a candidate only if its row increases rank. If direct
   setbacks cannot supply the missing constraint, try the previous end-edge
   stations, other crossings/extensions and contact locations. Do not assume
   an end is perpendicular or substitute a guessed bounding-box axis.
   A transverse corner alignment or physical end stop can make this extra
   longitudinal measurement unnecessary; an unmeasured parallel boundary cannot.
   Stop at three. This typically means two line stations plus an obvious end
   fit, or three measurements when that end needs locating; a useful joint
   location can be retained as a separate construction check.
7. Include the retained endpoints in drawing bounds, but not in the pick mesh
   or preview. Mark each endpoint, trace its named datum edge, and place the
   numeric dimension near that edge. Group measurements on the same or nearby
   parallel datum lines into a shared axis. Use the same short-span arrows,
   perpendicular leaders and fanned segment-label layout as Details, with
   compact glyphs; overlapping spans get separate measurement lanes.
   Mark perpendicular setbacks with a small right-angle square at the selected
   edge when both the gap and the available edge length have room.
   Keep numeric values and keyed references unchanged. Put each descriptive reference in a keyed
   legend. Header/legend backgrounds keep the oversized template from
   obscuring instructions. The complete SVG/WebGL drawing still pans and zooms
   as one transform without recalculating annotation layout.

Each Top view reports `planar: {rank, implicitRank, required: 3, complete}`.
Rank below three explicitly says **placement needs an additional reference**;
missing/parallel/unreachable intersections are never replaced with guessed
anchors. Three means local planar coverage, not height, tilt, a unique finite
pose in a symmetric assembly, fastening, or construction intent. It does not
silently promote the overall six-degree-of-freedom result to complete.

## Result, statuses, caching, and failure

The result contains `title`, `geometry`, `footprint`, `templateGeometry`,
`views`, `previewGeometry`, `status`, `unresolved`, and optional diagnostic
`evidence`. Each view has `name`, `standardView`, `renderGeometry`,
`boundsGeometry`, `pickGeometry`/`pickRanges`, occurrence-ID `neighbors`/`occluded`, `dimensions`, `notes`,
and `status`; Top also has `planar`. Dimensions have `id`, `kind: "offset"`, `from`, `to`, `value` in
inches, concise nonnumeric `label`, and a physical-face or named template `reference`.
Top-view location dimensions also have `source` (`contact-position` or
`template-intersection`, `template-extension` or `template-setback`) and the finite `datumEdge`.
Template candidates also retain `selectedEdge`; virtual extensions have
`extension: [physicalEndpoint, perimeterPoint]`, and an added end-location
reference has `purpose: "longitudinal"`. Exact corner hits use `kind: "alignment"`,
coincident `from`/`to`, and zero value, rendered as alignment marks, not dimensions.
Direct setbacks measure from a physical selected point to the template;
parallel-edge gaps also have `perpendicular: true`.
Preview picking uses
`previewPickGeometry`/`previewPickRanges`, excluding the footprint.

* `partial`: some finite geometric evidence, with unresolved intent/pose listed.
* `unresolved`: no usable selected surface or no verified finite reference.
* View `no-visible-reference`: no assigned dimension/contact note in that view.
  Context can still help interpret the piece.
* Unknown/non-leaf IDs throw `RangeError`. Empty/degenerate meshes return
  unresolved plans, not synthesized measurements.

Plans cache by exact occurrence ID. Repeated selection and camera changes
neither regenerate geometry nor rerun discovery. The model is a snapshot:
construct a **new planner when rebuilding the model**. In-place geometry edits
are unsupported; do not reuse the old planner after parameter/topology changes.
There is one O(N) bounds scan per uncached selection, followed by targeted local
face/triangle checks, not an all-pairs assembly checker. Dense/highly tessellated
local meshes can still be expensive; there is no arbitrary triangle budget
that truncates results and falsely declares success.

## Validation and explicit limitations

Run `node --test placement.test.js`. Focused generic fixtures cover:

* a seat with remaining sliding and yaw, versus seat + side stop + end stop;
* real finite-face clearance and visible true-length anchors;
* overlapping bounds with disjoint physical faces;
* empty and degenerate surfaces;
* an oblique relationship with no true-length standard view, explicitly
  unresolved instead of an omitted/foreshortened angular measurement;
* front/behind triangle-depth elision and a concave context whose box overlaps
  but whose actual triangles do not obstruct;
* retained geometry, cache identity, consistent assembly frame;
* finished actual-model references at more than one runtime width.

Placement-reference tests also cover partial contact versus a flush corner,
exact synthetic template intersections, extreme-seam priority over intermediate
seams, and caster-beam references across widths and module/step layouts.
Additional fixtures cover a single seam with separated perimeter extensions,
an independently located end, a transverse corner or physical end stop avoiding
an extra end measurement, exact corner alignment marks, obvious full fits,
and honest incomplete planar coverage when the template is unreachable.
Cross-beam regressions prefer their own step's nearby end setback over an
oblique neighboring-step reference. Rotated mitered ends verify centered normal
gaps; nonparallel ends verify proximity/crossing-angle ranking. Drawing tests
check the normal construction line and omit right-angle marks in cramped gaps.
The Module 1 / Step 4 rear cross-beam regression explicitly requires a
measurement along the beam, independently of the reported complete rank.
It also preserves genuine Top-view occlusion by the neighboring uprights and
their visibility from Bottom.
These test the placement algorithm, not the existing physical-footprint generator.

Unsupported cases include curved/cylinder tangent joints, edge-only or
point-only contact, authored centerlines, nonparallel angular joints, remote
site datums, intended noncontact flush/centering, fasteners and assembly access.
The six-inch band can miss meaningful remote datums. Coplanar grouping uses
quantized shared-edge coordinates and tolerance-tested planes, so T-junction tessellation or nearly
coplanar noisy surfaces can split one reference. References are named by
occurrence plus face orientation, not fabricated woodworking feature names.
Local contact evidence does not certify solid non-interference elsewhere on a
nonconvex part; use the independent clash checker for that.

The next substantive extension is **authored finite locating datums and intent**
verified against finished geometry, not adjacency lists or a hardcoded set of
drawings. Such an extension must explicitly specify which slides/rotation it
controls, validate anchors, and retain the same truthful failure behavior.
