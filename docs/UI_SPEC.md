---
type: adr
status: stable
entities: []
related: []
---
# UI_SPEC.md

Goal: feel like Google Drive / OneDrive for images. Light, calm, content-first. React pages under `resources/js/pages/drive/*` rendered via Inertia; React + Tailwind + shadcn/ui + lucide-react only.

## 1. Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ☰  Stash        [ 🔍 Search images and folders       ]   ◐ ⎋  │  top bar (64px)
├──────────────┬─────────────────────────────────────────────────┤
│ [+ New]      │  My Files › Trips › 2024        ⊞ ☰  Sort ▾    │  toolbar
│              │ ─────────────────────────────────────────────── │
│ ▣ My Files   │  Folders                                        │
│ ◷ Recent     │  [📁 Paris] [📁 Rome]                           │
│ ★ Starred    │                                                 │
│ 🗑 Trash     │  Images                                         │
│              │  [img][img][img][img][img]                      │
│ ▬▬▬▬ 640 MB  │  [img][img][img][img][img]                      │
│ 340 images   │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
                                         ┌ Uploading 3 of 20 ───┐   upload queue
                                         └──────────────────────┘
```

- Sidebar 256px on `lg+`, a drawer below `lg`. Top bar and toolbar are sticky. `⎋` is log out.
- Selection mode shows a floating action bar at the bottom of the view with the count and a clear action (`✕  3 selected`); **Move** (task 2.4) is live, and `🔗 Copy link`, `★ Star` and `🗑 Trash` join it once those actions exist. On mobile it sticks to the bottom edge.

## 2. Visual tokens

| Token | Light | Dark |
|---|---|---|
| Background | `#ffffff` | `#131314` |
| Surface | `#f6f8fc` | `#1e1f20` |
| Border | `#e3e6ec` | `#2d2f31` |
| Text | `#1f1f1f` | `#e3e3e3` |
| Muted | `#5f6368` | `#9aa0a6` |
| Accent | `#0b57d0` | `#a8c7fa` |
| Accent surface | `#d3e3fd` | `#0842a0` |
| Danger | `#b3261e` | `#f2b8b5` |
| Success | `#146c2e` | `#6dd58c` |

Inter (system fallback), base 14px. Radius: cards 12px, pills for search and New, 8px elsewhere. Define colors as CSS variables (shadcn convention); never hard-code hex in components.

## 3. Review & convert dialog (the confirm-before-upload step)

Opens when files are dropped, pasted, or chosen. **Nothing is uploaded until Confirm.**

```
┌ Upload 3 images to "Trips / 2024" ────────────────────────────┐
│ Format   (•) WebP  ( ) AVIF  ( ) Original      [Apply to all] │
│ Quality  ───────●────  80      Max size [ 2048 ] px (optional)│
│ ───────────────────────────────────────────────────────────── │
│ [thumb] IMG_0412.jpg    4.2 MB  4032×3024   Format: WebP ▾  ✕ │
│ [thumb] beach.png       1.1 MB  1920×1080   Format: AVIF ▾  ✕ │
│ [thumb] anim.gif        3.0 MB  480×270 ⟳   Format: WebP ▾  ✕ │
│ ───────────────────────────────────────────────────────────── │
│ ⓘ Originals are not stored. Metadata such as GPS is removed.  │
│ ☐ Remember these settings                                      │
│                                   [ Cancel ]  [ Upload 3 ]    │
└───────────────────────────────────────────────────────────────┘
```

- Global controls set defaults for every row. Each row can override its own format and quality.
- Previews use `URL.createObjectURL` (client only); no server call yet.
- **AVIF** is disabled (with a tooltip) if `capabilities.avif` is false, and for animated inputs. **Original** shows a warning that metadata is kept and the file is stored as is.
- Unsupported files (SVG, HEIC, non-images) appear in the list with an inline error and are excluded from the count.
- Files over `capabilities.maxUploadMb` are flagged and excluded.
- Defaults come from `capabilities.defaults`; "Remember" stores the last choice in `localStorage`.
- Confirm starts the queue. After each file completes, its row shows "4.2 MB → 610 KB (−86%)".
- The same dialog, in single-file mode, powers **Replace image** (format and quality only, no folder choice).

## 4. Components

**Top bar:** logo, search pill (`/` focuses), theme toggle, log out.

**Sidebar:** *New* button → menu (*New folder*, *Upload images*). Nav: My Files, Recent, Starred, Trash. Storage meter at the bottom ("640 MB used · 340 images"; no quota).

**Breadcrumbs:** clickable; each crumb is a drop target. Collapse middle segments with `…` beyond 4.

**FolderCard:** a 56px pill (icon, name, ⋮). Click or Enter opens. A drag source (the folder moves) and a drop target (a dragged selection moves into it); highlights while a drag is over it.

**Move to… picker:** a small centered dialog listing every active folder as a depth-indented `<select>`, `My Files` (root) first. Moving a folder disables itself and its descendants; the current folder is disabled (a no-op). Confirm posts `items.move`; Cancel or a backdrop click closes without a request.

**ImageCard (grid):** `aspect-[4/3]` thumbnail (`object-cover`, explicit width/height from the DB to avoid layout shift), file name below, a small format badge (`AVIF` / `WEBP`), star badge if starred. Checkbox top-left on hover or when selected. ⋮ top-right. Thumbnails use the permanent thumb URL.

