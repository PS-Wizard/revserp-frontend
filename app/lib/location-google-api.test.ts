import { afterEach, describe, expect, test } from "bun:test"

import {
  deleteLocationGoogleBinding,
  describeGoogleAccount,
  describeLocationGoogleConnection,
  locationGoogleBindingConfigured,
  parseLocationGoogleSetupIntent,
  shouldRestoreLocationGoogleWizard,
  describeLocationAnalyticsSource,
  describeLocationGscSource,
  fetchAccountAnalyticsProperties,
  fetchAccountGscSites,
  fetchLocationAnalyticsBinding,
  fetchLocationGscBinding,
  fetchProjectGoogleAccounts,
  isAllowedGoogleAuthURL,
  locationGoogleBindingPath,
  locationGoogleBindingQueryKey,
  projectGoogleBoundAccountId,
  projectGoogleConnections,
  projectGoogleSelectedAccountId,
  putLocationAnalyticsBinding,
  putLocationGscBinding,
  startProjectGoogleConnect,
  type LocationAnalyticsBindingResponse,
  type LocationGscBindingResponse,
  type ProjectGscStatusWithAccounts,
} from "~/lib/location-google-api"

type FetchCall = { url: string; method: string; body: unknown }
const calls: FetchCall[] = []
const realFetch = globalThis.fetch

function mockFetch(handler: (call: FetchCall) => { status: number; payload: unknown }) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    const call = { url, method: init?.method ?? "GET", body }
    calls.push(call)
    const { status, payload } = handler(call)
    return new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
    })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
})

const GSC_BINDING: LocationGscBindingResponse = {
  mode: "inherit",
  effective: {
    source: "project",
    google_connection_id: "conn-1",
    google_account_email: "owner@example.com",
    site_url: "https://example.com/",
  },
  project: { google_connection_id: "conn-1", site_url: "https://example.com/" },
  google_connections: [
    {
      id: "conn-1",
      google_account_email: "owner@example.com",
      google_status: "active",
    },
  ],
}

