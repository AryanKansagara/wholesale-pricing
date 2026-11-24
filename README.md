# Wholesale Ready

A pricing and line-sheet studio for small brands going wholesale on Faire and direct: candle studios, ceramicists, stationers, apparel makers moving from DTC and Etsy into stockists.

**The pain:** handmade margins leave little room for a marketplace. A $10 new-retailer fee and 15% commission are noise on a $16 candle and a loss on a $7 travel tin, and fee changes quietly take another 10–20% off margin. Most makers find out after the order ships.

## Features

- **Import** Shopify (legacy and 2024 CSV layouts), Etsy and Faire product exports (Faire's .xlsx read directly in the browser, with a worksheet picker when a workbook has several sheets with data), cost sheets and bills of materials, with format detection, column mapping and a validation report with line numbers.
- **Engine (tested):** unit cost roll-up (BOM, labour, overhead), keystone, target-margin or competitor-anchored pricing with price-point rounding, per-channel contribution margin (Shopify, Etsy, Faire first order, Faire reorder, Faire Direct, direct wholesale), first-order loss flags, MAP/MSRP checks, order-minimum and retailer lifetime value economics, and a wholesale-tier simulator.
- **Actions:** printable line sheet with cover, grid and order form; Shopify and Faire price-update CSVs; a one-page pricing rationale.
- **History:** dated snapshots with a compare view showing what cost or fee changes did to every margin.
- **Dated, sourced, editable fee table** in `/docs`.
- Local-first (IndexedDB), optional account sync, light and dark themes, three synthetic sample brands.

## Run locally

```bash
npm install
cp .env.example .env   # optional: Supabase URL + publishable key for sync
npm run dev
npm test
```

Live: https://wholesale-pricing-eight.vercel.app

## Tests and CI

```bash
npm test                              # unit tests (node --test, src/**/*.test.ts)
npx playwright install chromium       # once; add --with-deps on a bare Linux box
npm run test:e2e                      # builds, serves the production build with `vite preview` on port 4390, runs Playwright (Chromium)
```

The E2E suite lives in `e2e/` and drives the production build signed out: it opens a sample, edits a price and a fee, imports a catalog and a cost sheet, downloads the Faire and Shopify price files and the line sheet, feeds it bad files, and reloads to check that state persisted. Every request to another origin is aborted (only the web-font hosts are tolerated), and any uncaught page error fails the test. Its fixtures are `e2e/fixtures/` plus the existing real-layout files in `src/engine/fixtures/`. Playwright traces and the HTML report are written to `test-results/` and `playwright-report/` when a run fails.

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm test` and `npm run test:e2e` on Node 22 for every pull request and push to `main`, with read-only repository permissions.

## Known gaps

- Faire's bulk upload accepts only its own .xlsx template, so the Faire price file is a CSV to copy into that template rather than a direct upload.
- One worksheet is imported at a time; to bring in two sheets from the same workbook, import the file twice and choose a different sheet each time. Chart sheets are not offered, and a worksheet whose XML uses prefixed element names (`<x:row>`) is read as empty. Old .xls and Numbers files need exporting to CSV.
- Shopify variants without a SKU are keyed by handle and option value; cost sheets must use the same keys.
- Prices are USD only.
