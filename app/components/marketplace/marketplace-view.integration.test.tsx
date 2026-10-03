import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import {
  fetchMCPCatalog,
  fetchMCPConnections,
  mcpCatalogQueryKey,
  mcpConnectionsQueryKey,
} from "./marketplace-api"
import {
  CatalogCard,
  ConfigureToolsContent,
  ConnectionCard,
  ConnectForm,
  filterMCPToolSections,
  isSelectedConnectionStale,
  MarketplaceView,
  useSingleFlight,
  type CatalogConnectionActions,
  type ConnectFormValues,
} from "./marketplace-view"
import type {
  MCPConnection,
  MCPToolInfo,
  MCPToolPermissionEdit,
  ProjectResponse,
} from "~/lib/api.types"

installTestDom()

const PROJECT: ProjectResponse = {
  id: "p-1",
  organization_id: "o-1",
  name: "P",
  base_url: "https://example.com",
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

function tool(
  name: string,
  permission: "ask" | "allow" | "deny",
  extra: Partial<MCPToolInfo> = {}
): MCPToolInfo {
  return {
    name,
    description: `${name} description`,
    group: "content",
    permission,
    available: true,
    ...extra,
  }
}

function connectionFixture(): MCPConnection {
  return {
    id: "c-1",
    project_id: "p-1",
    name: "WordPress",
    service: "wordpress",
    endpoint_url: "https://example.com/mcp",
    revision: "rev-1",
    last_checked_at: "2024-01-01T00:00:00Z",
    tools: [
      tool("list_posts", "ask"),
      tool("update_post", "allow"),
      tool("delete_post", "deny", { available: false }),
    ],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  }
}

let connectionsFixture: MCPConnection[]

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = async (
    input: string | URL | { url: string },
    init?: { method?: string; body?: string }
  ) => {
    const url = typeof input === "string" ? input : String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown
    try {
      body = init?.body ? JSON.parse(init.body) : undefined
    } catch {
      body = undefined
    }
    fetchCalls.push({ url, method, body })
    if (url.includes("/mcp/catalog")) {
      return Response.json({
        items: [
          {
            id: "wordpress",
            title: "WordPress",
            description: "WordPress content through MCP tools.",
          },
        ],
      })
    }
    if (url.includes("/mcp/connections") && method === "GET") {
      return Response.json({ connections: connectionsFixture })
    }
    return Response.json({}, { status: 404 })
  }
}

function press(el: Element | null | undefined) {
  if (!el) throw new Error("press target missing")
  const target = el as HTMLElement
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  }
  target.dispatchEvent(new PointerEvent("pointerdown", init))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.focus?.()
  target.dispatchEvent(new PointerEvent("pointerup", init))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

function selectedPermission(toolLabel: string) {
  const group = document.querySelector(
    `[aria-label="Permission for ${toolLabel}"]`
  )
  if (!group) throw new Error(`permission group for "${toolLabel}" missing`)
  return group.querySelector('[aria-pressed="true"]')?.textContent ?? null
}

async function clickChoice(toolLabel: string, choice: string) {
  const group = document.querySelector(
    `[aria-label="Permission for ${toolLabel}"]`
  )
  if (!group) throw new Error(`permission group for "${toolLabel}" missing`)
  const item = [...group.querySelectorAll("button")].find(
    (button) => button.textContent === choice
  )
  if (!item) throw new Error(`choice "${choice}" not found`)
  await act(async () => {
    press(item)
    await flushTestDom()
  })
}

async function mountElement(element: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
    await flushTestDom()
    await flushTestDom()
  })
  return { root, container }
}

async function unmountElement(root: Root) {
  await act(async () => {
    root.unmount()
  })
  document.body.innerHTML = ""
}

