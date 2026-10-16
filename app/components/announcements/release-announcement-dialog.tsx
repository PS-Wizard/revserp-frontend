"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import type { ReleaseAnnouncement } from "~/lib/release-announcements";
import { cn } from "~/lib/utils";
import "./release-announcement-dialog.css";

export type ReleaseAnnouncementDialogProps = {
  release: ReleaseAnnouncement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewAll: () => void;
};

function formatReleaseDate(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Date(time).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ReleaseAnnouncementDialog({
  release,
  open,
  onOpenChange,
  onViewAll,
}: ReleaseAnnouncementDialogProps) {
  const [step, setStep] = useState(0);
  const total = release.slides.length;

  useEffect(() => {
    if (open) setStep(0);
  }, [open, release.id]);

  useEffect(() => {
    const next = release.slides[step + 1]?.image;
    if (!next || typeof Image === "undefined") return;
    const img = new Image();
    img.src = next;
  }, [release.slides, step]);

  const slide = release.slides[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="release-announcement flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <div className="relative h-[168px] w-full shrink-0 overflow-hidden sm:h-[224px]">
          <img
            key={slide.id}
            src={slide.image}
            alt=""
            aria-hidden="true"
            className="release-announcement-art absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: slide.imagePosition ?? "50% 45%" }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-4">
          <DialogTitle className="text-lg">
            What&apos;s new · {formatReleaseDate(release.publishedAt)}
            {release.version ? ` · ${release.version}` : null}
          </DialogTitle>

          <div key={slide.id} className="release-announcement-slide mt-3 min-h-[168px]">
            <h3 className="text-base font-semibold">{slide.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {slide.description}
            </p>
            {slide.bullets?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {slide.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <p aria-live="polite" className="sr-only">
            {slide.title} — slide {step + 1} of {total}
          </p>
        </div>

        <div className="shrink-0 border-t px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center" role="group" aria-label="Release highlights">
                {release.slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(index)}
                    aria-label={`Go to slide ${index + 1}: ${item.title}`}
                    aria-current={index === step ? true : undefined}
                    className="flex size-6 items-center justify-center"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 rounded-full transition-colors",
                        index === step
                          ? "bg-foreground"
                          : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                      )}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {step + 1} of {total}
              </span>
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                ·
              </span>
              <button
                type="button"
                onClick={onViewAll}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                View all updates
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 0}
                onClick={() => setStep((value) => Math.max(0, value - 1))}
              >
                <ChevronLeftIcon />
                Back
              </Button>
              {isLast ? (
                <Button size="sm" className="min-w-[84px]" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              ) : (
                <Button size="sm" className="min-w-[84px]" onClick={() => setStep((value) => Math.min(total - 1, value + 1))}>
                  Next
                  <ChevronRightIcon />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
