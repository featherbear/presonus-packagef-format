meta:
  id: presonus_packagef
  title: PreSonus PACKAGEF (.skin) container
  file-extension: skin
  endian: le
  encoding: UTF-16LE
doc: |
  Container format used by PreSonus for resource bundles.

  Layout:
    - 8-byte "PACKAGEF" header
    - Payload: concatenated independent zlib streams (one per file)
    - Index: tree of Root/Folder/File entries with UTF-16LE names
    - 64-byte trailer pointing at the index, ending in "PACKAGEF" magic

seq:
  - id: magic
    contents: "PACKAGEF"
  - id: payload
    size: trailer.index_offset - 8
    doc: Concatenated zlib streams referenced by File entries.
  - id: index
    type: index
    size: trailer.index_size

instances:
  trailer:
    pos: _io.size - 64
    size: 64
    type: trailer_type
    doc: |
      Parse this section first - the trailer holds the index location and is required
      to compute the size of `payload`.

types:

  trailer_type:
    seq:
      - id: index_offset
        type: u8
      - id: index_size
        type: u8
      - id: padding
        size: 16
      - id: misc
        size: 16
        doc: |
          Unknown. Observed: A7 CD B0 40 95 0A 88 B1 BF FC C6 FB 00 00 00 00.
      - id: version
        type: u4
        doc: Observed value 1.
      - id: trailer_size
        type: u4
        doc: Observed value 0x40.
      - id: trailing_magic
        contents: "PACKAGEF"

  index:
    seq:
      - id: root
        type: root_entry

  root_entry:
    seq:
      - id: tag
        contents: "Root"
      - id: flags
        type: u4
      - id: num_children
        type: u4
      - id: children
        type: entry
        repeat: expr
        repeat-expr: num_children

  entry:
    seq:
      - id: tag
        type: str
        size: 4
        encoding: ASCII
      - id: body
        type:
          switch-on: tag
          cases:
            '"File"': file_entry
            '"Fold"': folder_entry

  folder_entry:
    seq:
      - id: flags
        type: u4
      - id: name
        type: utf16z
      - id: num_children
        type: u4
      - id: children
        type: entry
        repeat: expr
        repeat-expr: num_children

  file_entry:
    seq:
      - id: flags
        type: u4
      - id: name
        type: utf16z
      - id: timestamp
        type: timestamp
      - id: reserved
        type: u1
        doc: Observed 0.
      - id: offset
        type: u8
        doc: Absolute byte offset of the zlib stream in the file.
      - id: compressed_size
        type: u8
      - id: decompressed_size
        type: u8

  timestamp:
    seq:
      - id: year
        type: u2
      - id: month
        type: u1
      - id: day
        type: u1
      - id: hour
        type: u1
      - id: minute
        type: u1
      - id: second
        type: u1
      - id: extra
        type: u1
        doc: Unknown. Observed 0.

  utf16z:
    doc: |
      2-null-byte-terminated UTF-16LE string (... 0x00 0x00).
      The string is NOT length-prefixed, so we read bytes until we hit the terminator.

      To obtain a decoded string in your host language, take the
      `code_units` array minus its trailing zero and decode as UTF-16LE.
      (Kaitai Struct has no built-in "array of u2 -> string" conversion,
      so this step is left to the caller.)
    seq:
      - id: code_units
        type: u2
        repeat: until
        repeat-until: _ == 0
