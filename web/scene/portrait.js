// Portrait character (trial): a bot's own profile picture on a rounded card standing on a small base.
// Card yaws toward the camera each frame. No eyes, so the actor skips eye animation.
import * as THREE from 'three';

const cache = new Map();
function loadTex(url) {
  if (!cache.has(url)) {
    cache.set(url, new THREE.TextureLoader().loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null));
  }
  return cache.get(url);
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = 0;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** resolves to a THREE.Group named "portrait_root", or null if the image fails to load */
export async function generatePortrait(url, color = '#5C3FC8') {
  const tex = await loadTex(url);
  if (!tex) return null;
  const root = new THREE.Group(); root.name = 'portrait_root';
  const W = 0.8, H = 0.8, R = 0.14, T = 0.04, LIFT = 0.12;
  const card = new THREE.Group(); card.name = 'portrait_card'; card.position.y = LIFT;
  const frameGeo = new THREE.ExtrudeGeometry(roundedRect(W + 0.06, H + 0.06, R + 0.03), { depth: T, bevelEnabled: false });
  frameGeo.translate(0, -0.03, -T / 2 - 0.002);
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  frame.name = 'portrait_frame'; frame.castShadow = true;
  const faceGeo = new THREE.ShapeGeometry(roundedRect(W, H, R));
  const uv = faceGeo.attributes.uv, pos = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / H);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
  const front = new THREE.Mesh(faceGeo, mat); front.name = 'portrait_face'; front.position.z = T / 2 + 0.001;
  card.add(frame, front);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, LIFT, 32), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  base.name = 'portrait_base'; base.position.y = LIFT / 2; base.castShadow = true; base.receiveShadow = true;
  root.add(base, card);
  const v = new THREE.Vector3();
  front.onBeforeRender = (r, s, cam) => {          // billboard yaw toward camera
    if (!card.parent) return;
    v.setFromMatrixPosition(cam.matrixWorld); card.parent.worldToLocal(v);
    card.rotation.y = Math.atan2(v.x - card.position.x, v.z - card.position.z);
  };
  return root;
}
