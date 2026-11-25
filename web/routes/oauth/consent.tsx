/**
 * OAuth consent — the bucket0.com login + consent surface for the remote MCP
 * Worker (mcp.bucket0.com). The Worker redirects the user here during the OAuth
 * flow; once they sign in (Clerk) and approve, we mint a revocable b0ak_ key,
 * seal it into a short-lived encrypted code, and bounce back to the Worker's
 * /callback. The key only leaves this server as AES-GCM ciphertext.
 */

import { Form, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { auth } from "@/server/compat/clerk";
import Link from "@/web/compat/link";
import { Bot, ShieldCheck, FolderLock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentKeyService } from "@/lib/agent/agent-key-service";
import { encryptCode, bridgeSign } from "@/lib/oauth/bridge";
import { constructMetadata } from "@/lib/shared/seo";
import { nextMeta } from "@/web/compat/meta";

const CODE_TTL_MS = 120_000; // 2 minutes

function workerOrigin(): string {
  return process.env.MCP_WORKER_ORIGIN || "https://mcp.bucket0.com";
}

function isTrustedCallback(callback: string): boolean {
  try {
    return new URL(callback).origin === workerOrigin();
  } catch {
    return false;
  }
}

function consentUrl(state: string, client: string, callback: string, error?: string): string {
  const params = new URLSearchParams({ state, client, callback });
  if (error) params.set("error", error);
  return `/oauth/consent?${params.toString()}`;
}

export const meta = () =>
  nextMeta(constructMetadata({ title: "Connect to AgentBucket", noIndex: true }));

export async function loader({ request }: LoaderFunctionArgs) {
  const sp = new URL(request.url).searchParams;
  const state = sp.get("state") ?? "";
  const client = (sp.get("client") ?? "An MCP client").slice(0, 80);
  const callback = sp.get("callback") ?? "";
  const error = sp.get("error") ?? undefined;

  // Guard against malformed requests and open redirects before doing anything.
  if (!state || !isTrustedCallback(callback)) {
    return { invalid: true as const };
  }

  const { userId } = await auth();
  if (!userId) {
    throw redirect(`/sign-in?redirect_url=${encodeURIComponent(consentUrl(state, client, callback))}`);
  }

  return { invalid: false as const, state, client, callback, error };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const state = String(form.get("state") ?? "");
  const client = String(form.get("client") ?? "An MCP client").slice(0, 80);
  const callback = String(form.get("callback") ?? "");

  if (!state || !isTrustedCallback(callback)) {
    throw redirect("/oauth/consent");
  }

  const { userId } = await auth();
  if (!userId) throw redirect("/sign-in");

  const secret = process.env.OAUTH_BRIDGE_SECRET;
  if (!secret) throw new Error("OAUTH_BRIDGE_SECRET is not configured");

  const result = await agentKeyService.createKey(userId, `MCP — ${client}`.slice(0, 100));
  if (!result.success || !result.key) {
    const message = result.error?.message ?? "Could not create a key for this connection.";
    throw redirect(consentUrl(state, client, callback, message));
  }

  const code = encryptCode(
    secret,
    JSON.stringify({ userId, apiKey: result.key.apiKey, exp: Date.now() + CODE_TTL_MS })
  );
  const target = new URL(callback);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  target.searchParams.set("sig", bridgeSign(secret, `${code}.${state}`));
  throw redirect(target.toString());
}

export default function OAuthConsentPage({
  loaderData: page,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  if (page.invalid) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-foreground">Invalid connection request</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link is missing required information or points somewhere we don&apos;t trust. Start
          the connection again from your AI assistant.
        </p>
      </Shell>
    );
  }

  const { state, client, callback, error } = page;

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Connect to AgentBucket
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            Allow <span className="text-primary">{client}</span>?
          </h1>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        This will give {client} access to your AgentBucket through a new, revocable key. You can
        remove it any time from your dashboard.
      </p>

      <ul className="mt-5 space-y-3">
        <Capability icon={FolderLock} title="Store & read files">
          Save, list, read, and delete files in your AgentBucket.
        </Capability>
        <Capability icon={Search} title="Semantic memory">
          Index and search your stored files by meaning.
        </Capability>
        <Capability icon={ShieldCheck} title="Scoped & revocable">
          A dedicated key for this connection — encrypted in transit, never used to train AI.
        </Capability>
      </ul>

      {error && (
        <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Form method="post" className="mt-7 flex gap-3">
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="client" value={client} />
        <input type="hidden" name="callback" value={callback} />
        <Button type="submit" size="lg" className="flex-1">
          Authorize
        </Button>
        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link href="/dashboard">Cancel</Link>
        </Button>
      </Form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl">
        {children}
      </div>
    </main>
  );
}

function Capability({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
