# Parts list UI design

This is the original design proposal. The current consolidated Parts browser,
Filters section, and Find interaction are documented in
[Part-browser UI](stairs.md#part-browser-ui).

**Model update:** the current implementation creates canonical, geometry-bearing
Parts during model construction, then installs Pieces referencing those Parts.
The Parts list displays those existing definitions and counts their Pieces; it
does not retroactively group installed component specifications. The ownership
hierarchy is Stairway -> Modules -> Pieces. Earlier `PartTree`/`PartNode` and
inventory-coalescing descriptions below are historical; see
[Part and Piece model](stairs.md#part-and-piece-model) for the current API.

## 1. Purpose and recommendation

Add a **Parts** tab alongside **Parameters** and **Assemblies**. It presents a
flat inventory of the current stairway, grouped by purchasing stock and
coalesced by manufacturing specification. Each entry includes its quantity,
useful cutting dimensions, and a short feature summary. Plain-text entries have
separate **Show location(s)** and **Show details** actions.

The two browsing modes answer different questions:

- **Assemblies:** Where does this particular component fit?
- **Parts:** What kinds of pieces do I need, how many of each, and what stock
  should I consider buying?

Use one physical part tree and one details viewer, not a second assembly
hierarchy or a separate set of woodworking drawings. Build the inventory as a
derived, read-only projection of the existing physical leaves.

**Recommended first release:** stock-grouped list, reliable coalescing,
unambiguous names, concise descriptions, quantity totals, all-occurrence
highlighting, and shared details with assembly-location links. Add search and a
small material overview next. Printing and export are useful later additions.
Do not make board-length optimization or sheet nesting prerequisites.

This document is a design and implementation proposal; it does not change the
application's behavior.

## 2. Requirements

### 2.1 Functional requirements

1. List every modeled physical part, including lumber, plywood, and purchased
   hardware. Do not list assemblies as parts or count an upright twice because
   it is displayed under Bottom frame.
2. Order and group entries by type of purchasing stock. In particular, all
   pine 1x4 parts must appear together, independently of their assembly parents.
3. Coalesce identical manufactured parts and show the required quantity.
   Quantity means the number of physical occurrences in the current model,
   not the number of assemblies, displayed names, or stock boards to buy.
4. Keep identically named but different parts separate. Qualify their names
   with useful assembly context, such as `Upright - front left (step assembly 6)`.
5. Retain every occurrence and its location even when multiple occurrences
   share one list entry.
6. Open the existing part-details experience from an entry, including the
   woodworking drawings or purchased-hardware 3D view as appropriate.
7. Make each entry useful without opening details: show stock, quantity,
   cutting length or sheet-aligned bounding rectangle, and notable features.
8. Recompute the inventory when width, step count, or module count changes.
   Camera position, explosion, selection, and visibility must not change the
   quantities.
9. Make it practical to draft a shopping list from the displayed inventory,
   while distinguishing required cut pieces from purchasable boards, sheets,
   or packs.

### 2.2 Presentation and interaction requirements

- Work in the existing narrow sidebar, without forcing the 3D canvas to become
  smaller solely to accommodate a wide table.
- Support keyboard and touch operation; do not require hover or double-click.
- Keep quantities and dimensions readable, including existing fractional-inch
  formatting and accessible plain text.
- Preserve the useful parts of the Assemblies workflow: stable selection,
  contextual highlighting, and a predictable return from details.
- Surface unavailable specifications or grouping errors explicitly. A missing
  description is not a reason to silently omit an item or guess its identity.

### 2.3 Not part of the initial scope

Automatic cut optimization, kerf allowances, board selection by retail length,
sheet nesting, prices, purchasing checkboxes, saved stock inventories, and
supplier substitutions are separate features. So are estimating unmodeled
fasteners, cladding, and banister components.

The UI must say **Modeled parts only**. A complete-looking inventory must not
imply that it is a complete bill of materials for constructing the stairway.

## 3. What the current application already provides

The following observations are based on the committed application, not assumed
new capabilities:

| Existing code | Capability and implication |
| --- | --- |
| `parts.js`: `PartTree.getLeaves()` | Enumerates each physical component once, including direct module beams and the uprights displayed under Bottom frame. This is the inventory source. |
| `PartTree.getAncestors()` and `PartNode.parentId` | Supply module, globally numbered step assembly, and frame context. No parsing of node-ID strings is needed for display labels. |
| `PartNode.getDescription()` | Returns structured lumber/plywood manufacturing data or hardware information, along with occurrence ID and name. Identity must exclude those occurrence fields. |
| `describeBoard()` | Describes source stock, blank profiles, cut length, finished width, width rip, edge cuts, notches, and dados. These are much stronger inputs than names or rounded display dimensions. |
| `part-description.js` | Already formats stock, dimensions, and the concise notable-feature summary. Reuse this logic rather than developing a second vocabulary. |
| `PartTree.getStockViews(id)` | Labels views relative to a particular installed occurrence. A coalesced entry still needs a real occurrence for details. |
| `PartBrowser` | Owns an assembly location and permits selecting its immediate leaf children. It is not a global inventory selection model. |
| `model.createNodeGeometry(id, ...)` | Supplies installed geometry for a real occurrence and respects the current explosion transforms. |
| `main.js` | Currently couples details, their description, and focus restoration to `browser.selectedNode` and the Assemblies tab. This needs a small explicit separation. |
| `index.html` / `style.css` | Provide two sidebar tabs, list-box-like part buttons, and one shared details dialog. The sidebar is only about 10-16 rem wide. |

### 3.1 Verified examples in the default model

For the current 24-inch, nine-step, three-module stairway:

- All nine **bottom-frame left side boards** have matching manufacturing
  descriptions.
- All nine **treads** have matching manufacturing descriptions.
- The **top-frame left side boards** are not all identical: the first step's
  board differs from the other eight. Their cut lengths alone do not reveal
  this difference.
- Left upright lengths and, in some cases, material, width, and joinery differ.
- There are 141 physical leaves, including 12 casters.

These observations are fixture examples, not quantities to hard-code. In
particular, `Left side board x 9` needs a **Bottom frame** qualifier so it
cannot be confused with a top-frame part of the same name.

## 4. UI options and variations

### Option A: A third sidebar tab with stock-grouped entries

**Recommended.** Add `Parts` to the existing tab strip. Each stock type is a
section with compact multi-line entries.

Advantages:

- Makes the distinction between assembly structure and inventory explicit.
- Keeps the 3D preview available for locating occurrences.
- Reuses typography, focus styles, tab keyboard controls, and the details
  dialog while distinguishing inventory actions from assembly selection.
- Supports both small collections of repeated parts and many unique uprights.

Disadvantages:

- Long descriptions wrap in the narrow sidebar.
- A third tab may wrap at the smallest sidebar sizes.
- A global inventory can be longer than the current assembly-local list.

Variations:

- **Plain-text entries with two low-profile actions:** agreed design. Each
  entry has **Show location(s)** and **Show details** beneath its description;
  the entry itself is not selectable. The actions remain independent.
- **Selected row plus a shared Details button:** considered but not chosen;
  familiar from Assemblies, but less natural for stock-grouped reading and
  future printed cross-references.
- **Row opens details immediately:** one fewer action, but makes inspecting
  the group in the main preview awkward. Suitable if highlighting is omitted.
- **Inline actions beside descriptions:** saves vertical space, but squeezes
  text in a narrow sidebar; put the agreed actions underneath instead.
- **Collapsible stock sections:** helpful for a longer inventory, but initially
  keep sections expanded so quantities are not inadvertently overlooked.

### Option B: A dedicated Parts dialog or full-width workspace

A `Parts list` command opens a large inventory with columns for part, quantity,
stock, dimensions, and features.

Advantages:

- Better side-by-side comparison of upright lengths and cutting variations.
- More room for purchasing subtotals, printing, and export controls.
- A semantic table is a natural fit when enough horizontal space exists.

Disadvantages:

- Covers or displaces the model.
- Opening part details from an inventory dialog introduces stacked dialogs or
  a second navigation layer. Avoid this by replacing the inventory content
  within one workspace, not opening a modal on top of another modal.
- A wide table still needs a separate narrow-screen presentation.

Variation: keep Option A as the everyday browser and later add an
**Expand / Print inventory** view using the same projection. Do not maintain
separate grouping or naming implementations for the two surfaces.

### Option C: An Assemblies / By stock switch inside the Assemblies tab

Reuse one tab and switch between hierarchical and inventory modes.

Advantages:

- Avoids adding another top-level tab.
- Could share the same selection controls and panel area.

Disadvantages:

- The tab name no longer accurately describes half its contents.
- Breadcrumbs, selection scope, and the meaning of quantities change inside
  one panel.
- More likely to accidentally discard the user's place in the assembly tree.

This is defensible if the tab is renamed **Browse**, with clearly independent
`Assemblies` and `Parts` views. It is less discoverable than Option A and adds
mode-switching complexity without reducing the inventory work.

### Recommended decision

Use **Option A**, with stock sections and plain-text multi-line entries, each
followed by low-profile **Show location(s)** and **Show details** buttons.
Retain Option B's expanded/printable view as a later enhancement. Do not
replace or flatten the existing assembly navigation.

## 5. Recommended list design

### 5.1 Structure and example entries

The following is an illustrative layout. Individual example dimensions and
feature summaries are from the current default model; the overview counts and
group subtotals must be computed.

```text
[Parameters] [Assemblies] [Parts]

Parts
Entire stairway | 9 steps | 3 modules | 24 in wide
Modeled parts only
<physical piece count> pieces / <cut-pattern count> types

Pine - 1x4
3/4 x 3 3/4 in actual
<piece count> pieces / <cut-pattern count> types

  Left side board (bottom frame)                 x 9
  1x4 pine - length 6 27/32 in
  2 beveled cuts
  [Show locations] [Show details]

  Upright - front left (step assembly 6)         x 1
  2x4 pine - length 44 11/16 in
  Width rip and 2 notches (with bevels)
  [Show location] [Show details]

...

Plywood - 1/2 in

  Tread                                         x 9
  1/2-inch plywood - blank 10 29/32 x 23 29/32 in
  2 mitered cuts
  [Show locations] [Show details]

...

Hardware - Casters

  CWfutureparts 3-inch swivel caster             x 12
  Purchased part - plate-mounted, two brakes per four-caster set
  [Show locations] [Show details]
```

Entries are plain text, not selectable rows or list-box options. Their actions
are explicit: locating a pattern and reading its details are independent.
Opening details does not require first selecting or locating the pattern.

The user's two-line format should be preserved semantically. Allow a third
visual line when the sidebar is narrow; never truncate away a notch, width
rip, or quantity just to force two rendered lines.

Always show quantity, including `x 1`, to make the list easy to scan. On a wide
row it can align to the right; on a narrow row it must remain attached to the
title rather than being clipped.

Use `in` in plain text consistently with existing descriptions. The current
fraction styling can improve screen presentation without changing copyable
text. Do not use a typographic inch mark as the only indication of units.

### 5.2 Stock sections and ordering

Use this order:

1. Lumber, grouped by material and nominal stock size.
2. Plywood, grouped by material/specification and thickness.
3. Hardware, grouped by product category.

For lumber, use a documented material order, initially pine then oak, with
nominal sizes sorted numerically rather than lexically. Preserve actual
thickness and width in the stock key: two supplies both labeled `1x4` must
not merge if their actual dimensions differ.

Within a stock section, sort by semantic role/name, then numeric cutting
length, finished width, and a deterministic variant tie-breaker. Use natural
number ordering for step and module qualifiers. Do not sort numeric lengths
by their formatted fractional strings.

Grouping by stock is broader than grouping identical cut pieces. Several
entries may share `Pine - 1x4` but have different lengths, rips, or notches.
Oak and pine versions of the same shape belong to different sections.

### 5.3 Names and disambiguation

Derive names from the retained occurrences, not from a new hard-coded catalog
of expected steps.

- Use the existing role name when it is unambiguous: `Tread`.
- Qualify frame-dependent names: `Left side board (bottom frame)` or
  `Left side board (top frame)`.
- For one-off variants, use the globally numbered step:
  `Upright - front left (step assembly 6)`.
- For repeated variants, compress an accurate location set:
  `Left side board (top frame, step assemblies 2-9)`.
- Direct module parts use module context, not an invented step parent:
  `Beam - caster left (module 2)`.
- If distinct patterns still produce the same label, add the shortest useful
  remaining ancestor context. As a final fallback, append `variant 1`,
  `variant 2`, etc., and show a visible distinction such as finished width or
  notch count below. Variant numbers are display aids, not persistent IDs.

Different role names must not prevent a genuine manufacturing match. If two
roles have the same specification, keep one entry with role aliases and their
quantities. Only two positional role pairs use merged display titles:
`Attachment block - rear support left / Attachment block - rear support right`
becomes `Attachment block - rear support`, and
`Spindle - front / Spindle - rear` becomes `Spindle`.
Retain the individual role names for Find and placement details; a filtered
group containing only one role keeps that role's positional name. If there are too many
roles for a useful title, use a neutral title such as `Board (3 roles)` and
expose the aliases under **Used in**. Never silently drop a role.

Location sets must come from actual membership. Do not write `steps 2-9` if
one of those steps uses a different variant.

### 5.4 Concise descriptions

Share the notable-feature formatter with Part details.

| Kind | Required row information |
| --- | --- |
| Lumber | Nominal stock and material; cut length at the long point; notable-feature summary. |
| Ripped lumber | Same, with finished width included in the row when needed to distinguish variants; always retain `Width rip` in the summary. |
| Plywood | Thickness and material; sheet/grain-aligned bounding rectangle; feature summary. The rectangle is not a claim that the final part is rectangular. |
| Hardware | Product/model name and concise distinguishing specification. Do not present approximate mesh dimensions as manufacturing data. |

For an ordinary board, `Square cuts only` is acceptable. Do not show every
cut angle or dado dimension in the list; those remain in details.

The example upright should appear as:

```text
Upright - front left (step assembly 6) x 1
1x4 pine - length 44 11/16 in
Width rip and 2 notches (with bevels)
```

If another variant has the same displayed length and summary, show its
finished width or additional location context. Rounded text is neither an
identity key nor a guarantee that two rows are equivalent.

### 5.5 Location actions, preview, and details

- **Show location** (one occurrence) or **Show locations** (several) highlights
  **all occurrences** belonging to the entry, not just the first.
  Keep the whole stairway as dimmed context so the repetition is visible.
  Only one pattern is located at a time; repeating its action leaves it shown.
  Mark the active location button and provide a text status, not a selectable
  row. Locating a different pattern replaces the highlight.
- Keep the current module separation and camera. Keep full-model
  bounds; do not zoom unexpectedly when selecting a small part.
- The Parts inventory and preview use the whole model, independently of
  Parameters visibility checkboxes, just as Assemblies has its own scope.
  State `All modeled parts; visibility filters do not affect quantities`.
  Returning to Parameters restores its existing visibility choices.
- **Show details** opens the shared dialog directly from that entry, with one
  representative occurrence and the group's quantity and locations. It does
  not change which pattern is located in the main preview.
- Closing details returns focus to that entry's Show details button. There is
  no separate selected-entry card or shared bottom-of-panel Details button.
- A future printed representation replaces the buttons with a cut-pattern
  part identifier and drawing/location cross-references. Page numbers are
  assigned during print layout, not used as model identity.

Color each physical leaf once in the Parts preview, highlighting pattern
members and dimming the others. Combine their `createNodeGeometry()` results
without layering a second coincident copy of the located parts over the
whole-model mesh; that would introduce depth artifacts.

### 5.6 Search, filtering, and empty states

Add a simple search after the basic inventory works. Match role aliases,
stock, material, feature words, and location names. Avoid an initial row of
multiple sort/filter controls competing with the list.

Search hides nonmatching **entries**; it does not restrict an entry's
membership. Searching `step assembly 6` may return `Tread x 9`, with the
explanation that this pattern is used there and elsewhere. It must not turn
that entry into `Tread x 1` unless a separate, explicitly labeled scope filter
has been introduced.

Keep section quantities as full-inventory totals, with a separate
`Showing N of M types` search result count. If the located pattern is filtered out,
clear the located-pattern highlight and its status. Do not leave an invisible
active location action.

Show `No matching parts` with a clear-search action. Unknown specifications
belong in an explicitly labeled unresolved section, with their physical
locations, rather than disappearing from counts.

### 5.7 Accessibility and responsive behavior

Use section headings, native `ul` and `li`, plain-text entry descriptions, and
two ordinary buttons under each entry. Do not add `role="listbox"`, selectable
row semantics, or click handlers on the entry itself. The active location
button can use `aria-pressed`. Native Tab/Shift+Tab and Enter/Space operate the
actions. Buttons must not be nested.

The row's accessible text must include its quantity, distinguishing location,
stock, dimensions, and features. Avoid a title-only `aria-label` that hides
the visible description. Associate the repeated action labels with their entry
title. A located pattern must be indicated by text as well as color.

Extend tab-strip Arrow Left/Right, Home, and End behavior to all three tabs.
Allow tabs and entry text to wrap. Do not make long part names unbreakable;
the existing nonbreaking assembly breadcrumb segments can remain unchanged.

Return focus from details to the actual opener. If that element no longer
exists after a rebuild, focus the corresponding current row or the Parts
heading, not an unrelated Assemblies control. Announce completed model or
search updates through one polite status message rather than announcing
every row.

## 6. Coalescing: define identity before implementing the UI

### 6.1 Three different identities

Keep these concepts separate:

| Identity | Example | Purpose |
| --- | --- | --- |
| Occurrence | Module 2 / Step assembly 6 / Bottom frame / Upright - front left | Selection, placement, assembly links, and context-relative views. |
| Manufacturing specification | One particular pine 1x4 blank and its complete cuts/joinery | Coalescing and quantity. |
| Purchasing stock | Pine 1x4, actual 3/4 x 3 3/4 in | Ordering and shopping guidance across many cut patterns. |

Names, parents, installed height, and renderer colors are not manufacturing
identity. Conversely, matching names, cut lengths, bounding boxes, or feature
counts do not establish identity.

### 6.2 Lumber and plywood specification

Build an explicit normalized record from the analytic description. Include:

- Part kind, material identity, source stock kind and nominal size, actual
  stock thickness and width, and any future grade/finish/grain restrictions.
- Blank dimensions and both stock-coordinate broad-face profiles, including
  fitted end geometry and width-rip shape.
- All cutting planes and their applicable faces or profile boundaries.
- Every notch's corner, length, paired face lengths when present, and both
  depths. Preserve the difference between depth bevels and shoulder bevels.
- Every dado's face, starting position, opening width, and depth.

Use semantic fields, not display sentences or a serialization of the entire
description object. Some fields, such as formatted cut angles, are derived;
prefer the underlying profile/plane and dimensional values. Do not accidentally
include occurrence ID/name merely because `getDescription()` includes them.

Canonicalize object-field order and semantically unordered feature arrays.
Normalize polygon cycles and face references so a different starting vertex
or face enumeration does not create a new pattern. Do not use mesh triangle
order, Float32 positions, grain-rendering coordinates, or normals as identity:
these reflect rendering choices as well as fabrication.

In the initial implementation, use the existing stock frame: X along grain,
Y through thickness, Z across width. Stock coordinates exclude world
placement. This already coalesces the verified repeated side boards and
treads without geometric matching in installed space.

### 6.3 Reversal, handedness, and safe under-coalescing

**Initial rule:** coalesce the same normalized stock-frame specification.
Do not automatically reflect a part, exchange broad faces, or reverse the
grain direction to make it match another record.

Two components may be physically interchangeable after turning a board over
or end-for-end even though their current stock-frame recipes differ. That is
a known conservative limitation, not a reason to merge all apparent mirrors.
Keep such cases separate until interchangeability is explicitly supported.
The initial list is a set of manufacturing patterns, not an optimizer for
every possible shop reorientation.

An optional later improvement can compare proper rigid stock rotations that
preserve the grain axis: identity and the three 180-degree axis rotations.
Transform the blank, cuts, notch/dado faces, and grain/finish restrictions
together, then choose one canonical representation. Never admit an improper
reflection. Two same-looking faces can conceal different handed joinery.
Retain the transformation per occurrence so details never mislabel a face.

If the implementation cannot prove equality for a new type, keep its
occurrences separate and explain that grouping is unavailable. Do not merge
on dimensions alone as a fallback.

### 6.4 Numerical normalization

Do not use the displayed 1/32-inch rounding for identity.

For example, start with a documented fixed normalization grid of `1e-8 in`
for analytic lengths and `1e-8` for unit-normal components, normalizing
negative zero as well. This is a floating-point noise policy, not a fabrication
tolerance. Validate it against independently generated matching descriptions
at the slider extremes.

Use a canonical normalized record as the equality value. A short hash may
index candidates, but a hash match must be checked against the full record.
Fixed-grid equality is deterministic and transitive; tolerance-based merging
of arbitrary neighboring entries can become order-dependent.

Values near a grid boundary can conservatively remain separate. Do not
silently widen tolerance until unequal cuts happen to match. Missing,
nonfinite, or invalid dimensions must produce an explicit error or an
unresolved occurrence, never a shared generic identity.

### 6.5 Hardware identity

The caster currently exposes a name, Amazon URL, specifications, and an
approximate mesh. Add a stable product key, such as an internal catalog ID
with manufacturer/model metadata, to its structured description.

Coalesce hardware by product key and relevant variant, not installed heading,
mesh similarity, role name, or prose summary. All front/rear and left/right
occurrences of the same caster then become one purchased-part entry.

The Amazon URL is an outbound link, not a robust identity mechanism. Packaging
is also separate: `12 casters required` does not establish `12 packs` or even
that the linked offer currently contains one caster.

## 7. Object-model changes

### 7.1 Keep the physical tree unchanged

`PartTree` remains the source of physical ownership. Do not reparent parts by
stock, replace occurrences with a shared Board object, or add a synthetic
Parts assembly to the tree. Current node IDs and geometry placement continue
to mean what they mean today.

In particular, preserve:

- Uprights' presentation under Bottom frame.
- Direct module-level support beams.
- Individual occurrence geometry and actual material/stock.
- The invariant that every physical leaf contributes exactly once.

### 7.2 Add a derived inventory module

Introduce `part-list.js`, with pure functions or a small read-only
`PartInventory` class. Build it once per newly constructed model from
`model.partTree`; do not regenerate it for camera motion or every render.

An illustrative entry shape is:

```js
{
  key,                    // Canonical specification key; not a tree-node ID.
  stockKey,               // Purchasing-stock key, not the cut-pattern key.
  kind,                   // lumber | plywood | hardware
  specification,          // Normalized, occurrence-independent record.
  occurrenceIds,          // All real leaf IDs, in stable assembly order.
  representativeId,       // One of occurrenceIds, for existing details APIs.
  roles,                  // Role names and their occurrence subsets.
  locations,              // Structured ancestor context for each occurrence.
  quantity,               // Exactly occurrenceIds.length.
}
```

Prefer exposing derived labels through presentation helpers rather than
making English strings part of this immutable identity record. Validate
membership, representative membership, and the sum of quantities.

Stock sections aggregate entries by `stockKey`. This does not require a
second class hierarchy or a database. JavaScript records, arrays, and maps fit
the dependency-free codebase.

### 7.3 Small extensions to structured descriptions

Add stable material keys to the current Pine/Oak/Plywood catalog records and
carry them into structured stock descriptions. Keep human-readable material
names for display. Add the caster product key and category.

The existing woodworking description contains the needed dimensional and
joinery data. Prefer an adapter that extracts its specification fields over
adding duplicate manufacturing logic to every Board subclass. Introduce a
new component-level specification method only if the adapter demonstrably
cannot represent a future part.

Do not add required procurement fields with invented values. Grade, sheet
size, usable board lengths, pack size, and stock availability are currently
unknown.

### 7.4 Separate inventory state from assembly state

Keep `PartBrowser`'s current contract. Add independent inventory state:

- Located pattern, tracked through a preferred occurrence ID.
- Separate details context and its own representative occurrence.
- Search text and, if later introduced, collapsed stock sections.
- Per-tab scroll position.

Do not make `PartBrowser.select()` accept arbitrary global leaves just to
reuse it for Parts. A location link can legitimately navigate to the leaf's
parent and then select the leaf.

### 7.5 Rebuild and location/details lifecycle

On a parameter change, construct the new model, tree, inventory, and resolved
location/details state before committing the UI update. Keep the existing successful view
if model construction fails, and report the failure rather than displaying
new counts over old geometry.

Preserve inventory intent by retaining the located occurrence ID when topology
is unchanged, then look up the new entry containing that occurrence. A width
change may change the specification key even though it is still the same
logical tread. A formerly shared entry may split; follow the preferred
occurrence and update the quantity, rather than retaining old membership.

When step/module topology changes, follow the existing Assemblies reset
policy: clear located-pattern state, rebuild names/counts, and retain harmless
view preferences such as search text. Do not assume a reused node ID refers
to the same physical design after regrouping.

If a details dialog can remain open during a programmatic update, rebind it
to a valid new occurrence and current description, or close it with a brief
status message. Never leave stale dimensions attached to new geometry.

## 8. Harmonizing Assemblies and Part details

### 8.1 Assemblies

Keep its mixed subassembly/part lists, breadcrumbs, immediate-child selection,
and selected-part highlighting. It remains the way to inspect one particular
installed component and its neighbors.

Reuse typography, low-profile action styling, and focus rings, while keeping
independent Show location and Show details actions under each part name.
Do not expand every assembly-local row into a full
inventory description by default; its structural context already does useful
work and the current compact list should remain compact.

Provide **Find in Parts** in the shared details dialog, regardless of which
tab opened it. It closes details, activates Parts, reveals the existing entry
containing that occurrence, and invokes its normal Show location(s) behavior.
Scroll the full entry, including its name and description, into view and focus
its Show location(s) button. Do not filter the list or introduce row selection.
Use membership lookup rather than recomputing a name match.

Highlight all members with the normal inventory representative; do not retain
the originating occurrence as a preferred representative for later details.
If optional search is added later, clear a conflicting search with an announcement.

Switching tabs preserves assembly selection, the independent located pattern,
and each tab's scroll position. Simply opening Parts must not navigate the
assembly browser.

### 8.2 One explicit details context

Refactor details consumers in `main.js` to resolve a context rather than
reading `browser.selectedNode` throughout:

```js
{
  source,                 // assemblies | parts
  occurrenceId,           // Real node used for geometry and view directions.
}
```

Derive the current entry and logical return button from the source and
occurrence ID, rather than retaining a stale specification key or DOM node
across a model rebuild.

The dialog uses that occurrence for description, stock geometry, hardware
geometry, and `getStockViews()`. Existing viewer instances and SVG annotation
code can be reused. `showInformation()`, view selection, error handling,
hardware controls, and close/focus logic must all use the same resolved
context; changing only the open button is insufficient.

### 8.3 Quantity, representative views, and locations

From either Parts or Assemblies, use exactly the inventory entry's title and
quantity as the dialog heading:

```text
Left side board (bottom frame) x 9
[Used in 9 locations]
```

The normal description and drawing follow. This does not imply that all
occurrences occupy one assembly.

The collapsed location disclosure identifies the specific occurrence used for
the drawing and lists all occurrence paths. Details opened from Assemblies
continue to draw that exact occurrence; the shared title does not replace it
with the inventory's first representative.

Provide a **Show in Assemblies** action for each location. Activating
that action closes the dialog, navigates the
assembly browser to the occurrence's parent, selects it, switches tabs,
scrolls its full row into view, and focuses its Show location button.
The Parts highlight remains independent. There is no nested dialog.

Optionally allow choosing a different representative occurrence without
leaving details. Keep the quantity and manufacturing specification fixed,
but refresh stair-relative labels and compass directions. Initially, a stable
first occurrence plus explicit representative text is sufficient.

The shared details dialog also provides **Find in Parts** from either source.
The shared heading already conveys the manufacturing pattern, role aliases, and total
quantity; the occurrence path is secondary context, not the primary title.

### 8.4 Preserve the existing drawings

Retain `Up end`, `Left face`, etc. as labels relative to the representative
installed occurrence. Do not rename them to global stock axes for all users
merely because details can now be opened from an inventory.

Keep the plywood single-view behavior, woodworking callouts, and hardware
interactive 3D rendering. Preserve the product link in hardware details.

Keep the new location disclosure collapsed initially so it does not consume
the drawing area. The current bounded, scrolling description region should
continue to leave room for the main drawing.

### 8.5 Shared concise-description formatting

Extract a small formatting helper for the list's stock/dimensions/summary
fields, reusing `formatLength()` and the feature-summary logic from
`formatPartDescription()`. Do not strip a long description using string
replacement or duplicate feature counting in `main.js`.

The existing measurement DOM formatter is local to `main.js`. It may remain
there if both list and details are rendered there; extract it only if a
separate UI module actually needs it. No new formatting library is necessary.

## 9. Shopping-list usefulness and limits

### 9.1 Useful in the first release

The stock sections and row quantities already let someone write down, for
example, which pine 1x4 cut pieces are required and inspect the longest ones.
Add a compact material overview once the underlying inventory is reliable:

| Category | Safe derived information | Not implied |
| --- | --- | --- |
| Lumber | Actual/nominal stock, required piece count, sum of blank cut lengths, longest required blank. | Retail board count, waste allowance, or a feasible cutting layout. |
| Plywood | Thickness, part count, bounding-rectangle dimensions, and optionally summed bounding-rectangle area. | Number of sheets or a valid grain-preserving nesting arrangement. |
| Hardware | Product/variant and number of individual units required. | Package count, price, supplier availability, or included mounting fasteners. |

For lumber, sum `quantity * cutLength` using raw values and round only the
displayed total. Cutting lengths refer to long points. Width rips still
consume the original source width; do not assume ripped-off strips can supply
other parts.

If plywood bounding areas are shown, label them **sum of blank rectangles**,
not `sheet area required`. Do not divide by a presumed 4x8 sheet and present
the result as a purchasing recommendation.

Use a plain warning:

> Cut-piece requirements, not an optimized buying list. Allow for kerf,
> trimming, defects, grain direction, and available stock. Fasteners and other
> unmodeled items are not included.

### 9.2 Later enhancements

A print or plain-text export is more valuable initially than an optimizer.
It should include the current parameter snapshot, stock sections, quantities,
cut dimensions, feature summaries, occurrence references, and the same
limitations. Use the inventory projection rather than scraping rendered rows.

An eventual buying-list tool needs explicit inputs for available lengths and
sheet sizes, kerf, end allowance, defects/waste, grain restrictions, and pack
sizes. Treat it as a separate derivation from the parts inventory.

## 10. Detailed implementation plan

Each stage should leave the existing Assemblies and details workflow usable.
No new framework, service, or dependency is required.

### Stage 1: Define and verify inventory identity

**Files:** new `part-list.js` and focused `part-list.test.js`; small structured
metadata changes in `model.js` / `parts.js` if needed.

1. Define stock keys, canonical manufacturing records, numeric normalization,
   and the unsupported-specification policy.
2. Add stable material and hardware product keys without changing display
   names or existing geometry.
3. Enumerate physical leaves exactly once and build deterministic entries,
   stock sections, reverse occurrence lookup, and structured locations.
4. Implement naming/disambiguation and role aliases separately from identity.
5. Add the new test file to the existing `npm test` script.

**Acceptance:** the default fixture contains a bottom-frame left-side pattern
with quantity 9, a tread pattern with quantity 9, and caster quantity 12.
Different upright lengths, stock materials, ripped widths, and joinery remain
separate. The first top-frame side board is not incorrectly merged with the
other eight. Entry quantities sum to the physical-leaf count.

Stop and resolve identity discrepancies here; a polished UI must not conceal
an unreliable grouping algorithm.

### Stage 2: Decouple and reuse the details controller

**Files:** `main.js`, minimal `index.html` adjustments if required,
`viewer.test.js`.

1. Introduce the explicit details context and one resolver for the current
   occurrence, description, and view directions.
2. Replace direct `browser.selectedNode` dependencies in details rendering,
   annotations, hardware interactions, and close/focus handling.
3. Keep the existing Assemblies open action working before adding Parts.
4. Add representative/group metadata and a compact locations disclosure.

**Acceptance:** existing lumber, plywood, and caster details remain unchanged
when opened from Assemblies. A supplied inventory context can open the same
viewer without navigating the assembly browser. Escape/Close restores the
correct source focus.

### Stage 3: Ship the Parts tab

**Files:** `index.html`, `style.css`, `main.js`, `part-description.js`,
`viewer.test.js`.

1. Add the tab/panel and extend existing keyboard tab navigation.
2. Render stock headings, computed counts, qualified names, quantities, and
   concise descriptions using shared formatting.
3. Implement separate low-profile Show location(s) and Show details actions on
   each plain-text entry; no row selection or shared Details action.
4. Highlight all occurrence members against full-model context, without
   changing camera, bounds, explosion mode, or parameter visibility state.
5. Build inventory state transactionally on parameter changes and apply the
   location/details lifecycle from section 7.5.
6. Provide visible errors/unresolved entries rather than omitting parts.

**Acceptance:** a user can find pine 1x4s together, distinguish upright
variants, locate all nine matching side boards, and open their details directly.
Counts refresh after every parameter change and remain unchanged by camera,
visibility, and explosion controls. Narrow rows retain all essential text.

This is the minimum useful release; search and exports need not block it.

### Stage 4: Connect occurrence and inventory navigation

**Files:** `main.js`, details markup/style, `viewer.test.js`.

1. Add **Find in Parts** to shared details: reveal the matching unfiltered
   entry, invoke its location action, and focus that action. Use the normal
   inventory representative rather than carrying over the original occurrence.
2. Add **Show in Assemblies** beneath each full location path in details;
   navigate to and highlight that exact occurrence, scroll its row into view,
   and focus its Show location action.
3. Preserve independent tab selections and scroll positions.
4. Restore focus by logical IDs rather than keeping references to DOM elements
   destroyed during rerendering. Perform navigation after the dialog's close
   event so its normal focus restoration cannot override the destination.
   Search-conflict handling is only needed if optional search is added later.
5. Verify representative occurrence labels for parts used in several modules.

**Acceptance:** navigation works in both directions, targeting the chosen
physical occurrence in Assemblies and the correct complete pattern in Parts,
without unexpectedly resetting the main camera or changing explosion settings.

### Optional follow-on work

Choose these independently rather than making one large release. None is
required to complete stages 1–4.

#### Shopping-list scanning (deferred)

The current stock grouping and descriptions are sufficient for manually
drafting a shopping list. Defer these conveniences until actual use reveals
a need for faster scanning or material summaries.

**Files:** `part-list.js`, formatting and panel rendering, focused tests.

1. Add search across roles, stock, features, and locations, preserving whole
   entry quantities.
2. Add material overview totals and the purchasing limitations.
3. Add a clear empty state and `Showing N of M types` feedback.
4. Consider optional stock-section collapsing only after evaluating the
   actual list length.

**Acceptance:** searching a location does not silently turn an all-stairway
quantity into a per-step quantity. Lumber totals include rips at their source
stock requirements, and plywood/hardware totals do not claim sheets or packs.

#### Other optional improvements

- Printable/expanded inventory using the same projection.
- Plain-text or CSV export, with raw numeric fields distinct from display
  fractions where appropriate.
- Choosing a representative occurrence inside details.
- Proven stock-rotation equivalence with explicit handedness tests.
- Explicit module scope, with quantities labeled `in this module` and
  optional whole-stairway totals.
- Buying-list optimization with user-supplied procurement constraints.

## 11. Focused verification and completion criteria

Use the existing Node test runner and lightweight viewer harness. Favor
fixtures and pure inventory tests over prolonged browser automation.

**Identity cases:** same part at different placements; same name with
different lengths; same rounded length but different raw dimensions; pine vs.
oak; full vs. ripped width; differing notch face depths and shoulder lengths;
different dado faces; mirrored asymmetric cuts; different array/face ordering;
hardware with different headings but the same product; unknown metadata.

**Accounting cases:** every physical leaf appears once; quantities sum;
direct module beams and relocated upright presentation are included; search,
visibility, and explosion do not alter requirements.

**UI cases:** repeated location actions do not toggle off; all occurrences
highlight; details uses a real representative; counts/selection survive or
reset correctly on rebuild; assembly/list navigation and focus restoration
work; empty/unresolved states are explicit; no detail viewer reads the wrong
tab's selection.

**Manual checks:** narrow sidebar, short landscape viewport, keyboard-only
use, copyable fractional dimensions, and enough remaining drawing space when
locations are disclosed.

The first release is complete when the list is reliable enough to draft
cut-piece requirements, every entry can reach the shared details UI, ambiguous
names are qualified, and users cannot confuse a coalesced pattern with one
particular assembly occurrence or an optimized stock purchase.
