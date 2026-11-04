# Staircase Building Instructions

I would now like to create a set of step-by-step instructions for building the staircase,
including diagrams and cut lists. You can assume the design is finalized, so we no longer
need to build a web program that dynamically generates renderings and instructions. The
work product now is the instructions themselves.

The instructions should be black-and-white or grayscale and suitable for printing. I am
agnostic about the format. A printable web page with SVG diagrams would be one possibility.

`index.html` is the project landing page, linking to the 3D viewer in `model.html`,
assembly instructions in `module1.html`, `module2.html` and `module3.html`, and the shared cut list in `cuts.html`.
Keep assembly instructions separate by module, but retain one global cutting document.
It covers all treads and framing for all three modules, plus module 1's foundation and structural newel/spindle supports,
with whole-project quantities and piece locations for every listed part.
Global P-xxx numbers identify unique cutting parts, not installed pieces. Number
the standard tread first and the first-step tread second. Defer spindle notches:
steps 2-9 share one cutting part even though their finished model parts differ.
Purchased hardware is shown by name and illustration, without cutting-part numbers.
Modules 2 and 3 start with completed wooden foundations; their assembly documents
cover the framing above those foundations, without casters or intermodule joining.
Module 1 starts from an unbuilt foundation. Include its beams, cross-pieces, low first-step
supports, apron and newel mounting blocks. Defer the newel itself with the other railing parts.

## Current status and next steps

Let's take an iterative approach to building instructions, so I can review each iteration
before continuing. The wooden foundations for modules 2 and 3 are already built, but their
casters will not be installed until the very end. Module 1's foundation still needs to be built,
so its document includes foundation construction.
Use the tops of the foundation cross-pieces as the assembly height datum, not the floor.
The current documents finish the framing for all three modules, including parts
classified in the model as treads, uprights, step framing, and risers. Module 1 also
includes its wooden foundation, newel mounting blocks and both front-spindle supports.

## Assembly instructions

You should use your judgement to think through a sequence of steps that makes sense for a
human assembling the stairway. This should take into account considerations such as the
following:

- The existing assembly (i.e., parts assembled so far) should be able to stand on the groud
- Each newly-added part needs to be able to attach to the existing assembly
- There should be clear reference points that enable a new part to be positioned accurately
  with respect to the existing assembly. Humans can't just position a part accurately in 3D
  space using a set of coordinates, but can measure and draw a line.

The current assembly approach is:

For module 1, build the foundation first. Dry-fit all six upright bottoms on the cross-piece
tops to locate their attachment blocks, remove the posts for underside fastening, then add
the low first-step supports before the step-2 and step-3 frames. There are no step-1 uprights.
Fit the step-3 right-front post with the step-2 frame to receive its rear support.

For modules 2 and 3, the revised approach is to assemble all three step frames and their uprights off the
foundation first. Rest the six full-length upright bottoms in a common level plane,
using the actual cut treads laid temporarily on the floor as placement patterns. The completed frames locate
the upright tops; temporary diagonal braces preserve alignment during transfer.
Build the bottom frame (M2-11 through M2-14) alone at floor level. Raise and support
it before fitting rear cross-member M2-48 between the rear uprights: the bottom of
long left rail M2-14 rests on TOP of M2-48, not underneath or against its end.
Fit step-5 right-front post M2-06 with the step-4 frame, whose rear support M2-12
fastens to it. Likewise, fit step-6 right-front post M2-07 with the step-5 frame
to receive rear support M2-29; these posts are already in place for their own frames.
Do not fasten uprights or lower attachment blocks to the foundation until all three
frames are assembled. Dry-seat the braced carcass to locate the blocks, lift it clear
for underside block fastening, then reseat and attach the upright bottoms. Leave the
lower front brace off until after transfer because it extends below the upright bottoms.

