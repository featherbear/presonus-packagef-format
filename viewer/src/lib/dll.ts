/**
 * Minimal Windows PE (DLL/EXE) parser.
 *
 * Walks the PE resource directory and extracts all RT_RCDATA resources whose
 * data begins with the PACKAGEF magic string, returning them as named
 * ArrayBuffers ready to feed into parseSkin().
 *
 * Only a tiny subset of the PE format is needed:
 *   - MZ header  → e_lfanew (offset to PE signature)
 *   - PE optional header → DataDirectory[2] (resource directory RVA+size)
 *   - Resource directory tree  → find RT_RCDATA (type id 10)
 *   - Leaf data entries        → RVA + Size
 *
 * References:
 *   https://docs.microsoft.com/en-us/windows/win32/debug/pe-format
 */

const PACKAGEF_MAGIC = 0x46454741_4b434150n; // "PACKAGEF" as little-endian u64 (not used as bigint in comparison, see below)
const PACKAGEF_BYTES = [0x50, 0x41, 0x43, 0x4b, 0x41, 0x47, 0x45, 0x46]; // "PACKAGEF"

/** A single RCDATA resource that contains a PACKAGEF blob. */
export interface DllSkinEntry {
  /** Human-readable name: the resource name string, or "#<id>" for integer ids. */
  name: string;
  /** The raw bytes of the PACKAGEF blob (a slice of the original DLL buffer). */
  data: ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Reader helper
// ---------------------------------------------------------------------------

class BinReader {
  private dv: DataView;
  private u8: Uint8Array;

  constructor(buf: ArrayBuffer) {
    this.dv = new DataView(buf);
    this.u8 = new Uint8Array(buf);
  }

  u8at(off: number): number { return this.u8[off]; }
  u16(off: number): number { return this.dv.getUint16(off, true); }
  u32(off: number): number { return this.dv.getUint32(off, true); }

  ascii(off: number, len: number): string {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.u8[off + i]);
    return s;
  }

  /** Read a null-terminated UTF-16LE string (used for named resources). */
  utf16z(off: number): string {
    const chars: number[] = [];
    while (true) {
      const c = this.dv.getUint16(off, true);
      if (c === 0) break;
      chars.push(c);
      off += 2;
    }
    return String.fromCharCode(...chars);
  }

  get byteLength(): number { return this.u8.byteLength; }
}

// ---------------------------------------------------------------------------
// PE helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Relative Virtual Address to a file offset.
 * Requires scanning the section table.
 */
function rvaToOffset(r: BinReader, peOffset: number, rva: number): number {
  // Number of sections is at PE+6
  const numSections = r.u16(peOffset + 6);
  // Size of optional header is at PE+20
  const optHeaderSize = r.u16(peOffset + 20);
  // Section table starts right after the optional header (PE signature(4) + coff(20) + opt)
  const sectionTableOff = peOffset + 24 + optHeaderSize;

  for (let i = 0; i < numSections; i++) {
    const s = sectionTableOff + i * 40;
    const vAddr  = r.u32(s + 12); // VirtualAddress
    const vSize  = r.u32(s + 16); // VirtualSize (may be 0, fall back to SizeOfRawData)
    const rawOff = r.u32(s + 20); // PointerToRawData
    const rawSz  = r.u32(s + 16 + 4); // SizeOfRawData

    const effectiveSize = vSize > 0 ? vSize : rawSz;
    if (rva >= vAddr && rva < vAddr + effectiveSize) {
      return rawOff + (rva - vAddr);
    }
  }
  throw new Error(`RVA 0x${rva.toString(16)} not found in any PE section`);
}

// ---------------------------------------------------------------------------
// Resource directory walker
// ---------------------------------------------------------------------------

/** A leaf resource data entry. */
interface ResLeaf {
  /** Name of the resource (string or "#id"). */
  name: string;
  /** File offset of the raw resource data. */
  dataOffset: number;
  /** Byte length of the resource data. */
  dataSize: number;
}

/**
 * Walk one level of a resource directory and collect leaves under a
 * given type (RT_RCDATA = 10).
 *
 * @param r          BinReader over the whole DLL buffer
 * @param rsrcOff    File offset of the start of the .rsrc section
 * @param rsrcRva    Virtual address of the .rsrc section (to convert data RVAs)
 * @param dirOff     File offset of the resource directory to walk
 * @param depth      0=type, 1=name/id, 2=language
 * @param typeId     The type id we want (10 = RT_RCDATA), or -1 if we're already inside
 * @param nameLabel  Accumulated resource name from higher levels
 * @param out        Accumulator for found leaves
 */
