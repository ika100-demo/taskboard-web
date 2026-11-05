import { describe, expect, it } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";

describe("probe endpoints", () => {
  it("/api/health reports ok", async () => {
    const res = health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("/api/ready reports ready", async () => {
    const res = ready();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });
});
