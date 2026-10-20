# Curved Stairway Model

## Scope and components

The project is a standalone WebGL viewer whose JavaScript constructs a model
programmatically from reusable, parameterized components. All dimensions are in
inches.

The initial prototype was a single 12-inch 1x4. Its reusable components remain
available:

- `Board(thickness, width, length)` describes a rectangular board.
- `OneByFour(length)` specializes it with thickness `0.75` and width `3.75`.
- The initial board therefore measures `0.75 x 3.75 x 12`.

The viewer now displays the named `bottomFrame`, `topFrame`, `riser`, and `tread`
parts for each step, replacing the earlier simplified solid. Each bottom
frame includes two side boards, two vertical uprights, and a cross-piece.
The final step also has a pair of rear uprights at its far radial boundary.
Each top frame has two side boards and two end cross-pieces; the riser is a
separate piece. A half-inch tread sits on each top frame, flush with its side
and back edges and extending forward to the front of the riser.
Risers and treads are plywood, shown in a slightly lighter wood tone than the
1x4 framing. Subtle procedural grain follows each board's length, with slightly
darker, diagonal-patterned cut ends. Plywood veneers have quieter grain, and
their cut edges have striping through the thickness to suggest three plies in
the risers and five in the treads; these are illustrative, not stock specifications.
Grain coordinates and material colors stay attached to each piece when meshes
are combined or transformed and share the same directional lighting. Where
supported, shader derivatives fade out patterns too small to resolve on screen.
The viewer supports drag-to-orbit, two-finger drag to pan, wheel or pinch zoom,
and resetting the view. Two-finger gestures can pan and zoom together.
Keyboard arrows orbit, Shift+arrows pan, and +/- zoom.
The directional light follows the camera, keeping illumination from the same
upper-left direction on screen as the camera orbits. Ctrl+drag or Ctrl+arrows
adjust that camera-relative light direction horizontally and vertically without
changing the camera. These adjustments survive model, visibility, and
exploded-view changes. Home or Reset view restores both the camera and the
original lighting.
The right-hand panel provides live sliders for the two widths and step count.
Changes preserve the camera's viewing angle, zoom, and pan; Reset view clears
the pan as well as resetting rotation, zoom, and lighting, without changing the model.
Global checkboxes independently show or hide `bottomFrame`,
`topFrame`, `riser`, and `tread` across all steps. All start visible; hiding all leaves an empty
preview. Visibility changes preserve framing based on the complete assembly,
so hiding parts does not move the camera or rescale the remaining parts.
Other named parts are deferred.

### Exploded view

The separate **Exploded view** checkbox starts unchecked. Checking it increases
the rotation between steps from `angle` to `2 * angle`, leaving the first step
fixed and rotating every later step farther about the stairway's world origin.
Each step remains a complete assembly: its dimensions, elevations, materials,
and component positions relative to one another do not change.

`createGeometry(visibility, explosion)` accepts explosion progress from `0`
(assembled) to `1` (fully exploded), defaulting to `0`. The viewer interpolates
this progress over 600 ms with smooth easing in either direction. Toggling
again during a transition reverses from the current position rather than
jumping. Reduced-motion preferences make the change immediate.

Width, step-count, and part-visibility controls remain live during transitions.
The camera retains its orientation and relative zoom while fitting the moving
full assembly, including hidden parts. Reset view affects only the camera and lighting.
The increased angular spacing is a visualization, not a change to the stairway's
specified quarter-turn layout or fabrication dimensions.

## Fixed requirements

```js
const TOTAL_HEIGHT = 77;
const INNER_ARC_LENGTH = 60.5;
const INNER_RADIUS = INNER_ARC_LENGTH * 2 / Math.PI;
const FRAME_THICKNESS = 0.75;
const FRAME_WIDTH = 3.75;
const RISER_THICKNESS = 1 / 8;
const TREAD_THICKNESS = 1 / 2;
const FLOOR_CLEARANCE = 1;
```

The stairway turns exactly 90 degrees. Its reference inside edge is a
quarter-circle with an arc length of exactly `60.5`, so:

$$
R = \text{INNER_RADIUS}
  = \frac{60.5}{\pi/2}
  = \frac{121}{\pi}
  \approx 38.5155
$$

The total height from the floor to the upper landing is exactly `77`.

## Stairway parameters

The assembly is described by:

```js
buildStairway(bottomStairWidth, topStairWidth, stepCount)
```

