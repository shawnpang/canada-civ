// Headless stage for the Canada atlas. It calls the same painters, in the same
// order as main.js, but leaves all visitor-facing DOM and selection state alone.
import {paintMapTerrain} from '../../js/terrain.js';
import {paintCityTiles} from '../../js/render/citytiles.js';
import {paintLens} from '../../js/render/lenses.js';
import {drawBorders} from '../../js/render/borders.js';
import * as labels from '../../js/render/labels.js';
import {drawLayers} from '../../js/render/layers.js';
import * as wonders from '../../js/render/wonders.js';
import * as banners from '../../js/ui/banners.js';

async function json(base, name) {
  const response = await fetch(`${base}${name}.json`);
  if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
  return response.json();
}

export async function loadStage(base = '../data/') {
  const names = ['world', 'cities', 'towns', 'nation', 'provinces', 'lenses', 'sources',
    'resources', 'infrastructure', 'wonders', 'districts', 'citizens', 'disasters', 'election2025'];
  const data = Object.fromEntries(await Promise.all(names.map(async name => [name, await json(base, name)])));
  const world = data.world;
  const cityById = new Map(data.cities.map(city => [String(city.id), city]));
  const lensById = new Map(data.lenses.lenses.map(lens => [lens.id, lens]));
  const stage = {
    data, w: world, world, cityById, lensById, R: world.grid.radius || 25, dpr: 1,
    render(canvas, view) {
      const dpr = view.dpr ?? stage.dpr;
      const width = canvas.width / dpr, height = canvas.height / dpr;
      const scale = view.scale ?? view.rpx / stage.R;
      if (!(scale > 0) || !Number.isFinite(view.x) || !Number.isFinite(view.y)) throw new Error('Invalid trailer camera');
      const camera = {x: view.x, y: view.y, w: width, h: height, width, height, scale,
        ox: width / 2 - view.x * scale, oy: height / 2 - view.y * scale};
      camera.toScreen = (x, y) => [(camera.ox + x * scale) * dpr, (camera.oy + y * scale) * dpr];
      const context = canvas.getContext('2d');
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.globalAlpha = 1;
      const tileView = {width, height, scale, ox: camera.ox, oy: camera.oy};
      const selectedCityId = view.city == null ? null : String(view.city);
      // Renderers read canvas.clientWidth; a detached supersampled canvas has
      // no CSS layout, so supply the logical viewport through a lightweight API.
      const app = {world, cities: data.cities, towns: view.layers?.towns === false ? [] : data.towns,
        districts: data.districts, wonders: data.wonders,
        canvas: {clientWidth: width, clientHeight: height}, ctx: context,
        selectedCityId, getCamera: () => camera, getLang: () => view.lang === 'fr' ? 'fr' : 'en'};
      const cityOpts = {cities: data.cities, towns: app.towns, selectedCityId,
        districts: data.districts, showDistricts: false, lang: app.getLang()};
      paintMapTerrain(context, world, tileView);
      paintCityTiles(context, world, tileView, {...cityOpts, selectedCityId: null});
      const cityAlpha = selectedCityId ? Math.max(0, Math.min(1, (view.cityAnimMs ?? 1000) / 500)) : 0;
      if (cityAlpha > 0) {
        context.save(); context.globalAlpha = cityAlpha;
        paintCityTiles(context, world, tileView, {...cityOpts, highlightOnly: true});
        context.restore();
      }
      if (view.lens) {
        const lens = lensById.get(view.lens);
        if (!lens) throw new Error(`Unknown lens: ${view.lens}`);
        paintLens(app, lens);
      }
      drawBorders(context, world, tileView);
      if (view.labels !== false) labels.onRedraw(app);
      const enabled = new Set();
      for (const name of ['roads', 'rail', 'airports', 'ports', 'military', 'wonders']) {
        if (view.layers?.[name]) enabled.add(name);
      }
      if (view.layers?.crops || view.layers?.resources || view.resources === true) enabled.add('resources');
      drawLayers(app, data, enabled);
      if (enabled.has('wonders')) wonders.onRedraw(app);
      if (view.banners !== false) banners.onRedraw(app);
      if (cityAlpha > 0) {
        context.save(); context.globalAlpha = cityAlpha;
        paintCityTiles(context, world, tileView, {...cityOpts, showDistricts: true, plaquesOnly: true});
        context.restore();
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      return camera;
    }
  };
  return stage;
}
