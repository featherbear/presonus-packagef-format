<script lang="ts">
  import { readFileBytes, type FileEntry } from "./lib/packagef";

  type Props = {
    path: string;
    entry: FileEntry;
  };

  let { path, entry }: Props = $props();

  type Loaded =
    | { state: "loading" }
    | { state: "ok"; data: Uint8Array }
    | { state: "error"; message: string };

  let loaded = $state<Loaded>({ state: "loading" });
  // Object URLs created for previews must be revoked when the entry changes.
  // Tracked outside `$state` because we mutate it from within a `$derived`
  // expression, which is forbidden for `$state` (Svelte error
  // state_unsafe_mutation). The URL string is purely a side-effect handle
  // for cleanup; the visible URL is part of the derived `view` value.
  let blobUrl: string | undefined = undefined;

  $effect(() => {
    // Re-run when the entry identity changes.
    const e = entry;
    loaded = { state: "loading" };
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = undefined;
    }
    readFileBytes(e)
      .then((data) => {
        loaded = { state: "ok", data };
      })
      .catch((err: Error) => {
        loaded = { state: "error", message: err.message };
      });
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  });

  function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  const ext = $derived(entry.name.toLowerCase().split(".").pop() ?? "");
  const isImage = $derived(
    ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].includes(ext),
  );
  const isSvg = $derived(ext === "svg");
  const isTextExt = $derived(
    ["xml", "txt", "json", "html", "htm", "css", "js", "md", "csv", "ini", "yaml", "yml"].includes(ext),
  );

  function looksLikeText(b: Uint8Array): boolean {
    const n = Math.min(b.length, 512);
    if (n === 0) return true;
    let printable = 0;
    for (let i = 0; i < n; i++) {
      const v = b[i];
      if (v === 9 || v === 10 || v === 13 || (v >= 32 && v < 127)) printable++;
    }
    return printable / n > 0.9;
  }

  const mimeFor = (e: string) => {
    if (e === "jpg") return "image/jpeg";
    if (e === "svg") return "image/svg+xml";
    return `image/${e}`;
  };

  // Compute preview content reactively.
  const view = $derived.by(() => {
    if (loaded.state !== "ok") return null;
    const data = loaded.data;
    if (isImage || isSvg) {
      const blob = new Blob([data as BlobPart], { type: mimeFor(ext) });
      const url = URL.createObjectURL(blob);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = url;
      return { type: "image" as const, url };
    }
    if (isTextExt || looksLikeText(data)) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
      return { type: "text" as const, text };
    }
    // Hex dump (first 4 KB).
    const slice = data.subarray(0, Math.min(data.length, 4096));
    const lines: string[] = [];
    for (let i = 0; i < slice.length; i += 16) {
      const chunk = slice.subarray(i, i + 16);
      const hex = Array.from(chunk)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      const ascii = Array.from(chunk)
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
        .join("");
      lines.push(
        i.toString(16).padStart(8, "0") +
          "  " +
          hex.padEnd(48, " ") +
          "  " +
          ascii,
      );
    }
    let txt = lines.join("\n");
    if (data.length > 4096) txt += `\n… ${data.length - 4096} more bytes\n`;
    return { type: "hex" as const, text: txt };
  });

  function downloadOne() {
    if (loaded.state !== "ok") return;
    const blob = new Blob([loaded.data as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
</script>

<div class="head">
  <span class="name">{path}</span>
  <span class="meta">
    {fmtSize(entry.dsize)} (compressed {fmtSize(entry.csize)}) · {entry.timestamp}
  </span>
  <button onclick={downloadOne} disabled={loaded.state !== "ok"}>Download</button>
</div>

<div class="body">
  {#if loaded.state === "loading"}
    <div class="placeholder">Decompressing…</div>
  {:else if loaded.state === "error"}
    <div class="err">Decompression failed: {loaded.message}</div>
  {:else if view}
    {#if view.type === "image"}
      <img src={view.url} alt={entry.name} />
    {:else if view.type === "text"}
      <pre>{view.text}</pre>
    {:else}
      <pre class="hex">{view.text}</pre>
    {/if}
  {/if}
</div>

<style>
  .head {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 600;
    word-break: break-all;
  }
  .meta {
    color: var(--muted);
    font-size: 12px;
  }
  .head button {
    margin-left: auto;
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 16px;
    min-height: 0;
  }
  .body img {
    max-width: 100%;
    max-height: 100%;
  }
  pre {
    margin: 0;
    font: 12px/1.4 ui-monospace, "Menlo", "Consolas", monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }
  pre.hex {
    white-space: pre;
  }
  .placeholder {
    color: var(--muted);
  }
  .err {
    color: var(--error);
  }
</style>
