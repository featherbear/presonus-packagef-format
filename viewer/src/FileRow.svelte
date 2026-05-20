<script lang="ts">
  import type { FileEntry } from "./lib/packagef";

  type Props = {
    entry: FileEntry;
    path: string;
    onSelect: (path: string, entry: FileEntry) => void;
    selectedPath: string;
  };

  let { entry, path, onSelect, selectedPath }: Props = $props();

  function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
</script>

<li class="file">
  <div
    class="row"
    class:selected={path === selectedPath}
    onclick={() => onSelect(path, entry)}
    role="treeitem"
    aria-selected={path === selectedPath}
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") onSelect(path, entry);
    }}
  >
    <span class="caret">·</span>
    <span class="label">{entry.name}</span>
    <span class="sz">{fmtSize(entry.dsize)}</span>
  </div>
</li>

<style>
  li.file {
    list-style: none;
  }
  .row {
    cursor: pointer;
    padding: 2px 8px;
    user-select: none;
    border-radius: 4px;
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .row:hover {
    background: var(--panel2);
  }
  .row.selected {
    background: #314970;
    color: #fff;
  }
  .caret {
    color: var(--muted);
    width: 1em;
    display: inline-block;
    text-align: center;
  }
  .sz {
    color: var(--muted);
    font-size: 11px;
    margin-left: auto;
  }
</style>
