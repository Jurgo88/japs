import { describe, expect, it } from "vitest";
import { maskAttribute } from "./recording.ts";

describe("maskAttribute", () => {
  it("hides every attribute that can name a project", () => {
    for (const name of ["aria-label", "title", "alt", "href", "src", "id", "for", "name", "placeholder", "value", "data-handle", "unknown-new-attribute"]) {
      expect(maskAttribute(name, "Client Secret Shop")).toBe("*");
    }
  });

  it("keeps what draws the layout", () => {
    expect(maskAttribute("class", "card active")).toBe("card active");
    expect(maskAttribute("style", "height: 40%")).toBe("height: 40%");
    expect(maskAttribute("data-v-b53dff6c", "")).toBe("");
  });

  it("keeps stylesheets, but not other links", () => {
    expect(maskAttribute("href", "/assets/index.css", { tagName: "LINK" } as Element)).toBe("/assets/index.css");
    expect(maskAttribute("href", "https://client.example.dev", { tagName: "A" } as Element)).toBe("*");
  });

  it("hides images set through style", () => {
    expect(maskAttribute("style", "background: url(https://client.example.dev/shot.png)")).toBe("*");
  });
});
