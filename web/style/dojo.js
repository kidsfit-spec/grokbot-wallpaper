// 怪獸道場 — Wong Tai Sin-inspired architectural style (colour, material roles, a procedural roof shell).
// Architecture only: no deities, plaques, incense or glyphs. Sole owner of the dojo hex values.
import * as THREE from 'three';

export const PALETTE = {
  vermillion: '#E11D2E', yellow_tile: '#F5C211', gold: '#D4AF37', lintel_blue: '#2F5F7A',
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
  version: 'dojo5g',
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

// Procedural temple shell around an open floor: plinth, columns, lintel, eaves, ridge.
// MeshBasicMaterial so night/daylight ambient cannot hide the shell. frustumCulled=false for InstancedMesh.
export function buildShell(floorObj, height = 2.7) {
  if (!fromUrl().shell || !floorObj) return null;
  floorObj.updateMatrixWorld(true);
  // Local AABB from mesh geometries (avoids world/parent skew at construct time).
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  floorObj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (floorObj.parent) {
    const inv = new THREE.Matrix4().copy(floorObj.parent.matrixWorld).invert();
    box.applyMatrix4(inv);
  }
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return null;
  const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
  const mats = {
    stone: basic(PALETTE.stone), col: basic(PALETTE.vermillion), blue: basic(PALETTE.lintel_blue),
    tile: new THREE.MeshBasicMaterial({ color: PALETTE.yellow_tile, side: THREE.DoubleSide }), gold: basic(PALETTE.gold),
  };
  const g = new THREE.Group();
  g.name = 'dojo_shell';
  const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z, y0 = Math.min(0, box.min.y);
  const W = Math.max(1, x1 - x0), D = Math.max(1, z1 - z0), H = height;
  const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const mark = (mesh) => { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; g.add(mesh); };

  // 1 plinth
  const pl = new THREE.BoxGeometry(1, 1, 1);
  const plinth = new THREE.InstancedMesh(pl, mats.stone, 4);
  const ph = 0.32, pt = 0.5;
  plinth.setMatrixAt(0, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 - ph / 2, z0 - pt / 2), new THREE.Quaternion(), new THREE.Vector3(W + pt * 2, ph, pt)));
  plinth.setMatrixAt(1, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 - ph / 2, z1 + pt / 2), new THREE.Quaternion(), new THREE.Vector3(W + pt * 2, ph, pt)));
  plinth.setMatrixAt(2, tmpM.compose(new THREE.Vector3(x0 - pt / 2, y0 - ph / 2, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(pt, ph, D)));
  plinth.setMatrixAt(3, tmpM.compose(new THREE.Vector3(x1 + pt / 2, y0 - ph / 2, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(pt, ph, D)));
  mark(plinth);

  // 2 vermillion columns — thicker so they read at night
  const pos = [];
  const nx = Math.max(4, Math.round(W / 1.8)), nz = Math.max(4, Math.round(D / 1.8));
  for (let i = 0; i <= nx; i++) { const x = x0 + (W * i) / nx; pos.push([x, z0], [x, z1]); }
  for (let i = 1; i < nz; i++) { const z = z0 + (D * i) / nz; pos.push([x0, z], [x1, z]); }
  const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.16, H, 12), mats.col, pos.length);
  pos.forEach(([x, z], i) => cols.setMatrixAt(i, tmpM.makeTranslation(x, y0 + H / 2, z)));
  mark(cols);

  // 3 lintel
  const band = new THREE.InstancedMesh(pl, mats.blue, 4);
  const bh = 0.3, bt = 0.28;
  band.setMatrixAt(0, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 + H - bh / 2, z0), new THREE.Quaternion(), new THREE.Vector3(W + 0.4, bh, bt)));
  band.setMatrixAt(1, tmpM.compose(new THREE.Vector3(x0 + W / 2, y0 + H - bh / 2, z1), new THREE.Quaternion(), new THREE.Vector3(W + 0.4, bh, bt)));
  band.setMatrixAt(2, tmpM.compose(new THREE.Vector3(x0, y0 + H - bh / 2, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(bt, bh, D + 0.4)));
  band.setMatrixAt(3, tmpM.compose(new THREE.Vector3(x1, y0 + H - bh / 2, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(bt, bh, D + 0.4)));
  mark(band);

  // 4 eaves — project INTO the cutaway (toward +x/+z) so the iso camera sees stacked tiers.
  // Outside-only eaves sit behind opaque far walls and vanish from this view.
  const eaveGeo = new THREE.BoxGeometry(1, 1, 1);
  const TIERS = 3;
  const eave = new THREE.InstancedMesh(eaveGeo, mats.tile, TIERS * 2 + 2);
  let ei = 0;
  const tip = 0.22; // slight tip; mostly flat so top faces read from above
  for (let t = 0; t < TIERS; t++) {
    const y = y0 + H + 0.2 + t * 0.52;
    const out = 1.7 - t * 0.4;       // lower tier wider
    const thick = 0.2 - t * 0.025;
    const spanW = W + 0.8 - t * 0.35;
    const spanD = D + 0.8 - t * 0.35;
    // −z far wall: overhang INTO room (+z) and a little outside
    e.set(tip, 0, 0); q.setFromEuler(e);
    eave.setMatrixAt(ei++, tmpM.compose(
      new THREE.Vector3(x0 + W / 2, y, z0 + out * 0.25), q, new THREE.Vector3(spanW, thick, out)));
    // −x far wall: overhang INTO room (+x)
    e.set(0, 0, -tip); q.setFromEuler(e);
    eave.setMatrixAt(ei++, tmpM.compose(
      new THREE.Vector3(x0 + out * 0.25, y, z0 + D / 2), q, new THREE.Vector3(out, thick, spanD)));
  }
  // near rails — thin, outside only
  {
    const y = y0 + H + 0.15, out = 0.36, thick = 0.07;
    e.set(-tip * 0.5, 0, 0); q.setFromEuler(e);
    eave.setMatrixAt(ei++, tmpM.compose(
      new THREE.Vector3(x0 + W / 2, y, z1 + out * 0.9), q, new THREE.Vector3(W * 0.45, thick, out)));
    e.set(0, 0, tip * 0.5); q.setFromEuler(e);
    eave.setMatrixAt(ei++, tmpM.compose(
      new THREE.Vector3(x1 + out * 0.9, y, z0 + D / 2), q, new THREE.Vector3(out, thick, D * 0.45)));
  }
  mark(eave);

  // 5 gold ridge — above uppermost inward tier (still on far side of open volume)
  const ridge = new THREE.InstancedMesh(pl, mats.gold, 2);
  const ry = y0 + H + 0.2 + (TIERS - 1) * 0.52 + 0.35;
  ridge.setMatrixAt(0, tmpM.compose(
    new THREE.Vector3(x0 + W / 2, ry, z0 + 0.35), new THREE.Quaternion(), new THREE.Vector3(W * 0.45, 0.12, 0.12)));
  ridge.setMatrixAt(1, tmpM.compose(
    new THREE.Vector3(x0 + 0.35, ry, z0 + D / 2), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.12, D * 0.45)));
  mark(ridge);

  g.userData.mats = Object.values(mats);
  for (const m of g.userData.mats) m.userData.dojoShell = true;
  return g;
}
