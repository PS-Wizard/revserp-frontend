import { Link, useLocation } from "react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { getPublishedReleaseAnnouncements } from "~/lib/release-announcements";
import { requestAnnouncementReplay } from "~/lib/announcement-events";

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

export default function UpdatesPage() {
  const location = useLocation();
  const releases = getPublishedReleaseAnnouncements();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        to={`/app${location.search}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" />
        Back to workspace
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Updates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Completed work in each release, newest first.
      </p>

      {releases.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <div className="mt-8 space-y-12">
          {releases.map((release) => (
            <article key={release.id} aria-labelledby={`${release.id}-title`}>
              <div className="overflow-hidden rounded-xl border">
                <img
                  src={release.coverImage}
                  alt=""
                  aria-hidden="true"
                  className="aspect-[21/9] w-full object-cover"
                  loading="lazy"
                />
              </div>

              <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {formatReleaseDate(release.publishedAt)}
              </p>
              <h2 id={`${release.id}-title`} className="mt-1 text-xl font-semibold tracking-tight">
                {release.title}
                {release.version ? ` · ${release.version}` : null}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {release.summary}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => requestAnnouncementReplay(release.id)}
              >
                View highlights
              </Button>

              <div className="mt-6 space-y-6">
                {release.sections.map((section) => (
                  <section key={section.title} aria-label={section.title}>
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
