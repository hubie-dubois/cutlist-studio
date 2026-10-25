# Cutlist Studio

A free, dependency-free sheet cutting planner that runs in your browser. The live app is at https://cut-list.hubiedubois.com/.

## Open the app

Double-click **Cutlist Studio.html** for the self-contained offline version. No server or installation is required. `npm run build` regenerates it after source changes.

For local development, `npm run dev` serves `dist/` at http://localhost:4173. `npm test` runs physical-invariant, import/export, units, project migration, and report tests. No dependency installation is needed.

## Projects and reusable lists

New projects start blank. **Load sample project** is opt-in. **Clear all** resets the current project and cutting settings while keeping units; **Undo clear** restores it until another project is opened or the page reloads. Empty and partially entered drafts are saved automatically. Existing edited projects remain compatible.

Use **Save project**, **Save as**, and the searchable **Projects** library to retain named projects. Saved projects can be renamed or deleted with undo. Export/import project JSON to transfer a project, including unfinished drafts. Storage is local to the browser and device; export files for durable backups.

Each table's **List tools** provides separate named part/stock libraries, CSV import/export, spreadsheet paste, sorting, bulk enable/disable, clear with undo, and labels generated from dimensions. Loading a list replaces that table, with undo. Dimensions in saved lists remain correct even when loaded into a project using different display units. Individual rows can be enabled/disabled; duplicate controls are in the materials/grain details.

CSV headers: `length,width,qty` (quantity defaults to 1). Optional: `label,material,grain,edges,band_top,band_bottom,band_left,band_right,enabled,unit`. `quantity` is an alias for `qty`. Spreadsheet paste accepts headers or columns in the order `length,width,qty,label,material`. Import appends rows and checks all data before applying it. Formula-like CSV text is prefixed with an apostrophe for spreadsheet safety.

## Dimensions, materials and grain

Supported units: millimeters, centimeters, meters, decimal/fractional inches, decimal/fractional feet and inches, and generic units. Fractions display to the nearest 1/64 inch; decimal precision is configurable from 0 to 6. Enter `24 1/2`, `2' 3 1/2"`, or an explicit suffix such as `100 cm`. Bare numbers in feet/inch modes mean inches. Changing units or display precision preserves the underlying millimeter geometry. Input fields retain extra decimal places to avoid changing cut sizes just by focusing a field. Dimension order can be length × width or width × length.

Length is horizontal on the unrotated diagram. Parts and stock each have independent grain directions: none, along length, or along width. Rotation must align those axes when both have grain. A legacy part grain lock means grain along length; legacy stock defaults to grain along length. Material names match case-insensitively. Represent thickness in the material name, for example `Birch 18 mm`.

Each part has four independently named banded edges. Totals use original edge dimensions and enabled quantities. Banding is an annotation: enter final cutting dimensions; band thickness is not automatically deducted. Totals include enabled pieces that could not be placed.

## Cutting and optimization

The worker compares up to 512 deterministic greedy guillotine strategies, including the original 80 strategies. Jobs above 1,000 enabled pieces use 128 strategies; above 2,500 use 80. Progress reports actual completed strategies and the best layout. **Use best so far** accepts a completed candidate; **Cancel optimization** stops the worker. Changes to cutting inputs invalidate the old plan and block stale exports.

Constraints include finite enabled stock, material matching, grain, rotation, saw kerf, edge trim, minimum trim width, and a one-sheet limit. Priorities are less total stock area, fewer cuts, or smaller average sheet area, always after minimizing unplaced pieces. This is a practical heuristic, not an exhaustive solver or a guarantee of mathematical optimality.

- Edge trim removes the specified amount from each of the four sides before packing. Use zero for boards already at their finished width. Trim cuts are excluded from cut totals and the sequence.
- Minimum trim width rejects a placement when either remaining gap, after subtracting kerf, is a nonzero strip narrower than the specified width. Exact stock-edge fits remain allowed. Zero disables this constraint.
- Preferred cuts choose the first split of each placement along length (horizontal) or width (vertical); the second orthogonal split still occurs where needed. These are explicit local semantics; the reference service's premium implementation is not accessible.
- Cut coordinates use the original sheet's top-left corner and mark the start of the blade kerf. Every cut spans its current source section. The sequence shows the source rectangle and resulting sections.
- Limits: 1,000 rows per table, 5,000 enabled pieces and 5,000 enabled stock sheets, dimensions up to 100,000 mm, and kerf/trim settings up to 1,000 mm. Large, fragmented jobs may take longer; the worker remains cancelable.

## Diagrams, statistics and reports

View options control zoom/pan, 90° view rotation, text size, colors, labels, dimensions, cut numbers and offcuts. Rotation of the view does not change the cutting plan. Identical layouts from the same stock row group with an explicit repeat quantity. Disable grouping to inspect every sheet individually. Straight board layouts retain a readable left-to-right piece list.

Project and sheet statistics show stock usage, used/unused area, cut count/length, offcuts, band totals, and unplaced pieces with fit diagnostics. Unused area includes offcuts, kerf and edge trim.

Export project JSON, either table's CSV, the current SVG, configurable PNG images, PDF reports, or print layouts. PDF/image settings include filename, header, notes, text size, date, and current/all layouts. PDFs also offer A4/US Letter, project-wide summary, and cut sequences. A selected-layout report's summary still describes the whole project. PNGs download separately for multiple layouts; the browser may require allowing multiple downloads. PDF pages contain high-resolution rendered images (text is not selectable), with a 250-page limit. SVG preserves vector geometry. View options carry into diagrams in all exports.

## Website deployment

GitHub Pages uses the **GitHub Actions** workflow in `.github/workflows/pages.yml` to test and publish `dist/` when `main` changes. Keep the custom domain `cut-list.hubiedubois.com` in Pages settings. Publishing the repository root would display this README. The standalone HTML is a separate offline artifact.

## Reference scope

See [the feature audit](docs/feature-audit.md) for the comparison with CutList Optimizer. This project uses its own interface and solver. It does not implement accounts/cloud synchronization, subscriptions/invoices, Android integration, a multilingual interface, or the reference's proprietary optimization server. It has no analytics or external runtime dependencies.

Verify dimensions, kerf, grain and cutting order against your actual material and machinery before cutting.
