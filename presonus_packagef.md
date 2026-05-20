# PreSonus PACKAGEF (`.skin`) File Format

This document describes the container format used by PreSonus for resource bundles.  
The structure is reverse-engineered and not official, there are no guarantees of its accuracy.

All integers are **little-endian** unless stated otherwise.

## Overall Layout

```
+-------------------------------+   offset 0
| Header (8 bytes)              |
|   "PACKAGEF"                  |
+-------------------------------+   offset 8
| Payload                       |
|   Concatenated independent    |
|   zlib streams, one per file. |
+-------------------------------+   offset = trailer.index_offset
| Index                         |
|   Tree of Root/Folder/File    |
|   entries describing the      |
|   contents of the payload.    |
+-------------------------------+   offset = file_size - 64
| Trailer (64 bytes)            |
|   index pointer, [unknown],   |
|   version, trailing magic.    |
+-------------------------------+   offset = file_size
```

## 1. Header (8 bytes)

| Offset | Size | Field | Value            |
|--------|------|-------|------------------|
| 0      | 8    | magic | ASCII `PACKAGEF` |

## 2. Payload

The payload region (from offset 8 up to `trailer.index_offset`) is a
concatenation of independent **zlib streams**, one for each `File`
entry in the index. Each stream begins with the standard zlib header
(`78 DA` in all observed files - best-compression preset).

Files are located via `(offset, compressed_size, decompressed_size)`
fields in the index. Streams may be stored in any order, but in
practice are written in index-traversal order, immediately adjacent to
one another (no padding between streams).

## 3. Index

The index is rooted at `trailer.index_offset` and occupies exactly
`trailer.index_size` bytes. It is a depth-first serialisation of a
single root folder containing files and sub-folders.

### 3.1 Root header (12 bytes)

| Offset | Size | Field        | Value                             |
|--------|------|--------------|-----------------------------------|
| 0      | 4    | tag          | ASCII `Root`                      |
| 4      | 4    | flags (u32)  | observed `1`                      |
| 8      | 4    | child_count  | number of immediate child entries |

The `child_count` entries follow immediately. Each entry is either a
**File** or a **Folder** (see below). Sub-folders recurse using the
same format.

### 3.2 Folder entry (variable length)

| Offset | Size      | Field        | Value                                  |
|--------|-----------|--------------|----------------------------------------|
| 0      | 4         | tag          | ASCII `Fold`                           |
| 4      | 4         | flags (u32)  | observed `2`                           |
| 8      | variable  | name         | null-terminated UTF-16LE string        |
| ...    | 4         | child_count  | number of immediate children           |
| ...    | variable  | children     | `child_count` Folder/File entries      |

> The name terminator is a single UTF-16LE NUL (`00 00`). The name is
> NOT length-prefixed.

### 3.3 File entry (variable length)

| Offset | Size     | Field             | Notes                                       |
|--------|----------|-------------------|---------------------------------------------|
| 0      | 4        | tag               | ASCII `File`                                |
| 4      | 4        | flags (u32)       | observed `2`                                |
| 8      | variable | name              | null-terminated UTF-16LE string             |
| ...    | 8        | timestamp         | see below                                   |
| ...    | 1        | reserved (u8)     | observed `0`                                |
| ...    | 8        | offset (u64)      | absolute byte offset of the zlib stream     |
| ...    | 8        | compressed_size   | size of the zlib stream in bytes            |
| ...    | 8        | decompressed_size | uncompressed size of the file               |

#### Timestamp (8 bytes)

| Offset | Size | Field          | Example         |
|--------|------|----------------|-----------------|
| 0      | 2    | year (u16)     | `0x07EA` = 2026 |
| 2      | 1    | month (u8)     | `0x03`          |
| 3      | 1    | day (u8)       | `0x13` = 19     |
| 4      | 1    | hour (u8)      | `0x14` = 20     |
| 5      | 1    | minute (u8)    | `0x1C` = 28     |
| 6      | 1    | second (u8)    | `0x25` = 37     |
| 7      | 1    | unknown (u8)   | observed `0`    |

## 4. Trailer (last 64 bytes of the file)

| Offset (rel) | Size | Field          | Value / Notes                                     |
|--------------|------|----------------|---------------------------------------------------|
| 0x00         | 8    | index_offset   | absolute byte offset of the Root marker           |
| 0x08         | 8    | index_size     | byte length of the index                          |
| 0x10         | 16   | padding        | observed all zero                                 |
| 0x20         | 16   | [unknown]      | `A7 CD B0 40 95 0A 88 B1 BF FC C6 FB 00 00 00 00` |
| 0x30         | 4    | version (u32)  | observed `1`                                      |
| 0x34         | 4    | trailer_size   | observed `0x40` (64)                              |
| 0x38         | 8    | trailing magic | ASCII `PACKAGEF`                                  |

To open a file, seek to `file_size - 64`, read the trailer, then read
`index_size` bytes at `index_offset` to obtain the directory.
