import { Link, router, usePage } from "@inertiajs/react";
import {
  Cloud,
  Files,
  Clock,
  FolderPlus,
  ImagePlus,
  Star,
  Trash2,
  Menu,
  X,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { classifyReviewFiles, type ReviewRow } from "../lib/reviewFiles.js";
import { formatBytes } from "../lib/format.js";
import type { SharedProps } from "../types.js";
import Toasts from "./Toasts.js";
import StorageBanner from "./drive/StorageBanner.js";
import ReviewDialog, { type ReviewUpload } from "./drive/ReviewDialog.js";
import NewFolderDialog from "./drive/NewFolderDialog.js";
import UploadQueue from "./drive/UploadQueue.js";
import DropOverlay from "./drive/DropOverlay.js";
import {
  enqueueUploads,
  setOnUploaded,
  useUploadQueue,
} from "./drive/queueStore.js";
import {
  isExternalFileDrag,
  isItemDrag,
  requestMoveToRoot,
} from "../lib/itemDrag.js";

const NAV_ITEMS = [
  { href: "/files", label: "My Files", icon: Files },
  { href: "/recent", label: "Recent", icon: Clock },
  { href: "/starred", label: "Starred", icon: Star },
  { href: "/trash", label: "Trash", icon: Trash2 },
] as const;

/** 1.05 KB, 4.2 MB, 1.2 GB — shown as uploaded, base-1024. */

function SidebarNav({
  activePath,
  onNavigate,
}: {
  activePath: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Drive" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          activePath === item.href || activePath.startsWith(`${item.href}/`);
        const isRoot = item.href === "/files";
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            // Task 2.4: dropping a drag onto the sidebar's My Files moves the
            // dragged items to the root (the drive page owns the move).
            draggable={false}
            onDragOver={(event) => {
              if (!isItemDrag(event.dataTransfer)) return;
              if (isRoot) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!isItemDrag(event.dataTransfer)) return;
              event.preventDefault();
              if (isRoot) event.stopPropagation();
              if (isRoot) requestMoveToRoot();
            }}
            className={`flex items-center gap-3 rounded-g-ctl px-4 py-2 text-sm transition ${
              active
                ? "bg-g-accent-tint font-bold text-g-heading"
                : "text-g-text-2 hover:bg-g-raised hover:text-g-heading"
            }`}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function StorageMeter({
  usedBytes,
  imageCount,
}: {
  usedBytes: number;
  imageCount: number;
}) {
  return (
    <div className="mt-auto border-t border-g-line px-3 pt-3 text-xs text-g-muted">
      <p>
        {formatBytes(usedBytes)} used · {imageCount}{" "}
        {imageCount === 1 ? "image" : "images"}
      </p>
    </div>
  );
}

/** The accent New button and its menu (UI_SPEC §4: New folder, Upload images).
 *  One accent fill per screen stays here. */
function NewButton({
  onPickFiles,
  onNewFolder,
}: {
  onPickFiles: () => void;
  onNewFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const pick = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <div
      className="relative"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center justify-start gap-2 rounded-g-ctl bg-g-accent px-4 py-2 text-sm font-bold text-g-on-accent shadow-g-card transition hover:opacity-95"
      >
        <Plus className="h-5 w-5" aria-hidden />
        New
      </button>
      {open && (
        <div
          role="menu"
          aria-label="New"
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-40 rounded-g-card border border-g-line bg-g-panel p-1 shadow-g-float"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onNewFolder)}
            className="flex w-full items-center gap-2 rounded-g-ctl px-3 py-2 text-sm text-g-text transition hover:bg-g-raised hover:text-g-heading"
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            New folder
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onPickFiles)}
            className="flex w-full items-center gap-2 rounded-g-ctl px-3 py-2 text-sm text-g-text transition hover:bg-g-raised hover:text-g-heading"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            Upload images
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  activePath,
  onNavigate,
  onPickFiles,
  onNewFolder,
}: {
  activePath: string;
  onNavigate?: () => void;
  onPickFiles: () => void;
  onNewFolder: () => void;
}) {
  const { props } = usePage();
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <NewButton onPickFiles={onPickFiles} onNewFolder={onNewFolder} />
      <SidebarNav activePath={activePath} onNavigate={onNavigate} />
      <StorageMeter
        usedBytes={props.storage.usedBytes}
        imageCount={props.storage.imageCount}
      />
    </div>
  );
}

/** The Stash shell (UI_SPEC §1): sticky top bar, 256px sidebar that becomes a
 *  drawer below `lg`, storage meter. Login renders without this shell. */
export default function Layout({ children }: PropsWithChildren) {
  const { props: pageProps, url } = usePage();
  // The drive pages' own props ride along on the shared ones; `folder` is
  // undefined on pages that are not inside the drive.
  const props = pageProps as SharedProps & {
    folder?: { id: number } | null;
    breadcrumbs?: readonly { id: number | null; name: string }[];
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const openReview = useCallback(
    (files: readonly File[]) => {
      void classifyReviewFiles(files, {
        avif: props.capabilities.avif,
        maxUploadMb: props.capabilities.maxUploadMb,
      }).then((rows) => setReviewRows(rows));
    },
    [props.capabilities.avif, props.capabilities.maxUploadMb],
  );

  // The queue survives navigation by living in a module store; the shell only
  // subscribes and refreshes the open page's props as uploads land.
  const queueItems = useUploadQueue();
  useEffect(() => {
    setOnUploaded(() => {
      router.reload({
        only: ["folder", "breadcrumbs", "folders", "images", "storage"],
      });
    });
    return () => setOnUploaded(undefined);
  }, []);

  const confirmReview = useCallback(
    (uploads: readonly ReviewUpload[]) => {
      setReviewRows(null);
      // Every upload lands in the folder being browsed (ROUTES_SPEC §4
      // folderId); at root nothing is sent, which the server reads as root.
      const folderId = props.folder?.id;
      enqueueUploads(
        uploads.map((upload) => ({
          ...upload,
          folderId: folderId === undefined ? undefined : folderId,
        })),
      );
    },
    [props.folder?.id],
  );

  // Window-wide drop and paste open the Review dialog (UI_SPEC §3, §4); the
  // depth counter survives the enter/leave churn of child elements.
  useEffect(() => {
    const isFileDrag = (event: DragEvent) =>
      isExternalFileDrag(Array.from(event.dataTransfer?.types ?? []));
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) openReview(files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        openReview(files);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [openReview]);

  // The last breadcrumb names the destination folder (root is "My Files").
  // Pages without breadcrumbs (Recent, Starred, Trash) get no destination in
  // the dialog and overlay.
  const folderName = props.breadcrumbs
    ? props.breadcrumbs.at(-1)?.name ?? "My Files"
    : undefined;

  const navButtonClass =
    "rounded-g-ctl border border-g-line-strong px-3 py-1 text-g-text transition hover:border-g-muted";

  return (
    <div className="flex min-h-screen flex-col bg-g-page font-sans text-sm text-g-text">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-g-line bg-g-panel px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="rounded-g-ctl p-2 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <Link
          href="/files"
          className="flex items-center gap-2 text-lg font-bold text-g-heading"
        >
          <Cloud className="h-6 w-6 text-g-accent" aria-hidden />
          Stash
        </Link>

        {/* Search arrives with task 4.4; the pill holds the layout meanwhile. */}
        <div className="mx-auto hidden w-full max-w-xl items-center gap-2 rounded-g-ctl border border-transparent bg-g-raised px-4 py-2 text-g-muted sm:flex">
          <Search className="h-4 w-4" aria-hidden />
          <span>Search images and folders</span>
        </div>

        {props.auth.user ? (
          <Link
            href="/logout"
            method="post"
            as="button"
            aria-label="Log out"
            className={navButtonClass}
          >
            <LogOut className="h-5 w-5" aria-hidden />
          </Link>
        ) : (
          <Link href="/login" className={navButtonClass}>
            Sign in
          </Link>
        )}
      </header>

      <StorageBanner />

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-g-line bg-g-panel lg:block">
          <Sidebar
            activePath={url}
            onPickFiles={() => fileInputRef.current?.click()}
            onNewFolder={() => setNewFolderOpen(true)}
          />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            {/* The scrim over the page ground: the ink token dimmed, so the
                wash follows the theme without a raw color. */}
            <div
              className="absolute inset-0 bg-g-ink/60"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Drive menu"
              className="absolute inset-y-0 left-0 w-64 border-r border-g-line bg-g-panel shadow-g-float"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 font-bold text-g-heading">
                  <Cloud className="h-5 w-5 text-g-accent" aria-hidden />
                  Stash
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="rounded-g-ctl p-2 text-g-text-2 transition hover:bg-g-raised hover:text-g-heading"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <Sidebar
                activePath={url}
                onNavigate={() => setDrawerOpen(false)}
                onPickFiles={() => fileInputRef.current?.click()}
                onNewFolder={() => {
                  setDrawerOpen(false);
                  setNewFolderOpen(true);
                }}
              />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {dragging && <DropOverlay folderName={folderName} />}

      {/* One picker for the whole shell; the value resets so re-picking the
          same file fires onChange again. Picking only stages the Review
          dialog — nothing is sent before Confirm. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.target;
          if (files && files.length > 0) openReview(Array.from(files));
          event.target.value = "";
        }}
      />

      {reviewRows && (
        <ReviewDialog
          rows={reviewRows}
          caps={props.capabilities}
          folderName={folderName}
          onCancel={() => setReviewRows(null)}
          onConfirm={confirmReview}
        />
      )}

      {newFolderOpen && (
        <NewFolderDialog
          parentId={props.folder?.id ?? null}
          destinationName={folderName ?? "My Files"}
          onCancel={() => setNewFolderOpen(false)}
        />
      )}

      <UploadQueue items={queueItems} />
      <Toasts />
    </div>
  );
}
