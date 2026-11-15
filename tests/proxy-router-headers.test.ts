import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy router headers", () => {
  it("never sets the reserved next-url header (it breaks _rsc cache-busting validation and loops prefetches)", async () => {
    const response = await proxy(new NextRequest("http://localhost/income?fy=26-27"));
    expect(response.headers.get("next-url")).toBeNull();
  });

  it("still forwards the pathname to server components as request headers", async () => {
    const response = await proxy(new NextRequest("http://localhost/income?fy=26-27"));
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-pathname-with-search");
  });
});