async function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await queryClient.fetchQuery({
    queryKey: mcpCatalogQueryKey(PROJECT.id),
    queryFn: () => fetchMCPCatalog(PROJECT.id),
  })
  await queryClient.fetchQuery({
    queryKey: mcpConnectionsQueryKey(PROJECT.id),
    queryFn: () => fetchMCPConnections(PROJECT.id),
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const element = (
    <QueryClientProvider client={queryClient}>
      <MarketplaceView activeProject={PROJECT} isOrganizationOwner />
    </QueryClientProvider>
  )
  await act(async () => {
    root.render(element)
    await flushTestDom()
    await flushTestDom()
  })
  return { root, container }
}

beforeEach(() => {
  connectionsFixture = [connectionFixture()]
  fetchCalls.length = 0
  installFetch()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  document.body.innerHTML = ""
})

function groupSectionsForTest() {
  return [
    {
      key: "content",
      title: "Content",
      rows: [
        {
          name: "list_posts",
          label: "List Posts",
          description: "Browse posts",
          available: true,
          permission: "ask" as const,
        },
        {
          name: "update_post",
          label: "Update Post",
          description: "Edit a post",
          available: true,
          permission: "allow" as const,
        },
      ],
    },
  ]
}

describe("ConfigureToolsContent permission lifecycle", () => {
  function configureProps(connection: MCPConnection) {
    const submitted: MCPToolPermissionEdit[][] = []
    return {
      props: {
        connection,
        canManage: true,
        saving: false,
        submitError: "",
        onClose: () => {},
        onSubmit: (edits: MCPToolPermissionEdit[]) => {
          submitted.push(edits)
        },
      },
      submitted,
    }
  }

  for (const service of ["wordpress", "custom"] as const) {
    test(`${service} bulk permissions stay local until saved and skip unavailable tools`, async () => {
      const connection = { ...connectionFixture(), service }
      const { props, submitted } = configureProps(connection)
      const { root } = await mountElement(<ConfigureToolsContent {...props} />)
      try {
        await act(async () => {
          press(buttonByText(document, "Allow all"))
          await flushTestDom()
        })
        expect(selectedPermission("List Posts")).toBe("Always allow")
        expect(selectedPermission("Update Post")).toBe("Always allow")
        expect(submitted).toEqual([])

        await act(async () => {
          press(buttonByText(document, "Save 1 change"))
          await flushTestDom()
        })
        expect(submitted).toEqual([
          [{ tool_name: "list_posts", permission: "allow" }],
        ])

        await act(async () => {
          root.render(
            <ConfigureToolsContent
              {...props}
              connection={{
                ...connection,
                tools: [...connection.tools, tool("create_post", "ask")],
              }}
            />
          )
          await flushTestDom()
        })
        expect(selectedPermission("Create Post")).toBe("Ask")

        await act(async () => {
          press(buttonByText(document, "Deny all"))
          await flushTestDom()
        })
        expect(selectedPermission("List Posts")).toBe("Always deny")
        expect(selectedPermission("Update Post")).toBe("Always deny")
        expect(selectedPermission("Create Post")).toBe("Always deny")
        expect(submitted.length).toBe(1)

        await act(async () => {
          press(buttonByText(document, "Save 3 changes"))
          await flushTestDom()
        })
        expect(submitted[1]).toEqual([
          { tool_name: "list_posts", permission: "deny" },
          { tool_name: "update_post", permission: "deny" },
          { tool_name: "create_post", permission: "deny" },
        ])
      } finally {
        await unmountElement(root)
      }
    })
  }

  test("bulk controls are disabled for non-owners and while saving", async () => {
    const { props } = configureProps(connectionFixture())
    const { root } = await mountElement(
      <ConfigureToolsContent {...props} canManage={false} />
    )
    try {
      expect(buttonByText(document, "Allow all").disabled).toBe(true)
      expect(buttonByText(document, "Deny all").disabled).toBe(true)
      await act(async () => {
        root.render(<ConfigureToolsContent {...props} saving />)
        await flushTestDom()
      })
      expect(buttonByText(document, "Allow all").disabled).toBe(true)
      expect(buttonByText(document, "Deny all").disabled).toBe(true)
    } finally {
      await unmountElement(root)
    }
  })

  test("overrides survive refresh and submit sends only changed available tools", async () => {
    const { props, submitted } = configureProps(connectionFixture())
    const { root } = await mountElement(<ConfigureToolsContent {...props} />)
    try {
      expect(selectedPermission("List Posts")).toBe("Ask")
      expect(selectedPermission("Update Post")).toBe("Always allow")
      expect(
        document.querySelector('[aria-label="Permission for Delete Post"]') ===
          null
      ).toBe(true)
      expect(document.body.textContent ?? "").toContain("Unavailable")

      await clickChoice("List Posts", "Always allow")
      expect(buttonByText(document, "Save 1 change")).toBeTruthy()

      const refreshed: MCPConnection = {
        ...connectionFixture(),
        tools: [
          tool("list_posts", "deny"),
          tool("update_post", "deny"),
          tool("delete_post", "deny", { available: false }),
          tool("create_post", "allow"),
        ],
      }
      await act(async () => {
        root.render(<ConfigureToolsContent {...props} connection={refreshed} />)
        await flushTestDom()
      })
      expect(selectedPermission("List Posts")).toBe("Always allow")
      expect(selectedPermission("Update Post")).toBe("Always deny")
      expect(selectedPermission("Create Post")).toBe("Always allow")
      expect(buttonByText(document, "Save 1 change")).toBeTruthy()

      await act(async () => {
        press(buttonByText(document, "Save 1 change"))
        await flushTestDom()
      })
      expect(submitted.length).toBe(1)
      expect(submitted[0]).toEqual([
        { tool_name: "list_posts", permission: "allow" },
      ])
    } finally {
      await unmountElement(root)
    }
  })

  test("a server refresh toward ask disables save and submits nothing", async () => {
    const { props, submitted } = configureProps(connectionFixture())
    const { root } = await mountElement(<ConfigureToolsContent {...props} />)
    try {
      const refreshed: MCPConnection = {
        ...connectionFixture(),
        tools: [
          tool("list_posts", "ask"),
          tool("update_post", "ask"),
          tool("delete_post", "deny", { available: false }),
        ],
      }
      await act(async () => {
        root.render(<ConfigureToolsContent {...props} connection={refreshed} />)
        await flushTestDom()
      })
      expect(selectedPermission("Update Post")).toBe("Ask")
      const save = buttonByText(document, "Save")
      expect(save.textContent).toBe("Save")
      expect(save.disabled).toBe(true)
      expect(submitted.length).toBe(0)
    } finally {
      await unmountElement(root)
    }
  })

  test("an unavailable tool shows the platform restriction reason", async () => {
    const { props } = configureProps({
      ...connectionFixture(),
      tools: [
        tool("delete_post", "ask", {
          available: false,
          unavailable_reason: "Blocked by the reviewed WordPress adapter.",
        }),
      ],
    })
    const { root } = await mountElement(<ConfigureToolsContent {...props} />)
    try {
      expect(document.body.textContent ?? "").toContain("Unavailable")
      expect(document.body.textContent ?? "").toContain(
        "Blocked by the reviewed WordPress adapter."
      )
    } finally {
      await unmountElement(root)
    }
  })

  test("search matches name, label, and description", () => {
    const sections = groupSectionsForTest()
    expect(filterMCPToolSections(sections, "").length).toBe(1)
    expect(
      filterMCPToolSections(sections, "update")[0]?.rows.map((row) => row.name)
    ).toEqual(["update_post"])
    expect(
      filterMCPToolSections(sections, "BROWSE")[0]?.rows.map((row) => row.name)
    ).toEqual(["list_posts"])
    expect(filterMCPToolSections(sections, "no-such-tool")).toEqual([])
  })
})

describe("ConnectForm validation", () => {
  function formProps() {
    const submitted: ConnectFormValues[] = []
    return {
      props: {
        initialName: "",
        initialEndpointUrl: "",
        namePlaceholder: "WordPress",
        tokenPlaceholder: "Paste the bearer token",
        tokenOptional: false,
        saving: false,
        submitLabel: "Connect",
        submitError: "",
        onSubmit: (values: ConnectFormValues) => {
          submitted.push(values)
        },
        onCancel: () => {},
      },
      submitted,
    }
  }

  const invalid = (id: string) =>
    document.getElementById(id)?.getAttribute("aria-invalid") === "true"

  async function submit() {
    await act(async () => {
      const button = document.querySelector(
        'form button[type="submit"]'
      ) as HTMLButtonElement
      press(button)
      await flushTestDom()
    })
  }

  test("only the failing field is flagged", async () => {
    const empty = formProps()
    const emptyMount = await mountElement(<ConnectForm {...empty.props} />)
    try {
      await submit()
      expect(invalid("mcp-connect-name")).toBe(true)
      expect(invalid("mcp-connect-endpoint")).toBe(false)
      expect(invalid("mcp-connect-token")).toBe(false)
      expect(empty.submitted.length).toBe(0)
    } finally {
      await unmountElement(emptyMount.root)
    }

    const named = formProps()
    const namedMount = await mountElement(
      <ConnectForm {...named.props} initialName="WordPress" />
    )
    try {
      await submit()
      expect(invalid("mcp-connect-name")).toBe(false)
      expect(invalid("mcp-connect-endpoint")).toBe(true)
      expect(invalid("mcp-connect-token")).toBe(false)
      expect(named.submitted.length).toBe(0)
    } finally {
      await unmountElement(namedMount.root)
    }

    const withEndpoint = formProps()
    const endpointMount = await mountElement(
      <ConnectForm
        {...withEndpoint.props}
        initialName="WordPress"
        initialEndpointUrl="https://example.com/mcp"
      />
    )
    try {
      await submit()
      expect(invalid("mcp-connect-name")).toBe(false)
      expect(invalid("mcp-connect-endpoint")).toBe(false)
      expect(invalid("mcp-connect-token")).toBe(true)
      expect(withEndpoint.submitted.length).toBe(0)
    } finally {
      await unmountElement(endpointMount.root)
    }

    const editable = formProps()
    const editMount = await mountElement(
      <ConnectForm
        {...editable.props}
        initialName="WordPress"
        initialEndpointUrl="https://example.com/mcp"
        tokenOptional
      />
    )
    try {
      await submit()
      expect(invalid("mcp-connect-name")).toBe(false)
      expect(invalid("mcp-connect-endpoint")).toBe(false)
      expect(invalid("mcp-connect-token")).toBe(false)
      expect(editable.submitted.length).toBe(1)
      expect(editable.submitted[0]).toEqual({
        name: "WordPress",
        endpointUrl: "https://example.com/mcp",
        bearerToken: "",
      })
    } finally {
      await unmountElement(editMount.root)
    }
  })

  test("server errors render as an alert without flagging fields", async () => {
    const { props } = formProps()
    const { root } = await mountElement(
      <ConnectForm {...props} submitError="Name taken." />
    )
    try {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Name taken."
      )
      expect(invalid("mcp-connect-name")).toBe(false)
      expect(invalid("mcp-connect-endpoint")).toBe(false)
      expect(invalid("mcp-connect-token")).toBe(false)
    } finally {
      await unmountElement(root)
    }
  })
})

