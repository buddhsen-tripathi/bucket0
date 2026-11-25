
import { useEffect } from "react";

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

type ModelContextLike = {
  registerTool?: (tool: WebMcpTool) => Promise<void> | void;
  provideContext?: (ctx: { tools: WebMcpTool[] }) => Promise<void> | void;
};

function getModelContext(): ModelContextLike | null {
  if (typeof window === "undefined") return null;
  const nav = navigator as Navigator & { modelContext?: ModelContextLike };
  const doc = document as Document & { modelContext?: ModelContextLike };
  return nav.modelContext ?? doc.modelContext ?? null;
}

const TOOLS: WebMcpTool[] = [
  {
    name: "get_agentbucket_info",
    description:
      "Return how to use Bucket0 AgentBucket (REST base URL, auth, MCP endpoint, docs links).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({
      restBaseUrl: "https://bucket0.com/api/agent-bucket",
      auth: "Authorization: Bearer b0ak_... (create keys in the dashboard)",
      mcpUrl: "https://mcp.bucket0.com/mcp",
      docs: "https://bucket0.com/docs",
      authMd: "https://bucket0.com/auth.md",
      openapi: "https://bucket0.com/openapi/agent-bucket.json",
      serverCard: "https://bucket0.com/.well-known/mcp/server-card.json",
    }),
  },
  {
    name: "list_public_pages",
    description:
      "List key public Bucket0 pages useful for navigation (docs, pricing, tools, auth).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({
      pages: [
        { name: "Home", url: "https://bucket0.com/" },
        { name: "Docs", url: "https://bucket0.com/docs" },
        { name: "Pricing", url: "https://bucket0.com/pricing" },
        { name: "PDF & Image Tools", url: "https://bucket0.com/tools" },
        { name: "Auth for agents", url: "https://bucket0.com/auth.md" },
        { name: "llms.txt", url: "https://bucket0.com/llms.txt" },
        { name: "Sign in", url: "https://bucket0.com/sign-in" },
        { name: "Contact", url: "https://bucket0.com/contact" },
      ],
    }),
  },
  {
    name: "navigate_to",
    description:
      "Navigate the browser to a known Bucket0 path (docs, pricing, tools, sign-in, contact, auth.md, or a /tools/{slug} page).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Site path starting with /, e.g. /docs, /pricing, /tools/merge, /auth.md",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ path }) => {
      const raw = typeof path === "string" ? path.trim() : "";
      if (!raw.startsWith("/")) {
        return { ok: false, error: "path must start with /" };
      }
      const allowed =
        raw === "/" ||
        raw === "/docs" ||
        raw === "/pricing" ||
        raw === "/tools" ||
        raw === "/contact" ||
        raw === "/sign-in" ||
        raw === "/sign-up" ||
        raw === "/auth.md" ||
        raw === "/llms.txt" ||
        raw === "/changelog" ||
        raw.startsWith("/tools/");
      if (!allowed) {
        return { ok: false, error: "path not in allowlist" };
      }
      window.location.assign(raw);
      return { ok: true, navigatedTo: raw };
    },
  },
  {
    name: "get_pricing_summary",
    description: "Return a short summary of Bucket0 pricing tiers.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => ({
      url: "https://bucket0.com/pricing",
      plans: [
        { name: "Free", price: "$0", storage: "5 GB" },
        { name: "Starter", price: "$5–7/mo", storage: "150 GB" },
        { name: "Pro", price: "$15–19/mo", storage: "700 GB" },
        { name: "Scale", price: "$35–45/mo", storage: "2 TB" },
      ],
    }),
  },
];

/**
 * Registers WebMCP tools so browser agents can discover key site actions.
 * No-ops when the WebMCP API is unavailable.
 */
export default function WebMcpProvider() {
  useEffect(() => {
    const ctx = getModelContext();
    if (!ctx) return;

    let cancelled = false;
    const controller = new AbortController();

    async function register() {
      if (!ctx || cancelled) return;
      try {
        if (typeof ctx.provideContext === "function") {
          await ctx.provideContext({ tools: TOOLS });
          return;
        }
        if (typeof ctx.registerTool === "function") {
          for (const tool of TOOLS) {
            if (cancelled || controller.signal.aborted) return;
            await ctx.registerTool(tool);
          }
        }
      } catch {
        // WebMCP is experimental; ignore registration failures.
      }
    }

    void register();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return null;
}
