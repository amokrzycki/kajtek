import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createUpstreamHeaders, resolvePublicPathname } from "../server-utils.mjs";

const index = fs.readFileSync("index.html", "utf8");
const privacy = fs.readFileSync("public/privacy/index.html", "utf8");
const legal = fs.readFileSync("public/legal/index.html", "utf8");

describe("privacy and legal routes", () => {
  it.each([
    ["/privacy", "/privacy/index.html"],
    ["/legal", "/legal/index.html"],
    ["/favicon.svg", "/favicon.svg"],
  ])("maps %s to a static file", (route, expected) => {
    expect(resolvePublicPathname(route)).toBe(expected);
  });

  it("links the public documents from the application footer", () => {
    expect(index).toContain('href="/privacy"');
    expect(index).toContain('href="/legal"');
  });

  it.each([
    [privacy, "Polityka prywatności - KAJTEK"],
    [legal, "Informacje prawne - KAJTEK"],
  ])("ships metadata and shared styles without requiring JavaScript", (html, title) => {
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain('name="description"');
    expect(html).toContain('href="/style.css"');
    expect(html).not.toContain("<script");
  });
});

describe("upstream proxy headers", () => {
  it("forwards only explicitly allowed headers and never client IP headers", () => {
    const headers = createUpstreamHeaders(
      {
        accept: "application/json",
        "cf-connecting-ip": "203.0.113.1",
        "client-ip": "203.0.113.2",
        cookie: "session=secret",
        forwarded: "for=203.0.113.3",
        "true-client-ip": "203.0.113.4",
        "x-forwarded-for": "203.0.113.5",
        "x-real-ip": "203.0.113.6",
      },
      "api.example.test",
    );

    expect(headers).toEqual({
      accept: "application/json",
      host: "api.example.test",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
  });
});
