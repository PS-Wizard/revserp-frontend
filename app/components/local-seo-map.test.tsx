import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

declare module "bun:test" {
  export const mock: {
    module(specifier: string, factory: () => unknown): void;
  };
}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FeatureCollection } from "geojson";

import { installTestDom } from "~/lib/dom-test-setup";
import { gridFeatureCollection } from "~/lib/local-seo-grid-geo";

installTestDom();

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

type ClickPayload = {
  lngLat: { lng: number; lat: number };
  features?: Array<Record<string, unknown>>;
};

type HandlerEntry = {
  layer?: string;
  handler: (event: ClickPayload) => void;
};

class FakeGeoJSONSource {
  data: unknown;
  constructor(data: unknown) {
    this.data = data;
  }
  setData(data: unknown) {
    this.data = data;
  }
}

class FakeMap {
  static instances: FakeMap[] = [];
  static failConstruction = false;
  options: Record<string, unknown>;
  controls: unknown[] = [];
  sources = new Map<string, FakeGeoJSONSource>();
  layers: Array<Record<string, unknown>> = [];
  images = new Map<string, unknown>();
  handlers = new Map<string, HandlerEntry[]>();
  removed = false;
  constructor(options: Record<string, unknown>) {
    if (FakeMap.failConstruction) throw new Error("WebGL is unavailable");
    this.options = options;
    FakeMap.instances.push(this);
  }
  addControl(control: unknown) {
    this.controls.push(control);
  }
  addSource(id: string, definition: { data: unknown }) {
    this.sources.set(id, new FakeGeoJSONSource(definition.data));
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  hasImage(id: string) {
    return this.images.has(id);
  }
  addImage(id: string, image: unknown) {
    this.images.set(id, image);
  }
  addLayer(definition: Record<string, unknown>) {
    this.layers.push(definition);
  }
  on(event: string, layerOrHandler: string | HandlerEntry["handler"], handler?: HandlerEntry["handler"]) {
    const entry =
      typeof layerOrHandler === "string"
        ? { layer: layerOrHandler, handler: handler as HandlerEntry["handler"] }
        : { handler: layerOrHandler };
    const list = this.handlers.get(event) ?? [];
    list.push(entry);
    this.handlers.set(event, list);
  }
  remove() {
    this.removed = true;
  }
  resize() {}
  fire(event: string, payload: ClickPayload, layer?: string) {
    for (const entry of this.handlers.get(event) ?? []) {
      if ((entry.layer ?? undefined) === layer) entry.handler(payload);
    }
  }
}

class FakeAttributionControl {
  constructor(_options?: unknown) {}
}
class FakeNavigationControl {
  constructor(_options?: unknown) {}
}
class FakeScaleControl {
  constructor(_options?: unknown) {}
}

mock.module("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: class {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
  },
  AttributionControl: FakeAttributionControl,
  NavigationControl: FakeNavigationControl,
  ScaleControl: FakeScaleControl,
}));
mock.module("maplibre-gl/dist/maplibre-gl.css", () => ({}));

const { LocalSeoMap } = await import("~/components/local-seo-map");
type MapProps = Parameters<typeof LocalSeoMap>[0];

const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const CENTRE: [number, number] = [85.340306, 27.715444];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderMap(props: MapProps): FakeMap {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<LocalSeoMap {...props} />);
  });
  return FakeMap.instances[FakeMap.instances.length - 1];
}

function rerender(props: MapProps) {
  act(() => {
    root?.render(<LocalSeoMap {...props} />);
  });
}

function teardown() {
  if (root) act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  FakeMap.instances.length = 0;
}

const getCanvasContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  teardown();
  FakeMap.failConstruction = false;
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof getCanvasContext;
});

afterEach(() => {
  teardown();
  HTMLCanvasElement.prototype.getContext = getCanvasContext;
});

