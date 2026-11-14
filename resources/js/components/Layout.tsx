import { Link, router, usePage } from "@inertiajs/react";
import {
  Cloud,
  Files,
  Clock,
  ImagePlus,
  Star,
  Trash2,
  Menu,
  X,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useRef, useState, type PropsWithChildren } from "react";
import { formatBytes } from "../lib/format.js";
import Toasts, { type Toast } from "./drive/Toasts.js";
import { uploadFile } from "./drive/upload.js";

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
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
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

/** The accent New button and its one-command menu; task 1.6 grows more items
 *  (folder, upload with review). One accent fill per screen stays here. */
function NewButton({ onPickFiles }: { onPickFiles: () => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
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
            onClick={() => {
              setOpen(false);
              onPickFiles();
            }}
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
}: {
  activePath: string;
  onNavigate?: () => void;
  onPickFiles: () => void;
}) {
  const { props } = usePage();
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <NewButton onPickFiles={onPickFiles} />
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
  const { props, url } = usePage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const openPicker = useCallback(() => fileInputRef.current?.click(), []);

  // Sequential on purpose: the server caps concurrent encodes, and task 1.6's
  // queue brings the real (parallel, cancellable) behavior.
  async function uploadFiles(files: FileList) {
    const defaults = props.capabilities.defaults;
    const quality =
      defaults.format === "avif"
        ? defaults.qualityAvif
        : defaults.format === "webp"
          ? defaults.qualityWebp
          : undefined;
    for (const file of Array.from(files)) {
      const result = await uploadFile(file, {
        format: defaults.format,
        quality,
      });
      if (result.ok) {
        setToasts((current) => [
          ...current,
          {
            id: nextToastId.current++,
            kind: "success",
            text: `${result.name}: ${formatBytes(result.originalSize)} → ${formatBytes(result.storedSize)} (−${result.savedPercent}%)`,
          },
        ]);
      } else {
        setToasts((current) => [
          ...current,
          {
            id: nextToastId.current++,
            kind: "error",
            text: `${result.name}: ${result.message}`,
          },
        ]);
      }
    }
    router.reload({
      only: ["folder", "breadcrumbs", "folders", "images", "storage"],
    });
  }

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

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-g-line bg-g-panel lg:block">
          <Sidebar activePath={url} onPickFiles={openPicker} />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            {/* The scrim over the page ground: a black wash, the one color no
                token covers, disabled with that reason for the lint rule. */}
            {/* eslint-disable-next-line guren/no-raw-color */}
            <div
              className="absolute inset-0 bg-black/40"
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
                onPickFiles={openPicker}
              />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* One picker for the whole shell; the value resets so re-picking the
          same file fires onChange again. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.target;
          if (files && files.length > 0) void uploadFiles(files);
          event.target.value = "";
        }}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
