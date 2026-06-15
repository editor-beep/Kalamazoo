// World building: one shared geography, nine skins of time.
// Anchored places hold their coordinates in every era — only time moves.

import * as THREE from '../vendor/three/three.module.min.js';
import { SkyShader, WaterShader } from './shaders.js';
import { GEO, PLACES, STREETS } from './geo.js';
import {
  Agent, Cruiser, Shuttle, Train, makePersonMesh,
  makeSmokeColumn, makeFireflies, makeMotes, updateChats,
} from './agents.js';

const ERA_ORDER = ['founding', 'boiling', 'celery', 'mall', 'seventies', 'paper', 'nineties', 'living', 'returns'];
const stage = key => ERA_ORDER.indexOf(key);
const since = (era, key) => stage(era.key) >= stage(key);
const only = (era, ...keys) => keys.includes(era.key);

const M = opts => new THREE.MeshStandardMaterial(opts);

// Solid construction registers its footprint so people, vehicles, and trees
// respect it (invariant 8). Center + size, or explicit bounds.
const block = (world, cx, cz, w, d) =>
  world.obstacles.push({ x1: cx - w / 2, z1: cz - d / 2, x2: cx + w / 2, z2: cz + d / 2 });
const blockBounds = (world, x1, z1, x2, z2) =>
  world.obstacles.push({ x1, z1, x2, z2 });
const inFootprint = (world, x, z, pad = 0) =>
  world.obstacles.some(b => x > b.x1 - pad && x < b.x2 + pad && z > b.z1 - pad && z < b.z2 + pad);

// Per-era seeded PRNG: construction is deterministic, so the city is the
// *same city* every visit. Agent wander (agents.js) stays truly random.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFrom = str => {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
let R = Math.random;
const rand = (a, b) => a + R() * (b - a);
const pick = arr => arr[Math.floor(R() * arr.length)];

// ------------------------------------------------------------- canvas textures
// All guarded so the module stays importable in Node (smoke tests).

const HAS_DOM = typeof document !== 'undefined';
function canvasTex(w, h, draw, repeat) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = 4;
  return tex;
}

function brickTex(base, mortar, rows = 12) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
    const bh = h / rows, bw = w / 6;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5;
      for (let c = -1; c < 7; c++) {
        const jitter = (R() - 0.5) * 14;
        ctx.fillStyle = shade(base, jitter);
        ctx.fillRect(c * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
      }
    }
  });
}

function groundTex(c1, c2) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      ctx.fillStyle = R() < 0.5 ? c2 : shade(c1, (R() - 0.5) * 22);
      const r = rand(3, 16);
      ctx.globalAlpha = rand(0.1, 0.4);
      ctx.beginPath();
      ctx.arc(R() * w, R() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [8, 8]);
}

function signTex(text, { bg = '#20242a', fg = '#f3ede2', font = 'bold 54px Georgia', sub = null } = {}) {
  const tex = canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg; ctx.globalAlpha = 0.5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) { ctx.font = '24px Georgia'; ctx.fillText(sub, w / 2, h / 2 + 32); }
  });
  // Mark as readable text so the true-map z-reflection (group.scale.z = -1) can be
  // cancelled per-mesh, keeping words forward-facing instead of mirror-written.
  if (tex) tex.userData.isText = true;
  return tex;
}


function makeStreetSign(name, x, z, rot = 0, sub = null) {
  const g = new THREE.Group();
  g.userData.phase2 = 'street-sign';
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 2.2, 8),
    M({ color: 0x2c3330, roughness: 0.55, metalness: 0.35 })
  );
  pole.position.y = 1.1;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.42, 2.45),
    new THREE.MeshStandardMaterial({
      map: signTex(name, { bg: '#174d34', fg: '#f2f6ed', font: 'bold 42px Georgia', sub }),
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.15,
    })
  );
  blade.position.set(0, 2.15, 0);
  g.add(pole, blade);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

function makeBench(x, z, rot = 0, color = 0x4a4540) {
  const g = new THREE.Group();
  const mat = M({ color, roughness: 0.85 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.48), mat);
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 0.14), mat);
  back.position.set(0, 0.76, -0.24);
  [-0.7, 0.7].forEach(px => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), mat);
    leg.position.set(px, 0.21, 0.12);
    g.add(leg);
  });
  g.add(seat, back);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeBanner(x, z, text) {
  const g = new THREE.Group();
  g.userData.phase2 = 'wmu-banner';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), M({ color: 0x2f2f2f, roughness: 0.5, metalness: 0.4 }));
  pole.position.y = 1.6;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.05, 0.72),
    new THREE.MeshStandardMaterial({
      map: signTex(text, { bg: '#4b2e1f', fg: '#f1c232', font: 'bold 42px Georgia' }),
      color: 0xffffff,
      roughness: 0.7,
    })
  );
  banner.position.set(0, 2.35, 0.38);
  g.add(pole, banner);
  g.position.set(x, 0, z);
  g.rotation.y = -0.25;
  return g;
}

function muralTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1d3557'); grad.addColorStop(0.5, '#2a9d8f'); grad.addColorStop(1, '#e9c46a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    // river ribbon
    ctx.strokeStyle = '#a8dadc'; ctx.lineWidth = 18; ctx.beginPath();
    ctx.moveTo(0, h * 0.7);
    ctx.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.9, w, h * 0.6);
    ctx.stroke();
    // sun
    ctx.fillStyle = '#f4a261'; ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, 34, 0, Math.PI * 2); ctx.fill();
    // heron silhouette
    ctx.fillStyle = '#10141c';
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.32, 26, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.3, h * 0.32, 4, 50);
  });
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ------------------------------------------------------------- small builders

function makeTree(x, z, scale, foliagePalette, kind = 'round') {
  const g = new THREE.Group();
  const trunkMat = M({ color: 0x4a3522, roughness: 0.9 });
  const fol = M({ color: pick(foliagePalette), roughness: 0.85 });

  if (kind === 'willow') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 2.4 * scale, 6), trunkMat);
    trunk.position.y = 1.2 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9 * scale, 8, 7), fol);
    crown.scale.y = 1.25;
    crown.position.y = 3.4 * scale;
    crown.castShadow = true;
    g.add(crown);
  } else if (kind === 'oak') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * scale, 0.55 * scale, 3.2 * scale, 7), trunkMat);
    trunk.position.y = 1.6 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const r = (i === 0 ? 2.6 : 1.9) * scale;
      const f = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), fol);
      f.position.set((i - 1.5) * 1.3 * scale, 4.4 * scale + (i % 2) * 0.8 * scale, ((i % 2) - 0.5) * 1.4 * scale);
      f.castShadow = true;
      g.add(f);
    }
  } else if (kind === 'sapling') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.09 * scale, 1.8 * scale, 5), trunkMat);
    trunk.position.y = 0.9 * scale;
    g.add(trunk);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.65 * scale, 7, 6), fol);
    f.position.y = 2.0 * scale;
    f.castShadow = true;
    g.add(f);
  } else if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, 1.6 * scale, 6), trunkMat);
    trunk.position.y = 0.8 * scale;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.7 - i * 0.42) * scale, 1.7 * scale, 8), fol);
      cone.position.y = (1.7 + i * 1.05) * scale;
      cone.castShadow = true;
      g.add(cone);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2.2 * scale, 6), trunkMat);
    trunk.position.y = 1.1 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const offs = [[0, 2.9, 0, 1.5], [0.8, 3.3, 0.4, 1.1], [-0.7, 3.2, -0.4, 1.05]];
    offs.forEach(([ox, oy, oz, r]) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 7, 6), fol);
      f.position.set(ox * scale, oy * scale, oz * scale);
      f.castShadow = true;
      g.add(f);
    });
  }
  g.position.set(x, 0, z);
  g.rotation.y = R() * Math.PI * 2;
  return g;
}

function gableHouse({ w = 5, d = 5.6, h = 2.6, wall, roof, windowMat, porch = false, chimney = true, solar = false }) {
  const g = new THREE.Group();
  const wallMat = wall;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // gabled roof: stretched 4-sided "cone" reads as a hip roof at our scale
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.62, 4), roof);
  roofMesh.position.y = h + h * 0.3;
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.scale.set(w >= d ? 1 : w / d, 1, d > w ? 1 : d / w);
  roofMesh.castShadow = true;
  g.add(roofMesh);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.6, 0.08), M({ color: 0x33271c, roughness: 0.8 }));
  door.position.set(0, 0.8, d / 2 + 0.04);
  g.add(door);

  [-w * 0.28, w * 0.28].forEach(wx => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.06), windowMat);
    win.position.set(wx, h * 0.62, d / 2 + 0.03);
    g.add(win);
  });

  if (porch) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.18, 1.4), M({ color: 0x6b5b4a, roughness: 0.9 }));
    slab.position.set(0, 0.09, d / 2 + 0.8);
    g.add(slab);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.1, 1.4), roof);
    canopy.position.set(0, h * 0.82, d / 2 + 0.8);
    g.add(canopy);
    [-w * 0.4, w * 0.4].forEach(px => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h * 0.78, 6), M({ color: 0xd8d2c4, roughness: 0.8 }));
      post.position.set(px, h * 0.42, d / 2 + 1.35);
      g.add(post);
    });
  }
  if (chimney) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.9, 0.5), M({ color: 0x6b4438, roughness: 0.9 }));
    ch.position.set(w * 0.3, h + h * 0.32, -d * 0.2);
    g.add(ch);
    g.userData.chimneyTop = new THREE.Vector3(w * 0.3, h + h * 0.8, -d * 0.2);
  }
  if (solar) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.06, d * 0.45), M({ color: 0x18283a, roughness: 0.3, metalness: 0.5 }));
    panel.position.set(-w * 0.12, h + h * 0.42, d * 0.12);
    panel.rotation.x = -0.18;
    g.add(panel);
  }
  return g;
}

function logCabin() {
  const g = new THREE.Group();
  const logMat = M({ color: 0x6b4e2e, roughness: 0.95 });
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.6, 7), logMat);
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.22 + i * 0.4;
    g.add(log);
    const log2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.8, 7), logMat);
    log2.rotation.x = Math.PI / 2;
    log2.position.y = 0.42 + i * 0.4;
    g.add(log2);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 4), M({ color: 0x4a3a28, roughness: 0.9 }));
  roof.position.y = 2.85;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.chimneyTop = new THREE.Vector3(1.4, 3.2, -0.8);
  return g;
}

// ------------------------------------------------------------- big builders

function buildRiver(era, world) {
  const vis = era.vis;
  const wide = only(era, 'founding', 'boiling', 'returns');
  const width = wide ? 17 : 14;
  const g = new THREE.Group();

  const waterGeo = new THREE.PlaneGeometry(width, 184, 14, 80);
  const waterMat = new THREE.ShaderMaterial({
    ...WaterShader,
    uniforms: THREE.UniformsUtils.clone(WaterShader.uniforms),
    transparent: true,
  });
  waterMat.uniforms.uColorA.value = new THREE.Color(vis.water.a);
  waterMat.uniforms.uColorB.value = new THREE.Color(vis.water.b);
  waterMat.uniforms.uMurk.value = vis.water.murk;
  waterMat.uniforms.uSunDir.value = new THREE.Vector3(0.5, 1, 0.3);
  waterMat.uniforms.uSunColor.value = new THREE.Color('#fff2d8');
  waterMat.uniforms.uFogColor.value = new THREE.Color(vis.fogDay);
  waterMat.uniforms.uFogDensity.value = vis.fogDensity;

  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(GEO.riverX, 0.14, 0);
  water.userData.landmark = 'river';
  g.add(water);
  world.water = { mesh: water, mat: waterMat };
  world.pickLandmarks.push(water);

  // banks
  const bankMat = M({ color: only(era, 'paper') ? 0x4d5244 : 0x3d5232, roughness: 0.95 });
  [-1, 1].forEach(s => {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(5, 184), bankMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(GEO.riverX + s * (width / 2 + 2.4), 0.05, 0);
    bank.receiveShadow = true;
    g.add(bank);
  });

  if (since(era, 'living')) {
    const walkMat = M({ color: only(era, 'returns') ? 0x8f7a55 : 0x6d5940, roughness: 0.82 });
    const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.22, 62), walkMat);
    boardwalk.position.set(GEO.riverX - 9.9, 0.2, -13);
    boardwalk.receiveShadow = true;
    boardwalk.castShadow = true;
    boardwalk.userData.phase2 = 'riverwalk';
    g.add(boardwalk);

    // Board seams keep it feeling hand-built, not poured.
    for (let z = -42; z <= 16; z += 4) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.04, 0.045), M({ color: 0x3d3327, roughness: 0.9 }));
      seam.position.set(GEO.riverX - 9.9, 0.34, z);
      g.add(seam);
    }

    const railMat = M({ color: 0x3f493b, roughness: 0.72, metalness: 0.15 });
    [GEO.riverX - 8.65, GEO.riverX - 11.15].forEach(x => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 62), railMat);
      rail.position.set(x, 0.95, -13);
      g.add(rail);
      for (let z = -42; z <= 16; z += 6) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.95, 0.13), railMat);
        post.position.set(x, 0.58, z);
        g.add(post);
      }
    });

    [-36, -22, -8, 8].forEach((z, i) => {
      g.add(makeBench(GEO.riverX - 12.15, z, Math.PI / 2, i % 2 ? 0x5a5148 : 0x4a4540));
    });

    [-30, -2].forEach(z => {
      const overlook = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.24, 16, 1, false, Math.PI * 0.5, Math.PI), walkMat);
      overlook.position.set(GEO.riverX - 9.2, 0.23, z);
      overlook.rotation.y = 0;
      overlook.userData.phase2 = 'riverwalk-overlook';
      g.add(overlook);
    });
  }

  // sandbars in the wild past and the rewilded future
  if (only(era, 'returns', 'boiling', 'founding')) {
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.CircleGeometry(rand(1.6, 3), 10), M({ color: 0xcbb992, roughness: 1 }));
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(GEO.riverX + rand(-4, 4), 0.18, -70 + i * 42 + rand(-6, 6));
      g.add(bar);
      if (i === 1) {
        // a heron, standing committee of one
        const heron = new THREE.Group();
        const bodyM = M({ color: 0xb9c4c9, roughness: 0.7 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 7), bodyM);
        body.scale.set(1, 0.9, 1.5);
        body.position.y = 0.85;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), bodyM);
        neck.position.set(0, 1.25, 0.3);
        neck.rotation.x = 0.3;
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 4), M({ color: 0x4a4438 }));
        legs.position.y = 0.42;
        heron.add(body, neck, legs);
        heron.position.copy(bar.position).setY(0.2);
        g.add(heron);
      }
    }
    // sturgeon shadow (1831 & 2050 — the same patience, bookending): a long
    // dark shape under the surface
    if (only(era, 'returns', 'founding')) {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 12),
        new THREE.MeshBasicMaterial({ color: 0x07181c, transparent: true, opacity: 0.4 })
      );
      shadow.scale.set(1, 2.6, 1);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(GEO.riverX, 0.1, 20);
      g.add(shadow);
      world.sturgeon = shadow;
    }
  }

  // drifting things
  world.drifters = [];
  if (vis.water.drift === 'logs') {
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, rand(3, 5), 7), M({ color: 0x5b432a, roughness: 0.9 }));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = rand(-0.3, 0.3);
      log.position.set(GEO.riverX + rand(-4, 4), 0.22, rand(-85, 85));
      g.add(log);
      world.drifters.push({ mesh: log, speed: rand(1.0, 1.8) });
    }
  } else if (vis.water.drift === 'foam') {
    for (let i = 0; i < 6; i++) {
      const foam = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 1.3), 8),
        new THREE.MeshBasicMaterial({ color: 0xb9b4a4, transparent: true, opacity: 0.45 }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(GEO.riverX + rand(-5, 5), 0.2, rand(-85, 85));
      g.add(foam);
      world.drifters.push({ mesh: foam, speed: rand(0.8, 1.4) });
    }
  } else if (vis.water.drift === 'lily') {
    for (let i = 0; i < 10; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.3, 0.6), 8), M({ color: 0x2e6b3d, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(GEO.riverX + rand(-6.5, 6.5), 0.2, rand(-80, 80));
      g.add(pad);
      world.drifters.push({ mesh: pad, speed: rand(0.1, 0.25) });
    }
  }

  // bridge at Michigan Ave (z = 10) — every era rebuilds it
  const bridge = new THREE.Group();
  bridge.userData.landmark = 'bridge';
  const bw = width + 8;
  let deckMat, deck;
  if (only(era, 'founding')) {
    // 1831: no bridge yet — the ford. Stepping stones, knee-deep water, and
    // an invisible deck so the crossing still answers when clicked.
    deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.1, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
    const stoneMat = M({ color: 0xb3a584, roughness: 1 });
    for (let i = 0; i < 8; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.32, 0.55), rand(0.4, 0.68), 0.3, 7), stoneMat);
      stone.position.set(-bw / 2 + (i + 0.5) * (bw / 8), 0.12, rand(-1.1, 1.1));
      stone.rotation.y = R() * Math.PI;
      bridge.add(stone);
    }
  } else if (only(era, 'boiling')) {
    deckMat = M({ color: 0x6b4e2e, roughness: 0.95 });
    deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.5, 5.4), deckMat);
    for (let i = -2; i <= 2; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), deckMat);
      post.position.set(i * (bw / 5), 1.0, 2.5);
      bridge.add(post);
      const post2 = post.clone(); post2.position.z = -2.5;
      bridge.add(post2);
    }
  } else if (only(era, 'celery')) {
    deckMat = M({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
    deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.55, 6.2), deckMat);
    for (let s = -1; s <= 1; s += 2) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.7, 0.16), deckMat);
      truss.position.set(0, 1.6, s * 3.0);
      bridge.add(truss);
    }
  } else {
    deckMat = M({ color: 0x787d82, roughness: 0.8 });
    deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.7, only(era, 'mall', 'paper') ? 8 : 6.6), deckMat);
    [-1, 1].forEach(s => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.5, 0.14), M({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.4 }));
      rail.position.set(0, 1.0, s * (deck.geometry.parameters.depth / 2 - 0.1));
      bridge.add(rail);
    });
    if (since(era, 'living')) {
      // overlook bumps — the city looks at the water again
      [-1, 1].forEach(s => {
        const look = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.7, 10, 1, false, 0, Math.PI), deckMat);
        look.position.set(0, 0.35, s * 4.2);
        look.rotation.y = s > 0 ? 0 : Math.PI;
        bridge.add(look);
      });
    }
  }
  deck.position.y = 0.85;
  deck.castShadow = true; deck.receiveShadow = true;
  bridge.add(deck);
  bridge.position.set(GEO.riverX, 0, GEO.michiganZ);
  g.add(bridge);
  world.pickLandmarks.push(bridge);
  // The bridge carries Michigan Ave across the water — it's meant to be driven
  // on, so it registers no wall. Pedestrians are held back by the river band.

  return g;
}

