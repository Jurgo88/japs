import { z } from "zod";

/**
 * Portfolio addresses on the hosted domain, <handle>.japs.app (ADR 0013). A handle is one DNS
 * label: lowercase letters and digits, joined by single hyphens, 3 to 39 characters, so every
 * GitHub login of three or more characters fits. A double hyphen never occurs: drafts live at
 * <key>--<handle>, and it also rules out punycode labels ("xn--").
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 39;
const PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Names of the service itself and the usual phishing bait; nobody gets these. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // The app and its infrastructure
  "www", "api", "app", "apps", "admin", "administrator", "auth", "builder", "cdn", "static", "assets",
  "img", "images", "media", "files", "dashboard", "editor", "status", "docs", "help", "support",
  "blog", "about", "pricing", "privacy", "terms", "legal", "security", "abuse", "contact", "japs",
  "team", "staff", "official", "system", "root", "dev", "staging", "test", "demo", "preview",
  "draft", "beta", "mail", "email", "smtp", "imap", "pop", "ftp", "ns1", "ns2", "dns",
  "postmaster", "hostmaster", "webmaster", "noreply", "no-reply",
  // Sign-in and money pages
  "login", "logout", "signin", "signup", "register", "account", "accounts", "billing", "payment",
  "payments", "pay", "wallet", "verify", "verification", "secure", "oauth", "sso", "password",
  "reset", "settings",
]);

/** Why `handle` can't be an address, or null when its form is fine. Whether it's free is the server's call. */
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return `Use ${HANDLE_MIN} to ${HANDLE_MAX} characters.`;
  if (!PATTERN.test(handle)) return "Use lowercase letters and digits, joined by single hyphens.";
  if (RESERVED_HANDLES.has(handle)) return "This address is reserved.";
  return null;
}

export const Handle = z.string().superRefine((handle, ctx) => {
  const problem = handleProblem(handle);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

/** The address a GitHub login suggests, or null when the login doesn't fit the rules. */
export function defaultHandle(login: string): string | null {
  const handle = login.toLowerCase();
  return handleProblem(handle) === null ? handle : null;
}
