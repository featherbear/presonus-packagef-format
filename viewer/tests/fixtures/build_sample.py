#!/usr/bin/env python3
"""
Generate a synthetic PreSonus PACKAGEF (.skin) file for testing.

The output contains a small but realistic mix of file types so the viewer's
preview code paths (PNG, SVG, XML/text, generic binary -> hex dump) all get
exercised. It uses the same byte layout as real .skin files but every byte
of content here is synthetic and free of any third-party copyright.
"""

import os
import struct
import sys
import zlib
from dataclasses import dataclass

MAGIC = b"PACKAGEF"
TRAILER_SIZE = 0x40
SIGNATURE = bytes.fromhex("a7cdb040950a88b1bffcc6fb00000000")
VERSION = 1
# Bog-standard 1x1 transparent PNG.
PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da6300010000000500010d0a2db40000000049454e44ae42"
    "6082"
)


@dataclass
class File:
    name: str
    data: bytes


@dataclass
class Folder:
    name: str
    children: list  # list[File | Folder]


def utf16z(s: str) -> bytes:
    return s.encode("utf-16-le") + b"\x00\x00"


def build_index(root: Folder, file_locs: dict) -> bytes:
    """
    Walk the tree and serialize the index. `file_locs` maps id(file) ->
    (offset, csize, dsize).
    """
    out = bytearray()
    out += b"Root"
    out += struct.pack("<I", 1)  # flags
    out += struct.pack("<I", len(root.children))

    def write_entries(entries):
        for e in entries:
            if isinstance(e, File):
                off, csize, dsize = file_locs[id(e)]
                out.extend(b"File")
                out.extend(struct.pack("<I", 2))  # flags
                out.extend(utf16z(e.name))
                # Timestamp: y:u16, mon:u8, day:u8, hr:u8, min:u8, sec:u8, ?:u8
                out.extend(struct.pack("<HBBBBBB", 2025, 1, 1, 0, 0, 0, 0))
                out.extend(struct.pack("<B", 0))  # reserved
                out.extend(struct.pack("<Q", off))
                out.extend(struct.pack("<Q", csize))
                out.extend(struct.pack("<Q", dsize))
            elif isinstance(e, Folder):
                out.extend(b"Fold")
                out.extend(struct.pack("<I", 2))  # flags
                out.extend(utf16z(e.name))
                out.extend(struct.pack("<I", len(e.children)))
                write_entries(e.children)
            else:
                raise TypeError(e)

    write_entries(root.children)
    return bytes(out)


def collect_files(root: Folder):
    out = []
    def walk(folder):
        for c in folder.children:
            if isinstance(c, File):
                out.append(c)
            else:
                walk(c)
    walk(root)
    return out


def build_skin(root: Folder) -> bytes:
    out = bytearray()
    out += MAGIC

    file_locs = {}
    for f in collect_files(root):
        compressed = zlib.compress(f.data, level=9)
        file_locs[id(f)] = (len(out), len(compressed), len(f.data))
        out += compressed

    index_offset = len(out)
    index_bytes = build_index(root, file_locs)
    out += index_bytes
    index_size = len(index_bytes)

    # Trailer (0x40 bytes total):
    #   0x00  u64 index_offset
    #   0x08  u64 index_size
    #   0x10  16 bytes reserved (zero)
    #   0x20  16 bytes signature
    #   0x30  u32 version
    #   0x34  u32 trailer_size
    #   0x38  8 bytes trailing magic
    trailer = bytearray(TRAILER_SIZE)
    struct.pack_into("<Q", trailer, 0x00, index_offset)
    struct.pack_into("<Q", trailer, 0x08, index_size)
    trailer[0x20:0x30] = SIGNATURE
    struct.pack_into("<I", trailer, 0x30, VERSION)
    struct.pack_into("<I", trailer, 0x34, TRAILER_SIZE)
    trailer[0x38:0x40] = MAGIC
    out += trailer

    return bytes(out)


def sample_tree() -> Folder:
    """A small synthetic tree mirroring what a real .skin looks like."""
    svg = (
        b'<?xml version="1.0" encoding="UTF-8"?>\n'
        b'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">\n'
        b'  <rect width="16" height="16" fill="#3ba9ff"/>\n'
        b'</svg>\n'
    )
    xml = (
        b'<?xml version="1.0" encoding="UTF-8"?>\n'
        b"<theme name=\"sample\">\n"
        b"  <color id=\"bg\" value=\"#1e1e1e\"/>\n"
        b"  <color id=\"fg\" value=\"#e6e6e6\"/>\n"
        b"</theme>\n"
    )
    readme = b"This is a synthetic .skin file generated for tests.\n"
    blob = bytes(range(256))  # exercises the hex-dump path
    return Folder(
        name="",
        children=[
            Folder(
                name="images",
                children=[
                    File("pixel.png", PNG_1x1),
                    File("square.svg", svg),
                ],
            ),
            Folder(
                name="meta",
                children=[
                    File("theme.xml", xml),
                    File("README.txt", readme),
                    Folder(
                        name="raw",
                        children=[File("bytes.bin", blob)],
                    ),
                ],
            ),
        ],
    )


def main() -> int:
    out_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.path.join(os.path.dirname(__file__), "sample.skin")
    )
    data = build_skin(sample_tree())
    with open(out_path, "wb") as f:
        f.write(data)
    print(f"Wrote {out_path} ({len(data)} bytes, 5 files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