| Parameter | Meaning | Default | Slider range |
|---|---|---|---|
| `bottomStairWidth` | Front width of the bottom step | `24` | `20` to `36`, in `0.25`-inch increments |
| `topStairWidth` | Back width of the top step | `24` | `20` to `36`, in `0.25`-inch increments |
| `stepCount` | Number of modeled steps, a positive integer | `8` | Integers `7` to `10` |

`stepCount` and the term `stairCount` used in discussion refer to the same
quantity. This document uses `stepCount` consistently.

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

Use equal angular spacing and interpolate the radial width linearly from bottom
to top. Let:

$$
n = \text{stepCount}, \qquad
\Delta\theta = \frac{\pi}{2n}
$$

For boundary index $j = 0,\ldots,n$:

$$
\theta_j = j\Delta\theta
$$

$$
w_j = \text{bottomStairWidth}
  + \frac{j}{n}
    (\text{topStairWidth} - \text{bottomStairWidth})
$$

Thus, $w_0$ is the front width of the bottom step, and $w_n$ is the back width
of the top step. The default widths are equal. When the top width exceeds the
bottom width, each step's back edge is slightly wider than its front edge;
reversing the widths produces a narrowing stairway.

Using horizontal coordinate pairs `(East, North)`, define the inside and
outside vertices at each boundary:

$$
I_j = (R\cos\theta_j,\ R\sin\theta_j)
$$

$$
O_j = ((R+w_j)\cos\theta_j,\ (R+w_j)\sin\theta_j)
$$

Step $i$ has the footprint $I_i,\ O_i,\ O_{i+1},\ I_{i+1}$. This vertex
construction defines the intended shape as well as the edge lengths below.

The inside vertices lie on the radius-$R$ circle. With linear widening, the
outside vertices lie on an Archimedean spiral segment: its radius increases
linearly with angle. With equal widths, the outside reference curve is a
concentric circular arc instead. Both boundaries are modeled with straight
segments, not curved edges.

The hard `60.5` requirement applies to the reference circular arc. The inside
polyline is its chord approximation, so its total length is slightly less than
`60.5`; it is not rescaled to have that length.

## Step component parameters

A reusable step is described by:

```js
new Step({ frontWidth, backWidth, leftDepth, rightDepth, height, stepRise, isLast = false })
```

For step index $i = 0,\ldots,n-1$, derive its horizontal dimensions as follows:

$$
\text{frontWidth}_i = w_i
$$

$$
\text{backWidth}_i = w_{i+1}
$$

$$
\text{leftDepth}_i = 2R\sin(\Delta\theta/2)
$$

$$
\text{rightDepth}_i =
\sqrt{
  (R+w_i)^2 + (R+w_{i+1})^2
  - 2(R+w_i)(R+w_{i+1})\cos\Delta\theta
}
$$

These depths are horizontal straight-line distances, not arc lengths or sloping
distances. Every step has the same inside depth. When the stairway widens,
the outside depth increases toward the top; with equal widths, it is constant.

The step component reconstructs the radial footprint from these four edge
lengths, using the constraint that the inside corners are equally far from the
intersection of the front and back radial lines. Its geometry therefore does
not depend on the stairway's global radius constant.
`stepRise` is the vertical difference between adjacent step-top elevations;
the stairway builder passes the same value to every step.

## Local coordinates and assembly

Each step's local origin is its inside/front/bottom corner. For an unplaced
step, East points across the front edge toward the outside, North points toward
the back, and Up is vertical. Coordinates remain in inches; no unit scaling is
applied.

To place step $i$:

1. Translate its local geometry East by `INNER_RADIUS`.
2. Rotate the translated geometry left about the world origin by
   $i\Delta\theta$.

The rotation changes both position and orientation. It is not a rotation about
the step's translated local origin. The local vertical origin remains floor
level; the bottom-frame boards start at `FLOOR_CLEARANCE` above that origin.

The implementation maps East to `+X`, Up to `+Y`, and North to `-Z`. The camera
orbits the assembled model's bounding-box center; the geometry retains its
specified world coordinates.

## Named part: bottomFrame

`Step.parts.bottomFrame` includes the base boards and uprights. It contains:

