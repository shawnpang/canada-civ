// Hash state is shared with the panel and lens modules. Selection changes create
// history entries; camera writes replace the current entry.
let applying = false;

export function getHash() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

export function setHashKeys(keys, {replace = false} = {}) {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const [key, value] of Object.entries(keys)) {
    if (value == null || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const next = params.toString();
  if (next === location.hash.slice(1)) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', next ? `#${next}` : location.pathname + location.search);
  window.dispatchEvent(new Event('hashchange'));
}

function homeScale(ctx) {
  return Math.min(innerWidth / (ctx.world.width + 200), (innerHeight - 95) / (ctx.world.height + 200));
}

export function writeHash(ctx) {
  if (applying || !ctx.world) return;
  const {scale, ox, oy} = ctx.getCamera();
  const fit = homeScale(ctx);
  if (![scale, ox, oy, fit].every(Number.isFinite) || scale <= 0 || fit <= 0) return;
  const x = (innerWidth / 2 - ox) / scale;
  const y = (innerHeight / 2 - oy) / scale;
  const zoom = Math.log2(scale / fit);
  const params = new URLSearchParams(location.hash.slice(1));
  const previousLang = params.get('lang') || (navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const languageChanged = previousLang !== ctx.getLang();
  params.set('lang', ctx.getLang());
  params.set('at', `${x.toFixed(1)},${y.toFixed(1)},${zoom.toFixed(4)}`);
  history[languageChanged ? 'pushState' : 'replaceState'](null, '', `#${params}`);
}

export function onHash(ctx) {
  if (!ctx.world) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const requested = params.get('lang');
  const language = requested === 'fr' || (requested !== 'en' && navigator.language.toLowerCase().startsWith('fr')) ? 'fr' : 'en';
  applying = true;
  try {
    if (ctx.getLang() !== language) ctx.setLang(language);
    const at = params.get('at');
    if (at) {
      const parts = at.split(',');
      const [x, y, z] = parts.map(Number);
      if (parts.length === 3 && parts.every(part => part.trim() !== '') && [x, y, z].every(Number.isFinite)) {
        const scale = homeScale(ctx) * 2 ** z;
        if (Number.isFinite(scale) && scale > 0) ctx.setCamera({scale, ox: innerWidth / 2 - x * scale, oy: innerHeight / 2 - y * scale});
      }
    }
  } finally {
    applying = false;
  }
}

export function init() {}