describe("location google binding endpoints", () => {
  test("binding paths and query keys separate services", () => {
    expect(locationGoogleBindingPath("p1", "l1", "gsc")).toBe(
      "/projects/p1/locations/l1/gsc/binding"
    )
    expect(locationGoogleBindingPath("p1", "l1", "analytics")).toBe(
      "/projects/p1/locations/l1/analytics/binding"
    )
    expect(locationGoogleBindingQueryKey("p1", "l1", "gsc")).toEqual([
      "location-google-binding",
      "p1",
      "l1",
      "gsc",
    ])
  })

  test("fetch reads the gsc binding with GET", async () => {
    mockFetch(() => ({ status: 200, payload: GSC_BINDING }))
    const binding = await fetchLocationGscBinding("p1", "l1")
    expect(binding.mode).toBe("inherit")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain("/projects/p1/locations/l1/gsc/binding")
    expect(calls[0]?.method).toBe("GET")
  })

  test("put writes the analytics custom binding", async () => {
    mockFetch(() => ({ status: 200, payload: { ok: true, mode: "custom" } }))
    await putLocationAnalyticsBinding("p1", "l1", {
      mode: "custom",
      google_connection_id: "conn-2",
      property_id: "123",
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain(
      "/projects/p1/locations/l1/analytics/binding"
    )
    expect(calls[0]?.method).toBe("PUT")
    expect(calls[0]?.body).toEqual({
      mode: "custom",
      google_connection_id: "conn-2",
      property_id: "123",
    })
  })

  test("put writes the gsc off binding", async () => {
    mockFetch(() => ({ status: 200, payload: { ok: true, mode: "off" } }))
    await putLocationGscBinding("p1", "l1", { mode: "off" })
    expect(calls[0]?.method).toBe("PUT")
    expect(calls[0]?.body).toEqual({ mode: "off" })
  })

  test("missing binding fields normalize to inherit with no accounts", async () => {
    mockFetch(() => ({ status: 200, payload: {} }))
    const gsc = await fetchLocationGscBinding("p1", "l1")
    expect(gsc.mode).toBe("inherit")
    expect(gsc.effective).toBeNull()
    expect(gsc.google_connections).toEqual([])
    mockFetch(() => ({ status: 200, payload: { mode: "bogus" } }))
    const analytics = await fetchLocationAnalyticsBinding("p1", "l1")
    expect(analytics.mode).toBe("inherit")
  })
})

describe("location google source labels", () => {
  test("inherit with a parent effective binding is parent-live", () => {
    expect(describeLocationGscSource(GSC_BINDING)).toEqual({
      kind: "parent-live",
      label: "Parent property · live",
    })
  })

  test("inherit without an effective binding never claims parent data", () => {
    expect(
      describeLocationGscSource({ ...GSC_BINDING, effective: null })
    ).toEqual({ kind: "parent-unconfigured", label: "Parent has no property yet" })
    expect(
      describeLocationGscSource({
        ...GSC_BINDING,
        effective: null,
      }).label.includes("live")
    ).toBe(false)
  })

  test("off and custom states label honestly", () => {
    expect(
      describeLocationGscSource({ ...GSC_BINDING, mode: "off" }).kind
    ).toBe("off")
    expect(
      describeLocationGscSource({
        ...GSC_BINDING,
        mode: "custom",
        effective: {
          source: "location",
          google_connection_id: "conn-1",
          google_account_email: "owner@example.com",
          site_url: "https://example.com/shop",
        },
      }).kind
    ).toBe("own")
    expect(
      describeLocationGscSource({
        ...GSC_BINDING,
        mode: "custom",
        effective: null,
      }).kind
    ).toBe("custom-pending")
  })

  test("analytics mirrors the gsc source semantics", () => {
    const binding: LocationAnalyticsBindingResponse = {
      mode: "inherit",
      effective: {
        source: "project",
        google_connection_id: "conn-1",
        google_account_email: "owner@example.com",
        property_id: "123",
        property_display_name: "Shop",
        account_display_name: "Acct",
      },
      project: null,
      google_connections: [],
    }
    expect(describeLocationAnalyticsSource(binding).kind).toBe("parent-live")
    expect(
      describeLocationAnalyticsSource({ ...binding, effective: null }).kind
    ).toBe("parent-unconfigured")
    expect(
      describeLocationAnalyticsSource({ ...binding, mode: "off" }).kind
    ).toBe("off")
  })
})

describe("project account helpers", () => {
  const status: ProjectGscStatusWithAccounts = {
    has_google_connection: true,
    needs_reconnect: false,
    can_manage_connection: true,
    connected: true,
    available_sites: [{ site_url: "https://example.com/" }],
    google_connection_id: "conn-1",
    selected_google_connection_id: "conn-1",
    google_connections: [
      {
        id: "conn-1",
        google_account_email: "owner@example.com",
        google_status: "active",
      },
      {
        id: "conn-2",
        google_account_email: "other@example.com",
        google_status: "active",
      },
    ],
  }

  test("connections pass through and never synthesize rows", () => {
    expect(projectGoogleConnections(status)).toHaveLength(2)
    expect(projectGoogleConnections({})).toEqual([])
    expect(
      projectGoogleConnections({
        google_connections: [{ id: "x" }] as never,
      })
    ).toHaveLength(1)
  })

  test("bound account prefers the explicit selection", () => {
    expect(projectGoogleBoundAccountId(status)).toBe("conn-1")
    expect(
      projectGoogleBoundAccountId({ google_connection_id: "legacy" })
    ).toBe("legacy")
    expect(projectGoogleBoundAccountId({})).toBe("")
  })

  test("selected account falls back to the first listed", () => {
    expect(projectGoogleSelectedAccountId(status)).toBe("conn-1")
    expect(
      projectGoogleSelectedAccountId({
        google_connections: status.google_connections?.slice(1),
      })
    ).toBe("conn-2")
    expect(projectGoogleSelectedAccountId({})).toBe("")
  })

  test("account identity never invents an email for legacy rows", () => {
    expect(
      describeGoogleAccount({
        id: "conn-1",
        google_account_email: "owner@example.com",
      })
    ).toEqual({
      email: "owner@example.com",
      label: "owner@example.com",
      verified: true,
    })
    expect(describeGoogleAccount({ id: "legacy-id" })).toEqual({
      email: "",
      label: "Google account",
      verified: false,
    })
    expect(
      describeGoogleAccount({ id: "legacy-id", google_account_email: "" })
        .verified
    ).toBe(false)
  })

  test("per-account gsc sites load from the chosen account", async () => {
    mockFetch(() => ({
      status: 200,
      payload: {
        google_connection_id: "conn-2",
        google_account_email: "other@example.com",
        google_status: "active",
        available_sites: [{ site_url: "https://other.com/" }],
      },
    }))
    const sites = await fetchAccountGscSites("p1", "conn-2")
    expect(calls[0]?.url).toContain(
      "/projects/p1/google-accounts/conn-2/gsc-sites"
    )
    expect(sites.available_sites).toHaveLength(1)
    expect(sites.google_account_email).toBe("other@example.com")
  })

  test("per-account analytics properties carry scope and reconnect flags", async () => {
    mockFetch(() => ({
      status: 200,
      payload: {
        google_connection_id: "conn-2",
        google_account_email: "",
        google_status: "reauth_required",
        has_analytics_scope: false,
        needs_reconnect: true,
        available_properties: [{ property_id: "9", display_name: "Nine" }],
      },
    }))
    const properties = await fetchAccountAnalyticsProperties("p1", "conn-2")
    expect(calls[0]?.url).toContain(
      "/projects/p1/google-accounts/conn-2/analytics-properties"
    )
    expect(properties.available_properties).toHaveLength(1)
    expect(properties.has_analytics_scope).toBe(false)
    expect(properties.needs_reconnect).toBe(true)
  })

  test("per-account lists tolerate malformed rows", async () => {
    mockFetch(() => ({ status: 200, payload: {} }))
    const sites = await fetchAccountGscSites("p1", "conn-2")
    expect(sites.available_sites).toEqual([])
    expect(sites.google_account_email).toBe("")
  })
})

describe("location binding configured state", () => {
  test("configured passes through and defaults true for old fixtures", async () => {
    mockFetch(() => ({ status: 200, payload: { ...GSC_BINDING, configured: false } }))
    const unconfigured = await fetchLocationGscBinding("p1", "l1")
    expect(unconfigured.configured).toBe(false)
    expect(locationGoogleBindingConfigured(unconfigured)).toBe(false)
    mockFetch(() => ({ status: 200, payload: GSC_BINDING }))
    const legacy = await fetchLocationGscBinding("p1", "l1")
    expect(legacy.configured).toBeUndefined()
    expect(locationGoogleBindingConfigured(legacy)).toBe(true)
  })

  test("delete removes only this location binding", async () => {
    mockFetch(() => ({ status: 200, payload: { ok: true } }))
    await deleteLocationGoogleBinding("p1", "l1", "gsc")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain("/projects/p1/locations/l1/gsc/binding")
    expect(calls[0]?.method).toBe("DELETE")
    await deleteLocationGoogleBinding("p1", "l1", "analytics")
    expect(calls[1]?.url).toContain("/projects/p1/locations/l1/analytics/binding")
    expect(calls[1]?.method).toBe("DELETE")
  })
})

describe("location connection identity", () => {
  test("shows the saved email, never a blank row", () => {
    expect(describeLocationGoogleConnection(GSC_BINDING, "gsc")).toEqual({
      connectionId: "conn-1",
      propertyLabel: "https://example.com/",
      accountLabel: "owner@example.com",
      needsReconnect: false,
    })
  })

  test("missing identity falls back to the neutral Google account", () => {
    const binding: LocationGscBindingResponse = {
      ...GSC_BINDING,
      effective: {
        source: "location",
        google_connection_id: "conn-1",
        google_account_email: "",
        site_url: "https://example.com/shop",
      },
      google_connections: [
        { id: "conn-1", google_account_email: "", google_status: "active" },
      ],
    }
    expect(
      describeLocationGoogleConnection(binding, "gsc")?.accountLabel
    ).toBe("Google account")
  })

  test("reauth-required accounts need a reconnect, unknown rows do not", () => {
    const reauth: LocationGscBindingResponse = {
      ...GSC_BINDING,
      google_connections: [
        {
          id: "conn-1",
          google_account_email: "owner@example.com",
          google_status: "reauth_required",
        },
      ],
    }
    expect(
      describeLocationGoogleConnection(reauth, "gsc")?.needsReconnect
    ).toBe(true)
    const missing: LocationGscBindingResponse = {
      ...GSC_BINDING,
      google_connections: [],
    }
    expect(
      describeLocationGoogleConnection(missing, "gsc")?.needsReconnect
    ).toBe(false)
    expect(describeLocationGoogleConnection({ ...GSC_BINDING, effective: null }, "gsc")).toBeNull()
  })
})

describe("oauth setup intent", () => {
  test("round-trips the wizard step through the return path", () => {
    const params = new URLSearchParams(
      "gsc_status=connected&google_setup=custom&google_service=gsc&google_location=l1"
    )
    expect(parseLocationGoogleSetupIntent(params)).toEqual({
      mode: "custom",
      service: "gsc",
      locationId: "l1",
    })
    expect(
      parseLocationGoogleSetupIntent(new URLSearchParams("google_setup=bogus"))
    ).toBeNull()
    expect(
      parseLocationGoogleSetupIntent(
        new URLSearchParams("google_setup=custom&google_service=gsc")
      )
    ).toBeNull()
    expect(parseLocationGoogleSetupIntent(new URLSearchParams(""))).toBeNull()
  })

  test("matching intent restores even when configured; header reconnects do not", () => {
    const intent = { mode: "custom", service: "gsc", locationId: "l1" } as const
    expect(
      shouldRestoreLocationGoogleWizard({
        intent,
        service: "gsc",
        locationId: "l1",
        oauthStatus: "connected",
        configured: true,
        canManage: true,
      })
    ).toBe(true)
    expect(
      shouldRestoreLocationGoogleWizard({
        intent,
        service: "gsc",
        locationId: "l1",
        oauthStatus: "error",
        configured: true,
        canManage: true,
      })
    ).toBe(true)
    expect(
      shouldRestoreLocationGoogleWizard({
        intent: null,
        service: "gsc",
        locationId: "l1",
        oauthStatus: "connected",
        configured: true,
        canManage: true,
      })
    ).toBe(false)
    expect(
      shouldRestoreLocationGoogleWizard({
        intent: null,
        service: "gsc",
        locationId: "l1",
        oauthStatus: "connected",
        configured: false,
        canManage: true,
      })
    ).toBe(true)
    expect(
      shouldRestoreLocationGoogleWizard({
        intent: { ...intent, service: "analytics" },
        service: "gsc",
        locationId: "l1",
        oauthStatus: "connected",
        configured: false,
        canManage: true,
      })
    ).toBe(false)
    expect(
      shouldRestoreLocationGoogleWizard({
        intent,
        service: "gsc",
        locationId: "l1",
        oauthStatus: "connected",
        configured: false,
        canManage: false,
      })
    ).toBe(false)
  })
})

describe("connect and accounts endpoints", () => {
  test("legacy connect omits mode keys", async () => {
    mockFetch(() => ({
      status: 200,
      payload: { auth_url: "https://accounts.google.com/o/oauth2/auth?x=1" },
    }))
    const response = await startProjectGoogleConnect("p1", "gsc", {
      returnPath: "/app?project=p1",
    })
    expect(response.auth_url).toContain("accounts.google.com")
    expect(calls[0]?.url).toContain("/projects/p1/gsc/connect/start")
    expect(calls[0]?.body).toEqual({ return_path: "/app?project=p1" })
  })

  test("add and reconnect send mode and targeted account", async () => {
    mockFetch(() => ({ status: 200, payload: { auth_url: "https://x" } }))
    await startProjectGoogleConnect("p1", "analytics", {
      returnPath: "/app",
      mode: "add_account",
    })
    expect(calls[0]?.url).toContain("/projects/p1/analytics/connect/start")
    expect(calls[0]?.body).toEqual({
      return_path: "/app",
      mode: "add_account",
    })
    await startProjectGoogleConnect("p1", "gsc", {
      returnPath: "/app",
      mode: "reconnect_account",
      googleConnectionId: "conn-1",
    })
    expect(calls[1]?.body).toEqual({
      return_path: "/app",
      mode: "reconnect_account",
      google_connection_id: "conn-1",
    })
  })

  test("accounts list normalizes missing rows", async () => {
    mockFetch(() => ({
      status: 200,
      payload: {
        google_connections: [
          {
            id: "conn-1",
            google_account_email: "a@x.com",
            google_status: "active",
          },
        ],
        can_manage_connection: true,
      },
    }))
    const accounts = await fetchProjectGoogleAccounts("p1")
    expect(calls[0]?.url).toContain("/projects/p1/google-accounts")
    expect(accounts.google_connections).toHaveLength(1)
    expect(accounts.can_manage_connection).toBe(true)
  })

  test("auth allowlist matches the project views", () => {
    expect(
      isAllowedGoogleAuthURL("https://accounts.google.com/o/oauth2/auth?x=1")
    ).toBe(true)
    expect(isAllowedGoogleAuthURL("https://evil.example.com/auth")).toBe(false)
    expect(isAllowedGoogleAuthURL("http://accounts.google.com/auth")).toBe(
      false
    )
    expect(isAllowedGoogleAuthURL("not a url")).toBe(false)
  })
})
