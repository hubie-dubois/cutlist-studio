# CutList Optimizer feature audit

Reference: https://www.cutlistoptimizer.com/ (reviewed 2026-10-23, visible version 1.12.1).

Research: inspected the working application in Safari, its settings and PDF export dialogs, global/sheet statistics and cut sequence, and its public English UI labels. Premium controls were visible but disabled; their server implementation is not accessible. No third-party application code or branding is reused.

## Implementation checklist

- Blank startup, clear/undo, explicit sample loading (preserve).
- Part and stock lists: editable dimensions, quantities, labels, row enable/disable, sorting, duplicate, clear, bulk enable/disable, dimension-generated labels.
- Separate reusable part/stock lists; save, load, rename, search, delete with undo.
- CSV import/export for both lists, spreadsheet paste, portable project JSON.
- Project save/save-as, searchable library, rename and portable backups.
- Material types and separate grain direction for parts and stock.
- Independently named banding on each of four edges and band-length totals.
- Millimeters, centimeters, meters, decimal/fractional inches, decimal/fractional feet and inches, and generic units.
- Dimension display order and decimal precision.
- Kerf, single-sheet mode, edge trim, minimum leftover trim width, preferred cut direction.
- Objectives: material use, cut count, smaller average sheet area.
- Real search progress, accept best-so-far, cancel, 5,000-piece/stock limit.
- Diagram zoom, pan, view rotation, font size, colors, labels, dimensions, cut numbers, offcut dimensions.
- Group identical sheet layouts with explicit quantities.
- Global and sheet statistics, stock usage, used/wasted area, cut count and total cut length, offcuts, unplaced pieces.
- Executable cut table including source rectangle and resulting pieces.
- Configurable PDF/image exports: filename, header, notes, font size, summary, cuts, date, current/all layouts.

## Boundaries to report honestly

The reference also has account login/cloud sync, subscriptions/invoices, a dedicated optimization server, Android integration, and a multilingual interface. These are separate service/product capabilities, not evidence that its proprietary solver can be reproduced. Local equivalents retain free/offline operation; any remaining gaps must be listed at delivery. Minimum trim and preferred cut direction are implemented with explicit documented semantics because premium/reference internals cannot be verified.

## Delivered locally (2026-10-24)

All workshop capabilities in the checklist above are implemented in the browser UI and standalone HTML. Libraries are browser-local, with separate part/stock records; CSV and project JSON provide portable interchange. Grouping is restricted to identical geometry and the same stock row so inventory identity remains visible. Diagram controls affect exports as well as the screen. PDF reports use raster pages, support A4/Letter, and cap output at 250 pages; SVG remains vector. Multiple-layout PNG exports download separate files.

Search uses 512 strategies for up to 1,000 pieces, 128 for 1,001–2,500, and 80 above that, up to 5,000. Accept-best uses a fully completed worker candidate. This is an independently implemented heuristic, not the reference service's server solver or a guarantee that every possible cutting arrangement is evaluated.

Minimum trim checks the remaining gap after kerf in each dimension; preferred direction controls the first split of a placement. These semantics are documented in README because the reference's premium internals cannot be independently verified. Account/cloud services, billing, Android integration and multilingual UI remain outside this local implementation.
