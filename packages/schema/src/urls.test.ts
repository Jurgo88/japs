import { describe, expect, it } from "vitest";
import { LinkUrl, urlProtocol, WebUrl } from "./urls.ts";

const ok = (schema: typeof WebUrl, url: string) => schema.safeParse(url).success;

describe("URL schemes", () => {
  it("reads the scheme the way a browser does", () => {
    expect(urlProtocol(" JaVaScRiPt:alert(1)")).toBe("javascript:");
    expect(urlProtocol("java\tscript:alert(1)")).toBe("javascript:");
    expect(urlProtocol("/about", "https://example.com/")).toBe("https:");
    expect(urlProtocol("not a url")).toBeNull();
  });

  it("allows only http(s) for web URLs", () => {
    expect(ok(WebUrl, "https://acme.example.com/")).toBe(true);
    expect(ok(WebUrl, "http://acme.example.com/")).toBe(true);
    for (const url of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>x</script>", "mailto:jane@example.com", "ftp://x.example"]) {
      expect(ok(WebUrl, url), url).toBe(false);
    }
  });

  it("also allows mailto: for links a visitor clicks", () => {
    expect(ok(LinkUrl, "mailto:jane@example.com")).toBe(true);
    expect(ok(LinkUrl, "https://github.com/janedoe")).toBe(true);
    for (const url of ["javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html,x"]) {
      expect(ok(LinkUrl, url), url).toBe(false);
    }
  });

  it("reports a string that isn't a URL once, not twice", () => {
    const result = WebUrl.safeParse("acme.example.com");
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toEqual(["Invalid url"]);
  });
});
