import { FEE_SOURCES, FEES_CHECKED } from './engine/fees.ts'
import { CHANNEL_LABEL } from './engine/model.ts'
import { TEMPLATES } from './Import.tsx'
import { Code, Link } from './ui.tsx'

export default function Docs() {
  return (
    <section className="page docs">
      <div className="eyebrow">Docs</div>
      <h1>Getting your data in, and what the numbers mean</h1>
      <p className="lede muted">Everything runs in your browser. You need a product export from where you sell today and a cost sheet. Ten minutes, most of it filling in labour minutes.</p>
      <nav className="toc" aria-label="On this page">
        <a href="#shopify">Shopify</a><a href="#etsy">Etsy</a><a href="#faire">Faire</a><a href="#costs">Cost sheet & BOM</a><a href="#fees">Fees (dated)</a><a href="#exports">Export files</a><a href="#maths">The maths</a><a href="#data">Your data</a>
      </nav>

      <section id="shopify">
        <h2>Shopify product export</h2>
        <ol>
          <li>In Shopify admin, open <b>Products</b> and click <b>Export</b> (top right).</li>
          <li>Choose <b>All products</b> and <b>CSV for Excel, Numbers, or other spreadsheet programs</b> (plain CSV also works).</li>
          <li>Shopify downloads the file, or emails it for large catalogs. Drop it on the Import tab.</li>
        </ol>
        <p>Both Shopify layouts work: the long-running one (<code>Handle</code>, <code>Variant SKU</code>, <code>Variant Price</code>, <code>Variant Compare At Price</code>) and the 2024 template (<code>URL handle</code>, <code>SKU</code>, <code>Price</code>, <code>Compare-at price</code>). We also read <code>Title</code>, <code>Type</code>, <code>Option1 Name</code>/<code>Option1 Value</code> and <code>Cost per item</code>.</p>
        <ul>
          <li>Variant rows inherit the product title and option name; each variant becomes its own product, named like “Black Fig Candle - 4 oz tin”.</li>
          <li>Many shops never fill in variant SKUs. Those variants are keyed by handle and option (<code>black-fig-candle-4-oz-tin</code>); use the same keys in your cost sheet, or add SKUs in Shopify first.</li>
          <li>Image-only rows and gift cards are skipped. Compare-at price is read as MSRP, so a sale price below it shows up as a MAP warning.</li>
        </ul>
        <p className="muted small">Layouts checked {FEES_CHECKED} against Shopify's current product CSV template and exports from public Shopify sample stores (e.g. the shopifypartners/product-csvs repository on GitHub).</p>
      </section>

      <section id="etsy">
        <h2>Etsy listings export</h2>
        <ol>
          <li>In <b>Shop Manager</b>, go to <b>Settings → Options → Download Data</b>.</li>
          <li>Under <b>Currently for Sale Listings</b>, click <b>Download CSV</b>.</li>
        </ol>
        <p>We read <code>TITLE</code>, <code>PRICE</code> and <code>SKU</code>. Listings without a SKU get one from the title; match them to your catalog SKUs before importing costs, or set SKUs in Etsy first.</p>
      </section>

      <section id="faire">
        <h2>Faire product export</h2>
        <ol>
          <li>In the Faire brand portal, open <b>Products</b>.</li>
          <li>Use <b>Bulk edit</b> (or <b>Export</b>) to download your product spreadsheet.</li>
          <li>Faire gives you an Excel (.xlsx) file. Drop it on the Import tab as it is; the first sheet is read in your browser. A CSV saved from it works too.</li>
        </ol>
        <p>We read <code>Product Name (English)</code>, <code>SKU</code>, <code>Wholesale Price (USD)</code>, <code>Retail Price (USD)</code>, <code>Minimum Order Quantity</code> and <code>Case Size</code>, and tolerate the asterisks Faire puts on required columns.</p>
      </section>

      <section id="costs">
        <h2>Cost sheet and bill of materials</h2>
        <p>The cost sheet is one row per SKU with flat per-unit costs. Labour is in minutes; a per-row labour rate different from the brand's is converted for you. Leave overhead blank to use the brand-wide allocation (monthly overhead ÷ units made a month).</p>
        <Code code={TEMPLATES['cost-sheet']} label="cost-sheet.csv" />
        <p>A bill of materials links SKUs to shared components, so one supplier price change updates every product that uses it, and the wholesale tier simulator can swap components. Kind is <code>material</code> or <code>packaging</code>.</p>
        <Code code={TEMPLATES.bom} label="bom.csv" />
      </section>

      <section id="fees">
        <h2>Fees, as of {FEES_CHECKED}</h2>
        <p>These are the defaults every new brand starts with. Each is editable per brand under <b>Channels & fees</b>, and the date you checked them is stored with the brand and printed on the rationale. Faire's help centre blocks automated reading, so the Faire rows combine its public articles with recent 2026 write-ups that quote them. Check your own brand portal: your rates depend on your region, payout speed and when you joined.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Channel</th><th>Fee</th><th className="num">Default</th><th>Source</th></tr></thead>
            <tbody>
              {FEE_SOURCES.map((f, i) => <tr key={i}><td>{f.channel === 'all' ? 'All Faire orders' : CHANNEL_LABEL[f.channel]}</td><td>{f.item}</td><td className="num strong">{f.value}</td><td><a href={f.url} target="_blank" rel="noreferrer">{f.source}</a></td></tr>)}
            </tbody>
          </table>
        </div>
        <ul>
          <li><b>New retailer vs reorder.</b> A retailer Faire introduces pays the first-order rate once; reorders from them pay the reorder rate. Retailers you bring through your Faire Direct link pay no commission, only processing.</li>
          <li><b>Per-order fees</b> are spread across the units of an order by value, using each channel's typical order size. Change the typical order and the allocation changes with it.</li>
          <li><b>Etsy Offsite Ads</b> only apply to attributed orders, so the default charges 15% on 12% of orders. Shops over $10k a year pay 12% and cannot opt out.</li>
          <li><b>Shipping</b> is treated as passed through to the buyer. If you subsidise it, add it to fulfilment.</li>
        </ul>
      </section>

      <section id="exports">
        <h2>Export files</h2>
        <p><b>Shopify price update.</b> Columns <code>Handle, Title, Option1 Name, Option1 Value, Variant SKU, Variant Price, Variant Compare At Price, Cost per item</code>, matching Shopify's product CSV (checked {FEES_CHECKED}). Import with “Overwrite products with matching handles”. Price is set to MSRP so your site matches what stockists charge. Multi-variant products imported from Shopify keep their handle; check option values before overwriting.</p>
        <p><b>Faire price update.</b> Columns <code>Product Name (English), SKU, Wholesale Price (USD), Retail Price (USD), Minimum Order Quantity, Case Size</code>. Faire's bulk upload only accepts its own .xlsx template with its columns unchanged, so this file is not uploaded directly: download the current template (or your product export) from the portal, then copy these columns into it, matching rows by SKU.</p>
        <p><b>Line sheet and rationale</b> are print pages: use your browser's print dialog and “Save as PDF”.</p>
      </section>

      <section id="maths">
        <h2>The maths</h2>
        <ul className="math">
          <li><b>Unit cost</b> = flat materials + flat packaging + Σ (component cost × quantity) + labour minutes ÷ 60 × labour rate + overhead per unit.</li>
          <li><b>Keystone</b>: raw wholesale = cost × multiple. <b>Target margin</b>: raw wholesale = cost ÷ (1 − margin). Then MSRP = raw wholesale × retail markup, rounded <i>up</i> to the price point, and wholesale = MSRP ÷ markup, so rounding never eats your margin. <b>Competitor anchor</b>: MSRP = competitor price rounded to the nearest price point.</li>
          <li><b>Contribution per unit</b> = price − commission − processing − per-order fee × (price ÷ typical order) − per-unit fees − ads × share of orders with ads − fulfilment − unit cost. DTC and Etsy use your site or Etsy price; wholesale channels use wholesale.</li>
          <li><b>Order profit</b> = order value × (1 − commission − processing − blended cost ratio) − per-order fee, with the cost ratio weighted by your order mix. <b>Break-even first order</b> = per-order fee ÷ (1 − commission − processing − cost ratio).</li>
          <li><b>Retailer lifetime value</b> = first order profit + Σ<sub>k</sub> reorder rate<sup>k</sup> × reorder profit, over reorders a year × years. Payback is the first reorder where that running total reaches zero.</li>
          <li><b>MAP check</b>: your site or Etsy price below MSRP is flagged, and so is a retailer markup under 2×.</li>
        </ul>
      </section>

      <section id="data">
        <h2>Your data</h2>
        <p>Brands are stored in this browser (IndexedDB). Uploaded files are parsed and dropped; only the resulting catalog, costs, settings and snapshots are kept. Signing in (optional) syncs those to your account so you can open them on another device; brands over 3 MB stay on the device. You can export everything as JSON, delete your cloud data, or delete your account from the account menu. <Link href="/settings">Settings</Link></p>
      </section>
    </section>
  )
}
