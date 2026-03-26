import i18n from "i18next";
import { initReactI18next } from "react-i18next";


// Importing translation files

import translationEN from "./assets/i18n/en.json";
import translationJP from "./assets/i18n/jp.json";


//Creating object with the variables of imported translation files
const resources = {
  en: {
    translation: translationEN
  },
  jp: {
    translation: translationJP
  }
};

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: 'en', //default language
    // keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
    cleanCode: true
  });

export default i18n;