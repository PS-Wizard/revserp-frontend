import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  LOCAL_SEO_FIND_BUSINESSES_LABEL,
  buildLocalSeoListingLookupInput,
  buildLocalSeoUnboundDraftInput,
  describeLocalSeoResolveAction,
  isSameLocalSeoSourceCandidate,
  LocalSeoMapSearchCard,
  normalizeLocalSeoCandidateName,
  resolveLocalSeoSearchArea,
} from "~/components/local-seo-map-search";
import { localSeoLatestListingLookupQueryKey, type LocalSeoLocation, type LocalSeoListingLookup } from "~/lib/local-seo-api";

function makeUnboundLocation(overrides: Partial<LocalSeoLocation> = {}): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Main Street Cafe",
    place_id: null,
    address: "",
    locality: "",
    query_service: "",
    latitude: 27.71,
    longitude: 85.33,
    queries: [],
    ...overrides,
  };
}

function makeLookup(overrides: Partial<LocalSeoListingLookup> = {}): LocalSeoListingLookup {
  return {
    id: "lookup-1",
    status: "failed",
    expected_credits: 3,
    credits_used: 3,
    reserved_credits: 0,
    credit_known: true,
    error: "No bindable listing",
    candidates: [],
    ...overrides,
  };
}

function renderCard(props: Parameters<typeof LocalSeoMapSearchCard>[0], lookup?: LocalSeoListingLookup) {
  const client = new QueryClient();
  if (lookup && props.initialLocation) {
    client.setQueryData(
      localSeoLatestListingLookupQueryKey(props.projectId, props.initialLocation.id),
      lookup,
    );
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocalSeoMapSearchCard {...props} />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("no geocoder binding call", () => {
  test("binding card source never touches the free address API", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./local-seo-map-search.tsx", import.meta.url),
      "utf8",
    );
    for (const banned of [
      "searchLocalSeoAddresses",
      "reverseLocalSeoAddress",
      "address-search",
      "reverse-address",
      "Nominatim",
      "nominatim",
    ]) {
      expect(source.includes(banned)).toBe(false);
    }
    expect(source.includes("createLocalSeoListingLookup")).toBe(true);
    expect(source.includes("bindLocalSeoListing")).toBe(true);
  });
});

describe("explicit paid search gate", () => {
  test("first attempt is one explicit priced action", () => {
    const gate = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: null,
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Main Street Cafe", latitude: 27.71, longitude: 85.33 },
      lastSourceCandidate: null,
      creditKnown: null,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(gate.canResolve).toBe(true);
    expect(gate.resolveLabel).toBe("Find Google businesses · 3 credits");
    expect(gate.resolveLabel).toBe(LOCAL_SEO_FIND_BUSINESSES_LABEL);
    expect(gate.canBind).toBe(false);
  });

  test("running, uncertain, held, and unconfirmed states block new paid calls", () => {
    for (const status of ["running", "uncertain"] as const) {
      const gate = describeLocalSeoResolveAction({
        bound: false,
        lookupStatus: status,
        lookupBusy: false,
        bindBusy: false,
        candidateCount: 1,
        selectedPlaceId: null,
        selectedSearch: { display_name: "Other", latitude: 1, longitude: 2 },
        lastSourceCandidate: null,
        creditKnown: true,
        reservedCredits: 0,
        hasQuery: true,
        hasViewport: true,
      });
      expect(gate.canResolve).toBe(false);
      expect(gate.reason).toContain("nothing retries automatically");
    }
    const held = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Other", latitude: 1, longitude: 2 },
      lastSourceCandidate: null,
      creditKnown: true,
      reservedCredits: 3,
      hasQuery: true,
      hasViewport: true,
    });
    expect(held.canResolve).toBe(false);
    expect(held.reason).toContain("never recovered automatically");
    const unconfirmed = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Other", latitude: 1, longitude: 2 },
      lastSourceCandidate: null,
      creditKnown: false,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(unconfirmed.canResolve).toBe(false);
    const bound = describeLocalSeoResolveAction({
      bound: true,
      lookupStatus: "completed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 2,
      selectedPlaceId: "ChIJ1",
      creditKnown: true,
      hasQuery: true,
      hasViewport: true,
    });
    expect(bound.canResolve).toBe(false);
    expect(bound.canBind).toBe(false);
    expect(bound.reason).toContain("Unbind");
  });

  test("loading or failed lookup reads block before any charge", () => {
    const gate = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: true,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Other", latitude: 1, longitude: 2 },
      lastSourceCandidate: null,
      creditKnown: true,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(gate.canResolve).toBe(false);
    expect(gate.canBind).toBe(false);
  });

  test("missing term or missing search area blocks paid action", () => {
    const noQuery = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: null,
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: null,
      lastSourceCandidate: null,
      creditKnown: null,
      reservedCredits: 0,
      hasQuery: false,
      hasViewport: true,
    });
    expect(noQuery.canResolve).toBe(false);
    const noViewport = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: null,
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: null,
      lastSourceCandidate: null,
      creditKnown: null,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: false,
    });
    expect(noViewport.canResolve).toBe(false);
    expect(noViewport.reason).toContain("search area");
  });
});

