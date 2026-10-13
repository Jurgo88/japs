/** UI strings of this theme. Project content comes localized in portfolio.json. */
const STRINGS = {
  en: {
    projects: "Projects",
    featured: "Featured",
    live: "Live site",
    source: "Source code",
    role: "Role",
    period: "Period",
    present: "present",
    stack: "Built with",
    clientWork: "Client project",
    back: "All projects",
    language: "Language",
  },
  sk: {
    projects: "Projekty",
    featured: "Vybrané",
    live: "Živý web",
    source: "Zdrojový kód",
    role: "Rola",
    period: "Obdobie",
    present: "súčasnosť",
    stack: "Technológie",
    clientWork: "Klientsky projekt",
    back: "Všetky projekty",
    language: "Jazyk",
  },
  cs: {
    projects: "Projekty",
    featured: "Vybrané",
    live: "Živý web",
    source: "Zdrojový kód",
    role: "Role",
    period: "Období",
    present: "současnost",
    stack: "Technologie",
    clientWork: "Klientský projekt",
    back: "Všechny projekty",
    language: "Jazyk",
  },
  de: {
    projects: "Projekte",
    featured: "Ausgewählt",
    live: "Live-Website",
    source: "Quellcode",
    role: "Rolle",
    period: "Zeitraum",
    present: "heute",
    stack: "Technologien",
    clientWork: "Kundenprojekt",
    back: "Alle Projekte",
    language: "Sprache",
  },
} as const;

export type UiKey = keyof (typeof STRINGS)["en"];
export const SUPPORTED_LOCALES: string[] = Object.keys(STRINGS);

export const t = (locale: string, key: UiKey): string =>
  (STRINGS as Record<string, Record<UiKey, string>>)[locale]?.[key] ?? STRINGS.en[key];

/** "2025-03" -> "March 2025" / "marec 2025" in the page's language. */
export function formatMonth(value: string | null, locale: string): string | null {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Native name of a language for the switcher, e.g. "sk" -> "Slovenčina". */
export function languageName(locale: string): string {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}