Put placement diagrams in the relevant assembly steps, not in a separate Layouts section.
In assembly views and placement plans, follow each callout's part number with its
part name in smaller print.
Connect leaders to the label's inner edge. Give assembly views more space than
the placement plans. Omit numbered procedures throughout the assembly sections;
keep only diagrams, measurements and brief essential captions.
Combine foundation transfer and lower-block attachment under "Attach steps to foundation".
Express placement visually and with measurements from tread edges or adjoining parts.
Omit coordinate tables and X/Y/Z axis notation throughout the document.

The earlier example below illustrates access considerations rather than the current sequence:

1. Place step 6 tread upside-down on the floor
2. Attach rear tread support (step 6)
3. Attach left and right tread supports (step 6)
4. Attach front tread support (step 6)
5. Attach attachment blocks to rear tread support

At this point I might realize that it would have been easier to connect the rear attachment
blocks (step 5) to the rear tread support before attaching it to the tread. That's because
the attachment blocks would need to be screwed in from the front. Or maybe they could be
screwed together from the back, but at least the threaded flanges need to be screwed in from
the front.

In general, wood pieces are joined by being screwed together and glued. The instructions should
perhaps include steps for pre-drilling screw holes. E.g., if part 1 is attached to part 2, then
we should pre-drill holes in part 1 for the screws to pass through. The separate modules are not
attached to each other during assembly, however. They are designed to be temporarily attached
using through-bolts that screw into the threaded flanges.

A possible inspiration for assembly instructions would be instructions that come with flat pack
furniture, such as from IKEA.

Each part in the assembly instructions should be numbered, so the same part numbers can be
referenced from the assembly instructions and cut lists without a separate parts register.
Show recognizable hardware images as callouts in the assembly views where their host
boards are introduced. Point leaders to the actual connector mounting centers and
include the host, face and measurements from stock edges beside each image.
Omit the standalone hardware section and connector table.

## Cut lists

Separate from the assembly instructions are cut lists, which a separate person could use to
cut out the wood parts for assembly.

Each numbered wooden part should show the cuts needed to make it from raw stock
(e.g., a 2x4, 1x4, or plywood sheet), including miters, bevels and notches. The part
diagrams in the model's Parts view are a good start, but use your judgement to make
each drawing as clear as possible.

Prefer dimensioned drawings to written cutting steps. A sufficient diagram needs no
instructions; reserve explanations for complex combinations such as a notch, miter and
bevel together. Put notch dimensions directly on the views in fractional inches, and
identify each part's step as well as its name.
Assume a competent carpenter; omit general cutting tutorials and a cut-sheet reading guide.
For beveled notches, align an end view beside each broad face and show the far edge
of the bevel as a dotted hidden line.
Apply this visual-first approach to every cut sheet: dimension the drawings themselves,
use hidden lines and aligned end views where they clarify cuts, and retain only brief
cut notes. Omit cutting procedures, coordinate tables and X/Y/Z axis notation.
Use the same scale in face, edge and end views; do not exaggerate thickness.

Display fractional inch lengths to the nearest 1/16 inch in both the model and instructions;
this includes cut-sheet diagrams, blank sizes and notch depths.
Retain full precision in the underlying geometry.

For a simple board with only square cuts (e.g., a 1x4 cut to a certain length), no diagram is needed.

For a board with only mitered cuts, a single face-on 2D diagram showing the miters and their angles
and the relevent lengths should be provided. Analyze each diagram with a view towards whether a human
with simple tools like a ruler and pencil has enough information to cut out the part. For boards, we
do have a chop saw, so we can make accurate mitered cuts given the length of one edge and an angle.

Some details can be omitted at this stage. For example, the treads have notches cut for the spindles,
but it doesn't make sense to cut those notches until just before we attach the spindles. Therefore,
the cut list should omit these notches.
Include a tread construction diagram showing the inner and outer radii and the inner
and outer straight chord lengths. Distinguish the measuring chords from the curved cut lines.