function buildRoads(era, world) {
  const g = new THREE.Group();
  const roadMat = M({ color: era.vis.road, roughness: 0.95 });
  const dirtMat = M({ color: 0x5d4f37, roughness: 1 });
  const frontier = only(era, 'founding', 'boiling');
  const mat = frontier ? dirtMat : roadMat;

  const mkRoad = (w, l, x, z, rot = 0) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = rot;
    r.position.set(x, 0.02, z);
    r.receiveShadow = true;
    g.add(r);
  };

  // ---- the street grid (survey-true; see the geo.js PLACES transform).
  // N–S streets run in z; E–W streets run in x. The five MAIN streets exist from
  // the frontier on; the rest of the named grid fills in once the city is platted.
  const nsZ0 = -48, nsZ1 = 84;     // N–S streets run well north — past the rail to
                                   // North St, Parsons St, and the factory blocks
  const ewX0 = -58, ewX1 = 26;     // E–W streets stop just west of the river water
  const drawNS = (x, w) => mkRoad(w, nsZ1 - nsZ0, x, (nsZ0 + nsZ1) / 2);
  const drawEW = (z, w, x0 = ewX0, x1 = ewX1) => mkRoad(x1 - x0, w, (x0 + x1) / 2, z, Math.PI / 2);

  // Street "dressing" — flat asphalt alone vanished into the lawn at the low
  // north-up angle (you could only pick out the brick Mall and the bridge).
  // Raised light curbs catch the sun even edge-on, so the whole grid reads like a
  // map; painted center lines mark the through-streets. Frontier roads are dirt:
  // wagon ruts instead of curbs and paint.
  const curbMat = M({ color: 0xbcb6a7, roughness: 0.9 });
  const lineMat = M({ color: 0xd9bb52, roughness: 0.75 });
  const rutMat = M({ color: 0x4a3d29, roughness: 1 });
  const nsLen = nsZ1 - nsZ0, nsMid = (nsZ0 + nsZ1) / 2;
  const dressNS = (x, w, line) => {
    if (frontier) {
      [-1.2, 1.2].forEach(s => {
        const rut = new THREE.Mesh(new THREE.PlaneGeometry(0.5, nsLen), rutMat);
        rut.rotation.x = -Math.PI / 2; rut.position.set(x + s, 0.03, nsMid); g.add(rut);
      });
      return;
    }
    [-1, 1].forEach(s => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, nsLen), curbMat);
      c.position.set(x + s * (w / 2 + 0.2), 0.11, nsMid);
      c.castShadow = c.receiveShadow = true; g.add(c);
    });
    if (line) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.24, nsLen), lineMat);
      l.rotation.x = -Math.PI / 2; l.position.set(x, 0.05, nsMid); g.add(l);
    }
  };
  const dressEW = (z, w, line, x0 = ewX0, x1 = ewX1) => {
    const xlen = x1 - x0, mx = (x0 + x1) / 2;
    if (frontier) {
      [-1.2, 1.2].forEach(s => {
        const rut = new THREE.Mesh(new THREE.PlaneGeometry(xlen, 0.5), rutMat);
        rut.rotation.x = -Math.PI / 2; rut.position.set(mx, 0.03, z + s); g.add(rut);
      });
      return;
    }
    [-1, 1].forEach(s => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(xlen, 0.22, 0.4), curbMat);
      c.position.set(mx, 0.11, z + s * (w / 2 + 0.2));
      c.castShadow = c.receiveShadow = true; g.add(c);
    });
    if (line) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(xlen, 0.24), lineMat);
      l.rotation.x = -Math.PI / 2; l.position.set(mx, 0.05, z); g.add(l);
    }
  };

  // N–S: West→East   |   E–W: South→North — read from the shared STREETS grid
  // (geo.js), so the roads and the landmark anchors can never drift apart.
  const S = STREETS;
  const mainNS = [['BURDICK', S.ns.burdick, 7], ['ROSE', S.ns.rose, 6]];
  const mainEW = [['MICHIGAN', S.ew.michigan, 7], ['SOUTH', S.ew.south, 6]];
  const gridNS = [['OAKLAND', S.ns.oakland, 5], ['WESTNEDGE', S.ns.westnedge, 6], ['PARK', S.ns.park, 5]];
  const gridEW = [['PARSONS', S.ew.parsons, 5], ['NORTH', S.ew.north, 5], ['KALAMAZOO', S.ew.kalamazoo, 6], ['LOVELL', S.ew.lovell, 6], ['VINE', S.ew.vine, 5]];

  mainNS.forEach(([name, x, w]) => {
    drawNS(x, w);
    // Burdick becomes the pedestrian Mall in 1959+ — its brick paving dresses it
    // (no curbs or traffic line there); before that it's a real driving street.
    if (name === 'BURDICK' && since(era, 'mall')) return;
    dressNS(x, w, true);
  });
  drawEW(GEO.michiganZ, 7, -58, 42);   // Michigan alone crosses the river, on the bridge deck
  dressEW(GEO.michiganZ, 7, true, -58, 42);
  drawEW(GEO.southZ, 6);
  dressEW(GEO.southZ, 6, true);
  if (!frontier) {
    gridNS.forEach(([, x, w]) => { drawNS(x, w); dressNS(x, w, false); });
    gridEW.forEach(([, z, w]) => { drawEW(z, w); dressEW(z, w, false); });

    // Pitcher & Portage: the east streets between Burdick and the river. They run
    // only north of E. Michigan (the Mall and the State own the blocks to the
    // south), so the east edge finally reads river → Portage → Pitcher → Burdick.
    const ez0 = GEO.michiganZ - 2, ez1 = STREETS.ew.parsons + 2;
    const ezLen = ez1 - ez0, ezMid = (ez0 + ez1) / 2;
    [['PITCHER', S.ns.pitcher, 5], ['PORTAGE', S.ns.portage, 5]].forEach(([name, x, w]) => {
      mkRoad(w, ezLen, x, ezMid);
      [-1, 1].forEach(s => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, ezLen), curbMat);
        c.position.set(x + s * (w / 2 + 0.2), 0.11, ezMid);
        c.castShadow = c.receiveShadow = true; g.add(c);
      });
      g.add(makeStreetSign(name, x + 0.9, GEO.michiganZ + 3.6, 0, 'ST'));
    });
  }

  // 1831: the portage trail is still a working road — by 1855 it is already
  // an echo (buildEchoes draws the ghost of this exact line).
  if (only(era, 'founding')) {
    const from = { x: -30, z: -30 }, to = { x: 30, z: 8 };   // headed for the east ford
    const dx = to.x - from.x, dz = to.z - from.z;
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(1.4, Math.hypot(dx, dz)), M({ color: 0x6b5a3e, roughness: 1 }));
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = Math.atan2(-dx, -dz);
    trail.position.set((from.x + to.x) / 2, 0.025, (from.z + to.z) / 2);
    trail.receiveShadow = true;
    g.add(trail);
  }

  // sidewalks along Burdick + Michigan
  if (!frontier) {
    const walkMat = M({ color: 0x8d887c, roughness: 0.9 });
    [-4.4, 4.4].forEach(s => {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 104), walkMat);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(s, 0.03, 4);
      sw.receiveShadow = true;
      g.add(sw);
    });
  }

  // every platted street gets a blade: N–S names line Michigan Ave, E–W names
  // line Burdick — the city saying its own grid out loud.
  if (!frontier) {
    [...mainNS, ...gridNS].forEach(([name, x]) =>
      g.add(makeStreetSign(name, x + 0.9, GEO.michiganZ + 3.6, 0, 'ST')));
    [...mainEW, ...gridEW].forEach(([name, z]) =>
      g.add(makeStreetSign(name, GEO.burdickX + 3.6, z + 0.9, Math.PI / 2, name === 'MICHIGAN' ? 'AVE' : 'ST')));
  }

  // The Kalamazoo Mall: Burdick z -24..6, pedestrian from 1959 on
  if (since(era, 'mall')) {
    const pavTex = brickTex(only(era, 'returns') ? '#9a8f78' : '#9b8a74', '#6f6354', 16);
    const paving = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 30),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavTex, roughness: 0.85 })
    );
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(0, 0.045, -9);
    paving.receiveShadow = true;
    paving.userData.landmark = 'burdick';
    g.add(paving);
    world.pickLandmarks.push(paving);

    // planters & benches
    const planterMat = M({ color: 0x7a756a, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const z = -22 + i * 6.4;
      const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.6, 10), planterMat);
      planter.position.set(i % 2 === 0 ? -2.4 : 2.4, 0.3, z);
      planter.castShadow = true;
      g.add(planter);
      block(world, planter.position.x, z, 2.1, 2.1);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), M({ color: pick(era.vis.foliage), roughness: 0.9 }));
      bush.position.set(planter.position.x, 0.95, z);
      bush.castShadow = true;
      g.add(bush);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.55), M({ color: 0x4a4540, roughness: 0.85 }));
      bench.position.set(i % 2 === 0 ? 2.2 : -2.2, 0.22, z + 2.6);
      bench.castShadow = true;
      g.add(bench);
    }

    // market stalls in 2050's linear commons
    if (only(era, 'returns')) {
      for (let i = 0; i < 3; i++) {
        const stall = new THREE.Group();
        const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 4),
          M({ color: [0xc26d3a, 0x3a8a6b, 0xb8a23a][i], roughness: 0.8 }));
        top.position.y = 2.3;
        top.rotation.y = Math.PI / 4;
        const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.1), M({ color: 0x6b5b44, roughness: 0.9 }));
        table.position.y = 0.4;
        [-0.9, 0.9].forEach(px => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5), M({ color: 0x4a4438 }));
          pole.position.set(px, 1.0, 0);
          stall.add(pole);
        });
        stall.add(top, table);
        stall.position.set(i % 2 === 0 ? -2 : 2, 0, -18 + i * 8);
        stall.rotation.y = rand(-0.3, 0.3);
        stall.traverse(o => { if (o.isMesh) o.castShadow = true; });
        g.add(stall);
      }
    }
  } else {
    // pre-mall Burdick is just street — make it clickable for the story anyway
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(7, 30), new THREE.MeshBasicMaterial({ visible: false }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.06, -9);
    strip.userData.landmark = 'burdick';
    g.add(strip);
    world.pickLandmarks.push(strip);
  }

  return g;
}

