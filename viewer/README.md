# skin-viewer

In-browser viewer for PreSonus PACKAGEF resource bundles used by `.skin` files.  
e.g. (`presonusbase.skin`, `channelicons.skin`, `deviceicons.skin`, ...)

Everything runs locally - files you drop in never leave your machine.

## Features

- Drop a `.skin` file (or use the picker) to parse it in-browser.
- Drop a `.dll` file to extract and browse embedded `.skin` files - useful for Windows installations where `.skin` files are embedded as DLL resources rather than exposed as standalone files on the filesystem.
- Browse the folder tree extracted from the package index.
- Preview images (PNG/SVG), text/XML, and a hex dump for anything else.
- Download individual files or the whole package as a zip.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # production build to dist/
pnpm preview    # serve dist/
pnpm check      # svelte-check + tsc
pnpm test       # Playwright end-to-end tests
```

## Regenerating the Kaitai parser

The format is described in the repository root, at `presonus_packagef.ksy`.  
A pre-generated JavaScript parser is committed at `src/lib/kaitai/PresonusPackagef.js`.  

To regenerate after editing the spec:

```sh
pnpm gen-parser
```

This requires `kaitai-struct-compiler` on `PATH` (install from <https://kaitai.io/>).

## Format reference

The format, as understood from reverse-engineering the sample files:

```
[8B "PACKAGEF"]
[concatenated raw zlib streams]    <- each file's payload
[index]                            <- folder/file tree, UTF-16LE names
[64B trailer]                      <- offsets, signature, trailing "PACKAGEF"
```

Decompression uses the browser's built-in `DecompressionStream('deflate')`
(Chrome 80+, Firefox 113+, Safari 16.4+).
