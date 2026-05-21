<script lang="ts">
  import JSZip from "jszip";
  import Tree from "./Tree.svelte";
  import Preview from "./Preview.svelte";
  import SkinSelector from "./SkinSelector.svelte";
  import { parseSkin, readFileBytes, walk, type SkinPackage, type FileEntry } from "./lib/packagef";
  import { extractSkinsFromDll } from "./lib/dll";

  // ---- State ---------------------------------------------------------------

  let pkg = $state<SkinPackage | null>(null);
  let pkgName = $state("");          // name shown in the header (skin name or dll+skin)
  let parseError = $state("");
  let selectedPath = $state("");
  let selectedEntry = $state<FileEntry | null>(null);
  let isDragging = $state<false | "ok" | "reject">(false);
  let buildingZip = $state(false);

  /**
   * When a DLL is loaded we populate this list instead of going straight to
   * a pkg. Once the user picks an entry we parse that skin and set pkg.
   */
  type SkinOption = { name: string; pkg: SkinPackage };
  let dllName = $state("");
  let dllSkins = $state<SkinOption[]>([]);

  // Derived helpers ----------------------------------------------------------

  const fileCount = $derived(pkg ? [...walk(pkg.root)].length : 0);
  const showSelector = $derived(dllSkins.length > 0 && pkg === null);

  // ---- Utilities -----------------------------------------------------------

  function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  // ---- File loading --------------------------------------------------------

  const ACCEPTED_EXTS = /\.(skin|dll)$/i;

  function classifyFile(name: string): "skin" | "dll" | null {
    if (/\.skin$/i.test(name)) return "skin";
    if (/\.dll$/i.test(name)) return "dll";
    return null;
  }

  /**
   * Returns true when a DataTransfer looks like it contains an accepted file.
   * During dragover only the item type (MIME) and — in some browsers — the
   * filename are available, not the actual bytes.
   */
  function transferLooksAccepted(dt: DataTransfer): boolean {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== "file") continue;
      // Some browsers expose the filename via getAsFile() during dragover; most don't.
      const f = item.getAsFile();
      if (f && ACCEPTED_EXTS.test(f.name)) return true;
      // MIME type is sometimes "application/x-msdownload" for DLLs/EXEs or
      // "" (empty) — accept if it's an octet-stream, msdownload, or empty,
      // since .skin files have no registered MIME type either.
      const t = item.type.toLowerCase();
      if (t === "" || t === "application/octet-stream" || t === "application/x-msdownload") return true;
    }
    return false;
  }

  async function loadFile(file: File) {
    parseError = "";
    pkg = null;
    dllSkins = [];
    selectedPath = "";
    selectedEntry = null;

    const kind = classifyFile(file.name);
    if (kind === null) {
      const ext = file.name.includes(".") ? file.name.split(".").pop()! : "unknown";
      parseError = `Unsupported file type ".${ext}". Please open a .skin file or a Windows DLL containing embedded .skin files.`;
      return;
    }

    let buf: ArrayBuffer;
    try {
      buf = await file.arrayBuffer();
    } catch (err) {
      parseError = `Could not read "${file.name}": ${(err as Error).message}`;
      return;
    }

    if (kind === "dll") {
      dllName = file.name;
      let entries;
      try {
        entries = extractSkinsFromDll(buf);
      } catch (err) {
        parseError = `"${file.name}" is not a valid Windows PE file: ${(err as Error).message}`;
        return;
      }
      if (entries.length === 0) {
        parseError = `No .skin files found in "${file.name}". This DLL does not appear to contain any embedded PACKAGEF resources.`;
        return;
      }
      // Parse each embedded skin up-front (they are already sliced/copied)
      const options: SkinOption[] = [];
      const parseFailures: string[] = [];
      for (const e of entries) {
        try {
          options.push({ name: e.name, pkg: parseSkin(e.data) });
        } catch (err) {
          parseFailures.push(`${e.name}: ${(err as Error).message}`);
        }
      }
      if (options.length === 0) {
        parseError = `Found ${entries.length} .skin file(s) in "${file.name}" but none could be parsed.\n${parseFailures.join("\n")}`;
        return;
      }
      if (options.length === 1) {
        // Skip the selector when there is only one skin.
        selectSkin(options[0].name, options[0].pkg);
      } else {
        dllSkins = options;
      }
    } else {
      // Plain .skin file
      dllName = "";
      pkgName = file.name;
      try {
        pkg = parseSkin(buf);
      } catch (err) {
        pkg = null;
        const msg = (err as Error).message;
        // Translate low-level parser errors into something actionable.
        if (/bad.*magic|not a packagef/i.test(msg)) {
          parseError = `"${file.name}" does not appear to be a valid .skin file (bad file header).`;
        } else {
          parseError = `Failed to parse "${file.name}": ${msg}`;
        }
      }
    }
  }

  function selectSkin(name: string, selected: SkinPackage) {
    pkg = selected;
    pkgName = dllName ? `${dllName} › ${name}` : name;
    dllSkins = [];
    selectedPath = "";
    selectedEntry = null;
  }

  function onFilePicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    // Reset the input so the same file can be re-picked after an error.
    input.value = "";
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) void loadFile(f);
  }

  // ---- Tree selection ------------------------------------------------------

  function select(path: string, entry: FileEntry) {
    selectedPath = path;
    selectedEntry = entry;
  }

  // ---- ZIP download --------------------------------------------------------

  async function downloadAllZip() {
    if (!pkg) return;
    buildingZip = true;
    try {
      const zip = new JSZip();
      for (const { path, entry } of walk(pkg.root)) {
        const data = await readFileBytes(entry);
        zip.file(path, data);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      // Derive a sane filename: strip any path separators from pkgName
      const base = pkgName.replace(/\s*›\s*/g, "_").replace(/\.(skin|dll)$/i, "") || "skin";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = base + ".zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      alert("Failed to build zip: " + (err as Error).message);
    } finally {
      buildingZip = false;
    }
  }

  // ---- "Open another" helper -----------------------------------------------

  function openAnother() {
    pkg = null;
    dllSkins = [];
    dllName = "";
    pkgName = "";
    parseError = "";
    selectedPath = "";
    selectedEntry = null;
  }
</script>

<svelte:window
  ondragover={(e) => {
    if (e.target instanceof Element && e.target.closest(".drop")) return;
    if (e.dataTransfer && transferLooksAccepted(e.dataTransfer)) {
      e.preventDefault();
    }
  }}
  ondrop={(e) => {
    if (e.target instanceof Element && e.target.closest(".drop")) return;
    onDrop(e);
  }}
/>

<header>
  <h1>PreSonus .skin file viewer</h1>
  {#if pkg}
    <span class="info">
      {pkgName} · {fmtSize(pkg.fileSize)} · {fileCount} file(s) · format v{pkg.version}
    </span>
  {:else if showSelector}
    <span class="info">{dllName} · {dllSkins.length} embedded .skin file{dllSkins.length !== 1 ? "s" : ""}</span>
  {/if}
  <div class="actions">
    {#if pkg || showSelector}
      <button class="btn-secondary" onclick={openAnother}>Open another…</button>
    {:else}
      <label class="btn" for="filepick">Open file…</label>
    {/if}
    <input id="filepick" type="file" accept=".skin,.dll" onchange={onFilePicked} hidden />
    <button onclick={downloadAllZip} disabled={!pkg || buildingZip}>
      {buildingZip ? "Building zip…" : "Download all as .zip"}
    </button>
  </div>
</header>

{#if !pkg && !showSelector}
  <!-- Drop zone / landing screen -->
  <div
    class="drop"
    class:over={isDragging}
    ondragenter={(e) => { e.preventDefault(); isDragging = true; }}
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={(e) => { e.preventDefault(); isDragging = false; }}
    ondrop={onDrop}
    role="region"
    aria-label="Drop a .skin or .dll file here"
  >
    <div>
      <p class="big">Drop a <code>.skin</code> or <code>.dll</code> file here</p>
      <p>or use the <strong>Open</strong> button above</p>
      <p class="small">
        Everything happens locally in your browser — nothing is uploaded.
      </p>
      {#if parseError}
        <p class="err">Failed to load{pkgName ? ` ${pkgName}` : ""}:{" "}{parseError}</p>
      {/if}
    </div>
  </div>

{:else if showSelector}
  <!-- DLL skin picker -->
  <div class="selector-wrap">
    <SkinSelector
      {dllName}
      skins={dllSkins}
      onSelect={selectSkin}
    />
    {#if parseError}
      <p class="err selector-err">{parseError}</p>
    {/if}
  </div>

{:else}
  <!-- Main viewer -->
  <main>
    <aside class="tree-pane">
      <Tree folder={pkg!.root} onSelect={select} {selectedPath} />
    </aside>
    <section class="preview-pane">
      {#if selectedEntry}
        <Preview path={selectedPath} entry={selectedEntry} />
      {:else}
        <div class="placeholder">Select a file in the tree to preview it.</div>
      {/if}
    </section>
  </main>
{/if}

<style>
  header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    background: var(--panel);
  }
  header h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  header .info {
    color: var(--muted);
    font-size: 13px;
  }
  header .actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }

  .btn-secondary {
    background: transparent;
    border-color: var(--border);
  }

  .drop {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--border);
    margin: 24px;
    border-radius: 12px;
    color: var(--muted);
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .drop.over {
    border-color: var(--accent);
    background: #2a2f3a;
    color: var(--fg);
  }
  .drop p {
    margin: 8px 0;
  }
  .drop .big {
    font-size: 18px;
    color: var(--fg);
  }
  .drop .small {
    font-size: 12px;
  }
  .drop .err {
    color: var(--error);
  }

  .selector-wrap {
    flex: 1;
    overflow: auto;
  }
  .selector-err {
    color: var(--error);
    padding: 0 40px;
    font-size: 13px;
  }

  main {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .tree-pane {
    width: 380px;
    min-width: 240px;
    max-width: 60%;
    overflow: auto;
    border-right: 1px solid var(--border);
    padding: 8px 0;
    font-size: 13px;
    background: var(--panel);
    resize: horizontal;
  }
  .preview-pane {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .placeholder {
    color: var(--muted);
    padding: 24px;
  }
</style>
