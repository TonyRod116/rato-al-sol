import { catalan } from './catalog-ca.mjs';

export const languageKey = 'rato-al-sol-language';
export const isLanguage = (value) => value === 'es' || value === 'en' || value === 'ca';
export const translate = (language, spanish, english, ca) => language === 'en' ? english : language === 'ca' ? (ca ?? catalan[english] ?? spanish) : spanish;

const englishDirections = {
  norte: 'north', noreste: 'northeast', este: 'east', sureste: 'southeast',
  sur: 'south', suroeste: 'southwest', oeste: 'west', noroeste: 'northwest',
};
const catalanDirections = {
  norte: 'nord', noreste: 'nord-est', este: 'est', sureste: 'sud-est',
  sur: 'sud', suroeste: 'sud-oest', oeste: 'oest', noroeste: 'nord-oest',
};

export function translateDirection(language, value) {
  if (language !== 'en' && language !== 'ca') return value;
  const directions = language === 'ca' ? catalanDirections : englishDirections;
  const translated = directions[value.toLocaleLowerCase('es')] || value;
  return value[0] === value[0]?.toLocaleUpperCase('es') ? translated[0].toUpperCase() + translated.slice(1) : translated;
}