function buildStorefronts(era, world) {
  const g = new THREE.Group();
  const SIGNS = {
    founding: ['BRONSON HOUSE', 'BURDICK & CO', 'KINGSBURY DRY GOODS', 'SMITHY', 'POST & TRADE'],
    boiling: ['GENERAL STORE', 'LAND OFFICE', 'KALAMAZOO HOUSE', 'TELEGRAPH', 'HARNESS'],
    celery: ['GILMORE BROS.', 'DRY GOODS', 'OAKLAND PHARMACY', 'MILLINERY', 'GAZETTE', 'CORSETS', 'HARDWARE'],
    mall: ['GILMORE BROTHERS', 'S.S. KRESGE', 'WOOLWORTH', 'SHOES', 'RECORDS', 'LUNCH', 'CAMERA SHOP'],
    seventies: ['PLANET CLAIRE', 'GAZETTE', 'UPJOHN', 'HEAD SHOP', 'LUNCH', 'CAMERA SHOP', 'BOOKS'],
    paper: ['FOR LEASE', 'GILMORE BROTHERS', 'CLUB SODA', 'DINER', 'RESALE', 'TV REPAIR', 'PAWN'],
    nineties: ['FLIPSIDE', 'CLUB SODA', 'PLANET CLAIRE', 'COFFEE', 'ZINES', 'USED CDS', 'TATTOO'],
    living: ['WATER STREET COFFEE', 'GAZELLE SPORTS', 'SHAWARMA KING', 'BIKE SHOP', 'KIA GALLERY', 'BOOKBUG', "BELL'S TAPROOM"],
    returns: ['SEED LIBRARY', 'RIVER OUTFITTERS', 'REPAIR CAFE', 'BAKERY', 'STUDIO', 'MARKET HALL', 'TOOL SHARE'],
  };
  const signs = SIGNS[era.key];
  let signIdx = 0;

  const wood = only(era, 'founding', 'boiling');
  const brickPalettes = {
    founding: ['#9b8a68', '#8a7656', '#a8956e'],
    boiling: ['#a8916b', '#8f7a58', '#b5a079'],
    celery: ['#7d4030', '#8a5a3a', '#6b4438', '#96604a'],
    mall: ['#8a5a3a', '#9b8a74', '#7d4030', '#a89a85'],
    seventies: ['#7a5a3d', '#8a6a4a', '#6e5648', '#9b8a74'],
    paper: ['#6e5648', '#5c5048', '#7d6a58', '#665043'],
    nineties: ['#5c5048', '#6e5648', '#7d4030', '#3f4650'],
    living: ['#8a5a3a', '#7d4030', '#9b8a74', '#b08968'],
    returns: ['#8a5a3a', '#9b8a74', '#a8916b', '#7d6a58'],
  };
  const palette = brickPalettes[era.key];

  // Each row: faceX = x of the street-facing wall; facing = +1 faces +x, -1 faces -x.
  // Buildings run along z; width bw is the z-extent, depth bd the x-extent.
  // West rows stay shallow: the block between Burdick and Rose St is only
  // ~5.8 deep, and deeper backs used to sit in the street the cars drive.
  // The Mall's middle block (z -16..-4) is left open on BOTH sides for the two
  // landmarks that flank it: the Gazette to the west, the State Theatre to the
  // east. The generic storefronts fill the rest of the frontage, never the Mall.
  const rows = [
    { faceX: -5.4, facing: 1, from: -24, to: -16, depth: [4.6, 5.4] },   // gap for the Gazette
    { faceX: -5.4, facing: 1, from: -4, to: 4, depth: [4.6, 5.4] },
    { faceX: 5.4, facing: -1, from: -22, to: -16 },                      // gap for the State
    { faceX: 5.4, facing: -1, from: -4, to: 6 },
  ];
  // North of Michigan: the west side keeps shops (Mission caps the block);
  // the east side belongs to the hotel / Flipside / Rickman cluster.
  if (!wood) rows.push({ faceX: -5.4, facing: 1, from: 14, to: 28, depth: [4.6, 5.4] });

  rows.forEach(row => {
    let z = row.from;
    while (z < row.to) {
      const bw = rand(5.2, 7.2);
      if (z + bw > row.to + 2.5) break;
      const floors = wood ? 1 : (R() < 0.4 ? 3 : 2);
      const bh = wood ? rand(3.4, 4.2) : 3.1 * floors + 0.8;
      const bd = row.depth ? rand(row.depth[0], row.depth[1]) : rand(7, 9);
      const base = pick(palette);
      const cx = row.faceX - row.facing * (bd / 2);   // body center x
      const cz = z + bw / 2;                          // body center z
      const wallX = row.faceX + row.facing * 0.05;    // just proud of the wall

      const bld = new THREE.Group();
      const bTex = wood ? null : brickTex(base, shade(base, -36), 14);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: bTex ? 0xffffff : new THREE.Color(base),
        map: bTex, roughness: 0.88,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, bw - 0.35), bodyMat);
      body.position.set(cx, bh / 2, cz);
      body.castShadow = true; body.receiveShadow = true;
      bld.add(body);
      block(world, cx, cz, bd, bw - 0.35);

      // cornice
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(bd + 0.25, 0.35, bw - 0.2), M({ color: shade(base, -50), roughness: 0.8 }));
      cornice.position.set(cx, bh + 0.12, cz);
      bld.add(cornice);

      if (wood) {
        // frontier false front
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.25, bh * 0.4, bw - 0.3), M({ color: shade(base, 18), roughness: 0.9 }));
        front.position.set(row.faceX - row.facing * 0.1, bh + bh * 0.18, cz);
        bld.add(front);
      }

      // windows (upper floors) share one glowable material per building
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x2c3844, roughness: 0.25, metalness: 0.2,
        emissive: new THREE.Color(era.vis.lamp || '#ffd9a0'), emissiveIntensity: 0,
      });
      const boarded = ['paper', 'nineties'].includes(era.key) && R() < (era.key === 'paper' ? 0.34 : 0.18);
      if (!boarded) world.windowMats.push(winMat);
      const paneMat = boarded ? M({ color: 0x7a6a4e, roughness: 0.95 }) : winMat;

      for (let f = 1; f < floors; f++) {
        const wins = Math.max(2, Math.floor(bw / 1.9));
        for (let wcol = 0; wcol < wins; wcol++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.85), paneMat);
          const zz = cz + (wcol - (wins - 1) / 2) * (bw / (wins + 0.4));
          win.position.set(wallX, f * 3.1 + 0.7, zz);
          bld.add(win);
        }
      }

      // ground floor: storefront glass + sign + awning
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, bw * 0.7), paneMat);
      glass.position.set(wallX, 1.15, cz);
      bld.add(glass);

      const signText = signs[signIdx++ % signs.length];
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.85, bw * 0.74),
        new THREE.MeshStandardMaterial({
          map: signTex(signText, { bg: boarded ? '#4a4438' : shade(base, -58) }),
          color: 0xffffff, roughness: 0.7,
        })
      );
      sign.position.set(wallX + row.facing * 0.07, 2.55, cz);
      bld.add(sign);

      if (!boarded && (only(era, 'mall', 'seventies', 'nineties', 'living', 'returns') || (era.key === 'celery' && R() < 0.6))) {
        const awnColors = era.key === 'mall' ? [0xc23a3a, 0x2f6b8a, 0x3a8a5c, 0xc28a2f] : [0x735c44, 0x5c6b58, 0x6b5544];
        const awn = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, bw * 0.72), M({ color: pick(awnColors), roughness: 0.85 }));
        awn.position.set(row.faceX + row.facing * 0.62, 2.1, cz);
        awn.rotation.z = -row.facing * 0.22;
        awn.castShadow = true;
        bld.add(awn);
      }

      // mural on a 2026 end wall
      if (era.key === 'living' && R() < 0.18) {
        const mural = new THREE.Mesh(
          new THREE.PlaneGeometry(bd * 0.7, bh * 0.62),
          new THREE.MeshStandardMaterial({ map: muralTex(), color: 0xffffff, roughness: 0.9 })
        );
        mural.position.set(cx, bh * 0.45, cz + (bw - 0.35) / 2 + 0.03);
        bld.add(mural);
      }

      g.add(bld);
      // 1831 is a handful of raw frame buildings with grass between them;
      // 1855 is a wooden street; everything after is a brick wall of fronts.
      z += bw + (only(era, 'founding') ? rand(5, 10) : wood ? rand(0.8, 2.2) : 0.15);
    }
  });


  if (since(era, 'paper')) {
    // A little 1970s massing honesty: downtown is not only fine-grained brick.
    const slab = new THREE.Group();
    slab.userData.phase2 = 'office-slab';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 21, 9.4),
      M({ color: only(era, 'paper', 'nineties') ? 0x6e746f : 0x7b827d, roughness: 0.72, metalness: 0.12 })
    );
    body.position.set(14.2, 10.5, 1.8);   // flush to Michigan Ave, the core's tall anchor
    body.castShadow = true;
    body.receiveShadow = true;
    slab.add(body);
    block(world, 14.2, 1.8, 7.2, 9.4);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x385060, roughness: 0.2, metalness: 0.25, emissive: new THREE.Color(era.vis.lamp || '#ffd9a0'), emissiveIntensity: 0 });
    world.windowMats.push(glassMat);
    for (let floor = 0; floor < 7; floor++) {
      for (let col = -1; col <= 1; col++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 1.25), glassMat);
        win.position.set(10.55, 2.0 + floor * 2.65, 1.8 + col * 2.45);
        slab.add(win);
      }
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.55, 9.8), M({ color: 0x424744, roughness: 0.8 }));
    crown.position.set(14.2, 21.25, 1.8);
    slab.add(crown);
    g.add(slab);
  }

  return g;
}

function buildTheatre(era, world) {
  if (!since(era, 'mall')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'theatre';
  const base = '#8a5a3a';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 11, 9),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -40), 18), color: 0xffffff, roughness: 0.85 })
  );
  body.position.y = 5.5;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // vertical STATE blade sign
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 6.5, 1.4),
    new THREE.MeshStandardMaterial({
      map: canvasTex(128, 512, (ctx, w, h) => {
        ctx.fillStyle = '#7c1f1f'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffe9b8';
        ctx.font = 'bold 86px Georgia';
        ctx.textAlign = 'center';
        const letters = 'STATE';
        for (let i = 0; i < letters.length; i++) ctx.fillText(letters[i], w / 2, 92 + i * 92);
      }),
      color: 0xffffff,
      emissive: new THREE.Color('#ff9e5e'), emissiveIntensity: 0,
      roughness: 0.6,
    })
  );
  blade.position.set(-4.1, 8.6, 2.2);
  if (blade.material.map) blade.material.map.userData.isText = true;
  g.add(blade);
  world.marqueeMats.push(blade.material);

  // marquee: wide along the facade (z), overhanging the sidewalk (x)
  const marq = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.3, 5.8),
    new THREE.MeshStandardMaterial({
      map: signTex(era.key === 'living' ? 'WELCOME' : (era.key === 'paper' ? 'OPEN — STILL' : (era.key === 'nineties' ? 'BANDS' : 'TONIGHT')), { bg: '#26201a', fg: '#ffe9b8', font: 'bold 56px Georgia' }),
      color: 0xffffff, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0, roughness: 0.5,
    })
  );
  marq.position.set(-4.0, 4.3, -1.2);
  g.add(marq);
  world.marqueeMats.push(marq.material);
  if (['paper', 'nineties'].includes(era.key)) {
    // the lighting pass reads this flag and makes them stutter at night
    marq.material.userData.flicker = true;
    blade.material.userData.flicker = true;
  }

  // sits in the gap left in the east storefront row; blade & marquee are on
  // the local -x side, so the front faces the Mall to the west
  g.position.set(PLACES.theatre.x, 0, PLACES.theatre.z);
  block(world, PLACES.theatre.x, PLACES.theatre.z, 7.5, 9);
  world.pickLandmarks.push(g);
  return g;
}


function buildGazette(era, world) {
  if (!since(era, 'mall') || era.key === 'returns') return null;
  const g = new THREE.Group();
  g.userData.landmark = 'gazette';
  // flanks the west side of the Mall, narrowed to fit the shallow block between
  // Rose St and the Mall sidewalk — its back wall clears the street, its press
  // window faces the State across the bricks.
  const { x: cx, z: cz } = PLACES.gazette;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 8.8, 8.8),
    new THREE.MeshStandardMaterial({ map: brickTex('#8f7b61', '#5f5243', 16), color: 0xffffff, roughness: 0.86 })
  );
  body.position.set(cx, 4.4, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, 5.4, 8.8);
  const press = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.0, 5.2), M({ color: 0x2a2d31, roughness: 0.65, metalness: 0.25 }));
  press.position.set(cx - 0.2, 1.15, cz + 0.6);
  press.userData.phase2 = 'gazette-press';
  g.add(press);
  const facade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 6.6), new THREE.MeshStandardMaterial({ map: signTex('KALAMAZOO GAZETTE', { bg: '#2e2a24', fg: '#eadfcf', font: 'bold 38px Georgia' }), color: 0xffffff, roughness: 0.7 }));
  facade.position.set(cx + 2.77, 5.6, cz);
  g.add(facade);
  const reliefMat = M({ color: 0xd7c7a8, roughness: 0.75 });
  [-2.5, 2.5].forEach(dz => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.6, 0.42), reliefMat);
    pil.position.set(cx + 2.83, 3.3, cz + dz);
    g.add(pil);
  });
  world.pickLandmarks.push(g);
  return g;
}

function buildNightlifeAndShops(era, world) {
  if (!since(era, 'seventies') || era.key === 'returns') return null;
  const g = new THREE.Group();
  const makeVenue = ({ key, label, sub, x, z, w = 5.8, d = 5.2, h = 4.2, color = '#6e5648', neon = '#ff6bd6' }) => {
    const v = new THREE.Group();
    v.userData.landmark = key;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: brickTex(color, shade(color, -34), 10), color: 0xffffff, roughness: 0.9 }));
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    v.add(body);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.9, 0.12), new THREE.MeshStandardMaterial({
      map: signTex(label, { bg: '#17131d', fg: neon, font: 'bold 44px Georgia', sub }),
      color: 0xffffff, emissive: new THREE.Color(neon), emissiveIntensity: 0, roughness: 0.42,
    }));
    sign.position.set(0, h - 0.85, -d / 2 - 0.08);
    v.add(sign);
    world.marqueeMats.push(sign.material);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.12), M({ color: 0x24272b, roughness: 0.55 }));
    door.position.set(-w * 0.25, 1.0, -d / 2 - 0.09);
    v.add(door);
    v.position.set(x, 0, z);
    block(world, x, z, w, d);
    world.pickLandmarks.push(v);
    g.add(v);
    return v;
  };

  // 1 Main is compressed to the Michigan/Main edge of the model, near the
  // bridge — west of Rose St, off the avenue itself, facing the corner. Club
  // Soda's real run is the 1970s–'90s; it does not glow on into the living eras.
  if (only(era, 'seventies', 'paper', 'nineties')) {
    makeVenue({ key: 'clubsoda', label: 'CLUB SODA', sub: '1 MAIN', x: PLACES.clubsoda.x, z: PLACES.clubsoda.z, w: 6.2, d: 5.4, h: 4.8, color: '#4b3b45', neon: '#7de3ff' });
  }
  if (only(era, 'paper', 'nineties')) {
    // Open since 1977, the compass for taste; the 1990 move set it at 309 N.
    // Burdick. Here it fronts the eastern Kalamazoo-St block near the river's
    // west bank. Gone from the scene by the living eras.
    makeVenue({
      key: 'flipside', label: 'FLIPSIDE',
      sub: era.key === 'nineties' ? '309 N. BURDICK' : 'RECORDS • N. BURDICK',
      x: PLACES.flipside.x, z: PLACES.flipside.z, w: 6.8, d: 5.8, h: 4.4, color: '#5a4638', neon: '#ffd24d',
    });
  }
  if (only(era, 'seventies', 'paper', 'nineties')) {
    makeVenue({ key: 'planetclaire', label: 'PLANET CLAIRE', sub: 'imports • candles • oddities', x: PLACES.planetclaire.x, z: PLACES.planetclaire.z, w: 6.0, d: 5.0, h: 4.1, color: '#4b3d5c', neon: '#e68cff' });
  }
  return g;
}

function buildNorthwestUnit(era, world) {
  // Opens in 1954 as the Southwestern Michigan Tuberculosis Sanatorium, so it
  // already stands in 1959 (mall); becomes the KPH Northwest Unit; closes 1990;
  // gone by the living eras.
  if (!since(era, 'mall') || since(era, 'living')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'northwest';
  const { x: cx, z: cz } = PLACES.northwest;
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(12, 24), M({ color: 0x4d5a3d, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, 0.08, cz);
  g.add(lawn);
  const tb = era.key === 'mall';
  const vacant = era.key === 'nineties';
  const body = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 6), M({ color: vacant ? 0x68665f : 0xd6d2c3, roughness: 0.82 }));
  body.position.set(cx, 4.0, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.6, 12), M({ color: vacant ? 0x5b5a54 : 0xc8c3b6, roughness: 0.85 }));
  wing.position.set(cx + 8.2, 2.8, cz);
  wing.castShadow = true; wing.receiveShadow = true;
  g.add(wing);
  block(world, cx, cz, 16, 6);
  block(world, cx + 8.2, cz, 5.2, 12);
  const winMat = M({ color: vacant ? 0x1f2428 : 0x557286, roughness: 0.35 });
  for (let floor = 0; floor < 3; floor++) for (let col = -3; col <= 3; col++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.72), winMat);
    win.position.set(cx - 8.05, 2.0 + floor * 1.8, cz + col * 0.78);
    g.add(win);
  }
  if (vacant) {
    const fence = new THREE.Mesh(new THREE.CylinderGeometry(12.8, 12.8, 1.4, 24, 1, true), M({ color: 0x9aa0a0, roughness: 0.6, metalness: 0.35, transparent: true, opacity: 0.36, side: THREE.DoubleSide }));
    fence.position.set(cx, 0.7, cz);
    g.add(fence);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.0, 0.1), new THREE.MeshStandardMaterial({ map: signTex(tb ? 'TB SANATORIUM' : (vacant ? 'NORTHWEST UNIT' : 'KPH NORTHWEST'), { bg: '#26342d', fg: '#e8e3d8', font: 'bold 36px Georgia', sub: tb ? 'SW MICHIGAN • 1954' : (vacant ? 'CLOSED 1990' : 'BLAKESLEE AVE') }), color: 0xffffff }));
  sign.position.set(cx, 1.3, cz + 8.2);
  g.add(sign);
  world.pickLandmarks.push(g);
  return g;
}

function buildUpjohn(era, world) {
  if (!since(era, 'celery') || era.key === 'returns') return null;
  const g = new THREE.Group();
  g.userData.landmark = 'upjohn';
  const { x: cx, z: cz } = PLACES.upjohn;   // 301 John St / the Portage works, south of downtown
  const modern = since(era, 'mall');
  const body = new THREE.Mesh(new THREE.BoxGeometry(modern ? 13 : 7, modern ? 7 : 4.6, modern ? 7 : 5), new THREE.MeshStandardMaterial({ map: brickTex(modern ? '#9a856f' : '#8a5a3a', modern ? '#6f6354' : '#5f3a2e', 12), color: 0xffffff, roughness: 0.86 }));
  body.position.set(cx, (modern ? 7 : 4.6) / 2, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, modern ? 13 : 7, modern ? 7 : 5);
  if (modern) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 13, 4.4), M({ color: 0xc9bea8, roughness: 0.72 }));
    tower.position.set(cx + 4.8, 6.5, cz + 1.4);
    tower.castShadow = true;
    g.add(tower);
    block(world, cx + 4.8, cz + 1.4, 4.4, 4.4);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.1, 0.12), new THREE.MeshStandardMaterial({ map: signTex(since(era, 'nineties') ? 'PHARMACIA & UPJOHN' : 'UPJOHN', { bg: '#efe8dc', fg: '#2d3942', font: 'bold 42px Georgia', sub: modern ? 'research • patents • pills' : 'friable pills' }), color: 0xffffff }));
  sign.position.set(cx, modern ? 3.2 : 2.6, cz - (modern ? 3.58 : 2.58));
  g.add(sign);
  world.pickLandmarks.push(g);
  return g;
}

