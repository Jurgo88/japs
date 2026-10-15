import { extendStrings } from "@japs/theme-kit";

/** UI strings of the gallery theme on top of the shared ones. `{name}` is replaced by the first name. */
export const tt = extendStrings({
  en: { hello: "Hi, I’m {name}", myWork: "Things I’ve built", tools: "Tools I reach for", cta: "Let’s make it happen", upNext: "Up next" },
  sk: { hello: "Ahoj, som {name}", myWork: "Moja práca", tools: "Nástroje, ktoré používam", cta: "Poďme do toho", upNext: "Ďalej" },
  cs: { hello: "Ahoj, jsem {name}", myWork: "Moje práce", tools: "Nástroje, které používám", cta: "Pojďme do toho", upNext: "Dál" },
  de: { hello: "Hi, ich bin {name}", myWork: "Was ich gebaut habe", tools: "Meine Werkzeuge", cta: "Legen wir los", upNext: "Als Nächstes" },
});
