// 怪獸道場 — Wong Tai Sin-inspired architectural style (colour, material roles, a procedural roof shell).
// Architecture only: no deities, plaques, incense or glyphs. Sole owner of the dojo hex values.
import * as THREE from 'three';

export const PALETTE = {
  vermillion: '#B91C1C', yellow_tile: '#E8B923', gold: '#D4AF37', lintel_blue: '#2F5F7A',
  jade: '#3D7A6A', lacquer: '#3D1F1A', stone: '#E8DFD0',
};

// material name -> palette role (or raw mix for baked surfaces that need to stay readable under lightmaps)
const ROLES = {
  wall_white: 'yellow_tile', baked_wall_left: 'yellow_tile',
  baked_floor: 'stone', cabin_floor: 'stone', slab_white: 'stone', baked_slab_top: 'stone',
  oak: 'lacquer', trunk: 'lacquer', graphite: 'lacquer', black: 'lacquer',
  fabric_warm: 'vermillion', fabric_light: 'gold',
  glass_pane: 'gold', glass_cabin: 'gold', glass_shaft: 'gold', night_windows: 'gold',
  roof_deck: 'yellow_tile', mullion_light: 'gold', aluminium: 'gold',
  bar_white: 'stone', pot_white: 'stone',
};

export const DOJO = {
  version: 'dojo5',
  palette: PALETTE,
  nightFloor: 0.35,
  // floorstyle.js FALLBACK kit materials
  kit: { oak: PALETTE.lacquer, black: PALETTE.lacquer, graphite: PALETTE.lacquer, fabric_warm: PALETTE.vermillion,
    fabric_light: PALETTE.gold, pot_white: PALETTE.stone, bar_white: PALETTE.stone },
};

export function fromUrl(search = location.search) {
  const v = new URLSearchParams(search).get('dojo');
  return { enabled: v !== '0', shell: v !== '0' && v !== 'tint' };
}

// Stamps the base colour once so re-runs (and daylight's per-frame relight) never compound.
export function applyMaterials(templates) {
  if (!fromUrl().enabled) return;
  for (const root of Object.values(templates)) {
    root?.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.color || m.userData.dojo) continue;
        let role = ROLES[m.name] ?? ROLES[o.name];
        if (!role && /^leaf/.test(m.name || '')) role = 'jade';
        if (!role) continue;
        m.userData.dojo = { role, base: new THREE.Color(PALETTE[role]).getHex() };
        m.color.setHex(m.userData.dojo.base);
        if (m.name === 'night_windows' && m.emissive) m.emissive.set(PALETTE.gold);
        m.needsUpdate = true;
      }
    });
  }
}

// Baked surfaces: base × ambient tint, floored so night never crushes the palette to black.
export function relight(mat, p) {
  const d = mat.userData.dojo;
  if (!d) { mat.color.setRGB(...p.tint); return; }
  mat.color.setHex(d.base);
  const f = DOJO.nightFloor;
  mat.color.r *= Math.max(f, p.tint[0]); mat.color.g *= Math.max(f, p.tint[1]); mat.color.b *= Math.max(f, p.tint[2]);
}

// Glass keeps amber/gold at every hour (time-of-day glassC goes navy at night).
export function relightGlass(mat, p, fallback) {
  const d = mat.userData.dojo;
  if (d) mat.color.setHex(d.base); else mat.color.copy(fallback);
}

export function cssVars() {
  const out = {};
  for (const [k, v] of Object.entries(PALETTE)) out[`--dojo-${k.replace('_', '-')}`] = v;
  return out;
}
export function applyCssVars(el = document.documentElement) {
  if (!fromUrl().enabled) return;
  for (const [k, v] of Object.entries(cssVars())) el.style.setProperty(k, v);
}

