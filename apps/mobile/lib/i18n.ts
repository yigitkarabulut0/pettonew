import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "@/locales/en.json";
import tr from "@/locales/tr.json";
import ptBR from "@/locales/pt-BR.json";

// BCP-47 resolution. iOS / Android both expose `languageTag` (e.g. "pt-BR")
// alongside `languageCode` ("pt"). We prefer the full tag so a Brazilian
// device lands on pt-BR while a Portuguese device — which only sets
// "pt-PT" — falls through to base English (we don't ship a generic "pt"
// or "pt-PT" file). Turkish and English fall back to their language code
// because devices commonly report "tr-TR" / "en-US" and we only ship the
// generic files.
const supportedLanguages = ["en", "tr", "pt-BR"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

function isSupported(value: string | undefined): value is SupportedLanguage {
  return !!value && (supportedLanguages as readonly string[]).includes(value);
}

const primaryLocale = getLocales()[0];
const tag = primaryLocale?.languageTag ?? "en";       // e.g. "pt-BR"
const code = primaryLocale?.languageCode ?? "en";     // e.g. "pt"

// Tag wins (catches pt-BR exactly); if not supported, drop to language
// family (catches en-US → en, tr-TR → tr); else default to English.
const defaultLanguage: SupportedLanguage = isSupported(tag)
  ? tag
  : isSupported(code)
    ? code
    : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
    "pt-BR": { translation: ptBR }
  },
  lng: defaultLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  },
  compatibilityJSON: "v4"
});

export default i18n;

export function changeLanguage(lng: SupportedLanguage) {
  return i18n.changeLanguage(lng);
}

export function getCurrentLanguage(): string {
  return i18n.language;
}