function buildMillSite(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'mill';
  const pos = new THREE.Vector3(PLACES.mill.x, 0, PLACES.mill.z);

  if (only(era, 'founding')) {
    // 1831: the millwright's timber frame rising on the race Titus reserved —
    // the village's heartbeat, not yet beating
    const timberMat = M({ color: 0xb89e6e, roughness: 0.95 });
    [[-2.6, 0], [2.6, 0], [-2.6, -2.4], [2.6, -2.4]].forEach(([ox, oz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), timberMat);
      post.position.set(pos.x + ox, 2.1, pos.z + oz);
      post.castShadow = true;
      g.add(post);
    });
    [0, -2.4].forEach(oz => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.28, 0.28), timberMat);
      beam.position.set(pos.x, 4.2, pos.z + oz);
      g.add(beam);
    });
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 3.2), timberMat);
    rafter.position.set(pos.x - 2.6, 4.35, pos.z - 1.2);
    g.add(rafter);
    // the millstones, delivered, waiting in the grass
    for (let i = 0; i < 2; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.32, 14), M({ color: 0x9a958a, roughness: 0.9 }));
      stone.position.set(pos.x + 4.6, 0.18 + i * 0.34, pos.z + 2.4);
      stone.rotation.y = i * 0.5;
      stone.castShadow = true;
      g.add(stone);
    }
    // a log pile: the rest of the building, horizontal for now
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, rand(3.4, 4.4), 7), M({ color: 0x6b4e2e, roughness: 0.95 }));
      log.rotation.z = Math.PI / 2;
      log.position.set(pos.x - 1 + rand(-0.6, 0.6), 0.22 + Math.floor(i / 2) * 0.38, pos.z + 3.6 + (i % 2) * 0.5);
      g.add(log);
    }
    block(world, pos.x, pos.z - 1.2, 6.4, 3.6);
  } else if (only(era, 'boiling')) {
    const mill = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 5.5, 6), M({ color: 0x7a6243, roughness: 0.9 }));
    body.position.y = 2.75;
    body.castShadow = true;
    mill.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2.4, 4), M({ color: 0x4a3a28, roughness: 0.9 }));
    roof.position.y = 6.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    mill.add(roof);
    // water wheel
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 12), M({ color: 0x5b432a, roughness: 0.9 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(-4.2, 1.8, 0);
    mill.add(wheel);
    world.millWheel = wheel;
    mill.position.copy(pos);
    g.add(mill);
    block(world, pos.x, pos.z, 7, 6);
  } else if (only(era, 'celery', 'mall', 'seventies', 'paper', 'nineties')) {
    const dead = ['paper', 'nineties'].includes(era.key);
    const base = dead ? '#6e5648' : '#7d4030';
    const mat = new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -38), 20), color: 0xffffff, roughness: 0.9 });
    // body sits a step west of the anchor so its east wall clears the
    // Rose St traffic that turns the loop's southwest corner
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 11), mat);
    body.position.y = 4.5;
    body.castShadow = true; body.receiveShadow = true;
    body.position.copy(pos).setY(4.5);
    body.position.x = pos.x - 1;
    g.add(body);
    block(world, pos.x - 1, pos.z, 14, 11);
    // sawtooth roof
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 11), M({ color: 0x3f3832, roughness: 0.85 }));
      tooth.position.set(pos.x - 6.8 + i * 3.4, 9.6, pos.z);
      tooth.rotation.z = 0.32;
      g.add(tooth);
    }
    // window band
    const winMat = new THREE.MeshStandardMaterial({
      color: dead ? 0x4a4438 : 0x33414e, roughness: 0.3,
      emissive: new THREE.Color('#ffc97a'), emissiveIntensity: 0,
    });
    if (!dead) world.windowMats.push(winMat);
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.08), winMat);
      win.position.set(pos.x - 7.5 + i * 2.5, 4.6, pos.z + 5.56);
      g.add(win);
      if (dead && R() < 0.5) {
        // broken pane boards
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.1), M({ color: 0x7a6a4e, roughness: 1 }));
        board.position.set(win.position.x, 4.3 + rand(-0.6, 0.8), pos.z + 5.6);
        board.rotation.z = rand(-0.4, 0.4);
        g.add(board);
      }
    }
    // stacks
    const stacks = dead ? 1 : 2;
    for (let i = 0; i < stacks; i++) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 12, 10), M({ color: 0x57423a, roughness: 0.9 }));
      stack.position.set(pos.x + 4.1 - i * 3.4, 6, pos.z - 3.4);
      stack.castShadow = true;
      g.add(stack);
      if (i === 0) world.stackTop = stack.position.clone().setY(12.4);
    }
    const millSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.4, 9),
      new THREE.MeshStandardMaterial({ map: signTex(dead ? 'PLANT FOR SALE' : 'KALAMAZOO PAPER CO.', { bg: '#2a241e' }), color: 0xffffff })
    );
    millSign.position.set(pos.x + 6.1, 6.4, pos.z);
    g.add(millSign);
    if (dead) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(14, 1.5, 0.08), M({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.6, transparent: true, opacity: 0.45 }));
      fence.position.set(pos.x - 1, 0.75, pos.z + 7.4);
      g.add(fence);
    }
  } else if (only(era, 'living')) {
    // the brewery in the mill shell
    const base = '#7d4030';
    const mat = new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -30), 20), color: 0xffffff, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 11), mat);
    body.position.copy(pos).setY(4.5);
    body.position.x = pos.x - 1;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    block(world, pos.x - 1, pos.z, 14, 11);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a58, roughness: 0.2, metalness: 0.3,
      emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.15,
    });
    world.windowMats.push(winMat);
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 0.08), winMat);
      win.position.set(pos.x - 7.4 + i * 2.45, 4.6, pos.z + 5.56);
      g.add(win);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 12, 10), M({ color: 0x57423a, roughness: 0.9 }));
    stack.position.set(pos.x + 4.1, 6, pos.z - 3.4);
    g.add(stack);
    // tanks
    for (let i = 0; i < 3; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 12), M({ color: 0xc9ccd1, roughness: 0.25, metalness: 0.8 }));
      tank.position.set(pos.x - 8.8, 1.7, pos.z - 2.5 + i * 2.6);
      tank.castShadow = true;
      g.add(tank);
    }
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.6, 9),
      new THREE.MeshStandardMaterial({ map: signTex('OLD MILL BREWING', { bg: '#1d2a24', fg: '#ffd98a' }), color: 0xffffff, emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0 })
    );
    sign.position.set(pos.x + 6.1, 6.4, pos.z);
    g.add(sign);
    world.marqueeMats.push(sign.material);
    // patio
    const patio = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), M({ color: 0x8d887c, roughness: 0.9 }));
    patio.rotation.x = -Math.PI / 2;
    patio.position.set(pos.x + 2, 0.04, pos.z + 10);
    patio.receiveShadow = true;
    g.add(patio);
    for (let i = 0; i < 4; i++) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.78, 9), M({ color: 0x4a4540, roughness: 0.8 }));
      table.position.set(pos.x - 2.5 + i * 3.1, 0.39, pos.z + 10 + (i % 2 ? 1.4 : -1.4));
      table.castShadow = true;
      g.add(table);
    }
    world.stringLightRuns.push({ from: new THREE.Vector3(pos.x - 4, 4.6, pos.z + 7), to: new THREE.Vector3(pos.x + 8, 3.8, pos.z + 13) });
  } else {
    // 2050: stabilized ruins + amphitheater
    const base = '#7d4030';
    const wallMat = new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -34), 16), color: 0xffffff, roughness: 0.95 });
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.8), wallMat);
    wall1.position.set(pos.x, 3, pos.z - 5);
    wall1.castShadow = true;
    g.add(wall1);
    block(world, pos.x, pos.z - 5, 16, 0.8);
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 8), wallMat);
    wall2.position.set(pos.x - 7.6, 3.75, pos.z - 1);
    wall2.castShadow = true;
    g.add(wall2);
    block(world, pos.x - 7.6, pos.z - 1, 0.8, 8);
    // window openings as arches of sky: cut effect via dark frames
    for (let i = 0; i < 4; i++) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.9), M({ color: 0x2a2018, roughness: 1 }));
      frame.position.set(pos.x - 6 + i * 3.6, 3.4, pos.z - 5);
      g.add(frame);
    }
    // ivy
    for (let i = 0; i < 6; i++) {
      const ivy = new THREE.Mesh(new THREE.SphereGeometry(rand(0.7, 1.3), 7, 6), M({ color: pick(era.vis.foliage), roughness: 0.95 }));
      ivy.position.set(pos.x - 8 + rand(0, 16), rand(1, 5.6), pos.z - 5 + rand(-0.4, 0.6));
      g.add(ivy);
    }
    // amphitheater arcs facing the river
    for (let r = 0; r < 3; r++) {
      const arc = new THREE.Mesh(
        new THREE.CylinderGeometry(5 + r * 1.7, 5 + r * 1.7, 0.42 + r * 0.3, 22, 1, false, Math.PI * 0.55, Math.PI * 0.6),
        M({ color: 0x8d887c, roughness: 0.9 })
      );
      arc.position.set(pos.x - 1, (0.42 + r * 0.3) / 2, pos.z + 3);
      arc.receiveShadow = true;
      g.add(arc);
    }
    const stageMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 16), M({ color: 0x9b8a74, roughness: 0.85 }));
    stageMesh.position.set(pos.x - 4.5, 0.15, pos.z + 6.5);
    g.add(stageMesh);
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildPark(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'park';
  // Bronson Park: well west of Burdick and the State Theatre, between Rose and
  // Park St — its own open block, not jammed against downtown.
  const center = new THREE.Vector3(PLACES.park.x, 0, PLACES.park.z);

  // lawn ends flush at the Portage St curb (x = 28) instead of under it
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(16, 19), M({ color: only(era, 'paper') ? 0x4a5c3a : 0x3e6b35, roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(center.x, 0.035, center.z);
  lawn.receiveShadow = true;
  g.add(lawn);

  // diagonal paths
  [-Math.PI / 4, Math.PI / 4].forEach(rot => {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 22), M({ color: 0x9b9484, roughness: 0.9 }));
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = rot;
    path.position.set(center.x, 0.045, center.z);
    g.add(path);
  });

  // the oaks that heard Lincoln
  const oakScale = { founding: 0.7, boiling: 0.85, celery: 1.1, mall: 1.35, seventies: 1.4, paper: 1.45, nineties: 1.52, living: 1.6, returns: 1.2 }[era.key];
  [[-6.5, -6], [6.5, -6.5], [-6, 6.5], [5.8, 6]].forEach(([ox, oz], i) => {
    const s = (era.key === 'returns' && i > 1) ? 0.7 : oakScale; // great-grandchildren oaks
    g.add(makeTree(center.x + ox, center.z + oz, s, era.vis.foliage, 'oak'));
    block(world, center.x + ox, center.z + oz, 1.3, 1.3);
  });

  // center feature
  if (only(era, 'mall', 'paper')) {
    // Fountain of the Pioneers — stepped deco tower (its story is in the strata)
    const f = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 18), M({ color: 0x8d99a6, roughness: 0.7 }));
    pool.position.y = 0.25;
    f.add(pool);
    for (let i = 0; i < 4; i++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(1.8 - i * 0.34, 1.05, 1.8 - i * 0.34), M({ color: 0x9aa5b0, roughness: 0.75 }));
      tier.position.y = 0.9 + i * 1.0;
      f.add(tier);
    }
    f.position.set(center.x, 0, center.z);
    f.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.add(f);
    block(world, center.x, center.z, 7, 7);   // nobody wades the fountain
  } else if (only(era, 'living')) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 8, 22), M({ color: 0x7a756a, roughness: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, 0.18, center.z);
    g.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
        M({ color: [0xc26d8a, 0xd9b23a, 0xb84a3a, 0x8a6dc2][i % 4], roughness: 0.7 }));
      bloom.position.set(center.x + Math.cos(a) * 1.8, 0.25, center.z + Math.sin(a) * 1.8);
      g.add(bloom);
    }
  } else if (only(era, 'returns')) {
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.3, 18), M({ color: 0x2e6b70, roughness: 0.2, metalness: 0.1 }));
    pool.position.set(center.x, 0.15, center.z);
    g.add(pool);
    block(world, center.x, center.z, 6.4, 6.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, rand(0.9, 1.5), 5), M({ color: 0x4f7a3a, roughness: 0.9 }));
      reed.position.set(center.x + Math.cos(a) * 2.6, 0.6, center.z + Math.sin(a) * 2.6);
      g.add(reed);
    }
  }

  // bandstand
  if (since(era, 'celery')) {
    const b = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.5, 8), M({ color: 0x8a8073, roughness: 0.9 }));
    deck.position.y = 0.25;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.3, 8), M({ color: 0x5c4a3a, roughness: 0.85 }));
    roof.position.y = 3.2;
    roof.castShadow = true;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), M({ color: 0xd8d2c4, roughness: 0.8 }));
      post.position.set(Math.cos(a) * 1.9, 1.6, Math.sin(a) * 1.9);
      b.add(post);
    }
    b.add(deck, roof);
    b.position.set(center.x - 5, 0, center.z - 5);
    g.add(b);
    block(world, center.x - 5, center.z - 5, 4.8, 4.8);
  }

  // benches
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.55), M({ color: 0x4a4540, roughness: 0.85 }));
    const a = (i / 4) * Math.PI * 2 + 0.4;
    bench.position.set(center.x + Math.cos(a) * 5.4, 0.21, center.z + Math.sin(a) * 5.4);
    bench.rotation.y = -a + Math.PI / 2;
    bench.castShadow = true;
    g.add(bench);
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildRail(era, world) {
  const g = new THREE.Group();
  const z = 40;

  // 1831: no iron for fifteen years. The corridor is bracken and oak shade,
  // but the ground is still clickable — the strata speak for the line to come.
  // (buildEchoes lays the ghost rails; echoes run forward here.)
  if (only(era, 'founding')) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(120, 6), new THREE.MeshBasicMaterial({ visible: false }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.05, z);
    strip.userData.landmark = 'depot';
    g.add(strip);
    world.pickLandmarks.push(strip);
    const fernMat = M({ color: 0x4f7a3a, roughness: 0.95 });
    for (let i = 0; i < 14; i++) {
      const fern = new THREE.Mesh(new THREE.ConeGeometry(rand(0.3, 0.6), rand(0.5, 0.9), 5), fernMat);
      fern.position.set(rand(-55, 55), 0.3, z + rand(-1.8, 1.8));
      g.add(fern);
    }
    return g;
  }

  // ballast + rails + ties
  const ballast = new THREE.Mesh(new THREE.PlaneGeometry(184, 5), M({ color: 0x5a564e, roughness: 1 }));
  ballast.rotation.x = -Math.PI / 2;
  ballast.position.set(0, 0.025, z);
  ballast.receiveShadow = true;
  g.add(ballast);
  const railMat = M({ color: 0x6a6e72, roughness: 0.4, metalness: 0.7 });
  [-0.8, 0.8].forEach(off => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(184, 0.12, 0.12), railMat);
    rail.position.set(0, 0.12, z + off);
    g.add(rail);
  });
  const tieMat = M({ color: 0x3f3226, roughness: 1 });
  for (let x = -88; x <= 88; x += 2.6) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.4), tieMat);
    tie.position.set(x, 0.07, z);
    g.add(tie);
  }

  // depot
  const depot = new THREE.Group();
  depot.userData.landmark = 'depot';
  const wood = only(era, 'boiling');
  const base = wood ? '#a8916b' : '#8a4a30';
  const depotBody = new THREE.Mesh(
    new THREE.BoxGeometry(9, 3.6, 4.6),
    wood ? M({ color: base, roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -36), 10), color: 0xffffff, roughness: 0.85 })
  );
  depotBody.position.y = 1.8;
  depotBody.castShadow = true; depotBody.receiveShadow = true;
  depot.add(depotBody);
  const depotRoof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 1.8, 4), M({ color: 0x3f3832, roughness: 0.85 }));
  depotRoof.position.y = 4.4;
  depotRoof.rotation.y = Math.PI / 4;
  depotRoof.scale.set(1, 1, 0.55);
  depotRoof.castShadow = true;
  depot.add(depotRoof);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 2.2), M({ color: 0x8d887c, roughness: 0.9 }));
  platform.position.set(0, 0.2, -3.2);
  depot.add(platform);
  const depotSign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ map: signTex('KALAMAZOO', { bg: '#2a241e', font: 'bold 64px Georgia' }), color: 0xffffff }));
  depotSign.position.set(0, 2.9, -2.35);
  depot.add(depotSign);
  if (since(era, 'living')) {
    // the 1887 depot becomes the intermodal hub: trains, buses, everyone
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(13, 0.28, 3.2), M({ color: 0x46525c, roughness: 0.65, metalness: 0.2 }));
    canopy.position.set(0, 3.3, -3.2);
    depot.add(canopy);
    [-5.6, 5.6].forEach(px => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), M({ color: 0x3a444c, roughness: 0.6, metalness: 0.3 }));
      post.position.set(px, 1.6, -4.4);
      depot.add(post);
    });
    const hubSign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 0.1),
      new THREE.MeshStandardMaterial({ map: signTex('TRANSPORTATION CENTER', { bg: '#1f252b', fg: '#e8e3d8', font: 'bold 34px Georgia', sub: 'TRAINS • BUSES • EVERYWHERE ELSE' }), color: 0xffffff }));
    hubSign.position.set(0, 3.85, -2.35);
    depot.add(hubSign);
  }
  depot.position.set(PLACES.depot.x, 0, z + 5.2);
  g.add(depot);
  world.pickLandmarks.push(depot);
  block(world, 12, z + 5.2, 9, 4.6);   // the platform out front stays walkable

  // crossing gates at Burdick
  const crossing = new THREE.Group();
  [-1, 1].forEach(s => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), M({ color: 0xd8d2c4, roughness: 0.7 }));
    pole.position.set(s * 5, 1.7, z + s * 4.4);
    crossing.add(pole);
    [2.6, 3.1].forEach((h, i) => {
      const lightMat = new THREE.MeshStandardMaterial({ color: 0x441111, emissive: new THREE.Color('#ff2a2a'), emissiveIntensity: 0 });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), lightMat);
      light.position.set(s * 5, h, z + s * 4.4 - s * 0.18);
      crossing.add(light);
      world.crossingLights.push({ mat: lightMat, phase: i });
    });
  });
  g.add(crossing);

  // the train itself
  const styles = { boiling: 'steam', celery: 'steam', mall: 'freight', seventies: 'freight', paper: 'freight', nineties: 'freight', living: 'amtrak', returns: 'electric' };
  world.train = new Train(styles[era.key], z, () => world.onTrain && world.onTrain());
  g.add(world.train.group);

  return g;
}