test("checking state renders visibly on the connection card", async () => {
  const connection = connectionFixture()
  const none = async () => {}
  const { root: checking } = await mountElement(
    <ConnectionCard
      connection={connection}
      canManage
      checking
      onConfigure={none}
      onEdit={none}
      onCheck={none}
      onDelete={none}
    />
  )
  try {
    expect(document.body.textContent ?? "").toContain("Checking…")
  } finally {
    await unmountElement(checking)
  }
  const { root: idle } = await mountElement(
    <ConnectionCard
      connection={connection}
      canManage
      checking={false}
      onConfigure={none}
      onEdit={none}
      onCheck={none}
      onDelete={none}
    />
  )
  try {
    expect(document.body.textContent ?? "").toContain("Checked")
    expect((document.body.textContent ?? "").includes("Checking…")).toBe(false)
  } finally {
    await unmountElement(idle)
  }
})

describe("MarketplaceView catalogue", () => {
  const noop = async () => {}
  const noActions: CatalogConnectionActions = {
    onConnect: noop,
    onConfigure: noop,
    onEdit: noop,
    onRefresh: noop,
    onDisconnect: noop,
  }
  function catalogRow(title: string) {
    return (
      document.querySelector('[aria-label="Catalog"]')?.textContent ?? ""
    ).includes(title)
  }

  function catalogText() {
    return document.querySelector('[aria-label="Catalog"]')?.textContent ?? ""
  }

  function connectionsText() {
    return (
      document.querySelector('[aria-label="Connections"]')?.textContent ?? ""
    )
  }

  test("Connections render before Catalog", async () => {
    const { root } = await mountView()
    try {
      const connections = document.querySelector('[aria-label="Connections"]')
      const catalog = document.querySelector('[aria-label="Catalog"]')
      expect(connections !== null).toBe(true)
      expect(catalog !== null).toBe(true)
      expect(
        connections!.compareDocumentPosition(catalog!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    } finally {
      await unmountElement(root)
    }
  })

  test("an unconnected row offers only a plus action and no badges", async () => {
    connectionsFixture = []
    const { root } = await mountView()
    try {
      expect(
        document.querySelector('[aria-label="Connect WordPress"]') !== null
      ).toBe(true)
      expect(
        document.querySelector('[aria-label="Manage WordPress"]') === null
      ).toBe(true)
      expect(catalogText().includes("Connected ·")).toBe(false)
      expect(catalogText().includes("Not connected")).toBe(false)
      expect(
        [...document.querySelectorAll('[aria-label="Catalog"] button')].some(
          (button) => button.textContent?.trim() === "Connect"
        )
      ).toBe(false)
    } finally {
      await unmountElement(root)
    }
  })

  test("a connected row offers an overflow action instead of the plus", async () => {
    const { root } = await mountView()
    try {
      expect(
        document.querySelector('[aria-label="Manage WordPress"]') !== null
      ).toBe(true)
      expect(
        document.querySelector('[aria-label="Connect WordPress"]') === null
      ).toBe(true)
    } finally {
      await unmountElement(root)
    }
  })

  test("Custom MCP leads Connections and is absent from Catalog", async () => {
    connectionsFixture = []
    const { root } = await mountView()
    try {
      expect(connectionsText().includes("Custom MCP")).toBe(true)
      expect(catalogText().includes("Custom MCP")).toBe(false)
      expect(
        document.querySelector(
          '[aria-label="Connections"] [aria-label="Connect Custom MCP"]'
        ) !== null
      ).toBe(true)
    } finally {
      await unmountElement(root)
    }
  })

  test("the Custom MCP action card is not counted as a connection", async () => {
    connectionsFixture = []
    const { root } = await mountView()
    try {
      expect(
        document.querySelector('[aria-label="Connections"] h2')?.textContent
      ).toContain("0")
    } finally {
      await unmountElement(root)
    }
  })

  test("known rows group by role and unknown ones collapse into Others", async () => {
    connectionsFixture = []
    const { root } = await mountView()
    try {
      const catalog = document.querySelector('[aria-label="Catalog"]')
      const labels = [...catalog!.querySelectorAll("h3, summary")].map((node) =>
        (node.textContent ?? "").replace(/\d+/g, "").trim()
      )
      expect(labels).toEqual([
        "SEO and visibility",
        "Content and publishing",
        "Analytics and ads",
        "Others",
      ])
      const others = catalog!.querySelector("details")
      expect(others !== null).toBe(true)
      expect((others as HTMLDetailsElement).open).toBe(false)
      for (const title of [
        "WordPress",
        "DeepWiki",
        "Cloudflare Docs",
        "Microsoft Learn",
      ]) {
        expect(catalogRow(title)).toBe(true)
      }
    } finally {
      await unmountElement(root)
    }
  })

  test("preset rows ship logos and fall back to initials or a plug", async () => {
    connectionsFixture = []
    const { root } = await mountView()
    try {
      for (const title of [
        "WordPress",
        "DeepWiki",
        "Cloudflare Docs",
        "Microsoft Learn",
      ]) {
        expect(catalogRow(title)).toBe(true)
      }
      const logos = [...document.querySelectorAll("img")].map((node) =>
        node.getAttribute("src")
      )
      expect(logos).toContain("/brands/wordpress.svg")
      expect(logos).toContain("/brands/cloudflare.svg")
      expect(logos).toContain("/brands/microsoft-learn.png")
      expect(logos).toContain("/brands/se-ranking.ico")
      expect(logos).toContain("/brands/ahrefs.ico")
      expect(document.body.textContent ?? "").toContain("DW")
    } finally {
      await unmountElement(root)
    }
  })

  test("non-owners get no catalogue mutation actions", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    await queryClient.fetchQuery({
      queryKey: mcpCatalogQueryKey(PROJECT.id),
      queryFn: () => fetchMCPCatalog(PROJECT.id),
    })
    await queryClient.fetchQuery({
      queryKey: mcpConnectionsQueryKey(PROJECT.id),
      queryFn: () => fetchMCPConnections(PROJECT.id),
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MarketplaceView
            activeProject={PROJECT}
            isOrganizationOwner={false}
          />
        </QueryClientProvider>
      )
      await flushTestDom()
      await flushTestDom()
    })
    try {
      expect(
        [...document.querySelectorAll("button")].filter((button) =>
          /^(Connect|Manage) /.test(button.getAttribute("aria-label") ?? "")
        )
      ).toHaveLength(0)
      expect(document.body.textContent ?? "").toContain("read-only access")
    } finally {
      await unmountElement(root)
    }
  })

  test("a branded row with matching connections shows only overflow", async () => {
    const { root } = await mountElement(
      <CatalogCard
        item={{
          id: "deepwiki",
          title: "DeepWiki",
          description: "Repository questions.",
          service: "custom",
          endpoint_url: "https://mcp.deepwiki.com/mcp",
        }}
        connections={[connectionFixture()]}
        canManage
        checkingId={null}
        actions={noActions}
      />
    )
    try {
      expect(
        document.querySelector('[aria-label="Manage DeepWiki"]') !== null
      ).toBe(true)
      expect(
        document.querySelector('[aria-label="Connect DeepWiki"]') === null
      ).toBe(true)
    } finally {
      await unmountElement(root)
    }
  })

  test("an unconnected branded row still offers the plus action", async () => {
    const { root } = await mountElement(
      <CatalogCard
        item={{
          id: "deepwiki",
          title: "DeepWiki",
          description: "Repository questions.",
          service: "custom",
          endpoint_url: "https://mcp.deepwiki.com/mcp",
        }}
        connections={[]}
        canManage
        checkingId={null}
        actions={noActions}
      />
    )
    try {
      expect(
        document.querySelector('[aria-label="Connect DeepWiki"]') !== null
      ).toBe(true)
    } finally {
      await unmountElement(root)
    }
  })

  test("an unsupported row blocks the plus action and shows the reason", async () => {
    const { root } = await mountElement(
      <CatalogCard
        item={{
          id: "semrush",
          title: "Semrush",
          description: "SEO research data.",
          service: "custom",
          endpoint_url: "https://mcp.semrush.com/v2/mcp",
          auth_required: true,
          connection_supported: false,
          setup_note: "Requires OAuth sign-in.",
        }}
        connections={[]}
        canManage
        checkingId={null}
        actions={noActions}
      />
    )
    try {
      const plus = document.querySelector(
        '[aria-label="Connect Semrush"]'
      ) as HTMLButtonElement | null
      expect(plus !== null).toBe(true)
      expect(plus!.disabled).toBe(true)
      expect(document.body.textContent ?? "").toContain("Setup required")
      expect(document.body.textContent ?? "").toContain(
        "Requires OAuth sign-in."
      )
    } finally {
      await unmountElement(root)
    }
  })

  test("a supported row keeps its editable connect action", async () => {
    const { root } = await mountElement(
      <CatalogCard
        item={{
          id: "sanity",
          title: "Sanity",
          description: "Structured content.",
          service: "custom",
          endpoint_url: "https://mcp.sanity.io",
          auth_required: true,
          setup_note: "Use a Sanity API token.",
        }}
        connections={[]}
        canManage
        checkingId={null}
        actions={noActions}
      />
    )
    try {
      const plus = document.querySelector(
        '[aria-label="Connect Sanity"]'
      ) as HTMLButtonElement | null
      expect(plus!.disabled).toBe(false)
      expect(document.body.textContent ?? "").toContain("Structured content.")
      expect((document.body.textContent ?? "").includes("Setup required")).toBe(
        false
      )
    } finally {
      await unmountElement(root)
    }
  })
})