// Procedural temple shell around an open floor: plinth, columns, lintel band, eaves, ridge.
// Only the two far sides (−x, −z) get columns/eaves: the camera looks from +x,+z (scene.js ISO_DIR).
export function buildShell(floorObj, height = 2.7) {
  if (!fromUrl().shell || !floorObj) return null;
  floorObj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(floorObj);
  if (!Number.isFinite(box.min.x)) return null;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mats = {
    stone: lam(PALETTE.stone), col: lam(PALETTE.vermillion), blue: lam(PALETTE.lintel_blue),
    tile: new THREE.MeshLambertMaterial({ color: PALETTE.yellow_tile, side: THREE.DoubleSide }), gold: lam(PALETTE.gold),
  };
  const g = new THREE.Group();
  g.name = 'dojo_shell';
  const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z, y0 = 0;
  const W = x1 - x0, D = z1 - z0, H = height;

  // 1 plinth (L-shaped strip along the far sides, merged into one box each would be 2 calls; use thin back strips)
  const pl = new THREE.BoxGeometry(1, 1, 1);
  const plinth = new THREE.InstancedMesh(pl, mats.stone, 2);
  const tmpM = new THREE.Matrix4();
  plinth.setMatrixAt(0, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 - 0.12, z0 - 0.15), new THREE.Quaternion(), new THREE.Vector3(W + 0.6, 0.24, 0.3)));
  plinth.setMatrixAt(1, tmpM.compose(new THREE.Vector3(x0 - 0.15, y0 - 0.12, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.24, D + 0.6)));
  g.add(plinth);

  // 2 columns (instanced)
  const pos = [];
  const nx = Math.max(2, Math.round(W / 2.2)), nz = Math.max(2, Math.round(D / 2.2));
  for (let i = 0; i <= nx; i++) pos.push([x0 + (W * i) / nx, z0]);
  for (let i = 1; i <= nz; i++) pos.push([x0, z0 + (D * i) / nz]);
  const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.1, H, 10), mats.col, pos.length);
  pos.forEach(([x, z], i) => cols.setMatrixAt(i, tmpM.makeTranslation(x, y0 + H / 2, z)));
  g.add(cols);

  // 3 lintel band (instanced, 2 sides)
  const band = new THREE.InstancedMesh(pl, mats.blue, 2);
  band.setMatrixAt(0, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 + H - 0.12, z0), new THREE.Quaternion(), new THREE.Vector3(W + 0.2, 0.24, 0.22)));
  band.setMatrixAt(1, tmpM.compose(new THREE.Vector3(x0, y0 + H - 0.12, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(0.22, 0.24, D + 0.2)));
  g.add(band);

  // 4 eaves: two tiers of sloped tile planes, tilted down-and-out (instanced plane, 4 instances)
  const eave = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mats.tile, 4);
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let t = 0; t < 2; t++) {
    const y = y0 + H + 0.05 + t * 0.45, out = 0.9 - t * 0.35, inset = t * 0.4;
    e.set(-Math.PI / 2 - 0.45, 0, 0); q.setFromEuler(e);   // −z side: slopes down toward −z
    eave.setMatrixAt(t * 2, tmpM.compose(new THREE.Vector3(x0 + W / 2, y, z0 - out / 2 + inset), q, new THREE.Vector3(W + 1.2 - t * 0.8, out, 1)));
    e.set(0, -Math.PI / 2, 0); const qa = new THREE.Quaternion().setFromEuler(e);
    e.set(-Math.PI / 2 - 0.45, 0, 0); q.setFromEuler(e); qa.multiply(q);   // −x side
    eave.setMatrixAt(t * 2 + 1, tmpM.compose(new THREE.Vector3(x0 - out / 2 + inset, y, z0 + D / 2), qa, new THREE.Vector3(D + 1.2 - t * 0.8, out, 1)));
  }
  g.add(eave);

  // 5 gold ridge along both upper-tier tops
  const ridge = new THREE.InstancedMesh(pl, mats.gold, 2);
  const ry = y0 + H + 0.62;
  ridge.setMatrixAt(0, tmpM.compose(new THREE.Vector3(x0 + W / 2, ry, z0 + 0.4), new THREE.Quaternion(), new THREE.Vector3(W + 0.4, 0.08, 0.08)));
  ridge.setMatrixAt(1, tmpM.compose(new THREE.Vector3(x0 + 0.4, ry, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(0.08, 0.08, D + 0.4)));
  g.add(ridge);

  g.userData.mats = Object.values(mats);
  for (const m of g.userData.mats) m.userData.dojoShell = true;
  return g;
}
