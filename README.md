# Cutlist Studio

A dependency-free, browser-local sheet cutting optimizer. Apple-inspired visual design with editable part and stock tables, 512-strategy guillotine packing, finite stock, saw kerf, edge trim, grain locks, material matching, unit conversion, edge banding annotations, cutting sequences, saved projects, CSV import/export, JSON backups, SVG diagrams, and print-to-PDF.

## Run

Double-click **Cutlist Studio.html** for the self-contained, offline version. No server or installation is required. `npm run build` regenerates this file after source changes.

`npm run dev` serves the site at http://localhost:4173. No installation step is needed. The deployable website is in `dist/`.

`npm test` runs the optimizer's physical-invariant and regression tests.

## Website deployment

The live app is at https://cut-list.hubiedubois.com/.

GitHub Pages uses **GitHub Actions** as its publishing source. The workflow in `.github/workflows/pages.yml` runs the tests and publishes only `dist/` whenever `main` changes. It can also be run manually from the Actions tab. The website files are ready to deploy; `npm run build` only regenerates the separate offline HTML download.

Keep the custom domain set to `cut-list.hubiedubois.com` in the repository's Pages settings. Publishing the repository root instead would display this README because the app's entry point is `dist/index.html`.

## Use

Enter finished cutting dimensions and stock quantities, then choose **Optimize layout**. Length is horizontal and follows the stock grain; locking a part's grain prevents rotation. Dimensions support decimal values and fractions such as `24 1/2`. Switching mm/in converts dimensions.

CSV import appends rows. Required headers: `length,width,qty`. Optional: `label,material,grain,edges,unit`. Units are `mm` or `in`; absent units use the current project setting. Edges use `T`, `B`, `L`, `R`; banding is an annotation and does not change cutting dimensions.

Save named projects to the browser library; export JSON for durable backups or transfer. Browser storage is local to the origin and device. No accounts, analytics, or external runtime dependencies.

## Algorithm and limits

The worker compares 512 greedy guillotine strategies (32 sorted strategies plus 480 deterministic shuffled strategies), including all of the original 80 strategies. A live progress bar tracks completed strategies, with the best sheet count, material utilization, cut count, and unplaced pieces. The worker keeps the page responsive; no artificial loading delay is added. It first minimizes unplaced parts, then stock area or cut count according to the selected priority. It is a heuristic; global optimality is not guaranteed. Every split goes through the full current free rectangle, with kerf deducted from the remainder. A final edge can coincide with the stock boundary. Layouts are capped at 500 pieces and 500 sheets to keep browser work bounded; optimization is cancelable.

New projects start with an empty name, parts list, and stock list. New rows have blank names and dimensions. Load sample project is an explicit opt-in and does not run optimization automatically. Clear all resets the current project and cutting settings (keeping units), with Undo clear available until another project is opened or the page is reloaded; saved library projects remain available. Empty and partially entered drafts survive reloads. Existing automatic sample data is retired on upgrade; edited projects and explicitly loaded samples are preserved. New projects use 3 mm saw kerf and zero edge trim. Material and trim conflicts appear beside the Optimize button. Edge trim is removed from all four sides before placement; use zero when crosscutting boards already at their finished width. Trim cuts are excluded from the numbered cut count. Cut coordinates are relative to the original sheet's top-left corner and locate the start of the blade kerf. Unused area includes offcuts, kerf, and trim. Material names match case-insensitively. Thickness is represented by a distinct material name, for example `Birch 18 mm`.

Verify dimensions, kerf, grain, and cutting order against the actual material and machinery before cutting. This site implements its own packing engine and interface; it does not use CutList Optimizer's proprietary algorithm or service.
