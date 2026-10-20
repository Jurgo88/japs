import { describe, expect, it } from "vitest";
import { defaultHandle, Handle, handleProblem } from "./handle.ts";

describe("handles", () => {
  it("accepts DNS-safe names of 3 to 39 characters", () => {
    for (const ok of ["jane", "jane-doe", "j4n3", "abc", "a".repeat(39)]) expect(handleProblem(ok), ok).toBeNull();
  });

  it("explains what's wrong with a name", () => {
    expect(handleProblem("jo")).toBe("Use 3 to 39 characters.");
    expect(handleProblem("a".repeat(40))).toBe("Use 3 to 39 characters.");
    for (const bad of ["Jane", "-jane", "jane-", "jane--doe", "xn--jane", "jane.doe", "jane_doe", "jané"]) {
      expect(handleProblem(bad), bad).toBe("Use lowercase letters and digits, joined by single hyphens.");
    }
    for (const reserved of ["www", "api", "login", "admin", "japs"]) expect(handleProblem(reserved), reserved).toBe("This address is reserved.");
  });

  it("suggests the GitHub login, lowercased, when it fits", () => {
    expect(defaultHandle("JaneDoe")).toBe("janedoe");
    expect(defaultHandle("Jurgo88")).toBe("jurgo88");
    expect(defaultHandle("jo")).toBeNull();
    expect(defaultHandle("admin")).toBeNull();
  });

  it("validates as a schema", () => {
    expect(Handle.safeParse("jane").success).toBe(true);
    expect(Handle.safeParse("Jane").success).toBe(false);
  });
});
