import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

const deviceLanguage = getLocales()[0]?.languageCode ?? "en";
const supportedLanguages = ["en", "tr"];
const defaultLanguage = supportedLanguages.includes(deviceLanguage)
  ? deviceLanguage
  : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr }
  },
  lng: defaultLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  },
  compatibilityJSON: "v4"
});

export default i18n;

export function changeLanguage(lng: "en" | "tr") {
  return i18n.changeLanguage(lng);
}

export function getCurrentLanguage(): string {
  return i18n.language;
}