function buildFlats(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'flats';
  const { x: cx, z: cz } = PLACES.flats;   // the celery muck, southwest — clear of the superfund cap

  const soil = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), M({ color: 0x241d16, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(cx, 0.03, cz);
  soil.receiveShadow = true;
  g.add(soil);

  if (only(era, 'founding', 'boiling')) {
    // wild marsh: wet patches + reeds; in 1855, Taylor's first tamed corner
    for (let i = 0; i < 5; i++) {
      const wet = new THREE.Mesh(new THREE.CircleGeometry(rand(1.4, 2.6), 10), M({ color: 0x2c4a44, roughness: 0.3 }));
      wet.rotation.x = -Math.PI / 2;
      wet.position.set(cx + rand(-10, 10), 0.05, cz + rand(-6, 6));
      g.add(wet);
    }
    for (let i = 0; i < 40; i++) {
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, rand(0.9, 1.7), 4), M({ color: 0x6b7a3a, roughness: 0.95 }));
      reed.position.set(cx + rand(-12, 12), 0.6, cz + rand(-8, 8));
      reed.rotation.z = rand(-0.15, 0.15);
      g.add(reed);
    }
    if (only(era, 'boiling')) {
      for (let r = 0; r < 4; r++) {
        const row = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.5), M({ color: 0x7da05a, roughness: 0.9 }));
        row.position.set(cx - 8, 0.15, cz + 5 + r * 1.1);
        g.add(row);
      }
    } else {
      // 1831: rice sheaves drying at the marsh edge — the harvest before the harvests
      for (let i = 0; i < 5; i++) {
        const sheaf = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 6), M({ color: 0xb8a25c, roughness: 0.95 }));
        sheaf.position.set(cx - 9 + i * 1.6, 0.65, cz + 6 + (i % 2) * 0.9);
        g.add(sheaf);
      }
    }
  } else if (only(era, 'celery', 'mall', 'seventies')) {
    const rows = era.key === 'celery' ? 9 : 5;
    for (let r = 0; r < rows; r++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(22, 0.34, 0.6), M({ color: 0x86b35c, roughness: 0.9 }));
      row.position.set(cx, 0.17, cz - 7.5 + r * (15 / rows));
      g.add(row);
    }
    const barn = gableHouse({
      w: 5.5, d: 7, h: 3.4,
      wall: M({ color: 0x8a3a2a, roughness: 0.9 }),
      roof: M({ color: 0x4a3a30, roughness: 0.85 }),
      windowMat: M({ color: 0x33271c }), chimney: false,
    });
    barn.position.set(cx + 9.5, 0, cz - 6);
    g.add(barn);
    block(world, cx + 9.5, cz - 6, 5.5, 7);
    if (only(era, 'mall', 'seventies')) {
      // suburbs encroaching: surveyor stakes
      for (let i = 0; i < 6; i++) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), M({ color: 0xd9622a, roughness: 0.8 }));
        stake.position.set(cx - 11 + i * 4.4, 0.45, cz + 8);
        g.add(stake);
      }
    }
  } else if (only(era, 'paper', 'nineties')) {
    // the parking lot that smells like harvest
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), M({ color: 0x3c3f44, roughness: 0.95 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(cx, 0.06, cz);
    lot.receiveShadow = true;
    g.add(lot);
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4.6), M({ color: 0xc9c4b4, roughness: 0.9 }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(cx - 9 + i * 3.6, 0.07, cz - 3);
      g.add(stripe);
    }
    // one muck corner breaking through
    const muckBreak = new THREE.Mesh(new THREE.CircleGeometry(1.8, 9), M({ color: 0x241d16, roughness: 1 }));
    muckBreak.rotation.x = -Math.PI / 2;
    muckBreak.position.set(cx + 8.5, 0.08, cz + 5.5);
    g.add(muckBreak);
    const sprig = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), M({ color: 0x86b35c, roughness: 0.9 }));
    sprig.position.set(cx + 8.5, 0.3, cz + 5.5);
    g.add(sprig);
  } else {
    // gardens (2026) / muck commons (2050)
    const beds = era.key === 'living' ? 8 : 12;
    for (let i = 0; i < beds; i++) {
      const bx = cx - 10 + (i % 4) * 6.4;
      const bz = cz - 5 + Math.floor(i / 4) * 5.2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.4), M({ color: 0x6b5b44, roughness: 0.95 }));
      frame.position.set(bx, 0.25, bz);
      frame.castShadow = true;
      g.add(frame);
      block(world, bx, bz, 4.6, 2.4);   // walk between the beds, not through the greens
      const greens = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.36, 2.0), M({ color: pick(['#86b35c', '#5c9e4a', '#a3c46b']), roughness: 0.9 }));
      greens.position.set(bx, 0.58, bz);
      g.add(greens);
    }
    const shed = gableHouse({
      w: 3.6, d: 4.4, h: 2.4,
      wall: M({ color: 0x8a7a5c, roughness: 0.9 }),
      roof: M({ color: 0x4a4438, roughness: 0.85 }),
      windowMat: M({ color: 0x33414e }), chimney: false, solar: era.key === 'returns',
    });
    shed.position.set(cx + 10.5, 0, cz - 6);
    g.add(shed);
    block(world, cx + 10.5, cz - 6, 3.6, 4.4);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 0.1),
      new THREE.MeshStandardMaterial({
        map: signTex(era.key === 'returns' ? 'MUCK COMMONS' : 'COMMUNITY GARDENS', { bg: '#1d2a24', fg: '#e8e3d8', font: 'bold 40px Georgia' }),
        color: 0xffffff,
      }));
    sign.position.set(cx - 6, 1.3, cz + 9.2);
    g.add(sign);
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildSuperfund(era, world) {
  if (only(era, 'founding', 'boiling')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'superfund';
  const { x: cx, z: cz } = PLACES.superfund;

  if (only(era, 'celery', 'mall', 'seventies')) {
    // settling lagoons, unquestioned
    for (let i = 0; i < 3; i++) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6 - i * 0.4, 12), M({ color: 0x3a3c34, roughness: 0.25 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(cx - 4 + i * 5.5, 0.05, cz + (i % 2) * 3);
      g.add(pool);
      block(world, pool.position.x, pool.position.z, (2.6 - i * 0.4) * 2, (2.6 - i * 0.4) * 2);
    }
  } else if (only(era, 'paper', 'nineties')) {
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 9.5, 2.2, 14), M({ color: 0x595549, roughness: 1 }));
    mound.position.set(cx, 1.1, cz);
    mound.castShadow = true; mound.receiveShadow = true;
    g.add(mound);
    block(world, cx, cz, 19, 19);
    for (let i = 0; i < 3; i++) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.08),
        new THREE.MeshStandardMaterial({ map: signTex('WARNING', { bg: '#a88b1d', fg: '#1a1a1a', font: 'bold 64px Georgia', sub: 'NO TRESPASSING — EPA' }), color: 0xffffff }));
      const a = (i / 3) * Math.PI * 1.2 + 0.4;
      sign.position.set(cx + Math.cos(a) * 10.5, 1.0, cz + Math.sin(a) * 10.5);
      sign.rotation.y = -a + Math.PI / 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), M({ color: 0x6a6e72 }));
      post.position.set(sign.position.x, 0.6, sign.position.z);
      g.add(sign, post);
    }
  } else if (only(era, 'living')) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 1.8, 16), M({ color: 0x4f7a3a, roughness: 0.95 }));
    cap.position.set(cx, 0.9, cz);
    cap.receiveShadow = true;
    g.add(cap);
    // monitoring wells
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 7), M({ color: 0xd8d2c4, roughness: 0.6 }));
      well.position.set(cx + Math.cos(a) * 5.2, 2.3, cz + Math.sin(a) * 5.2);
      g.add(well);
    }
    // fence
    const fence = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1.5, 18, 1, true),
      M({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    fence.position.set(cx, 0.75, cz);
    g.add(fence);
    block(world, cx, cz, 22, 22);   // fenced means fenced
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 0.1),
      new THREE.MeshStandardMaterial({
        map: signTex('ALLIED PAPER SITE', { bg: '#1d3324', fg: '#e8e3d8', font: 'bold 44px Georgia', sub: 'SUPERFUND CLEANUP — IN PROGRESS' }),
        color: 0xffffff,
      }));
    sign.position.set(cx, 1.4, cz + 11.6);
    g.add(sign);
  } else {
    // the solar meadow
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 10.5, 1.6, 18), M({ color: 0x53843e, roughness: 0.95 }));
    cap.position.set(cx, 0.8, cz);
    cap.receiveShadow = true;
    g.add(cap);
    block(world, cx, cz, 21, 21);
    const panelMat = M({ color: 0x14253a, roughness: 0.25, metalness: 0.55 });
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 1.2), panelMat);
        p.position.set(cx - 6 + c * 3, 2.0, cz - 5 + r * 3.2);
        p.rotation.x = -0.42;
        p.castShadow = true;
        g.add(p);
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, r = rand(3, 9.5);
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4),
        M({ color: pick(['#d9b23a', '#c26d8a', '#e8e3d8', '#8a6dc2']), roughness: 0.7 }));
      flower.position.set(cx + Math.cos(a) * r, 1.75, cz + Math.sin(a) * r);
      g.add(flower);
    }
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildTower(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'tower';
  const { x: cx, z: cz } = PLACES.tower;

  const hill = new THREE.Mesh(new THREE.ConeGeometry(16, 7, 14), M({ color: 0x3e5c33, roughness: 1 }));
  hill.position.set(cx, 3.4, cz);
  hill.receiveShadow = true;
  g.add(hill);

  if (only(era, 'founding')) {
    // 1831: just the hill — oaks, owls, and a future nobody has imagined yet
    [[-4, -2, 4.6], [3, 1, 5.2], [0, 4, 4.9]].forEach(([ox, oz, oy], i) => {
      const oak = makeTree(cx + ox, cz + oz, 0.9 + i * 0.12, era.vis.foliage, 'oak');
      oak.position.y = oy;   // planted on the hillside, not inside it
      g.add(oak);
    });
  } else if (only(era, 'boiling')) {
    // walls rising, 1854: scaffold + partial masonry
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3.4), M({ color: 0x9b8a74, roughness: 0.9 }));
    wall.position.set(cx, 7.9, cz);
    g.add(wall);
    for (let i = 0; i < 4; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 5), M({ color: 0x6b4e2e, roughness: 0.95 }));
      pole.position.set(cx - 3 + i * 2, 9.1, cz + 2.1);
      g.add(pole);
    }
  } else {
    const towerMat = new THREE.MeshStandardMaterial({ map: brickTex('#8a6a4a', '#5c4632', 22), color: 0xffffff, roughness: 0.9 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.4, 12, 12), towerMat);
    shaft.position.set(cx, 12.8, cz);
    shaft.castShadow = true;
    g.add(shaft);
    // crenellated head
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.3, 2.4, 12), towerMat);
    head.position.set(cx, 19.6, cz);
    head.castShadow = true;
    g.add(head);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5), towerMat);
      merlon.position.set(cx + Math.cos(a) * 2.45, 21.2, cz + Math.sin(a) * 2.45);
      merlon.rotation.y = -a;
      g.add(merlon);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.6, 12), M({ color: 0x3f3832, roughness: 0.85 }));
    cap.position.set(cx, 23.2, cz);
    g.add(cap);
    // one lit window — somebody is always awake on the hill
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2c3844, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.2), winMat);
    win.position.set(cx + 2.0, 14.5, cz + 0.6);
    win.rotation.y = 0.4;
    g.add(win);
    world.windowMats.push(winMat);
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildWMU(era, world) {
  if (!since(era, 'celery')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'wmu';
  const { x: cx, z: cz } = PLACES.wmu;

  // Western sits on Prospect Hill in real life, but in this compressed
  // diorama the campus must stay physically planted on the shared ground.
  const hill = new THREE.Mesh(new THREE.CircleGeometry(18, 28), M({ color: 0x42603a, roughness: 1 }));
  hill.rotation.x = -Math.PI / 2;
  hill.position.set(cx, 0.07, cz);
  hill.receiveShadow = true;
  g.add(hill);

  const mkHall = (x, z, w, h, d, color) => {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: brickTex(color, shade(color, -36), 10), color: 0xffffff, roughness: 0.88 }));
    hall.position.set(x, h / 2 + 0.08, z);
    hall.castShadow = true;
    g.add(hall);
    block(world, x, z, w, d);
  };
  mkHall(cx, cz, 6.5, 3.4, 4, '#9b5a3a'); // East Hall — where the normal school began
  if (since(era, 'mall')) {
    mkHall(cx - 6, cz + 4, 5, 4.4, 4, '#8a7a5c');
    mkHall(cx + 6.5, cz + 3, 5, 5.6, 4, '#7d6a58');
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8, 2.2), M({ color: 0xb8ab90, roughness: 0.8 }));
    tower.position.set(cx + 1, 4.08, cz + 6);
    tower.castShadow = true;
    g.add(tower);
    block(world, cx + 1, cz + 6, 2.2, 2.2);
  }
  if (since(era, 'living')) {
    [[cx - 10.5, cz - 2.5, 'WMU'], [cx + 10.2, cz - 0.5, 'BRONCOS'], [cx - 2, cz - 7.2, 'GOLD']]
      .forEach(([x, z, text]) => g.add(makeBanner(x, z, text)));
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), M({ color: 0x6d6252, roughness: 0.9 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(cx - 2, 0.10, cz - 2.8);
    plaza.userData.phase2 = 'wmu-plaza';
    g.add(plaza);
    [
      { x: cx - 4.2, z: cz - 3.6, body: '#5c3a21' },
      { x: cx - 1.8, z: cz - 5.1, body: '#f1c232' },
      { x: cx + 1.6, z: cz - 3.0, body: '#3f4f6f' },
    ].forEach((stu, i) => {
      const { group: student } = makePersonMesh({ body: stu.body, skin: i % 4, hat: i === 1 ? 'cap' : 'none', prop: 'book' });
      student.position.set(stu.x, 0.12, stu.z);
      student.rotation.y = rand(-0.6, 0.6);
      student.userData.phase2 = 'wmu-student';
      g.add(student);
    });
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildGibson(era, world) {
  if (!since(era, 'mall')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'gibson';
  const { x: cx, z: cz } = PLACES.gibson;   // 225 Parsons St, north of the rails, west of the river

  const dead = ['paper', 'nineties'].includes(era.key);
  const base = '#9b6a4a';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(13, 7, 8),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -34), 14), color: 0xffffff, roughness: 0.88 })
  );
  body.position.set(cx, 3.5, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, 13, 8);

  const winMat = new THREE.MeshStandardMaterial({
    color: dead ? 0x3a3630 : 0x33414e, roughness: 0.3,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
  });
  if (!dead) world.windowMats.push(winMat);
  for (let i = 0; i < 5; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 0.08), winMat);
    win.position.set(cx - 5 + i * 2.5, 3.6, cz - 4.05);
    g.add(win);
  }

  const labels = { mall: ['GIBSON', 'Guitars & Mandolins'], seventies: ['GIBSON', 'Parsons St. still humming'], paper: ['HERITAGE', 'est. 1985 — same benches'], nineties: ['HERITAGE', 'same benches • new decade'], living: ['HERITAGE GUITAR', '225 Parsons St.'], returns: ['YODER LUTHERIE', 'salvaged maple • since the floors danced'] };
  const [t, s] = labels[era.key] || labels.living;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.15),
    new THREE.MeshStandardMaterial({ map: signTex(t, { bg: '#26201a', fg: '#e8d9b8', sub: s }), color: 0xffffff }));
  sign.position.set(cx, 6.2, cz - 4.15);
  g.add(sign);

  world.pickLandmarks.push(g);
  return g;
}