**List view:** columns Name · Format · Dimensions · Size · Modified; 40px thumbnail; click a header to sort.

**Lightbox:** a dark overlay; image fitted; top bar with name, 🔗 Share, ⬇, ⓘ, ✕; ‹ › arrows (keys too); swipe on touch; preload neighbours. ⓘ opens a 320px side panel with name, format, dimensions, size, created, and the **Versions** list (§6).

**Upload queue:** bottom-right, collapsible. Row per file: name, progress bar, ✕ cancel or ↻ retry, ✓ done with savings. Header: "Uploading 3 of 20" / "20 uploads complete". Concurrency 2. Uses `XMLHttpRequest` for progress.

**Drop overlay:** window-wide dashed accent border: "Drop images to upload to *{folder}*". Dropping opens the Review dialog.

**Toasts:** "Moved 3 items", "Moved to trash · Undo", "Link copied", and errors with Retry where possible.

## 5. Share dialog (🔗, also in the context menu and the selection bar)

```
┌ Share "Sunset beach" ─────────────────────────────────────────┐
│ Anyone with the link can view. No login required.             │
│                                                               │
│ Always latest   https://…/i/Xk3…/sunset-beach.avif    [Copy]  │
│   Updates when you replace the image.                         │
│ This version    https://…/i/Xk3…/sunset-beach.v3.avif [Copy]  │
│   Permanent. Never changes.                                   │
│ Share page      https://…/p/Xk3…                      [Copy]  │
│                                                               │
│ Embed   [ Markdown | HTML ]   ![Sunset beach](…v3.avif)  [Copy]│
│ ⚠ AVIF may not display in some chat apps and older viewers.   │
│   (shown only for AVIF images)                                │
└───────────────────────────────────────────────────────────────┘
```

- URLs come from the server (`urls.*`), built with `PUBLIC_BASE_URL`.
- If `PUBLIC_BASE_URL` points at `localhost`, show a hint: "Only reachable on this machine. Set PUBLIC_BASE_URL to share with others."
- Multi-select + Copy link copies one URL per line (permanent links).
- Implemented in task 3.3 (R1 MVP): Always latest, This version, the Markdown/HTML embed, the AVIF warning and the localhost hint; 🔗 opens it from the lightbox and the context menu. The share-page row lands with 3.4; the selection-bar 🔗 and multi-select copy with R1.2.

## 6. Versions (details panel)

List newest first: `v3 (current) · AVIF · 610 KB · 2 days ago`, with actions: **Copy permanent link**, **Make current** (restore), **Open**. Footer: "Replace image…" opens the Review dialog in single-file mode. A note: "Older versions are kept up to {KEEP_VERSIONS}."

## 7. Interaction rules

- Click selects; double-click opens; on touch, tap opens when nothing is selected, else toggles selection.
- Ctrl/Cmd+click toggle, Shift+click range, Ctrl/Cmd+A all, Esc clear.
- Dragging a selection drags all of it, with a count badge. Dragging a folder card drags that folder.
- Drop targets: a FolderCard, any breadcrumb crumb, and the sidebar's *My Files* (root). A drop moves the dragged items there and never navigates.
- The selection bar's **Move** opens the picker; the choice is optimistic (items hide immediately) and rolls back with an error toast if the request fails. Success shows "Moved N items".
- Drag from the OS shows the drop overlay. Dropping onto a FolderCard preselects that folder in the Review dialog.
- Optimistic UI for star, rename, move, trash (local state, rollback on error). Everything else uses Inertia navigation and partial reloads (`only`).
- Context menu: Open · Share · Download · Rename · Replace image… · Move to… · Star · Move to trash. In Trash: Restore · Delete forever.

## 8. Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus search |
| `Enter` | Open selected |
| `F2` | Rename |
| `Delete` / `Backspace` | Move to trash |
| `Shift+N` | New folder |
| `U` | Upload (opens file picker, then Review dialog) |
| `L` | Share dialog |
| `Ctrl/Cmd+A` | Select all |
| `Esc` | Clear selection; close dialogs and lightbox |
| `←` `→` | Lightbox prev / next |
| `?` | Shortcuts help |

## 9. States (required on every list view)

- **Loading:** skeleton cards (same grid, no layout shift).
- **Empty:** My Files "Drop images here or press **New**"; Trash "Trash is empty"; Starred "Star images to find them quickly"; Search "No results for *{q}*".
- **Error:** inline card with message and Retry. If `/health` reports storage down, show a banner: "Storage is unreachable. Is your S3 service running?".
- **Login page:** email and password only. No "register" or "forgot password" links.

## 10. Responsive and accessibility

- Grid: `grid-cols-2 sm:3 md:4 xl:5 2xl:6`, 12px gap. Touch targets at least 40px. The selection bar sticks to the bottom on mobile. Dialogs are full-screen sheets below `sm`.
- Grid `role="grid"` with arrow-key navigation. Every icon-only button has `aria-label`. Visible focus rings. Dialogs and lightbox trap focus and restore it on close. Respect `prefers-reduced-motion`.
- Images use `loading="lazy"`, explicit dimensions, and `alt` = image name. Format and savings are text, not color-only.