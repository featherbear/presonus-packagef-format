<script lang="ts">
  import DirNode from "./DirNode.svelte";
  import FileRow from "./FileRow.svelte";
  import type { FolderEntry, FileEntry, Entry } from "./lib/packagef";

  type Props = {
    folder: FolderEntry;
    prefix?: string;
    onSelect: (path: string, entry: FileEntry) => void;
    selectedPath: string;
  };

  let { folder, prefix = "", onSelect, selectedPath }: Props = $props();

  const sorted = $derived(
    [...folder.children].sort((a: Entry, b: Entry) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  );
</script>

<ul class="tree">
  {#each sorted as child (child.name + child.kind)}
    {#if child.kind === "dir"}
      <DirNode folder={child} prefix={prefix + child.name + "/"} {onSelect} {selectedPath} />
    {:else}
      <FileRow entry={child} path={prefix + child.name} {onSelect} {selectedPath} />
    {/if}
  {/each}
</ul>

<style>
  ul.tree {
    list-style: none;
    margin: 0;
    padding-left: 16px;
  }
</style>
