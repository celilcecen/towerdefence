import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../deploy/security-headers";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("deployment policy", () => {
  it("nginx sends exactly the headers the e2e suite is tested against", () => {
    const nginx = new Map(
      [
        ...read("deploy/nginx/security-headers.conf").matchAll(
          /^add_header ([\w-]+) "([^"]*)" always;$/gm,
        ),
      ].map((m) => [m[1], m[2]] as const),
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(nginx.get(name), name).toBe(value);
    }
    expect(nginx.get("Strict-Transport-Security")).toMatch(/^max-age=\d{7,}/);
  });

  it("every nginx location that sets headers also includes the security snippet", () => {
    const site = read("deploy/nginx/gridlock.conf");
    const locations = [...site.matchAll(/location [^{]+\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    for (const body of locations.filter((b) => b.includes("add_header"))) {
      expect(body).toContain("include /etc/nginx/snippets/gridlock-security-headers.conf;");
    }
  });

  it("index.html has no inline script or style that the CSP would block", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle="/i);
    expect(html).not.toMatch(/\son[a-z]+="/i);
  });
});