describe("useSingleFlight refresh guard", () => {
  function FlightProbe({
    handleRef,
  }: {
    handleRef: {
      current: ReturnType<typeof useSingleFlight> | null
    }
  }) {
    const flight = useSingleFlight()
    handleRef.current = flight
    return null
  }

  test("concurrent runs execute once and release after settling", async () => {
    const handleRef: {
      current: ReturnType<typeof useSingleFlight> | null
    } = { current: null }
    const { root } = await mountElement(<FlightProbe handleRef={handleRef} />)
    try {
      let runs = 0
      let release: (() => void) | null = null
      const task = () =>
        new Promise<void>((resolve) => {
          runs += 1
          release = resolve
        })
      let first: Promise<boolean> | null = null
      let second: Promise<boolean> | null = null
      await act(async () => {
        first = handleRef.current?.run("a", task) ?? null
        second = handleRef.current?.run("a", task) ?? null
        await flushTestDom()
      })
      expect(runs).toBe(1)
      expect(handleRef.current?.activeId).toBe("a")
      await act(async () => {
        release?.()
        await flushTestDom()
      })
      expect(await first).toBe(true)
      expect(await second).toBe(false)
      expect(handleRef.current?.activeId).toBeNull()
      await act(async () => {
        const third = await handleRef.current?.run("a", async () => {
          runs += 1
        })
        expect(third).toBe(true)
      })
      expect(runs).toBe(2)
    } finally {
      await unmountElement(root)
    }
  })
})

describe("selected connection staleness", () => {
  test("loading data never clears, a removed id does", () => {
    expect(isSelectedConnectionStale(null, [connectionFixture()])).toBe(false)
    expect(isSelectedConnectionStale("c-1", undefined)).toBe(false)
    expect(isSelectedConnectionStale("c-1", [])).toBe(true)
    expect(isSelectedConnectionStale("c-1", [connectionFixture()])).toBe(false)
    expect(isSelectedConnectionStale("c-9", [connectionFixture()])).toBe(true)
  })
})
