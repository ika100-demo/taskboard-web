import { describe, expect, it } from "vitest";

import { GET as metrics } from "@/app/api/metrics/route";

describe("/api/metrics", () => {
  it("serves Prometheus text format", async () => {
    const res = await metrics();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("process_cpu_user_seconds_total");
  });
});