function rankedOverlay(): MapProps["overlayData"] {
  return gridFeatureCollection(
    [
      {
        point_index: 4,
        call_status: "success_nonempty",
        match_status: "found",
        rank: 1,
        latitude: 27.715443999999994,
        longitude: 85.340306,
      },
    ],
    CENTRE,
    5000,
  );
}

describe("local SEO map lifecycle", () => {
  test("container positioning wins over MapLibre's unlayered relative rule", () => {
    renderMap({ center: CENTRE });
    const container = host?.querySelector<HTMLElement>("[role=application]");
    expect(container?.style.position).toBe("absolute");
  });

  test("builds one light-styled map and installs sources only after style load", () => {
    const seen: unknown[] = [];
    const map = renderMap({
      center: CENTRE,
      radiusM: 5000,
      onReady: (instance) => seen.push(instance),
    });
    expect(FakeMap.instances).toHaveLength(1);
    expect(map.options["style"]).toBe(LIGHT_STYLE_URL);
    expect(map.options["attributionControl"]).toBe(false);
    expect(
      map.controls.some((control) => control instanceof FakeAttributionControl),
    ).toBe(true);
    // addSource and addLayer before style load throw, so nothing is installed yet.
    expect(map.sources.size).toBe(0);
    expect(map.layers).toHaveLength(0);
    expect(seen).toHaveLength(0);

    map.fire("load", { lngLat: { lng: 0, lat: 0 } });

    expect(map.sources.has("local-seo-radius")).toBe(true);
    expect(map.sources.has("local-seo-overlay")).toBe(true);
    const ids = map.layers.map((layer) => layer["id"]);
    expect(ids).toContain("local-seo-radius-fill");
    expect(ids).toContain("local-seo-radius-line");
    expect(ids).toContain("local-seo-overlay-fill");
    expect(ids).toContain("local-seo-overlay-hatch");
    expect(ids).toContain("local-seo-overlay-line");
    expect(ids).toContain("local-seo-overlay-label");
    const radiusLine = map.layers.find((layer) => layer["id"] === "local-seo-radius-line");
    expect(
      (radiusLine?.["paint"] as Record<string, unknown>)["line-dasharray"],
    ).toEqual([2, 2]);
    const label = map.layers.find((layer) => layer["id"] === "local-seo-overlay-label");
    expect(JSON.stringify(label?.["layout"])).toContain("label");
    expect(seen[0]).toBe(map);
  });

  test("applies the latest overlay and radius props once loaded", () => {
    const overlay = rankedOverlay();
    const map = renderMap({ center: CENTRE, radiusM: 5000, overlayData: overlay });
    map.fire("load", { lngLat: { lng: 0, lat: 0 } });

    const radiusData = map.sources.get("local-seo-radius")
      ?.data as FeatureCollection;
    expect(radiusData.features).toHaveLength(1);
    expect(radiusData.features[0].geometry.type).toBe("Polygon");
    expect(
      (radiusData.features[0].geometry as { coordinates: unknown[][] }).coordinates[0],
    ).toHaveLength(97);
    expect(map.sources.get("local-seo-overlay")?.data).toBe(overlay);

    rerender({ center: CENTRE, radiusM: null, overlayData: overlay });
    const cleared = map.sources.get("local-seo-radius")?.data as FeatureCollection;
    expect(cleared.features).toHaveLength(0);
  });

  test("keeps one map instance and cleans up on unmount", () => {
    const map = renderMap({ center: CENTRE, radiusM: 1000 });
    rerender({ center: CENTRE, radiusM: 2000 });
    expect(FakeMap.instances).toHaveLength(1);
    teardown();
    expect(map.removed).toBe(true);
  });
});