describe("same search versus different term", () => {
  test("same normalized term plus exact viewport is blocked with free reuse", () => {
    const gate = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "  cafe A ", latitude: 27.71, longitude: 85.33 },
      lastSourceCandidate: { display_name: "Cafe A", latitude: 27.71, longitude: 85.33 },
      creditKnown: true,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(gate.canResolve).toBe(false);
    expect(gate.reason).toContain("already tried");
    expect(gate.reason).toContain("no new charge");
    expect(gate.resolveLabel).toContain("3 credits");
  });

  test("different term or moved viewport is a new explicit paid search", () => {
    const differentTerm = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Cafe B", latitude: 27.71, longitude: 85.33 },
      lastSourceCandidate: { display_name: "Cafe A", latitude: 27.71, longitude: 85.33 },
      creditKnown: true,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(differentTerm.canResolve).toBe(true);
    expect(differentTerm.resolveLabel).toContain("3 credits");
    const movedViewport = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "failed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 0,
      selectedPlaceId: null,
      selectedSearch: { display_name: "Cafe A", latitude: 27.72, longitude: 85.34 },
      lastSourceCandidate: { display_name: "Cafe A", latitude: 27.71, longitude: 85.33 },
      creditKnown: true,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(movedViewport.canResolve).toBe(true);
  });

  test("resolved search offers free bind, never a false failure message", () => {
    const source = { display_name: "Cafe A", latitude: 27.71, longitude: 85.33 };
    const gate = describeLocalSeoResolveAction({
      bound: false,
      lookupStatus: "completed",
      lookupBusy: false,
      bindBusy: false,
      candidateCount: 1,
      selectedPlaceId: "real-stored-id",
      selectedSearch: source,
      lastSourceCandidate: source,
      creditKnown: true,
      reservedCredits: 0,
      hasQuery: true,
      hasViewport: true,
    });
    expect(gate.canResolve).toBe(false);
    expect(gate.canBind).toBe(true);
    expect(gate.reason).toContain("already resolved");
    expect(gate.reason?.includes("did not resolve")).toBe(false);
  });
});

describe("search term normalization", () => {
  test("whitespace and case do not hide a repeat attempt", () => {
    expect(
      isSameLocalSeoSourceCandidate(
        { display_name: "  Cafe A ", latitude: 27.71, longitude: 85.33 },
        { display_name: "cafe a", latitude: 27.71, longitude: 85.33 },
      ),
    ).toBe(true);
    expect(normalizeLocalSeoCandidateName("  Cafe   A ")).toBe("cafe a");
  });

  test("exact viewport is required for a repeat", () => {
    expect(
      isSameLocalSeoSourceCandidate(
        { display_name: "Cafe A", latitude: 27.71, longitude: 85.33 },
        { display_name: "Cafe A", latitude: 27.72, longitude: 85.33 },
      ),
    ).toBe(false);
    expect(isSameLocalSeoSourceCandidate(null, null)).toBe(false);
  });
});

