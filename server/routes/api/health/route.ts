import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { checkReadiness, isReadinessAuthorized } from "@/server/readiness";

import { inspectInfrastructureProbe, startInfrastructureProbe } from "@/server/infrastructure-probe";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("check") === "infra") {
    if (!isReadinessAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await inspectInfrastructureProbe(request.nextUrl.searchParams.get("id") ?? ""), { headers: { "Cache-Control": "no-store" } });
  }
  if (request.nextUrl.searchParams.get("check") === "bindings") {
    if (!isReadinessAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const result = await checkReadiness();
    return NextResponse.json(result, { status: result.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "bucket0-web",
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  if (!isReadinessAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await startInfrastructureProbe(), { status: 202, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  if (!isReadinessAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await inspectInfrastructureProbe(request.nextUrl.searchParams.get("id") ?? "", true), { headers: { "Cache-Control": "no-store" } });
}
