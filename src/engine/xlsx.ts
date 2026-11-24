// Reads the worksheets of an .xlsx file into rows of strings, with no library:
// an .xlsx is a zip of XML parts, and browsers (and Node 18+) can inflate zip entries with DecompressionStream.
// Sheets are found the way ISO/IEC 29500-1 describes: xl/workbook.xml lists <sheet name state r:id/> in tab order
// (§18.2.19; state is visible, hidden or veryHidden, §18.18.68) and xl/_rels/workbook.xml.rels maps each r:id to the part.

const u16 = (b: Uint8Array, i: number) => b[i] | b[i + 1] << 8
const u32 = (b: Uint8Array, i: number) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0

async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const b = new Uint8Array(buf)
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not an .xlsx file (no zip directory found).')
  const files = new Map<string, () => Promise<string>>()
  let p = u32(b, eocd + 16)
  for (let n = u16(b, eocd + 10); n > 0; n--) {
    if (u32(b, p) !== 0x02014b50) break
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32), local = u32(b, p + 42)
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen))
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    const data = b.slice(start, start + size)
    files.set(name, async () => {
      if (method === 0) return new TextDecoder().decode(data)
      if (method !== 8) throw new Error(`Unsupported compression in ${name}.`)
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      try { return await new Response(stream).text() } catch { throw new Error(`${name} is damaged and could not be decompressed.`) }
    })
    p += 46 + nameLen + extra + comment
  }
  return files
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
// A numeric reference that is not a code point (e.g. "&#abc;" or "&#x110000;") is left as written instead of throwing.
const codePoint = (e: string) => { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n <= 0x10ffff ? String.fromCodePoint(n) : undefined }
const unescape = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === '#' ? codePoint(e) ?? m : ENT[e] ?? m)
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unescape(m[1])).join('')
// `name` is a regex source so a namespace prefix of any name can be matched; both quote styles are valid XML.
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? m[1] ?? m[2] : undefined }
// Attribute strings of every <name .../> element, with or without a namespace prefix (<sheet> or <x:sheet>).
const elements = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}(\\s(?:[^>"']|"[^"]*"|'[^']*')*?)?\\/?>`, 'g'))].map(m => m[1] ?? '')

function colIndex(ref: string) {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

const MAX_COLUMN = 16_383 // XFD, the last column Excel has

function parseSheet(sheet: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = []
    let next = 0
    for (const cm of (rm[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[1], body = cm[2] ?? ''
      const ref = attr(tag, 'r'), t = attr(tag, 't')
      const i = ref ? colIndex(ref) : next
      if (!Number.isInteger(i) || i < 0 || i > MAX_COLUMN) throw new Error(`Cell reference "${ref}" is outside the worksheet grid.`)
      next = i + 1
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let val = ''
      if (t === 's') val = shared[Number(v)] ?? ''
      else if (t === 'inlineStr') val = texts(body)
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
      else if (v !== undefined) {
        val = unescape(v)
        // Excel stores 12.1 as 12.0999999999999; show what the spreadsheet shows.
        if (t !== 'str' && t !== 'e' && val !== '' && Number.isFinite(Number(val))) val = String(Number(Number(val).toPrecision(15)))
      }
      while (row.length < i) row.push('')
      row[i] = val
    }
    rows.push(row)
  }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

export interface SheetInfo {
  name: string
  /** state="hidden" or "veryHidden" in workbook.xml. */
  hidden: boolean
  /** Non-empty rows, header included. 0 means nothing to import. */
  rows: number
  /** The sheet's part is missing or damaged. */
  unreadable: boolean
}

export interface Workbook {
  /** Worksheets in tab order. Chart sheets are not listed: they hold no cells. */
  sheets: SheetInfo[]
  /** Rows of one worksheet, by index into `sheets`. Only that sheet's part is parsed into the result. */
  read(index: number): Promise<string[][]>
}

const resolvePart = (target: string) => {
  let t = target
  try { t = decodeURIComponent(target) } catch { /* keep the raw target */ }
  const out: string[] = []
  for (const seg of (t.startsWith('/') ? t.slice(1) : `xl/${t}`).split('/')) { if (seg === '..') out.pop(); else if (seg !== '.' && seg !== '') out.push(seg) }
  return out.join('/')
}

/** Lists the worksheets of an .xlsx (name, visibility, row count) and returns a reader for any one of them. */
export async function openXlsx(buf: ArrayBuffer): Promise<Workbook> {
  const files = await unzip(buf)
  const byLower = new Map([...files.keys()].map(k => [k.toLowerCase(), k]))
  // OPC part names are case-insensitive.
  const has = (name: string) => files.has(name) || byLower.has(name.toLowerCase())
  const read = async (name: string) => files.get(files.has(name) ? name : byLower.get(name.toLowerCase()) ?? '')?.() ?? ''
  const wb = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels')
  const relById = new Map(elements(rels, 'Relationship').map(t => [attr(t, 'Id') ?? '', t] as const))

  // path: where the worksheet part is; null when the relationship does not lead to one.
  let found: { name: string; hidden: boolean; path: string | null }[] = []
  const listed = elements(wb, 'sheet')
  for (const t of listed) {
    const state = attr(t, 'state')
    const entry = { name: unescape(attr(t, 'name') ?? ''), hidden: state === 'hidden' || state === 'veryHidden', path: null as string | null }
    const rel = relById.get(attr(t, '[\\w.-]+:id') ?? '')
    const type = rel ? attr(rel, 'Type') : undefined
    if (rel && type && !/\/worksheet$/i.test(type)) continue // a chart sheet or dialog sheet: no cells to import
    if (rel && attr(rel, 'TargetMode')?.toLowerCase() !== 'external' && attr(rel, 'Target')) {
      const path = resolvePart(attr(rel, 'Target')!)
      // Some writers give an absolute target without the xl/ folder; the part is still the one under xl/.
      entry.path = !has(path) && has(`xl/${path}`) ? `xl/${path}` : path
    }
    found.push(entry)
  }
  // Files with no readable sheet list at all (hand-made or minimal) are still read from the conventional first part.
  if (!listed.length && await read('xl/worksheets/sheet1.xml')) found = [{ name: 'Sheet1', hidden: false, path: 'xl/worksheets/sheet1.xml' }]
  if (!found.length) throw new Error('No worksheet found in this .xlsx file.')

  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]))
  const load = async (path: string | null) => {
    const xml = path ? await read(path) : ''
    if (!xml) throw new Error('No worksheet found in this .xlsx file.')
    return parseSheet(xml, shared)
  }
  // Counting rows means looking at each sheet once; only the sheet the caller reads later is turned into import rows.
  const sheets: SheetInfo[] = []
  for (const f of found) {
    try { sheets.push({ name: f.name, hidden: f.hidden, rows: (await load(f.path)).length, unreadable: false }) }
    catch { sheets.push({ name: f.name, hidden: f.hidden, rows: 0, unreadable: true }) }
  }
  if (sheets.every(s => s.unreadable)) throw new Error(sheets.length === 1 ? 'The worksheet in this .xlsx file could not be read.' : 'None of the worksheets in this .xlsx file could be read.')
  return {
    sheets,
    async read(index) {
      const s = sheets[index]
      if (!s || s.unreadable) throw new Error(`The worksheet "${s?.name ?? index}" could not be read.`)
      return load(found[index].path)
    },
  }
}

/** The first worksheet in workbook order. The importer uses openXlsx so the user can choose. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  return (await openXlsx(buf)).read(0)
}
