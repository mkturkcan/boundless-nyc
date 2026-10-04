// The app's one KTX2Loader (AR34, VEHICLES 04:13): each KTX2Loader loads its own Basis transcoder and worker pool, and three
// warns for every one started while another is active ("Multiple active KTX2 loaders"). Every module that loads .ktx2
// takes this one: `ktx2Loader(renderer)` (null until a renderer is known; window.__ENGINE.renderer is tried).
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let _ktx2 = null;
export function ktx2Loader(renderer) {
  if (!_ktx2) {
    const r = renderer || (typeof window !== 'undefined' && window.__ENGINE && window.__ENGINE.renderer);
    if (!r) return null;
    _ktx2 = new KTX2Loader().setTranscoderPath('basis/').detectSupport(r);
  }
  return _ktx2;
}
