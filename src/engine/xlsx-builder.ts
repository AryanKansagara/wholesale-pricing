// Test helper: builds small, valid .xlsx workbooks from plain rows so tests can use synthetic multi-sheet files.
// Not imported by the app. Part layout follows ISO/IEC 29500-1 (SpreadsheetML): xl/workbook.xml lists each
// <sheet name sheetId state r:id/>, xl/_rels/workbook.xml.rels maps each r:id to the worksheet part, and the
// worksheet part holds the rows. Sheet parts and relationship ids are deliberately NOT in workbook order, so a
// reader that guesses "sheet1.xml" or the n-th file instead of following the relationships gets the wrong rows.
import { crc32, deflateRawSync } from 'node:zlib'

export type Cell = string | number | null

export interface TestSheet {
  name: string
  rows: Cell[][]
  /** Sheet state; omitted means visible. */
  state?: 'hidden' | 'veryHidden'
  /** Write strings inline (t="inlineStr") instead of through xl/sharedStrings.xml. */
  inline?: boolean
  /** A chart sheet has no cells; it is listed in workbook.xml but is not a worksheet. */
  chart?: boolean
}

export type Part = [name: string, data: string]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** The XML parts of a workbook, for tests that want to damage one before zipping. */
export function workbookParts(sheets: TestSheet[]): Part[] {
  const shared: string[] = []
  const sst = (s: string) => { let i = shared.indexOf(s); if (i < 0) { i = shared.length; shared.push(s) } return i }
  const n = sheets.length
  const parts: Part[] = []
  const sheetEls: string[] = []
  const relEls: string[] = []
  sheets.forEach((s, i) => {
    // Parts are numbered backwards and relationship ids start at 100, so neither matches workbook order.
    const part = s.chart ? `chartsheets/sheet${n - i}.xml` : `worksheets/sheet${n - i}.xml`
    const rid = `rId${100 + i}`
    sheetEls.push(`<sheet name="${esc(s.name)}" sheetId="${7 + i * 3}"${s.state ? ` state="${s.state}"` : ''} r:id="${rid}"/>`)
    relEls.push(`<Relationship Id="${rid}" Type="${REL}/${s.chart ? 'chartsheet' : 'worksheet'}" Target="${part}"/>`)
    if (s.chart) { parts.push([`xl/${part}`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><chartsheet xmlns="${NS}"/>`]); return }
    const rows = s.rows.map((row, r) => {
      const cells = row.map((v, c) => {
        if (v === null || v === '') return ''
        const ref = `${colName(c)}${r + 1}`
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
        return s.inline ? `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : `<c r="${ref}" t="s"><v>${sst(v)}</v></c>`
      }).join('')
      return `<row r="${r + 1}">${cells}</row>`
    }).join('')
    parts.push([`xl/${part}`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`])
  })
  relEls.reverse()
  relEls.push(`<Relationship Id="rId1" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`)
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheetEls.join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEls.join('')}</Relationships>`],
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${NS}" count="${shared.length}" uniqueCount="${shared.length}">${shared.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`],
    ...parts,
  ]
}

const le16 = (n: number) => [n & 255, n >> 8 & 255]
const le32 = (n: number) => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255]

/** A zip with UTF-8 names; entries alternate between stored and deflated unless `deflate` says otherwise. */
export function zip(parts: Part[], deflate: (name: string, index: number) => boolean = (_, i) => i % 2 === 1): ArrayBuffer {
  const out: number[] = [], central: number[] = []
  const enc = new TextEncoder()
  parts.forEach(([name, text], i) => {
    const nameBytes = enc.encode(name), raw = enc.encode(text)
    const packed = deflate(name, i) ? deflateRawSync(raw) : raw
    const method = deflate(name, i) ? 8 : 0
    const head = [...le16(20), ...le16(0x0800), ...le16(method), ...le16(0), ...le16(0x21), ...le32(crc32(raw)), ...le32(packed.length), ...le32(raw.length), ...le16(nameBytes.length), ...le16(0)]
    central.push(...le32(0x02014b50), ...le16(20), ...head, ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(out.length), ...nameBytes)
    out.push(...le32(0x04034b50), ...head, ...nameBytes, ...packed)
  })
  const eocd = [...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(parts.length), ...le16(parts.length), ...le32(central.length), ...le32(out.length), ...le16(0)]
  return new Uint8Array([...out, ...central, ...eocd]).buffer
}

export const buildXlsx = (sheets: TestSheet[]): ArrayBuffer => zip(workbookParts(sheets))
