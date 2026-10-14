/**
 * UI strings shared by the built-in themes; a theme adds its own with extendStrings().
 * Project content comes localized in portfolio.json.
 */
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
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    filter: "Filter by technology",
    all: "All",
    moreTags: "Show all technologies",
    showing: "Showing {shown} of {total} projects",
    previous: "Previous project",
    next: "Next project",
    enlarge: "Enlarge screenshot",
    close: "Close",
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
    theme: "Vzhľad",
    themeSystem: "Systémový",
    themeLight: "Svetlý",
    themeDark: "Tmavý",
    filter: "Filtrovať podľa technológie",
    all: "Všetky",
    moreTags: "Zobraziť všetky technológie",
    showing: "Zobrazené projekty: {shown} z {total}",
    previous: "Predošlý projekt",
    next: "Ďalší projekt",
    enlarge: "Zväčšiť screenshot",
    close: "Zavrieť",
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
    theme: "Vzhled",
    themeSystem: "Systémový",
    themeLight: "Světlý",
    themeDark: "Tmavý",
    filter: "Filtrovat podle technologie",
    all: "Vše",
    moreTags: "Zobrazit všechny technologie",
    showing: "Zobrazené projekty: {shown} z {total}",
    previous: "Předchozí projekt",
    next: "Další projekt",
    enlarge: "Zvětšit snímek",
    close: "Zavřít",
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
    theme: "Darstellung",
    themeSystem: "System",
    themeLight: "Hell",
    themeDark: "Dunkel",
    filter: "Nach Technologie filtern",
    all: "Alle",
    moreTags: "Alle Technologien anzeigen",
    showing: "{shown} von {total} Projekten",
    previous: "Vorheriges Projekt",
    next: "Nächstes Projekt",
    enlarge: "Screenshot vergrößern",
    close: "Schließen",
  },
} as const;

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type PluralKey = "projects" | "technologies" | "years";

/** Labels that follow a number ("3 projects"), in every plural form the locale uses. */
const PLURALS: Record<keyof typeof STRINGS, Record<PluralKey, PluralForms>> = {
  en: {
    projects: { one: "project", other: "projects" },
    technologies: { one: "technology", other: "technologies" },
    years: { one: "year", other: "years" },
  },
  sk: {
    projects: { one: "projekt", few: "projekty", other: "projektov" },
    technologies: { one: "technológia", few: "technológie", other: "technológií" },
    years: { one: "rok", few: "roky", other: "rokov" },
  },
  cs: {
    projects: { one: "projekt", few: "projekty", other: "projektů" },
    technologies: { one: "technologie", few: "technologie", other: "technologií" },
    years: { one: "rok", few: "roky", other: "let" },
  },
  de: {
    projects: { one: "Projekt", other: "Projekte" },
    technologies: { one: "Technologie", other: "Technologien" },
    years: { one: "Jahr", other: "Jahre" },
  },
};

export type UiKey = keyof (typeof STRINGS)["en"];
export type KitLocale = keyof typeof STRINGS;
export const SUPPORTED_LOCALES: string[] = Object.keys(STRINGS);

export const t = (locale: string, key: UiKey): string =>
  (STRINGS as Record<string, Record<UiKey, string>>)[locale]?.[key] ?? STRINGS.en[key];

/**
 * A theme's own UI strings on top of the shared ones. Every kit locale must be covered,
 * so a theme can't ship half-translated:
 *   const tt = extendStrings({ en: { hello: "Hi" }, sk: { hello: "Ahoj" }, cs: …, de: … });
 */
export function extendStrings<K extends string>(extra: Record<KitLocale, Record<K, string>>) {
  return (locale: string, key: UiKey | K): string => {
    const own = (extra as Record<string, Record<K, string>>)[locale] ?? extra.en;
    return key in own ? own[key as K] : t(locale, key as UiKey);
  };
}

/** Label for a count in the page's language: plural("sk", "projects", 3) -> "projekty". */
export function plural(locale: string, key: PluralKey, count: number): string {
  const forms = ((PLURALS as Record<string, Record<PluralKey, PluralForms>>)[locale] ?? PLURALS.en)[key];
  return forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
}

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
