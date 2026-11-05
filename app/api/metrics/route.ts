import { collectDefaultMetrics, register } from "prom-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Registered once per process (route modules can be re-evaluated in dev).
const globalForMetrics = globalThis as unknown as { __metricsStarted?: boolean };
if (!globalForMetrics.__metricsStarted) {
  collectDefaultMetrics();
  globalForMetrics.__metricsStarted = true;
}

/** Prometheus scrape endpoint. */
export async function GET() {
  return new Response(await register.metrics(), {
    headers: { "Content-Type": register.contentType },
  });
}
