import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Info, X } from "lucide-react";
import type { ImageItem, ImageVersionSummary } from "../../types";
import { formatBytes } from "../../lib/format";

type Props = {
  image: ImageItem;
  versions?: ImageVersionSummary[];
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDownload: (image: ImageItem) => void;
};

function formatDate(epochMs: number) {
  return new Date(epochMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Full-screen image viewer: prev/next, keyboard, download, versions info. */
export function Lightbox(props: Props) {
  const { image, versions } = props;
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }
      if (event.key === "Escape") props.onClose();
      else if (event.key === "ArrowLeft" && props.canPrev) props.onPrev();
      else if (event.key === "ArrowRight" && props.canNext) props.onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Lightbox: ${image.name}`}>
      <div className="absolute inset-0" onClick={props.onClose} aria-hidden="true" />

      {props.canPrev && (
        <button
          type="button"
          onClick={props.onPrev}
          className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {props.canNext && (
        <button
          type="button"
          onClick={props.onNext}
          className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Next image"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 p-3 pr-6">
        <div className="pointer-events-auto min-w-0 flex-1 truncate rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground">
          {image.name}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => props.onDownload(image)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen((open) => !open)}
            className={`rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-primary ${infoOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            aria-label={infoOpen ? "Hide info" : "Show info"}
            aria-pressed={infoOpen}
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Close lightbox"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden p-4 pt-16 pb-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.urls.latest}
          alt={image.name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>

      {infoOpen && (
        <aside className="absolute inset-y-0 right-0 z-20 w-80 overflow-y-auto border-l border-border bg-card p-4 text-sm text-foreground">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info</h2>
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="truncate text-right font-medium">{image.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Dimensions</dt>
              <dd className="font-medium">{image.width}×{image.height}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Format</dt>
              <dd className="font-medium">{image.format.toUpperCase()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-medium">{formatBytes(image.size)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium">v{image.version}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Added</dt>
              <dd className="font-medium">{formatDate(image.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="font-medium">{formatDate(image.updatedAt)}</dd>
            </div>
          </dl>

          {versions && (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versions</h3>
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No versions.</p>
              ) : (
                <ul className="space-y-1">
                  {versions.map((version) => (
                    <li
                      key={version.version}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${version.version === image.version ? "border-primary/40 bg-primary/5" : "border-border"}`}
                    >
                      <span className="font-medium">v{version.version}</span>
                      <span className="text-xs text-muted-foreground">
                        {version.format.toUpperCase()} · {formatBytes(version.size)}
                      </span>
                      {version.version === image.version && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Current</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      )}

      <div className="sr-only" aria-live="polite">
        {image.name}
      </div>
    </div>,
    document.body,
  );
}