describe("paid body and draft body", () => {
  test("paid body carries the actual search term plus live viewport", () => {
    const input = buildLocalSeoListingLookupInput("  cafe search ", 27.71, 85.33);
    expect(input).toEqual({ search_query: "cafe search", latitude: 27.71, longitude: 85.33 });
  });

  test("unbound draft keeps service and locality optional and empty", () => {
    const draft = buildLocalSeoUnboundDraftInput("  Main Street Cafe ", {
      latitude: 27.71,
      longitude: 85.33,
    });
    expect(draft.name).toBe("Main Street Cafe");
    expect(draft.address).toBe("");
    expect(draft.locality).toBe("");
    expect(draft.query_service).toBe("");
    expect(draft.queries).toEqual([]);
    expect(draft.latitude).toBe(27.71);
    expect(draft.longitude).toBe(85.33);
  });

  test("search area prefers the live viewport and falls back to the stored draft", () => {
    expect(
      resolveLocalSeoSearchArea([85.33, 27.71], { latitude: 0, longitude: 0 }),
    ).toEqual({ latitude: 27.71, longitude: 85.33, source: "live" });
    expect(
      resolveLocalSeoSearchArea(undefined, { latitude: 27.71, longitude: 85.33 }),
    ).toEqual({ latitude: 27.71, longitude: 85.33, source: "stored" });
    expect(resolveLocalSeoSearchArea(undefined, null)).toBeNull();
    expect(resolveLocalSeoSearchArea([200, 100], null)).toBeNull();
  });
});

describe("map search card", () => {
  test("new search shows one business field and exactly one explicit price", () => {
    const html = renderCard({ projectId: "proj-1", searchCenter: [85.33, 27.71], onClose: () => {} });
    expect(html).toContain("Business name search");
    expect(html).toContain("Find Google businesses · 3 credits");
    expect(countOccurrences(html, "3 credits")).toBe(1);
    expect(html.includes("Service text")).toBe(false);
    expect(html.includes("Locality")).toBe(false);
    expect(html).toContain("Search area");
    expect(html).toContain("not business identity");
    expect(html).toContain("Close");
  });

  test("missing viewport blocks the paid action before any charge", () => {
    const html = renderCard({ projectId: "proj-1" });
    expect(html).toContain("Move the map to set a search area");
    expect(/disabled[^>]*>Find Google businesses/.test(html)).toBe(true);
  });

  test("resume draft shows stored search area with priced retry and close", () => {
    const html = renderCard({
      projectId: "proj-1",
      initialLocation: makeUnboundLocation(),
      searchCenter: [85.34, 27.72],
      onClose: () => {},
    });
    expect(html).toContain("Google listing for Main Street Cafe");
    expect(html).toContain("Saved unbound search");
    expect(html).toContain("search area only");
    expect(html).toContain("Find Google businesses · 3 credits");
    expect(html).toContain("Close");
  });

  test("bound resume shows authoritative coords and blocks new searches", () => {
    const html = renderCard({
      projectId: "proj-1",
      initialLocation: makeUnboundLocation({ place_id: "real-place-1" }),
      searchCenter: [85.33, 27.71],
      onClose: () => {},
    });
    expect(html).toContain("Bound to");
    expect(html).toContain("Unbind");
    expect(/disabled[^>]*>Find Google businesses/.test(html)).toBe(true);
  });

  test("same failed search is disabled with helpful feedback and no recharge", () => {
    const location = makeUnboundLocation();
    const html = renderCard(
      { projectId: "proj-1", initialLocation: location },
      makeLookup({
        status: "failed",
        candidates: [],
        source_candidate: {
          display_name: "Main Street Cafe",
          latitude: 27.71,
          longitude: 85.33,
        },
      }),
    );
    expect(html).toContain("already tried");
    expect(html).toContain("no new charge");
    expect(/disabled[^>]*>Find Google businesses/.test(html)).toBe(true);
    expect(html).toContain("Last attempted search");
  });

  test("completed lookup needs explicit human confirmation to bind for free", () => {
    const location = makeUnboundLocation();
    const html = renderCard(
      { projectId: "proj-1", initialLocation: location, searchCenter: [99, 9] },
      makeLookup({
        status: "completed",
        error: null,
        candidates: [
          { place_id: "ChIJ1", title: "Cafe One", address: "Street 1", latitude: 27.71, longitude: 85.33 },
        ],
        source_candidate: {
          display_name: "Other query",
          latitude: 9,
          longitude: 99,
        },
      }),
    );
    expect(html).toContain("Choose your listing");
    expect(html).toContain("Cafe One");
    expect(html).toContain("Bind selected listing · Free");
    expect(html).toContain("Find Google businesses · 3 credits");
  });
});