| Board | Cross section | Placement |
|---|---|---|
| `leftEdge` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Inside long face follows the inside footprint chord; its length is `leftDepth` |
| `rightEdge` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Outside long face follows the outside footprint chord; its length is `rightDepth` |
| `crossBrace` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Between the inward faces of the two uprights, behind the riser |
| `leftUpright` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Vertical, against the inward face of `leftEdge` |
| `rightUpright` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Vertical, against the inward face of `rightEdge` |
| `leftRearUpright` | `FRAME_THICKNESS` by at most `FRAME_WIDTH` | Final step only, against `leftEdge` at the far radial boundary |
| `rightRearUpright` | `FRAME_THICKNESS` by `FRAME_WIDTH` | Final step only, against `rightEdge` at the far radial boundary |

The side boards and cross-piece are edge-on, with `FRAME_WIDTH` vertical. Their bottoms are at
`FLOOR_CLEARANCE` and their tops at `FLOOR_CLEARANCE + FRAME_WIDTH`, currently
`1` and `4.75` above the floor, respectively. This is the same for every step:
these base boards do not rise with the eventual step heights.

The side-board thicknesses are measured perpendicular to their long faces.
Their ends are trimmed to the front and back radial boundaries. The cross-piece
is a 1x4, `0.75` deep in local North, rather than thin riser stock. Its ends meet
the inward faces of the uprights, not the side boards. It occupies the
frontmost position where both complete ends fit along those upright faces;
its front face is parallel to, but behind, the riser's back face.
Its end cuts follow the upright faces without gaps or volume overlap.
There is no rear cross-piece.

Future cut plans must specify finished lengths and separate front/back cut
angles for these boards, with angles explicitly measured relative to a square cut.

The frame boards retain their stock dimensions as `Board` components, with
quadrilateral footprints for the angled end cuts. Each board is a closed,
six-faced solid. The open interior is not filled by the old simplified solid.
Frames too small to accommodate the specified stock and brace are rejected
explicitly.

`RISER_THICKNESS` defines the separate riser thickness.
`TREAD_THICKNESS` defines the half-inch tread thickness.

### Uprights

`Step.parts.bottomFrame.boards` includes the two vertical 1x4s, `leftUpright`
and `rightUpright`. Their horizontal cross sections are rectangular, measuring
`FRAME_THICKNESS` by `FRAME_WIDTH`, or `0.75 x 3.75`.

The left upright's broad west face lies against the inward face of the left
bottom-frame side board; the right upright's broad east face lies against the
inward face of the right side board. Each upright's width follows its side
board's direction. Its southernmost vertical corner touches the back face of
the riser at local North `RISER_THICKNESS`. Because the side boards and
riser are not perpendicular, this is corner contact, not a flush front-face
joint. The upright cross sections are not beveled.

All uprights start at `FLOOR_CLEARANCE`, or `1` inch above the floor. Their
tops are at `height - TREAD_THICKNESS`, level with the tread's underside.
Each upright's vertical length is therefore:

```js
height - TREAD_THICKNESS - FLOOR_CLEARANCE
```

The stairway builder sets `isLast` only on the final step. Its bottom frame
adds `leftRearUpright` and `rightRearUpright`, with the same heights and side-face
contact as the front uprights. Their farthest corners touch the far radial
boundary without crossing it; their rectangular cross sections are not beveled.
The rear-left upright is narrowed along the side board only when full-width
stock would overlap the front-left upright, stopping at its back face.
It remains full width with seven or eight steps; nine and ten steps require narrowing.
The rear-right upright remains full width.

Uprights are no longer independently selectable: hiding `bottomFrame` hides
its side boards, cross-piece, and all its front and rear uprights together.

## Named part: riser

`Step.parts.riser` is a separate board with its own visibility checkbox.
It is edge-on, `RISER_THICKNESS` deep in local North. Its front face is
on the front radial boundary, local North `0`, and its back face is on local
North `RISER_THICKNESS`. It spans the complete front width, from the inside
footprint edge to the outside edge; its ends follow those straight side edges.

Its elevations are:

```js
riserBottom = Math.max(FLOOR_CLEARANCE, height - stepRise);
riserTop = height - TREAD_THICKNESS;
```

Step `0` starts at `FLOOR_CLEARANCE`, one inch above the floor; every later
riser starts at the previous step's top elevation. No bottom-frame height
clamp is needed because the cross-piece is behind the riser, not in the same
plane. The riser's vertical board width is `riserTop - riserBottom`, or
`stepRise - TREAD_THICKNESS` except for the shortened first riser.