function buildChecker(era, world) {
  // Checker came to Kalamazoo in 1923 and built cabs at 2016 N. Pitcher until
  // July 1982; the plant stamped parts for years after. Here it stands from the
  // Mall era through the '90s — north on Pitcher, near the river, the yellow
  // giant beyond Gibson. (Gone by the living eras: demolished in real life.)
  if (!only(era, 'mall', 'seventies', 'paper', 'nineties')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'checker';
  const { x: cx, z: cz } = PLACES.checker;
  const winding = ['paper', 'nineties'].includes(era.key);   // the cab line is dead; parts only
  const base = '#7a6e5c';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(14, 6.5, 16),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -34), 16), color: 0xffffff, roughness: 0.9 })
  );
  body.position.set(cx, 3.25, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, 14, 16);

  // sawtooth factory roof — the silhouette of every plant that ever ran a line
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 16), M({ color: shade(base, -8), roughness: 0.92 }));
    tooth.position.set(cx - 5.2 + i * 3.4, 7.1, cz);
    tooth.rotation.z = 0.34;
    tooth.castShadow = true;
    g.add(tooth);
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 9, 10), M({ color: 0x6e5a48, roughness: 0.95 }));
  stack.position.set(cx - 6.2, 7.5, cz + 6.4);
  stack.castShadow = true;
  g.add(stack);

  const winMat = new THREE.MeshStandardMaterial({
    color: winding ? 0x3a3630 : 0x33414e, roughness: 0.3,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
  });
  if (!winding) world.windowMats.push(winMat);
  for (let i = 0; i < 6; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.08), winMat);
    win.position.set(cx - 5.5 + i * 2.2, 3.4, cz - 8.05);
    g.add(win);
  }

  // a parked Checker out front in the cab-building years
  if (!winding) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.6), M({ color: 0xe8b400, roughness: 0.5, metalness: 0.2 }));
    cab.position.set(cx + 5, 0.7, cz - 10);
    cab.castShadow = true;
    g.add(cab);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 2.2), M({ color: 0x1f1f1f, roughness: 0.4 }));
    cabin.position.set(cx + 5, 1.6, cz - 10.1);
    g.add(cabin);
  }

  const labels = {
    mall: ['CHECKER MOTORS', 'Kalamazoo builds the cab'],
    seventies: ['CHECKER MOTORS', "the cab that won't quit"],
    paper: ['CHECKER MOTORS', 'the cabs are memory now'],
    nineties: ['CHECKER MOTORS', "stamping other men's cars"],
  };
  const [t, s] = labels[era.key];
  const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 0.15),
    new THREE.MeshStandardMaterial({ map: signTex(t, { bg: '#1f2a1a', fg: '#e8d24d', font: 'bold 40px Georgia', sub: s }), color: 0xffffff }));
  sign.position.set(cx, 5.7, cz - 8.15);
  g.add(sign);

  world.pickLandmarks.push(g);
  return g;
}

function buildEastHall(era, world) {
  // Western State Normal School opened in 1903; East Hall went up on the East
  // Campus hill in 1904–05. The campus emptied late in the century; East Hall
  // was rescued and reopened as Heritage Hall in 2018. It sits on the WMU hill's
  // east shoulder — the building where the university began.
  if (!since(era, 'celery')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'easthall';
  const { x: cx, z: cz } = PLACES.easthall;
  const restored = since(era, 'living');
  const dark = era.key === 'nineties';   // the East Campus years of dark windows
  const base = '#9b5a3a';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 5),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -36), 12), color: 0xffffff, roughness: 0.88 })
  );
  body.position.set(cx, 2.6, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, 8, 5);

  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 4.6, 2.4),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -40), 10), color: 0xffffff, roughness: 0.88 })
  );
  tower.position.set(cx, 6.2, cz);
  tower.castShadow = true;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.9, 4), M({ color: restored ? 0x4a4036 : 0x3f3832, roughness: 0.85 }));
  cap.position.set(cx, 9.4, cz);
  cap.rotation.y = Math.PI / 4;
  g.add(cap);

  const winMat = new THREE.MeshStandardMaterial({
    color: dark ? 0x2a2620 : 0x33414e, roughness: 0.3,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
  });
  if (!dark) world.windowMats.push(winMat);
  for (let f = 0; f < 2; f++) for (let i = 0; i < 4; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.08), winMat);
    win.position.set(cx - 2.8 + i * 1.85, 1.9 + f * 2.0, cz - 2.55);
    g.add(win);
  }

  const labels = {
    celery: ['EAST HALL', 'Western State Normal'],
    mall: ['EAST HALL', 'where it all began'],
    seventies: ['EAST HALL', 'the hill above the city'],
    paper: ['EAST HALL', 'East Campus'],
    nineties: ['EAST HALL', 'dark windows, waiting'],
    living: ['HERITAGE HALL', 'rescued • 1904 / 2018'],
    returns: ['HERITAGE HALL', 'still on the hill'],
  };
  const [t, s] = labels[era.key] || labels.living;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 0.12),
    new THREE.MeshStandardMaterial({ map: signTex(t, { bg: '#2a2018', fg: '#e8d9b8', font: 'bold 34px Georgia', sub: s }), color: 0xffffff }));
  sign.position.set(cx, 3.9, cz - 2.62);
  g.add(sign);

  world.pickLandmarks.push(g);
  return g;
}

function buildNewsAgency(era, world) {
  // Michigan News Agency opened at 308 W. Michigan in 1947 — for three quarters
  // of a century the densest shelf of magazines and paperbacks in the state.
  // North side of the avenue, west of Rose. It dimmed in the mid-2020s.
  if (!since(era, 'mall') || only(era, 'returns')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'newsagency';
  const { x: cx, z: cz } = PLACES.newsagency;
  const closing = only(era, 'living');   // 2026: the racks going quiet
  const base = '#8a5a3a';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4.4, 4.6),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -34), 12), color: 0xffffff, roughness: 0.88 })
  );
  body.position.set(cx, 2.2, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  block(world, cx, cz, 6, 4.6);

  const winMat = new THREE.MeshStandardMaterial({
    color: closing ? 0x2a2c30 : 0x2c3844, roughness: 0.25, metalness: 0.2,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
  });
  if (!closing) world.windowMats.push(winMat);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.9, 0.08), winMat);
  glass.position.set(cx, 1.5, cz - 2.35);
  g.add(glass);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 0.12),
    new THREE.MeshStandardMaterial({
      map: signTex('MICHIGAN NEWS', {
        bg: '#1c2733', fg: '#e8e3d8', font: 'bold 32px Georgia',
        sub: closing ? '308 W. MICHIGAN • thank you' : 'MORE MAGAZINES THAN ANYWHERE',
      }), color: 0xffffff,
    }));
  sign.position.set(cx, 3.7, cz - 2.4);
  g.add(sign);

  world.pickLandmarks.push(g);
  return g;
}

function buildChurch(era, world) {
  if (only(era, 'founding')) return null;   // services still meet in cabins
  const g = new THREE.Group();
  const cx = -10, cz = -38;
  const wood = only(era, 'boiling');
  const base = wood ? '#d8d2c4' : '#9b8a74';
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 8),
    wood ? M({ color: base, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -30), 12), color: 0xffffff, roughness: 0.88 }));
  body.position.set(cx, 2.1, cz);
  body.castShadow = true;
  g.add(body);
  block(world, cx, cz, 5.5, 8);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4), M({ color: 0x3f3832, roughness: 0.85 }));
  roof.position.set(cx, 5.3, cz);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(0.8, 1, 1.25);
  roof.castShadow = true;
  g.add(roof);
  const steeple = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.4, 1.5), wood ? M({ color: base, roughness: 0.9 }) : M({ color: shade(base, 12), roughness: 0.85 }));
  steeple.position.set(cx, 7.0, cz + 2.6);
  steeple.castShadow = true;
  g.add(steeple);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 4), M({ color: 0x3f3832, roughness: 0.8 }));
  spire.position.set(cx, 10.0, cz + 2.6);
  spire.rotation.y = Math.PI / 4;
  g.add(spire);
  return g;
}

function buildHouses(era, world) {
  const g = new THREE.Group();
  const vis = era.vis;

  const lots = [];
  if (era.key === 'founding') {
    // 1831: a handful of cabins huddled near the plat — the village is a rumor
    // (kept west of the river band on the land side)
    [[16, -8], [-10, 18], [18, 24], [6, 30], [-14, 4]].forEach(([x, z]) => lots.push({ x, z, rot: Math.PI }));
  } else {
    // residential across the east river — the Eastside, over the water
    for (let i = 0; i < 6; i++) lots.push({ x: 48 + (i % 3) * 7, z: 25 + Math.floor(i / 3) * 8, rot: Math.PI });
    // west-side neighborhoods — off the bridge approach, on the land side
    for (let i = 0; i < 3; i++) lots.push({ x: -50 - (i % 2) * 7, z: -14 + i * 8, rot: Math.PI / 2 });
    // north of rail: mill cottages (1905+)
    if (since(era, 'celery')) {
      for (let i = 0; i < 5; i++) lots.push({ x: -22 + i * 7, z: 50, rot: Math.PI, cottage: true });
    }
  }

  const palettes = {
    founding: ['#c9b896', '#b5a079'],
    boiling: ['#c9b896', '#b5a079', '#a8916b'],
    celery: ['#8a5a3a', '#6b4438', '#7a6248', '#5c6b58'],
    mall: ['#d4c3a8', '#c2b49a', '#8a9a8a', '#b8a888'],
    seventies: ['#c0aa85', '#9f8a6d', '#8a7a5c', '#b8a888'],
    paper: ['#6b5b4f', '#7d6a58', '#5c5048', '#8a7a68'],
    nineties: ['#8a7a68', '#7d6a58', '#6b5b4f', '#9b8a74'],
    living: ['#ded5c8', '#c5b8a8', '#8a9a8a', '#b08968'],
    returns: ['#8fb89f', '#b8ab90', '#9aa88a', '#c5b8a8'],
  };

  lots.forEach((lot, idx) => {
    let house;
    if (era.key === 'founding' || (era.key === 'boiling' && idx % 2 === 0)) {
      house = logCabin();
    } else {
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x2c3844, roughness: 0.3,
        emissive: new THREE.Color(vis.lamp || '#ffd9a0'), emissiveIntensity: 0,
      });
      world.windowMats.push(winMat);
      house = gableHouse({
        w: lot.cottage ? 4.2 : rand(4.8, 5.8),
        d: lot.cottage ? 4.6 : rand(5.2, 6.2),
        h: lot.cottage ? 2.3 : (era.key === 'celery' ? rand(2.8, 3.3) : rand(2.3, 2.8)),
        wall: M({ color: pick(palettes[era.key]), roughness: 0.88 }),
        roof: M({ color: 0x3f3832, roughness: 0.85 }),
        windowMat: winMat,
        porch: era.key === 'celery' || (era.key === 'living' && R() < 0.5),
        solar: since(era, 'living') && (era.key === 'returns' || R() < 0.4),
      });
    }
    house.position.set(lot.x, 0, lot.z);
    house.rotation.y = (lot.rot || 0) + rand(-0.12, 0.12);
    g.add(house);
    block(world, lot.x, lot.z, lot.cottage ? 5.2 : 6.6, lot.cottage ? 5.6 : 7.2);
    if (only(era, 'founding', 'boiling') && house.userData.chimneyTop) {
      const top = house.userData.chimneyTop.clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), house.rotation.y)
        .add(house.position);
      world.hearths.push(top);
    }
  });

  // Harris orchard north of the rail, on the land side: whips in 1831, rows by 1855
  if (era.key === 'boiling') {
    for (let i = 0; i < 8; i++) {
      const tx = -44 + (i % 4) * 4.5, tz = 45 + Math.floor(i / 4) * 4.5;
      g.add(makeTree(tx, tz, 0.62, ['#4f7a3a'], 'round'));
      block(world, tx, tz, 1.0, 1.0);
    }
  } else if (era.key === 'founding') {
    for (let i = 0; i < 8; i++) {
      const tx = -44 + (i % 4) * 4.5, tz = 45 + Math.floor(i / 4) * 4.5;
      g.add(makeTree(tx, tz, 0.5, ['#5c8a44'], 'sapling'));
      block(world, tx, tz, 0.6, 0.6);
    }
  }

  return g;
}

function buildLamps(era, world) {
  const g = new THREE.Group();
  if (!era.vis.lamp) return g;
  const lampMatBase = { color: 0x2a2c30, roughness: 0.6, metalness: 0.5 };

  const spots = [];
  for (let z = -22; z <= 4; z += 9) spots.push([3.6, z], [-3.6, z + 4.5]);
  for (let x = -10; x <= 30; x += 10) spots.push([x, 13.6]);

  spots.forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), M(lampMatBase));
    pole.position.set(x, 2.2, z);
    g.add(pole);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x4a4438, emissive: new THREE.Color(era.vis.lamp), emissiveIntensity: 0,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), bulbMat);
    bulb.position.set(x, 4.5, z);
    g.add(bulb);
    world.lampMats.push(bulbMat);
    if (i % 4 === 0 && world.lampLights.length < 4) {
      const pl = new THREE.PointLight(new THREE.Color(era.vis.lamp), 0, 20, 1.9);
      pl.position.set(x, 4.6, z);
      g.add(pl);
      world.lampLights.push(pl);
    }
  });

  return g;
}

function buildStringLights(era, world) {
  const g = new THREE.Group();
  if (!since(era, 'living')) return g;

  // catenaries across the Mall
  for (let z = -20; z <= 2; z += 7.5) {
    world.stringLightRuns.push({ from: new THREE.Vector3(-4.6, 4.6, z), to: new THREE.Vector3(4.6, 4.4, z + 3) });
  }

  const bulbGeo = new THREE.SphereGeometry(0.09, 6, 5);
  world.stringLightRuns.forEach(run => {
    const from = run.from, to = run.to;
    const dist = from.distanceTo(to);
    const n = Math.floor(dist / 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6b5b3a, emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0,
    });
    world.stringMats.push(mat);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = from.clone().lerp(to, t);
      p.y -= Math.sin(t * Math.PI) * 0.7; // sag
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.copy(p);
      g.add(bulb);
    }
  });
  return g;
}

// ------------------------------------------------------------- downtown landmarks
// One shared geography, more of it named. These buildings persist across eras
// but change clothes, signage, or presence — and every one registers its
// footprint so the living city walks around them, not through them.

