# Amanita

A local-first Windows scrapbook for brainstorming, worldbuilding, and writing comics. This first edition focuses on collecting scattered visual ideas and character notes.

## Try it

Close any older Amanita window, then double-click **Open Amanita.cmd** in this project folder. It opens the latest build at **dist/story-views/Amanita-win32-x64/Amanita.exe**, using your existing saved project. A normal development package build is written to **dist/Amanita-win32-x64/Amanita.exe**. Keep the whole application folder together; the executable needs its companion files. This is a portable application build, not an installer.

For development, install Node.js and run:

```powershell
npm install
npm start
```

A browser preview is also available with `npm run preview` at http://127.0.0.1:4173. Browser and desktop saves are separate.

## In this edition

- Drag post-its around a freeform scrapbook; pan, zoom, and fit your notes.
- Use **New story** to create an optional story view. The sidebar picker scopes the scrapbook, category lists, and loose timeline. In a note's details, check any stories under **Appears in** to share that note across views. New notes and beats join the selected story automatically. **All stories** includes everything, even unassigned notes. Renaming or removing a view keeps its notes intact.
- Write ideas, character notes, and world notes in a detail panel. Story beats live in a separate loose timeline, excluded from the scrapbook. Arrange beats under Early, Along the way, Later, or Unplaced with drag-and-drop, ordering arrows, or the detail panel. Existing beats migrate to Unplaced; placement and order save with the project.
- Browse Image references from the sidebar. Attach PNG, JPEG, WebP, or GIF images with Add image, by dropping them onto the board, or by choosing Image reference on a regular note (8 MB per image). Converting a note preserves its title and text.
- Choose paper colors independently of note category.
- Rate importance separately from certainty: seed, exploring, established, or locked rule.
- Locked rules protect their title, content, category, and deletion until explicitly unlocked. Their position, color, importance, and connections remain adjustable.
- Connect notes with editable labels and no direction, first-to-second, second-to-first, or both directions. Direction choices use note titles, shortened to five words with an ellipsis for longer titles. Arrowheads show direction on the canvas; edit through the thread label or the pencil beside a relationship in the detail panel. Older connections remain undirected.
- Filter by category or certainty and search titles and content.
- Undo/redo board changes with Ctrl+Z / Ctrl+Shift+Z. Text fields retain standard text undo while focused.
- Automatic local saving plus JSON import/export with embedded images (40 MB project limit).

The first launch includes an example comic world. Use **New project** for a blank scrapbook. One project is active at a time; export a copy before opening or starting another. Project replacement can also be undone within the current session.

Desktop data lives in Electron's per-user application-data folder (`%APPDATA%/amanita/project.amanita.json` on Windows). Writes are serialized and replace the saved file through a temporary file. Browser previews save in localStorage, whose quota is typically smaller than the desktop project's limit. Export projects for backups and transfers. There is no cloud account or synchronization.

## Shortcuts

N adds a note; F fits visible notes; Esc closes details or cancels connecting. Drag the background or scroll to pan; Ctrl+scroll zooms. Double-click empty canvas to add a note there. Ctrl+S saves immediately.

## Development and verification

```powershell
npm test
npm run test:desktop
npm run test:connections
npm run test:timeline
npm run test:story-views
npm run package:win
```

Model tests cover project validation, locked rules, and relationship cleanup. Real-input connection tests cover two characters, Enter/mouse submission, cancellation, and smaller windows. The desktop smoke test uses a temporary user-data directory and a hidden Electron window to exercise editing, connections, undo/redo, categorization, image attachment, deletion, saving, and reload. It writes a preview screenshot to `docs/scrapbook.png`.

The desktop uses a sandboxed, isolated renderer with a small preload bridge for project loading, saving, and native file dialogs. The interface has no remote assets or runtime network requests. Imported projects are validated in both the UI and the desktop process.

## Growing from here

Full character sheets, editable maps, dedicated magic-system workspaces, and page/panel script writing are future features. Character and world notes already have stable IDs and typed categories, so those workspaces can refer to the same underlying content. The included map is an image reference, not a map editor. Connections are manually labeled; contradiction detection is not implemented yet.






