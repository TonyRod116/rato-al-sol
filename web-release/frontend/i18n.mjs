import { isLanguage, languageKey, translate, translateDirection } from './shared/i18n.mjs';

let language = 'es';
export const t = (spanish, english, catalan) => translate(language, spanish, english, catalan);
export const direction = (value) => translateDirection(language, value);

export function message(element, spanish, english, catalan) {
  element.dataset.es = spanish;
  element.dataset.en = english;
  if (catalan !== undefined) element.dataset.ca = catalan;
  else delete element.dataset.ca;
  element.textContent = t(spanish, english, catalan);
}

export function setLanguage(value, persist = false) {
  language = isLanguage(value) ? value : 'es';
  document.documentElement.lang = language;
  document.title = t('Rato al Sol — Explora la luz en Madrid y Barcelona', 'Sun Time — Explore the light in Madrid and Barcelona', 'Rato al Sol — Explora la llum a Madrid i Barcelona');
  for (const element of document.querySelectorAll('[data-en]')) {
    if (!('es' in element.dataset)) element.dataset.es = element.textContent;
    element.textContent = t(element.dataset.es, element.dataset.en, element.dataset.ca);
  }
  for (const attribute of ['aria-label', 'placeholder', 'content']) {
    for (const element of document.querySelectorAll(`[data-en-${attribute}]`)) {
      const english = element.getAttribute(`data-en-${attribute}`);
      const spanishKey = `data-es-${attribute}`;
      if (!element.hasAttribute(spanishKey)) element.setAttribute(spanishKey, element.getAttribute(attribute));
      element.setAttribute(attribute, t(element.getAttribute(spanishKey), english, element.getAttribute(`data-ca-${attribute}`) ?? undefined));
    }
  }
  document.getElementById('language').value = language;
  if (persist) try { localStorage.setItem(languageKey, language); } catch { /* Preference is optional. */ }
}

export function savedLanguage() {
  try { return isLanguage(localStorage.getItem(languageKey)) ? localStorage.getItem(languageKey) : 'es'; }
  catch { return 'es'; }
}
