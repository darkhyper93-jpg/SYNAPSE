// Minimal i18n: t('key.path', { var }) with {var} interpolation. Spanish + English.
import { STRINGS } from '../data/strings.js';

let lang = 'en';

export function setLang(l) {
  lang = STRINGS[l] ? l : 'en';
}

export function getLang() {
  return lang;
}

export function t(key, vars = {}) {
  const str = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

export function hasKey(key, l = lang) {
  return STRINGS[l]?.[key] !== undefined;
}
