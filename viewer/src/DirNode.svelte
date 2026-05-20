<script lang="ts">
  import { untrack } from "svelte";
  import Tree from "./Tree.svelte";
  import type { FolderEntry, FileEntry } from "./lib/packagef";

  type Props = {
    folder: FolderEntry;
    prefix: string;
    onSelect: (path: string, entry: FileEntry) => void;
    selectedPath: string;
  };

  let { folder, prefix, onSelect, selectedPath }: Props = $props();

  // Top-level folders auto-open; nested folders start closed.
  // `prefix` is a prop, but we only consult it once at component creation:
  // `untrack` tells Svelte that's intentional and silences the warning.
  let open = $state(untrack(() => prefix.split("/").filter(Boolean).length <= 1));
</script>

<li class="dir" class:open>
  <div
    class="row"
    onclick={() => (open = !open)}
    role="treeitem"
    aria-expanded={open}
    aria-selected={false}
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") open = !open;
    }}
  >
    <span class="caret">{open ? "▾" : "▸"}</span>
    <span class="label">{folder.name}</span>
    <span class="sz">{folder.children.length}</span>
  </div>
  {#if open}
    <Tree {folder} {prefix} {onSelect} {selectedPath} />
  {/if}
</li>

<style>
  li.dir {
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
