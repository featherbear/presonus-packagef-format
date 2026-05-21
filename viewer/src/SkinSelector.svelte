<script lang="ts">
  import type { SkinPackage } from "./lib/packagef";

  type SkinOption = {
    name: string;
    pkg: SkinPackage;
  };

  type Props = {
    dllName: string;
    skins: SkinOption[];
    onSelect: (name: string, pkg: SkinPackage) => void;
  };

  let { dllName, skins, onSelect }: Props = $props();
</script>

<div class="skin-selector">
  <p class="label">
    <strong>{dllName}</strong> contains {skins.length} embedded .skin file{skins.length !== 1 ? "s" : ""}.
    Select one to browse:
  </p>
  <ul class="list">
    {#each skins as skin (skin.name)}
      <li>
        <button onclick={() => onSelect(skin.name, skin.pkg)}>
          <span class="skin-name">{skin.name}</span>
          <span class="skin-meta">
            {skin.pkg.root.children.length} top-level entr{skin.pkg.root.children.length !== 1 ? "ies" : "y"}
            &nbsp;·&nbsp; v{skin.pkg.version}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .skin-selector {
    padding: 32px 40px;
    max-width: 640px;
    margin: 48px auto;
  }
  .label {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 16px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .list button {
    width: 100%;
    text-align: left;
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--fg);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .list button:hover {
    border-color: var(--accent);
    background: var(--panel2);
  }
  .skin-name {
    font-weight: 600;
    word-break: break-all;
  }
  .skin-meta {
    color: var(--muted);
    font-size: 12px;
    margin-left: auto;
    white-space: nowrap;
  }
</style>
