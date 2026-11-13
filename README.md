# Wholesale Ready

A pricing and line-sheet studio for small brands going wholesale on Faire and direct: candle studios, ceramicists, stationers, apparel makers moving from DTC and Etsy into stockists.

**The pain:** handmade margins leave little room for a marketplace. A $10 new-retailer fee and 15% commission are noise on a $16 candle and a loss on a $7 travel tin, and fee changes quietly take another 10–20% off margin. Most makers find out after the order ships.

## Features

- **Import** Shopify (legacy and 2024 CSV layouts), Etsy and Faire product exports (Faire's .xlsx read directly in the browser), cost sheets and bills of materials, with format detection, column mapping and a validation report with line numbers.
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

## Known gaps

- Faire's bulk upload accepts only its own .xlsx template, so the Faire price file is a CSV to copy into that template rather than a direct upload.
- Only the first worksheet of an .xlsx is read; old .xls and Numbers files need exporting to CSV.
- Shopify variants without a SKU are keyed by handle and option value; cost sheets must use the same keys.
- Prices are USD only.
