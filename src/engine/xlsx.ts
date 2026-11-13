// Reads the first worksheet of an .xlsx file into rows of strings, with no library:
// an .xlsx is a zip of XML parts, and browsers (and Node 18+) can inflate zip entries with DecompressionStream.

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
      return new Response(stream).text()
    })
    p += 46 + nameLen + extra + comment
  }
  return files
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m)
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unescape(m[1])).join('')
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

function colIndex(ref: string) {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf)
  const read = async (name: string) => files.get(name)?.() ?? ''
  // First sheet in workbook order, resolved through the workbook relationships.
  const wb = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels')
  const rid = wb.match(/<sheet\s[^>]*?r:id="([^"]+)"/)?.[1]
  const target = rid ? [...rels.matchAll(/<Relationship\s[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'Id') === rid) : undefined
  const path = target ? (attr(target, 'Target') ?? '').replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml'
  const sheet = await read(path)
  if (!sheet) throw new Error('No worksheet found in this .xlsx file.')
  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]))

  const rows: string[][] = []
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = []
    let next = 0
    for (const cm of (rm[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[1], body = cm[2] ?? ''
      const ref = attr(tag, 'r'), t = attr(tag, 't')
      const i = ref ? colIndex(ref) : next
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