describe("local SEO map clicks", () => {
  test("wires feature clicks even when the callback arrives after mount", () => {
    const map = renderMap({ center: CENTRE });
    map.fire("load", { lngLat: { lng: 0, lat: 0 } });
    const seen: unknown[] = [];
    rerender({ center: CENTRE, onFeatureClick: (feature) => seen.push(feature) });
    const feature = { properties: { label: "1" } };
    map.fire(
      "click",
      { lngLat: { lng: CENTRE[0], lat: CENTRE[1] }, features: [feature] },
      "local-seo-overlay-fill",
    );
    expect(seen).toEqual([feature]);
  });

  test("map clicks work when the callback arrives after mount", () => {
    const map = renderMap({ center: CENTRE });
    map.fire("load", { lngLat: { lng: 0, lat: 0 } });
    const seen: Array<[number, number]> = [];
    rerender({ center: CENTRE, onMapClick: (lngLat) => seen.push(lngLat) });
    map.fire("click", { lngLat: { lng: 85.3, lat: 27.7 } });
    expect(seen).toEqual([[85.3, 27.7]]);
  });
});

describe("local SEO map status semantics", () => {
  test("ranked cells carry dark numbers with white halos, absent and failed carry words", () => {
    const overlay = gridFeatureCollection(
      [
        {
          point_index: 4,
          call_status: "success_nonempty",
          match_status: "found",
          rank: 1,
          latitude: 27.715443999999994,
          longitude: 85.340306,
        },
        {
          point_index: 0,
          call_status: "success_nonempty",
          match_status: "absent",
          rank: null,
          latitude: 27.747235182411313,
          longitude: 85.30437893097559,
        },
        {
          point_index: 1,
          call_status: "request_failed",
          match_status: "unknown",
          rank: null,
          latitude: 27.74723982030064,
          longitude: 85.340306,
        },
      ],
      CENTRE,
      5000,
    );
    const map = renderMap({ center: CENTRE, overlayData: overlay });
    map.fire("load", { lngLat: { lng: 0, lat: 0 } });
    const data = map.sources.get("local-seo-overlay")?.data as typeof overlay;
    expect(data.features[4].properties.label).toBe("1");
    expect(data.features[4].properties.status).toBe("ranked");
    expect(data.features[0].properties.label).toBe("Not found");
    expect(data.features[0].properties.status).toBe("absent");
    expect(data.features[1].properties.label).toBe("Failed");
    expect(data.features[1].properties.status).toBe("failed");
    expect(data.features[1].properties.hatched).toBe(true);
    const label = map.layers.find((layer) => layer["id"] === "local-seo-overlay-label");
    expect((label?.["paint"] as Record<string, unknown>)["text-color"]).toBe("#0f172a");
    expect((label?.["paint"] as Record<string, unknown>)["text-halo-color"]).toBe("#ffffff");
    const labels = map.sources.get("local-seo-overlay-labels")?.data as { features: Array<{ geometry: { coordinates: number[] } }> };
    for (let index = 0; index < overlay.features.length; index++) {
      expect(labels.features[index].geometry.coordinates).toEqual([
        overlay.features[index].properties.longitude, overlay.features[index].properties.latitude,
      ]);
    }
  });
});

describe("local SEO map fallback", () => {
  test("missing WebGL support shows the fallback before construction", () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof getCanvasContext;
    renderMap({ fallbackHref: "/locations?view=list" });
    expect(FakeMap.instances).toHaveLength(0);
    expect(host?.textContent).toContain("Map could not start");
  });

  test("WebGL failure keeps the manual setup link reachable", () => {
    FakeMap.failConstruction = true;
    renderMap({ fallbackHref: "/app/projects/proj-1/locations?view=list" });
    expect(host?.textContent).toContain("Map could not start.");
    expect(host?.querySelector("a")?.getAttribute("href")).toBe("/app/projects/proj-1/locations?view=list");
    expect(FakeMap.instances).toHaveLength(0);
  });
  test("network failure exposes the same fallback without rebuilding the map", () => {
    const map = renderMap({ fallbackHref: "?view=list" });
    act(() => map.fire("error", { error: { message: "Failed to fetch style" } } as unknown as ClickPayload));
    expect(host?.textContent).toContain("Basemap could not be reached.");
    expect(host?.querySelector("a")?.getAttribute("href")).toBe("?view=list");
    expect(FakeMap.instances).toHaveLength(1);
  });
});