## Named part: topFrame

`Step.parts.topFrame` contains `leftEdge`, `rightEdge`, `southCrossPiece`, and
`northCrossPiece`. All four boards have their tops at
`height - TREAD_THICKNESS`, aligned with the upright and riser tops, to support
the tread.

### Side boards and end cross-pieces

The side boards are edge-on, `FRAME_THICKNESS` thick, directly above the
corresponding bottom-frame side boards. The left board's west face follows
the inside footprint chord, with its east face against the left upright. The
right board mirrors this arrangement along the outside edge and right upright.
Their south ends butt against the riser's back face.

The previous rear extensions are removed. The side boards now end at the back
radial boundary, which is also the next step's riser's south/front plane. Their
rear cuts retain the radial angles. The final step uses the same boundary rule.
The front ends remain shortened to make room for the step's own riser.

Both cross-pieces fit between the inward faces of the side boards. Each is
`FRAME_THICKNESS` thick with its broad vertical dimension normally
`FRAME_WIDTH`, making it an edge-on 1x4:

- `southCrossPiece` has its south face against the riser's north/back face,
  at local North `RISER_THICKNESS`. Its north face is `FRAME_THICKNESS` farther
  north.
- `northCrossPiece` has its north face on the back radial boundary. Its south
  face is offset `FRAME_THICKNESS` perpendicularly into the step, so it follows
  the next riser's plane rather than a constant local North coordinate.

Their ends are cut to meet the side-board faces without gaps or volume overlap.
All four top-frame boards stay within the step footprint.

The usual vertical board width is `FRAME_WIDTH`. To avoid overlapping the
bottom-frame boards, the top-frame bottom is clamped to the base-board top:

```js
sideTop = height - TREAD_THICKNESS;
sideBottom = Math.max(sideTop - FRAME_WIDTH, FLOOR_CLEARANCE + FRAME_WIDTH);
sideWidth = sideTop - sideBottom;
```

Only step `0` requires this reduced width with eight to ten steps; with seven
steps, all top-frame boards retain full width. The reduction applies to both
side boards and both new cross-pieces. The
top and bottom side boards still share the same horizontal footprint, and
the two south cross-pieces also share horizontal space. Moving the bottom
cross-piece only removes the riser's height clamp.

Upright and fastening joints remain nominal: top-frame end cross-pieces
intersect the upper portions of adjoining uprights until a joint detail is defined.
The north cross-piece is intended for attachment to the next riser, but its
top is still `TREAD_THICKNESS` below that riser's bottom under the current
height rules. Those rules are preserved rather than inventing a new fastening
detail. The preview is not yet a fabrication-ready joint or cut plan.

## Named part: tread

`Step.parts.tread` is a separate `Tread` board with its own visibility checkbox.
It is `TREAD_THICKNESS` thick vertically, with its underside at
`height - TREAD_THICKNESS` and its top at `height`. It rests on all four
top-frame members and covers the riser's top edge.
Its front edge is at local North `0`, flush with the front radial boundary
and the riser's front face.
Its remaining edges follow the top-frame side boards and back radial boundary.

## Heights and risers

`height` means the vertical distance from the common floor to the horizontal top
of a step. It is not the height of an individual riser or the thickness of a
board.

The upper landing is one rise above the last modeled step. There are therefore
`stepCount + 1` equal rises between the floor and the landing:

$$
\text{stepRise} = \frac{\text{TOTAL_HEIGHT}}{n+1}
           = \frac{77}{n+1}
$$

For step $i$:

$$
\text{height}_i = (i+1)\text{stepRise}
                = \frac{77(i+1)}{n+1}
$$

| Surface | Height above the floor |
|---|---|
| Floor | `0` |
| Bottom step, index `0` | `stepRise` |
| Step at index `i` | `(i + 1) * stepRise` |
| Top step, index `n - 1` | `n * stepRise`, or `77 - stepRise` |
| Upper landing | `77` |

The landing is not an additional step in `stepCount`. Its remaining rise is
included in the height calculation.

With the initial eight steps, there are nine rises of `77 / 9`, approximately
`8.5556` each. The last step is approximately `68.4444` above the floor, leaving
one more rise to the landing. The current preview renders bottom-frame
assemblies, top frames, separate risers, and treads at these step-top heights.
The upright and top-frame tops are `TREAD_THICKNESS` below those heights.
The landing is not rendered.
