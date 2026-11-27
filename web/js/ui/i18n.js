// Common chrome vocabulary. Names of places and data-defined labels come from
// their bilingual payload fields rather than this dictionary.
const strings = {
  en: {
    search: 'Search', searchPlaceholder: 'Search cities and provinces…', noMatches: 'No matches',
    almanac: 'Almanac', share: 'Share', close: 'Close', back: 'Back',
    about: 'About', yields: 'Yields', lenses: 'Lenses', terrain: 'Terrain', sources: 'Sources and licences',
    population: 'Population', food: 'Food', production: 'Production', gold: 'Gold', science: 'Science', culture: 'Culture', unemployment: 'Unemployment',
    noData: 'No data', city: 'City', province: 'Province or territory',
    copyLink: 'Copy link', downloadPng: 'Download PNG', copied: 'Link copied',
    help: 'Help', map: 'Map', language: 'Language', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view'
  },
  fr: {
    search: 'Rechercher', searchPlaceholder: 'Rechercher une ville ou une province…', noMatches: 'Aucun résultat',
    almanac: 'Almanach', share: 'Partager', close: 'Fermer', back: 'Retour',
    about: 'À propos', yields: 'Rendements', lenses: 'Couches', terrain: 'Relief', sources: 'Sources et licences',
    population: 'Population', food: 'Nourriture', production: 'Production', gold: 'Or', science: 'Science', culture: 'Culture', unemployment: 'Chômage',
    noData: 'Aucune donnée', city: 'Ville', province: 'Province ou territoire',
    copyLink: 'Copier le lien', downloadPng: 'Télécharger le PNG', copied: 'Lien copié',
    help: 'Aide', map: 'Carte', language: 'Langue', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', reset: 'Réinitialiser la vue'
  }
};
export function t(key, lang = 'en') { return (strings[lang] || strings.en)[key] ?? strings.en[key] ?? key; }
export function init() {}
