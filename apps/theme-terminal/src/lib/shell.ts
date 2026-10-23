/** Shell identity shown in prompts: a lowercase ASCII user name from the first name. */
export const user = (name: string): string =>
  (name.trim().split(/\s+/)[0] ?? "user")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "") || "user";

export const host = "portfolio";

/** A bar for the stack listing, e.g. "██████░░░░" scaled to `max`. */
export function bar(count: number, max: number, width = 20): string {
  const full = Math.max(1, Math.round((count / Math.max(1, max)) * width));
  return "█".repeat(full) + "░".repeat(Math.max(0, width - full));
}

/** Data the interactive shell reads from the page. */
export interface ShellData {
  user: string;
  host: string;
  cwd: string;
  home: string;
  locale: string;
  alternates: { locale: string; href: string }[];
  profile: {
    name: string;
    headline: string;
    bio: string;
    email: string | null;
    location: string | null;
    available: boolean | null;
    links: { label: string; url: string }[];
  };
  projects: { n: number; slug: string; title: string; url: string; year: string; tags: string[] }[];
  stack: { tag: string; count: number }[];
  s: Record<string, string>;
}

/** JSON for a <script type="application/json"> block, safe against "</script>". */
export const safeJson = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
