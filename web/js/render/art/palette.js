// Land-cover indices follow SPEC §6.3. The close palette preserves the v1.1 art.
import {FAR, MID, NEAR, CLOSE} from './lod.js';

export const LAND_FILLS = Object.freeze({
  [FAR]: Object.freeze(['#91a36c','#6fa24e','#3f783d','#59914a','#a7a66a','#c6b65e','#c2b45e','#d0b852','#819e66','#b2a785','#b6aa83','#e0e7df']),
  [MID]: Object.freeze(['#899b6c','#7d9f5a','#4d7949','#6b9659','#a4a579','#baaf70','#adab6d','#c4ae61','#849e75','#aaa487','#afa98f','#e0e7df']),
  [NEAR]: Object.freeze(['#81936d','#839b63','#526f4d','#718c60','#a1a47b','#b4a979','#a4a575','#bea96b','#849b79','#aaa487','#aaa998','#e0e7df']),
  [CLOSE]: Object.freeze(['#81936d','#839b63','#526f4d','#718c60','#a1a47b','#b4a979','#a4a575','#bea96b','#849b79','#aaa487','#aaa998','#e0e7df']),
});

export function landFill(cover, lod) {
  const palette = LAND_FILLS[lod] || LAND_FILLS[NEAR];
  return palette[cover] || palette[0];
}

export const SHADE_TINTS = Object.freeze({light: '250,239,202', dark: '23,38,36'});
export const FAR_MOUNTAIN = Object.freeze({light: '#a9b4a0', dark: '#506658', snow: '#f2f6ef'});

// Suggestions for water.js and neighbours.js; those renderers own their fills.
export const CONTEXT_FILLS = Object.freeze({ocean: '#173b5d', lake: '#377ca4', shelf: '#397597', foreign: '#777c73'});