function buildDowntownLandmarks(era, world) {
  const g = new THREE.Group();

  const brick = base => new THREE.MeshStandardMaterial({
    map: brickTex(base, shade(base, -36), 14), color: 0xffffff, roughness: 0.88,
  });
  const blade = (text, opts, w, h, d) => new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      map: signTex(text, opts), color: 0xffffff, roughness: 0.7,
      ...(opts.neon ? { emissive: new THREE.Color(opts.neon), emissiveIntensity: 0 } : {}),
    })
  );

  // ---- The Burdick House → Radisson Plaza (since 1905 here; the ground hosted
  // hotels since 1855). NE corner of Burdick & Michigan, facing the avenue.
  if (since(era, 'celery')) {
    const hotel = new THREE.Group();
    hotel.userData.landmark = 'hotel';
    // Anchor is the built center now: south side of E. Michigan, Burdick–Rose
    // block, facing the avenue (its sign reads north).
    const { x: hx, z: hz } = PLACES.hotel;
    if (!since(era, 'seventies')) {
      // the grand Burdick Hotel — burned 1909, rebuilt before the ash cooled
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 9.5, 9), brick('#8a5a3a'));
      body.position.set(hx, 4.75, hz);
      body.castShadow = true; body.receiveShadow = true;
      hotel.add(body);
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.55, 9.4), M({ color: 0x5c4632, roughness: 0.85 }));
      cornice.position.set(hx, 9.75, hz);
      hotel.add(cornice);
      const sign = blade('BURDICK HOTEL', { bg: '#2a241e', fg: '#f2e8d8', font: 'bold 44px Georgia', sub: 'SINCE 1855' }, 7, 1.6, 0.12);
      sign.position.set(hx, 7.6, hz + 4.58);
      hotel.add(sign);
    } else {
      // the 1975 plaza hotel, urban renewal's tallest apology
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 14, 9),
        M({ color: 0x6b7a85, roughness: 0.65, metalness: 0.15 }));
      body.position.set(hx, 7, hz);
      body.castShadow = true; body.receiveShadow = true;
      hotel.add(body);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(7.4, 12, 0.18),
        M({ color: 0x3a4a5c, roughness: 0.2, metalness: 0.6 }));
      glass.position.set(hx, 6.6, hz + 4.56);
      hotel.add(glass);
      const sign = blade('RADISSON PLAZA', { bg: '#1a252f', fg: '#c9d4e0', font: 'bold 40px Georgia', sub: 'KALAMAZOO', neon: '#a8c4ff' }, 6.4, 1.5, 0.12);
      sign.position.set(hx, 12.2, hz + 4.6);
      hotel.add(sign);
      world.marqueeMats.push(sign.material);
    }
    g.add(hotel);
    world.pickLandmarks.push(hotel);
    block(world, hx, hz, 9, 9);
  }

  // ---- The Rickman (1908 hotel → Milner → apartments), N. Burdick at the rails
  if (since(era, 'mall')) {
    const rick = new THREE.Group();
    rick.userData.landmark = 'rickman';
    const { x: rx, z: rz } = PLACES.rickman;
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 11, 7), brick('#8a5a3a'));
    body.position.set(rx, 5.5, rz);
    body.castShadow = true; body.receiveShadow = true;
    rick.add(body);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.6, 7.4), M({ color: 0x5c4632, roughness: 0.85 }));
    cornice.position.set(rx, 11.3, rz);
    rick.add(cornice);
    const label = since(era, 'seventies') ? 'RICKMAN HOUSE' : 'MILNER HOTEL';
    const sign = blade(label, { bg: '#2a241e', fg: '#f2e8d8', font: 'bold 46px Georgia' }, 0.15, 2.8, 4.5);
    sign.position.set(rx - 4.6, 7.5, rz);
    rick.add(sign);
    g.add(rick);
    world.pickLandmarks.push(rick);
    block(world, rx, rz, 9, 7);
  }

  // ---- Kalamazoo Gospel Mission (est. 1933), across N. Burdick from the Rickman
  if (since(era, 'mall')) {
    const mission = new THREE.Group();
    mission.userData.landmark = 'mission';
    // on Kalamazoo St, east of the depot; the sign faces north up the avenue
    const { x: mx, z: mz } = PLACES.mission;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.8, 6), brick('#6b5b4a'));
    body.position.set(mx, 2.4, mz);
    body.castShadow = true; body.receiveShadow = true;
    mission.add(body);
    const sign = blade('GOSPEL MISSION', { bg: '#2a2d24', fg: '#e8e3d8', font: 'bold 38px Georgia', sub: '448 N. BURDICK • DOORS OPEN' }, 4.4, 1.3, 0.1);
    sign.position.set(mx, 3.9, mz + 3.06);
    mission.add(sign);
    g.add(mission);
    world.pickLandmarks.push(mission);
    block(world, mx, mz, 5.6, 6);
  }

  // ---- The Public Library, foot of Rose St: 1893 Romanesque, then the 1959
  // floating modernist box on the very same ground.
  if (since(era, 'celery')) {
    const lib = new THREE.Group();
    lib.userData.landmark = 'library';
    const { x: lx, z: lz } = PLACES.library;   // 315 S. Rose St — its own clear ground
    if (!since(era, 'mall')) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 6, 7), brick('#7d4030'));
      body.position.set(lx, 3, lz);
      body.castShadow = true; body.receiveShadow = true;
      lib.add(body);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), brick('#6b3428'));
      tower.position.set(lx + 1.7, 4.5, lz + 2.1);
      tower.castShadow = true;
      lib.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 4), M({ color: 0x3f3832, roughness: 0.85 }));
      cap.position.set(lx + 1.7, 9.8, lz + 2.1);
      cap.rotation.y = Math.PI / 4;
      lib.add(cap);
      const sign = blade('PUBLIC LIBRARY', { bg: '#2e2a24', fg: '#eadfcf', font: 'bold 38px Georgia', sub: 'THE VAN DEUSEN GIFT • 1893' }, 0.12, 1.2, 4.6);
      sign.position.set(lx + 3.26, 4.2, lz);
      lib.add(sign);
    } else {
      // Kingscott's Ville Savoye homage: the reading room floats on columns
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 5.2), M({ color: 0x8d99a6, roughness: 0.7 }));
      base.position.set(lx, 1.3, lz);
      lib.add(base);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 7), M({ color: 0xb8c4d0, roughness: 0.78 }));
      upper.position.set(lx, 4.45, lz);
      upper.castShadow = true; upper.receiveShadow = true;
      lib.add(upper);
      [[-2.7, -2.9], [2.7, -2.9], [-2.7, 2.9], [2.7, 2.9]].forEach(([ox, oz]) => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.8, 8), M({ color: 0x9aa5b0, roughness: 0.7 }));
        col.position.set(lx + ox, 1.4, lz + oz);
        lib.add(col);
      });
      const sign = blade('CENTRAL LIBRARY', { bg: '#2a3138', fg: '#e8e3d8', font: 'bold 38px Georgia', sub: '315 S. ROSE ST' }, 0.12, 1.2, 4.8);
      sign.position.set(lx + 3.26, 4.4, lz);
      lib.add(sign);
    }
    g.add(lib);
    world.pickLandmarks.push(lib);
    block(world, lx, lz, 6.4, 7);
  }

  // ---- Shakespeare's Pub + the Lower Level, 241 E. Kalamazoo Ave (the old
  // Shakespeare fishing-rod building), east of Burdick on the avenue
  if (since(era, 'nineties')) {
    const shakes = new THREE.Group();
    shakes.userData.landmark = 'shakespeares';
    const { x: sx, z: sz } = PLACES.shakespeares;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.2, 5.6), brick('#5c4638'));
    body.position.set(sx, 2.6, sz);
    body.castShadow = true; body.receiveShadow = true;
    shakes.add(body);
    const comedy = since(era, 'living');
    const sign = blade("SHAKESPEARE'S", {
      bg: '#1a1612', fg: '#ffe9b8', font: 'bold 42px Georgia',
      sub: comedy ? 'LOWER LEVEL COMEDY — TONIGHT' : '241 E. KALAMAZOO AVE', neon: '#ffd27a',
    }, 3.8, 1.3, 0.1);
    sign.position.set(sx, 4.3, sz + 2.86);
    shakes.add(sign);
    world.marqueeMats.push(sign.material);
    g.add(shakes);
    world.pickLandmarks.push(shakes);
    block(world, sx, sz, 4.6, 5.6);
  }

  // ---- Pro Co Sound (1974 – the 2010s) at 225 Parsons, in the Gibson complex
  // north toward the river: the RAT distortion pedal was born here
  if (only(era, 'seventies', 'paper', 'nineties')) {
    const proco = new THREE.Group();
    proco.userData.landmark = 'proco';
    const { x: px, z: pz } = PLACES.proco;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.4, 4.2), brick('#5c5048'));
    body.position.set(px, 1.7, pz);
    body.castShadow = true; body.receiveShadow = true;
    proco.add(body);
    const sign = blade('PRO CO SOUND', {
      bg: '#1f1a14', fg: '#ffd98a', font: 'bold 36px Georgia',
      sub: era.key === 'seventies' ? 'AT THE SOUND FACTORY • EST. 1974' : 'HOME OF THE RAT', neon: '#ffd98a',
    }, 3.6, 1.1, 0.1);
    sign.position.set(px, 2.9, pz + 2.16);
    proco.add(sign);
    world.marqueeMats.push(sign.material);
    g.add(proco);
    world.pickLandmarks.push(proco);
    block(world, px, pz, 4.6, 4.2);
  }

  // ---- Fourth Coast Cafe (1992), pulled in toward downtown (Westnedge/Vine),
  // no longer marooned far to the south
  if (since(era, 'nineties')) {
    const cafe = new THREE.Group();
    cafe.userData.landmark = 'fourthcoast';
    const { x: cx, z: cz } = PLACES.fourthcoast;   // south-downtown corridor, SW of Bronson Park
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.8, 5), brick('#a8916b'));
    body.position.set(cx, 1.9, cz);
    body.castShadow = true; body.receiveShadow = true;
    cafe.add(body);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x2c3844, roughness: 0.25, metalness: 0.2,
      emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
    });
    world.windowMats.push(winMat);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 3.4), winMat);
    win.position.set(cx - 3.02, 1.3, cz);
    cafe.add(win);
    const sign = blade('FOURTH COAST CAFE', {
      bg: '#3a2a1f', fg: '#f2e8d8', font: 'bold 30px Georgia',
      sub: era.key === 'nineties' ? 'SINCE 1992' : "COFFEE • BREAD • THE CROW'S NEST",
    }, 0.1, 1.1, 4.2);
    sign.position.set(cx - 3.06, 3.0, cz);
    cafe.add(sign);
    g.add(cafe);
    world.pickLandmarks.push(cafe);
    block(world, cx, cz, 6, 5);
  }

  return g;
}

// ------------------------------------------------------------- echoes
// The palimpsest pass: every era carries faint remnants of the other layers,
// pressed into the ground like writing under writing. Opacity is owned by the
// lighting pass (applyEnvironment) — echoes breathe in at dusk, memory hour.
// Echoes run forward as well as back: 1905 already dreams the Mall's stakes.

function buildEchoes(era, world) {
  const g = new THREE.Group();

  const echoMat = (color, base) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: base, depthWrite: false });
    m.userData.echoBase = base;
    world.echoMats.push(m);
    return m;
  };
  // a flat strip/ring laid on the ground; rotZ spins it in-plane
  const flat = (geo, mat, x, z, y = 0.06, rotZ = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotZ;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  // ghost streetcar rails inlaid in the Mall paving — the cars stopped in
  // 1932; the bricks still remember the gauge
  const ghostRails = () => {
    const m = echoMat(0x8a9097, 0.15);
    [-0.75, 0.75].forEach(x => flat(new THREE.PlaneGeometry(0.16, 29), m, x, -9, 0.055));
  };

  if (only(era, 'founding')) {
    // 1831's echoes all run forward: the iron road, fifteen years off,
    // already faintly pressed into the bracken north of the village
    const m = echoMat(0x8a9097, 0.12);
    [-0.8, 0.8].forEach(off => flat(new THREE.PlaneGeometry(120, 0.14), m, 0, 40 + off, 0.06));
    // and the thread of the street Burdick will become — brick, dreaming
    flat(new THREE.PlaneGeometry(0.22, 30), echoMat(0xe8e3d8, 0.09), 0, -9, 0.05);
  } else if (only(era, 'boiling')) {
    // the portage trail — older than any deed, headed for the ford
    const trail = echoMat(0xd8cfb6, 0.13);
    const from = { x: -30, z: -30 }, to = { x: 30, z: 8 };   // headed for the east ford
    const dx = to.x - from.x, dz = to.z - from.z;
    flat(new THREE.PlaneGeometry(1.0, Math.hypot(dx, dz)), trail,
      (from.x + to.x) / 2, (from.z + to.z) / 2, 0.055, Math.atan2(-dx, -dz));
    // gathering ground under the park oaks: a wide ring nobody planted
    flat(new THREE.RingGeometry(3.6, 4.1, 28), echoMat(0xd8cfb6, 0.11), -6, -2, 0.055);
  } else if (only(era, 'celery')) {
    // pale survey stakes of the future Mall — an echo running forward
    const stakeMat = echoMat(0xe8e3d8, 0.16);
    for (let i = 0; i < 6; i++) {
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), stakeMat);
      stake.position.set(i % 2 ? 3.4 : -3.4, 0.35, -22 + i * 5.2);
      g.add(stake);
    }
    // the thread of the pedestrian street to come
    flat(new THREE.PlaneGeometry(0.2, 30), echoMat(0xe8e3d8, 0.08), 0, -9, 0.05);
  } else if (only(era, 'mall')) {
    // the old Burdick centerline, still driving home under the new bricks
    const m = echoMat(0xd8d2c4, 0.12);
    for (let z = -21; z <= 3; z += 4) flat(new THREE.PlaneGeometry(0.18, 2.0), m, 0, z, 0.055);
  } else if (only(era, 'paper')) {
    // celery-row striping bleeding through the parking lot — Greta's scene,
    // literalized: the field correcting a typo
    const m = echoMat(0x7fa05f, 0.13);
    for (let r = 0; r < 5; r++) flat(new THREE.PlaneGeometry(21, 0.5), m, -36, -46 + r * 3, 0.075);
  } else if (only(era, 'living')) {
    ghostRails();
    // the Fountain of the Pioneers' ring, a pale circle in the park bed —
    // removal leaves a mark too
    flat(new THREE.RingGeometry(3.1, 3.5, 26), echoMat(0xcfc6b0, 0.13), -6, -2, 0.06);
  } else {
    ghostRails();
    // mill foundation outline in the ruins lawn: the amphitheater sits
    // exactly where the beaters thundered
    const m = echoMat(0xb8a890, 0.15);
    flat(new THREE.PlaneGeometry(16, 0.3), m, -22, -32.5, 0.06);
    flat(new THREE.PlaneGeometry(16, 0.3), m, -22, -21.5, 0.06);
    flat(new THREE.PlaneGeometry(0.3, 11), m, -30, -27, 0.06);
    flat(new THREE.PlaneGeometry(0.3, 11), m, -14, -27, 0.06);
  }

  return g;
}

// ------------------------------------------------------------- the era world

