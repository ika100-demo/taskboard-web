import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Readiness: add dependency checks (upstream APIs, etc.) here as the app grows. */
export function GET() {
  return NextResponse.json({ status: "ready" });
}
