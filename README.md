# Per-folder sort

An Obsidian plugin that gives one folder its own file explorer sort. Folders you have not set keep the vault sort from the button at the top of the file explorer.

## How to use

1. Right-click a folder in the file explorer.
2. Choose **Sort**.
3. Pick one of the same orders as the vault sort:

- File name (A to Z)
- File name (Z to A)
- Modified time (new to old)
- Modified time (old to new)
- Created time (new to old)
- Created time (old to new)

Choose **Use vault sort** on that folder to remove the override. Right-click the empty space under the file list to set the vault root.

An override applies to the items directly inside that folder. It does not cascade. A subfolder keeps the vault sort until you set one on it.

Notes use the order you pick. Subfolders stay above the notes and stay in name order. That is the same rule Obsidian's vault sort already uses.

The plugin settings list every override, and each one can be cleared from there.

Renaming or moving a folder keeps its override. Deleting a folder drops it.

## Install

Copy `main.js` and `manifest.json` into:

```
.obsidian/plugins/per-folder-sort/
```

Reload Obsidian, then turn on **Per-folder sort** in **Settings → Community plugins**.

With the BRAT plugin, add `himanshugupta2077/obsidian-per-folder-sort`.

This plugin is not in the official community plugin directory yet.

## Develop

```
npm install
npm test
npm run build
```

## License

MIT. Copyright (c) 2026 Himanshu Gupta.