export function buildEraWorld(era) {
  R = mulberry32(seedFrom(era.key));   // deterministic construction per era

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(era.vis.fogDay), era.vis.fogDensity);

  const world = {
    era, scene,
    agents: [], cruisers: [], particles: [],
    windowMats: [], lampMats: [], lampLights: [], marqueeMats: [], stringMats: [],
    crossingLights: [], stringLightRuns: [], hearths: [], echoMats: [],
    pickLandmarks: [],
    obstacles: [], noStand: [],
    drifters: [], water: null, train: null, onTrain: null,
    time: 0,
  };
  // the rail crossing blocks foot traffic only while a train is passing
  world.railBlock = { x1: -92, z1: 38.3, x2: 92, z2: 41.7, active: false };
  world.obstacles.push(world.railBlock);

  // ---- lights
  world.amb = new THREE.AmbientLight(0x506070, 0.5);
  world.hemi = new THREE.HemisphereLight(0xaaccff, 0x33402a, 0.7);
  world.sun = new THREE.DirectionalLight(0xffffff, 2.2);
  world.sun.position.set(40, 55, 25);
  world.sun.castShadow = true;
  world.sun.shadow.mapSize.set(2048, 2048);
  world.sun.shadow.camera.near = 10;
  world.sun.shadow.camera.far = 220;
  const S = 78;
  world.sun.shadow.camera.left = -S; world.sun.shadow.camera.right = S;
  world.sun.shadow.camera.top = S; world.sun.shadow.camera.bottom = -S;
  world.sun.shadow.bias = -0.0004;
  world.sun.shadow.normalBias = 0.03;
  scene.add(world.amb, world.hemi, world.sun, world.sun.target);

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    ...SkyShader,
    uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
    side: THREE.BackSide, depthWrite: false,
  });
  skyMat.uniforms.uZenith.value = new THREE.Color(era.vis.skyDay[0]);
  skyMat.uniforms.uHorizon.value = new THREE.Color(era.vis.skyDay[1]);
  skyMat.uniforms.uSunDir.value = new THREE.Vector3(0.4, 0.5, 0.2);
  skyMat.uniforms.uSunColor.value = new THREE.Color('#ffe8c0');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(430, 28, 14), skyMat);
  scene.add(sky);
  world.sky = { mesh: sky, mat: skyMat };

  // ---- ground
  const gTex = groundTex(era.vis.ground[0], era.vis.ground[1]);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: gTex, roughness: 1 })
  );
  if (!gTex) ground.material.color = new THREE.Color(era.vis.ground[0]);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- the persistent places
  const group = new THREE.Group();
  world.group = group;
  // TRUE-MAP DISPLAY: all logic (geo, obstacles, agent targets, safety bands)
  // stays authored as +x=East / +z=North, but a Y-up engine renders that frame
  // east-west MIRRORED when you ask for north-up. Reflecting the visual group in
  // z (north→display −z) fixes the handedness, so the camera can finally show
  // BOTH north-up AND east-right (river on the right). Agents/picking ride this
  // group, so they stay consistent; the smoke test reads the authored frame and
  // is unaffected. (Text on z-reading signs is un-mirrored in a post-build pass.)
  group.scale.z = -1;
  scene.add(group);

  group.add(buildRiver(era, world));
  group.add(buildRoads(era, world));
  group.add(buildStorefronts(era, world));
  group.add(buildPark(era, world));
  group.add(buildRail(era, world));
  group.add(buildMillSite(era, world));
  group.add(buildFlats(era, world));
  group.add(buildHouses(era, world));
  const church = buildChurch(era, world); if (church) group.add(church);
  group.add(buildTower(era, world));
  group.add(buildLamps(era, world));
  group.add(buildStringLights(era, world));
  group.add(buildEchoes(era, world));
  const theatre = buildTheatre(era, world); if (theatre) group.add(theatre);
  group.add(buildDowntownLandmarks(era, world));
  const gazette = buildGazette(era, world); if (gazette) group.add(gazette);
  const nightlife = buildNightlifeAndShops(era, world); if (nightlife) group.add(nightlife);
  const northwest = buildNorthwestUnit(era, world); if (northwest) group.add(northwest);
  const upjohn = buildUpjohn(era, world); if (upjohn) group.add(upjohn);
  const superfund = buildSuperfund(era, world); if (superfund) group.add(superfund);
  const wmu = buildWMU(era, world); if (wmu) group.add(wmu);
  const gibson = buildGibson(era, world); if (gibson) group.add(gibson);
  const checker = buildChecker(era, world); if (checker) group.add(checker);
  const easthall = buildEastHall(era, world); if (easthall) group.add(easthall);
  const newsagency = buildNewsAgency(era, world); if (newsagency) group.add(newsagency);

  // ---- trees
  const treeKinds = { founding: ['oak', 'round', 'pine', 'oak'], boiling: ['round', 'oak', 'pine'], celery: ['round', 'round', 'oak'], mall: ['round', 'round'], seventies: ['round', 'round'], paper: ['sapling', 'round'], nineties: ['sapling', 'round'], living: ['round', 'round', 'oak'], returns: ['round', 'oak', 'willow', 'pine'] };
  const kinds = treeKinds[era.key];
  let planted = 0, guard = 0;
  while (planted < era.vis.treeCount && guard++ < 400) {
    const x = rand(-86, 86), z = rand(-86, 86);
    if (Math.abs(x) < 12 && z > -32 && z < 16) continue;       // keep downtown clear
    if (Math.abs(x) < 3 && z > -44 && z < 35) continue;        // Burdick spine (streetcar/mall)
    if (x > 18 && x < 47) continue;                            // river corridor (east now)
    if (Math.abs(z - 40) < 5) continue;                        // rails
    if (Math.abs(z - 10) < 5 || Math.abs(z + 26) < 4) continue;// streets
    if (x > -18 && x < -10 && z > -37 && z < 37) continue;     // Rose St
    if (x > -29 && x < -13 && z > -27 && z < 11) continue;     // the Bronson Park loop streets
    if (x > -75 && x < -46 && z > 8 && z < 38) continue;       // campus shuttle's drive
    if (x > -50 && x < -22 && z > -50 && z < -28) continue;    // flats (southwest)
    if (inFootprint(world, x, z, 1.2)) continue;               // never inside a building
    const kind = pick(kinds);
    group.add(makeTree(x, z, rand(0.7, 1.25), era.vis.foliage, kind));
    block(world, x, z, 1.0, 1.0);
    planted++;
  }
  // willows by the river
  for (let i = 0; i < (era.key === 'returns' ? 8 : 4); i++) {
    group.add(makeTree(GEO.riverX + pick([-1, 1]) * rand(9.5, 12), rand(-80, 80), rand(0.8, 1.2), era.vis.foliage, 'willow'));
  }

  // ---- particles
  if (era.vis.smoke === 'mill' && world.stackTop) {
    const s1 = makeSmokeColumn(world.stackTop, { color: '#8d8d90', rate: 1.1, count: 80 });
    world.particles.push(s1); group.add(s1.points);
    const s2 = makeSmokeColumn(world.stackTop.clone().add(new THREE.Vector3(-3.4, 0, 0)), { color: '#9d9da0', rate: 0.8, count: 60 });
    world.particles.push(s2); group.add(s2.points);
  } else if (era.vis.smoke === 'half' && world.stackTop) {
    const s = makeSmokeColumn(world.stackTop, { color: '#8d8d90', rate: 0.4, count: 36 });
    world.particles.push(s); group.add(s.points);
  } else if (era.vis.smoke === 'hearth') {
    world.hearths.filter(Boolean).slice(0, 4).forEach(p => {
      const s = makeSmokeColumn(p, { color: '#b8b4ac', rate: 0.5, spread: 0.7, rise: 1.6, count: 26 });
      world.particles.push(s); group.add(s.points);
    });
  }
  if (era.vis.fireflies) {
    const f1 = makeFireflies({ x: GEO.riverX - 12, z: 0, w: 26, d: 90 }, 50);
    world.fireflies = [f1];
    group.add(f1.points);
    const f2 = makeFireflies({ x: -42, z: -40, w: 26, d: 18 }, 36);
    world.fireflies.push(f2);
    group.add(f2.points);
  }
  if (era.key === 'paper') {
    const ash = makeMotes({ color: '#b8b4ac', count: 80, fall: 0.5, opacity: 0.3 });
    world.motes = ash; group.add(ash.points);
  } else if (only(era, 'founding', 'boiling')) {
    const pollen = makeMotes({ color: '#e8d9a0', count: 60, fall: 0.12, opacity: 0.22 });
    world.motes = pollen; group.add(pollen.points);
  } else if (era.key === 'celery') {
    const soot = makeMotes({ color: '#9a948a', count: 50, fall: 0.25, opacity: 0.2 });
    world.motes = soot; group.add(soot.points);
  }

  // ---- anchors (where life gathers) & residents
  const ANCHOR_SETS = {
    founding: [
      { x: 0, z: -6, r: 8 }, { x: -16, z: -24, r: 7 }, { x: -18, z: -6, r: 8 },
      { x: 8, z: -36, r: 8 }, { x: -21, z: 10, r: 5 }, { x: 16, z: 24, r: 7 }, { x: -8, z: 16, r: 6 },
    ],
    boiling: [
      { x: 0, z: -6, r: 9 }, { x: -16, z: -24, r: 7 }, { x: -18, z: -6, r: 8 },
      { x: 8, z: -36, r: 8 }, { x: -21, z: 10, r: 5 }, { x: 16, z: 24, r: 8 }, { x: 12, z: 42.5, r: 4 },
    ],
    celery: [
      { x: 0, z: -10, r: 9 }, { x: 0, z: -10, r: 9 }, { x: -14, z: -24, r: 7 },
      { x: -18, z: -6, r: 8 }, { x: 12, z: 42.5, r: 4 }, { x: -34, z: -40, r: 9 }, { x: -10, z: 50, r: 7 },
    ],
    mall: [
      { x: 0, z: -10, r: 8 }, { x: 0, z: -2, r: 8 }, { x: 0, z: -18, r: 8 },
      { x: -18, z: -6, r: 8 }, { x: 10, z: -10, r: 5 }, { x: 12, z: 42.5, r: 4 }, { x: 11, z: 6, r: 8 },
    ],
    seventies: [
      { x: 0, z: -8, r: 9 }, { x: -19.5, z: 16, r: 5 }, { x: -72, z: -16, r: 5 },
      { x: -10, z: -10, r: 5 }, { x: 11, z: 6, r: 7 }, { x: -64, z: 36, r: 7 }, { x: 11, z: 24, r: 6 },
    ],
    paper: [
      { x: 0, z: -8, r: 9 }, { x: -14, z: -24, r: 7 }, { x: -18, z: -6, r: 8 },
      { x: 0, z: 2, r: 6 }, { x: 11, z: 6, r: 8 }, { x: -34, z: -40, r: 7 }, { x: -16, z: -46, r: 5 },
    ],
    nineties: [
      { x: 11, z: 24, r: 7 }, { x: -19.5, z: 16, r: 5 }, { x: -72, z: -16, r: 5 },
      { x: 0, z: -8, r: 9 }, { x: 11, z: 6, r: 7 }, { x: -18, z: -6, r: 8 }, { x: 8, z: -31.5, r: 4 },
    ],
    living: [
      { x: 0, z: -10, r: 8 }, { x: 0, z: -2, r: 8 }, { x: -18, z: -17, r: 7 },
      { x: -18, z: -6, r: 8 }, { x: -34, z: -40, r: 8 }, { x: -21, z: 8, r: 5 }, { x: 10, z: -10, r: 5 },
    ],
    returns: [
      { x: -21, z: -2, r: 5 }, { x: 0, z: -10, r: 8 }, { x: -34, z: -40, r: 8 },
      { x: -19, z: -20, r: 6 }, { x: -18, z: -6, r: 8 }, { x: -21, z: 16, r: 5 }, { x: 0, z: 0, r: 9 },
    ],
  };
  const anchors = ANCHOR_SETS[era.key];
  world.anchors = anchors;

  // ---- live traffic lanes: fine to cross, nowhere to stand
  // Michigan Ave carries something in every era (wagons → buses).
  world.noStand.push({ x1: -52, z1: 8.2, x2: 44, z2: 12.0 });
  if (era.key === 'celery') {
    // the streetcar owns the middle of Burdick
    world.noStand.push({ x1: -2.2, z1: -44, x2: 2.2, z2: 34 });
  }
  if (since(era, 'mall')) {
    // South St also carries traffic in the car eras — no standing in the lane.
    world.noStand.push({ x1: -30, z1: -27.8, x2: 22, z2: -24.2 });
  }
  const nav = { obstacles: world.obstacles, zones: world.noStand };

  era.people.forEach((person, i) => {
    const a = anchors[i % anchors.length];
    const spawn = { x: a.x + rand(-4, 4), z: a.z + rand(-4, 4) };
    const agent = new Agent(person, person.look, anchors, spawn, nav);
    world.agents.push(agent);
    group.add(agent.mesh);
  });
  world.agentMeshes = world.agents.map(a => a.mesh);

  // ---- vehicles
  // Downtown traffic runs the two E–W avenues, both kept clear of building
  // footprints: E. Michigan (z 10) and South St (z −26). The old rectangular loop
  // needed Portage St, which the new grid drops, so cars shuttle the avenues now.
  const MICH = (k, c, sp) => world.cruisers.push(new Shuttle(k, c, { x: -50, z: 10 }, { x: 44, z: 10 }, sp));
  const SOUTH = (k, c, sp) => world.cruisers.push(new Shuttle(k, c, { x: -30, z: -26 }, { x: 22, z: -26 }, sp));
  // The campus shuttle runs Stadium Dr in from the west along E. Michigan.
  const broncoRoute = [{ x: -49, z: 10 }];
  if (only(era, 'founding', 'boiling')) {
    // 1831's wagon is an ox-team: same road, slower opinion
    world.cruisers.push(new Shuttle('wagon', null, { x: -8, z: 10 }, { x: 40, z: 10 }, era.key === 'founding' ? 1.0 : 1.3));
  } else if (era.key === 'celery') {
    world.cruisers.push(new Shuttle('streetcar', null, { x: 0, z: -42 }, { x: 0, z: 32 }, 4.2));
    world.cruisers.push(new Shuttle('wagon', null, { x: 36, z: 10 }, { x: -8, z: 10 }, 1.4));
  } else if (era.key === 'mall') {
    MICH('finned', 0xc23a3a, 7); MICH('finned', 0x4a8ab5, 6.4); SOUTH('checker', 0xe8b400, 7.5);
  } else if (era.key === 'paper') {
    MICH('boxy', 0x6e3a3a, 5.6); SOUTH('boxy', 0x3a4a5c, 6.2); MICH('checker', 0xe8b400, 6.6);
  } else if (era.key === 'living') {
    MICH('ev', 0x4a6b8a, 6.2); MICH('bus', 0x3a7a5f, 4.5); SOUTH('bike', 0x2a9d8f, 3.4);
    const bronco = new Shuttle('bus', 0x5c3a21, { x: -72, z: 33 }, { x: -19, z: 10 }, 4.0, broncoRoute);
    bronco.mesh.userData.phase2 = 'bronco-shuttle';
    world.cruisers.push(bronco);
  } else {
    const bronco = new Shuttle('bus', 0x5c3a21, { x: -72, z: 33 }, { x: -19, z: 10 }, 4.2, broncoRoute);
    bronco.mesh.userData.phase2 = 'bronco-shuttle';
    world.cruisers.push(bronco);
    MICH('bus', 0x4f8a6b, 4.5); SOUTH('bike', 0x2a9d8f, 3.2); SOUTH('bike', 0xc28a2f, 3.6);
  }
  world.cruisers.forEach(c => {
    c.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(c.mesh);
  });

  // ---- per-frame world update
  world.update = (dt, t, nightAmt) => {
    world.time = t;
    world.agents.forEach(a => a.update(dt, t));
    updateChats(world.agents, dt);
    world.cruisers.forEach(c => c.update(dt));
    if (world.train) {
      world.train.update(dt);
      world.railBlock.active = world.train.running;   // nobody walks into a train
      world.crossingLights.forEach(cl => {
        cl.mat.emissiveIntensity = world.train.running ? ((Math.sin(t * 9 + cl.phase * Math.PI) > 0) ? 2.4 : 0.1) : 0;
      });
    }
    world.particles.forEach(p => p.update(dt, t));
    if (world.fireflies) world.fireflies.forEach(f => f.update(dt, t, nightAmt));
    if (world.motes) world.motes.update(dt, t);
    if (world.water) world.water.mat.uniforms.uTime.value = t;
    if (world.millWheel) world.millWheel.rotation.x += dt * 0.6;
    world.drifters.forEach(d => {
      d.mesh.position.z += d.speed * dt;
      if (d.mesh.position.z > 90) d.mesh.position.z = -90;
    });
    if (world.sturgeon) {
      world.sturgeon.position.z = -20 + Math.sin(t * 0.05) * 55;
      world.sturgeon.position.x = GEO.riverX + Math.sin(t * 0.11) * 3;
    }
  };

  world.dispose = () => {
    scene.traverse(o => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (!m) return;
          m.map?.dispose?.();
          m.dispose?.();
        });
      }
    });
  };

  // True-map text fix: the visual group is reflected in z (group.scale.z = -1),
  // which would render any word that reads along the z-axis mirror-written. For
  // every text mesh (flagged via signTex / the STATE blade), cancel the reflection
  // locally (scale.z *= -1): the parent still places the sign at its reflected
  // spot, but its glyphs read forward again. Sign meshes are thin in their facing
  // axis, so reflecting them about their own center is otherwise invisible.
  group.traverse(o => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.map?.userData?.isText) {
      o.scale.z *= -1;
    }
  });

  R = Math.random;   // construction over; runtime randomness stays random

  return world;
}

export { since, only, stage };