function walkResDir(
  r: BinReader,
  rsrcOff: number,
  rsrcRva: number,
  dirOff: number,
  depth: number,
  typeFilter: number,
  nameLabel: string,
  out: ResLeaf[],
): void {
  // IMAGE_RESOURCE_DIRECTORY header (16 bytes)
  // namedEntries at +12 (u16), idEntries at +14 (u16)
  const namedCount = r.u16(dirOff + 12);
  const idCount    = r.u16(dirOff + 14);
  const totalCount = namedCount + idCount;
  const entBase    = dirOff + 16; // IMAGE_RESOURCE_DIRECTORY_ENTRY array starts here

  for (let i = 0; i < totalCount; i++) {
    const entOff   = entBase + i * 8;
    const nameField = r.u32(entOff);     // high bit set → named; else integer id
    const dataField = r.u32(entOff + 4); // high bit set → subdirectory; else data entry

    // ---- Determine entry name/id ----
    let entryName: string;
    if (nameField & 0x80000000) {
      // Named entry: offset (bits 0-30) is relative to rsrcOff
      const nameOff = rsrcOff + (nameField & 0x7fffffff);
      const nameLen = r.u16(nameOff); // u16 length in UTF-16 code units
      let s = "";
      for (let j = 0; j < nameLen; j++) {
        s += String.fromCharCode(r.u16(nameOff + 2 + j * 2));
      }
      entryName = s;
    } else {
      entryName = `#${nameField}`;
    }

    // ---- At depth 0 (type level) filter to RT_RCDATA ----
    if (depth === 0) {
      // We want only type id 10 (RT_RCDATA). Named types or other ids → skip.
      if (nameField & 0x80000000) continue; // named types are not RT_RCDATA
      if (nameField !== typeFilter) continue;
    }

    // ---- Compose accumulated name (only at depth 1 = name level) ----
    const label = depth === 1 ? entryName : nameLabel;

    // ---- Recurse into subdirectory or read leaf ----
    if (dataField & 0x80000000) {
      // Subdirectory: offset relative to rsrcOff
      const subDirOff = rsrcOff + (dataField & 0x7fffffff);
      walkResDir(r, rsrcOff, rsrcRva, subDirOff, depth + 1, typeFilter, label, out);
    } else {
      // Leaf: IMAGE_RESOURCE_DATA_ENTRY (16 bytes)
      // dataRva at +0, size at +4
      const dataEntOff = rsrcOff + dataField;
      const dataRva  = r.u32(dataEntOff);
      const dataSize = r.u32(dataEntOff + 4);
      // Convert data RVA to file offset: the .rsrc section itself maps
      // rsrcRva → rsrcOff (file offset), so:
      const dataFileOff = rsrcOff + (dataRva - rsrcRva);
      out.push({ name: label, dataOffset: dataFileOff, dataSize });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** RT_RCDATA resource type id */
const RT_RCDATA = 10;

/**
 * Parse a Windows DLL/EXE and extract all RT_RCDATA resources that contain
 * PACKAGEF (.skin) data.
 *
 * @throws if the file is not a valid PE binary
 */
export function extractSkinsFromDll(buf: ArrayBuffer): DllSkinEntry[] {
  const r = new BinReader(buf);

  // --- MZ header ---
  if (r.u16(0) !== 0x5a4d) throw new Error("Not a PE file (missing MZ signature)");
  const peOffset = r.u32(0x3c);
  if (r.ascii(peOffset, 4) !== "PE\0\0") throw new Error("Not a PE file (missing PE signature)");

  // --- Locate .rsrc data directory ---
  // Optional header starts at peOffset+24. Magic at +0: 0x10b=PE32, 0x20b=PE32+
  const optMagic = r.u16(peOffset + 24);
  let rsrcDirOff: number; // offset into optional header for DataDirectory[2]
  if (optMagic === 0x10b) {
    // PE32: DataDirectory starts at optHeader+96
    rsrcDirOff = peOffset + 24 + 96 + 2 * 8; // [0]=export,[1]=import,[2]=resource
  } else if (optMagic === 0x20b) {
    // PE32+: DataDirectory starts at optHeader+112
    rsrcDirOff = peOffset + 24 + 112 + 2 * 8;
  } else {
    throw new Error(`Unknown PE optional header magic: 0x${optMagic.toString(16)}`);
  }

  const rsrcRva  = r.u32(rsrcDirOff);
  const rsrcSize = r.u32(rsrcDirOff + 4);
  if (rsrcRva === 0 || rsrcSize === 0) return []; // no resource section

  // Convert rsrc RVA → file offset
  const rsrcFileOff = rvaToOffset(r, peOffset, rsrcRva);

  // --- Walk resource directory ---
  const leaves: ResLeaf[] = [];
  walkResDir(r, rsrcFileOff, rsrcRva, rsrcFileOff, 0, RT_RCDATA, "", leaves);

  // --- Filter to PACKAGEF blobs ---
  const results: DllSkinEntry[] = [];
  for (const leaf of leaves) {
    if (leaf.dataSize < 8) continue;
    // Check for "PACKAGEF" magic at the start of the resource data
    let isPackagef = true;
    for (let i = 0; i < 8; i++) {
      if (r.u8at(leaf.dataOffset + i) !== PACKAGEF_BYTES[i]) { isPackagef = false; break; }
    }
    if (!isPackagef) continue;

    results.push({
      name: leaf.name,
      // Slice is a zero-copy view when using ArrayBuffer.slice? No — .slice copies.
      // We intentionally copy so the caller gets a standalone ArrayBuffer.
      data: buf.slice(leaf.dataOffset, leaf.dataOffset + leaf.dataSize),
    });
  }

  return results;
}
