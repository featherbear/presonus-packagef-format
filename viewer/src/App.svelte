<script lang="ts">
  import JSZip from "jszip";
  import Tree from "./Tree.svelte";
  import Preview from "./Preview.svelte";
  import { parseSkin, readFileBytes, walk, type SkinPackage, type FileEntry } from "./lib/packagef";

  let pkg = $state<SkinPackage | null>(null);
  let pkgName = $state("");
  let parseError = $state("");
  let selectedPath = $state("");
  let selectedEntry = $state<FileEntry | null>(null);
  let isDragging = $state(false);
  let buildingZip = $state(false);

  const fileCount = $derived(pkg ? [...walk(pkg.root)].length : 0);

  function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  async function loadFile(file: File) {
    parseError = "";
    pkgName = file.name;
    try {
      const buf = await file.arrayBuffer();
      pkg = parseSkin(buf);
    } catch (err) {
      pkg = null;
      parseError = (err as Error).message;
      return;
    }
    selectedPath = "";
    selectedEntry = null;
  }

  function onFilePicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) void loadFile(f);
  }

  function select(path: string, entry: FileEntry) {
    selectedPath = path;
    selectedEntry = entry;
  }

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
      const base = pkgName.replace(/\.skin$/i, "") || "skin";
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
</script>

<svelte:window
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    if (e.target instanceof Element && e.target.closest(".drop")) return;
    onDrop(e);
  }}
/>

<header>
  <h1>PreSonus .skin viewer</h1>
  {#if pkg}
    <span class="info">
      {pkgName} · {fmtSize(pkg.fileSize)} · {fileCount} file(s) · format v{pkg.version}
    </span>
  {/if}
  <div class="actions">
    <label class="btn" for="filepick">Open .skin…</label>
    <input id="filepick" type="file" accept=".skin" onchange={onFilePicked} hidden />
    <button onclick={downloadAllZip} disabled={!pkg || buildingZip}>
      {buildingZip ? "Building zip…" : "Download all as .zip"}
    </button>
  </div>
</header>

{#if !pkg}
  <div
    class="drop"
    class:over={isDragging}
    ondragenter={(e) => { e.preventDefault(); isDragging = true; }}
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={(e) => { e.preventDefault(); isDragging = false; }}
    ondrop={onDrop}
    role="region"
    aria-label="Drop a .skin file here"
  >
    <div>
      <p class="big">Drop a <code>.skin</code> file here</p>
      <p>or use the <strong>Open</strong> button above</p>
      <p class="small">
        Everything happens locally in your browser - nothing is uploaded.
      </p>
      {#if parseError}
        <p class="err">Failed to parse {pkgName}: {parseError}</p>
      {/if}
    </div>
  </div>
{:else}
  <main>
    <aside class="tree-pane">
      <Tree folder={pkg.root} onSelect={select} {selectedPath} />
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
