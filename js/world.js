// World building: one shared geography, six skins of time.
// Anchored places hold their coordinates in every era — only time moves.

import * as THREE from '../vendor/three/three.module.min.js';
import { SkyShader, WaterShader } from './shaders.js';
import {
  Agent, Cruiser, Shuttle, Train,
  makeSmokeColumn, makeFireflies, makeMotes, updateChats,
} from './agents.js';

const ERA_ORDER = ['boiling', 'celery', 'mall', 'paper', 'living', 'returns'];
const stage = key => ERA_ORDER.indexOf(key);
const since = (era, key) => stage(era.key) >= stage(key);
const only = (era, ...keys) => keys.includes(era.key);

const M = opts => new THREE.MeshStandardMaterial(opts);

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
  return canvasTex(512, 128, (ctx, w, h) => {
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
  const wide = only(era, 'boiling', 'returns');
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
  water.position.set(-34, 0.14, 0);
  water.userData.landmark = 'river';
  g.add(water);
  world.water = { mesh: water, mat: waterMat };
  world.pickLandmarks.push(water);

  // banks
  const bankMat = M({ color: only(era, 'paper') ? 0x4d5244 : 0x3d5232, roughness: 0.95 });
  [-1, 1].forEach(s => {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(5, 184), bankMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(-34 + s * (width / 2 + 2.4), 0.05, 0);
    bank.receiveShadow = true;
    g.add(bank);
  });

  // riverwalk (2026+): the city turns to face the water again — boardwalk,
  // lean rail, benches on the east bank, where the anchors already point
  if (since(era, 'living')) {
    world.riverwalk = true;
    const edge = -34 + width / 2;               // the water's east edge
    const deckMat = M({ color: 0x8a7355, roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 92), deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(edge + 1.9, 0.08, -8);
    deck.receiveShadow = true;
    g.add(deck);
    const seamMat = M({ color: 0x6e5a42, roughness: 0.95 });
    for (let z = -52; z <= 36; z += 4) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.07), seamMat);
      seam.rotation.x = -Math.PI / 2;
      seam.position.set(edge + 1.9, 0.085, z);
      g.add(seam);
    }
    const walkRailMat = M({ color: 0x4a4438, roughness: 0.55, metalness: 0.45 });
    const leanRail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 92), walkRailMat);
    leanRail.position.set(edge + 0.5, 1.02, -8);
    g.add(leanRail);
    for (let z = -52; z <= 36; z += 5.5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 5), walkRailMat);
      post.position.set(edge + 0.5, 0.5, z);
      g.add(post);
    }
    // benches turned toward the water (the bridge keeps z ≈ 7..13 for itself)
    [-44, -28, -10, 20].forEach(z => {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 2.0), M({ color: 0x5c4f40, roughness: 0.85 }));
      bench.position.set(edge + 3.4, 0.21, z);
      bench.castShadow = true;
      g.add(bench);
    });
  }

  // sandbars in the rewilded future
  if (only(era, 'returns', 'boiling')) {
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.CircleGeometry(rand(1.6, 3), 10), M({ color: 0xcbb992, roughness: 1 }));
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(-34 + rand(-4, 4), 0.18, -70 + i * 42 + rand(-6, 6));
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
    // sturgeon shadow (2050): a long dark shape, under the surface, patient
    if (only(era, 'returns')) {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 12),
        new THREE.MeshBasicMaterial({ color: 0x07181c, transparent: true, opacity: 0.4 })
      );
      shadow.scale.set(1, 2.6, 1);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(-34, 0.1, 20);
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
      log.position.set(-34 + rand(-4, 4), 0.22, rand(-85, 85));
      g.add(log);
      world.drifters.push({ mesh: log, speed: rand(1.0, 1.8) });
    }
  } else if (vis.water.drift === 'foam') {
    for (let i = 0; i < 6; i++) {
      const foam = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 1.3), 8),
        new THREE.MeshBasicMaterial({ color: 0xb9b4a4, transparent: true, opacity: 0.45 }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(-34 + rand(-5, 5), 0.2, rand(-85, 85));
      g.add(foam);
      world.drifters.push({ mesh: foam, speed: rand(0.8, 1.4) });
    }
  } else if (vis.water.drift === 'lily') {
    for (let i = 0; i < 10; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.3, 0.6), 8), M({ color: 0x2e6b3d, roughness: 0.8 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(-34 + rand(-6.5, 6.5), 0.2, rand(-80, 80));
      g.add(pad);
      world.drifters.push({ mesh: pad, speed: rand(0.1, 0.25) });
    }
  }

  // bridge at Michigan Ave (z = 10) — every era rebuilds it
  const bridge = new THREE.Group();
  bridge.userData.landmark = 'bridge';
  const bw = width + 8;
  let deckMat, deck;
  if (only(era, 'boiling')) {
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
  bridge.position.set(-34, 0, 10);
  g.add(bridge);
  world.pickLandmarks.push(bridge);

  return g;
}

function buildRoads(era, world) {
  const g = new THREE.Group();
  const roadMat = M({ color: era.vis.road, roughness: 0.95 });
  const dirtMat = M({ color: 0x5d4f37, roughness: 1 });
  const mat = only(era, 'boiling') ? dirtMat : roadMat;

  const mkRoad = (w, l, x, z, rot = 0) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = rot;
    r.position.set(x, 0.02, z);
    r.receiveShadow = true;
    g.add(r);
  };

  mkRoad(7, 104, 0, 4);                      // Burdick (N-S)
  mkRoad(110, 7, -5, 10, Math.PI / 2);       // Michigan Ave (E-W)
  mkRoad(88, 6, 3, -26, Math.PI / 2);        // South St
  mkRoad(6, 70, 22, -2);                     // East St
  mkRoad(6, 72, -14, 0);                     // River Rd

  // sidewalks along Burdick + Michigan
  if (!only(era, 'boiling')) {
    const walkMat = M({ color: 0x8d887c, roughness: 0.9 });
    [-4.4, 4.4].forEach(s => {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 104), walkMat);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(s, 0.03, 4);
      sw.receiveShadow = true;
      g.add(sw);
    });
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
    boiling: ['GENERAL STORE', 'LAND OFFICE', 'KALAMAZOO HOUSE', 'TELEGRAPH', 'HARNESS', 'STOVES & TIN', 'BOOT MAKER'],
    celery: ['GILMORE BROS.', 'DRY GOODS', 'OAKLAND PHARMACY', 'MILLINERY', 'GAZETTE', 'CORSETS', 'HARDWARE', 'IHLING BROS.', 'BICYCLES'],
    mall: ['GILMORE BROTHERS', 'S.S. KRESGE', 'WOOLWORTH', 'SHOES', 'RECORDS', 'LUNCH', 'CAMERA SHOP', 'JACOBSON’S', 'SODA FOUNTAIN'],
    paper: ['FOR LEASE', 'GILMORE BROTHERS', 'CLUB SODA', 'DINER', 'RESALE', 'TV REPAIR', 'PAWN', 'CHECKER PARTS', 'ARCADE'],
    living: ['COFFEE & POEMS', 'MICHIGAN NEWS', 'TAQUERIA', 'BIKE SHOP', 'GALLERY', 'BOOKS', 'BREWPUB', 'CLIMBING GYM', 'RECORD STORE'],
    returns: ['SEED LIBRARY', 'RIVER OUTFITTERS', 'REPAIR CAFE', 'BAKERY', 'STUDIO', 'MARKET HALL', 'TOOL SHARE', 'FIBER MILL', 'CANOE LIVERY'],
  };
  const signs = SIGNS[era.key];
  let signIdx = 0;

  const wood = only(era, 'boiling');
  const brickPalettes = {
    boiling: ['#a8916b', '#8f7a58', '#b5a079'],
    celery: ['#7d4030', '#8a5a3a', '#6b4438', '#96604a'],
    mall: ['#8a5a3a', '#9b8a74', '#7d4030', '#a89a85'],
    paper: ['#6e5648', '#5c5048', '#7d6a58', '#665043'],
    living: ['#8a5a3a', '#7d4030', '#9b8a74', '#b08968'],
    returns: ['#8a5a3a', '#9b8a74', '#a8916b', '#7d6a58'],
  };
  const palette = brickPalettes[era.key];

  // Each row: faceX = x of the street-facing wall; facing = +1 faces +x, -1 faces -x.
  // Buildings run along z; width bw is the z-extent, depth bd the x-extent.
  const rows = [
    { faceX: -5.4, facing: 1, from: -24, to: 4 },
    { faceX: 5.4, facing: -1, from: -22, to: -16 },   // gap for the State Theatre
    { faceX: 5.4, facing: -1, from: -4, to: 6 },
  ];
  if (!wood) rows.push({ faceX: -5.4, facing: 1, from: 14, to: 30 }, { faceX: 5.4, facing: -1, from: 15, to: 30 });

  rows.forEach(row => {
    let z = row.from;
    while (z < row.to) {
      const bw = rand(5.2, 7.2);
      if (z + bw > row.to + 2.5) break;
      const floors = wood ? 1 : (R() < 0.4 ? 3 : 2);
      const bh = wood ? rand(3.4, 4.2) : 3.1 * floors + 0.8;
      const bd = rand(7, 9);
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
      const boarded = era.key === 'paper' && R() < 0.34;
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

      if (!boarded && (only(era, 'mall', 'living', 'returns') || (era.key === 'celery' && R() < 0.6))) {
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
      z += bw + (wood ? rand(0.8, 2.2) : 0.15);
    }
  });

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
  g.add(blade);
  world.marqueeMats.push(blade.material);

  // marquee: wide along the facade (z), overhanging the sidewalk (x)
  const marq = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.3, 5.8),
    new THREE.MeshStandardMaterial({
      map: signTex(era.key === 'living' ? 'WELCOME' : (era.key === 'paper' ? 'OPEN — STILL' : 'TONIGHT'), { bg: '#26201a', fg: '#ffe9b8', font: 'bold 56px Georgia' }),
      color: 0xffffff, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0, roughness: 0.5,
    })
  );
  marq.position.set(-4.0, 4.3, -1.2);
  g.add(marq);
  world.marqueeMats.push(marq.material);
  if (era.key === 'paper') {
    // the lighting pass reads this flag and makes them stutter at night
    marq.material.userData.flicker = true;
    blade.material.userData.flicker = true;
  }

  // sits in the gap left in the east storefront row; blade & marquee are on
  // the local -x side, so the front faces the Mall to the west
  g.position.set(10, 0, -10.5);
  world.pickLandmarks.push(g);
  return g;
}

function buildMillSite(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'mill';
  const pos = new THREE.Vector3(-22, 0, -27);

  if (only(era, 'boiling')) {
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
  } else if (only(era, 'celery', 'mall', 'paper')) {
    const dead = era.key === 'paper';
    const base = dead ? '#6e5648' : '#7d4030';
    const mat = new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -38), 20), color: 0xffffff, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 11), mat);
    body.position.y = 4.5;
    body.castShadow = true; body.receiveShadow = true;
    body.position.copy(pos).setY(4.5);
    g.add(body);
    // sawtooth roof
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 11), M({ color: 0x3f3832, roughness: 0.85 }));
      tooth.position.set(pos.x - 6 + i * 4, 9.6, pos.z);
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
      win.position.set(pos.x - 6.5 + i * 2.6, 4.6, pos.z + 5.56);
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
      stack.position.set(pos.x + 5.5 - i * 3.4, 6, pos.z - 3.4);
      stack.castShadow = true;
      g.add(stack);
      if (i === 0) world.stackTop = stack.position.clone().setY(12.4);
    }
    const millSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.4, 9),
      new THREE.MeshStandardMaterial({ map: signTex(dead ? 'PLANT FOR SALE' : 'KALAMAZOO PAPER CO.', { bg: '#2a241e' }), color: 0xffffff })
    );
    millSign.position.set(pos.x + 8.1, 6.4, pos.z);
    g.add(millSign);
    if (dead) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 0.08), M({ color: 0x8a8a8a, roughness: 0.6, metalness: 0.6, transparent: true, opacity: 0.45 }));
      fence.position.set(pos.x, 0.75, pos.z + 7.4);
      g.add(fence);
    }
  } else if (only(era, 'living')) {
    // the brewery in the mill shell
    const base = '#7d4030';
    const mat = new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -30), 20), color: 0xffffff, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 11), mat);
    body.position.copy(pos).setY(4.5);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a58, roughness: 0.2, metalness: 0.3,
      emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.15,
    });
    world.windowMats.push(winMat);
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 0.08), winMat);
      win.position.set(pos.x - 6.5 + i * 2.6, 4.6, pos.z + 5.56);
      g.add(win);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 12, 10), M({ color: 0x57423a, roughness: 0.9 }));
    stack.position.set(pos.x + 5.5, 6, pos.z - 3.4);
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
    sign.position.set(pos.x + 8.1, 6.4, pos.z);
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
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 8), wallMat);
    wall2.position.set(pos.x - 7.6, 3.75, pos.z - 1);
    wall2.castShadow = true;
    g.add(wall2);
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
  const center = new THREE.Vector3(20, 0, -14);

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(19, 19), M({ color: only(era, 'paper') ? 0x4a5c3a : 0x3e6b35, roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(center.x, 0.035, center.z);
  lawn.receiveShadow = true;
  g.add(lawn);

  // diagonal paths
  [-Math.PI / 4, Math.PI / 4].forEach(rot => {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 25), M({ color: 0x9b9484, roughness: 0.9 }));
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = rot;
    path.position.set(center.x, 0.045, center.z);
    g.add(path);
  });

  // the oaks that heard Lincoln
  const oakScale = { boiling: 0.85, celery: 1.1, mall: 1.35, paper: 1.45, living: 1.6, returns: 1.2 }[era.key];
  [[-6.5, -6], [6.5, -6.5], [-6, 6.5], [7, 6]].forEach(([ox, oz], i) => {
    const s = (era.key === 'returns' && i > 1) ? 0.7 : oakScale; // great-grandchildren oaks
    g.add(makeTree(center.x + ox, center.z + oz, s, era.vis.foliage, 'oak'));
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
    b.position.set(center.x + 5.5, 0, center.z - 5.5);
    g.add(b);
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
  depot.position.set(12, 0, z + 5.2);
  g.add(depot);
  world.pickLandmarks.push(depot);

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
  const styles = { boiling: 'steam', celery: 'steam', mall: 'freight', paper: 'freight', living: 'amtrak', returns: 'electric' };
  world.train = new Train(styles[era.key], z, () => world.onTrain && world.onTrain());
  g.add(world.train.group);

  return g;
}

function buildFlats(era, world) {
  const g = new THREE.Group();
  g.userData.landmark = 'flats';
  const cx = 36, cz = -40;

  const soil = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), M({ color: 0x241d16, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(cx, 0.03, cz);
  soil.receiveShadow = true;
  g.add(soil);

  if (only(era, 'boiling')) {
    // wild marsh: wet patches + reeds; Taylor's first tamed corner
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
    for (let r = 0; r < 4; r++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.5), M({ color: 0x7da05a, roughness: 0.9 }));
      row.position.set(cx - 8, 0.15, cz + 5 + r * 1.1);
      g.add(row);
    }
  } else if (only(era, 'celery', 'mall')) {
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
    if (era.key === 'mall') {
      // suburbs encroaching: surveyor stakes
      for (let i = 0; i < 6; i++) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), M({ color: 0xd9622a, roughness: 0.8 }));
        stake.position.set(cx - 11 + i * 4.4, 0.45, cz + 8);
        g.add(stake);
      }
    }
  } else if (only(era, 'paper')) {
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
  if (only(era, 'boiling')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'superfund';
  const cx = -18, cz = -52;

  if (only(era, 'celery', 'mall')) {
    // settling lagoons, unquestioned
    for (let i = 0; i < 3; i++) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6 - i * 0.4, 12), M({ color: 0x3a3c34, roughness: 0.25 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(cx - 4 + i * 5.5, 0.05, cz + (i % 2) * 3);
      g.add(pool);
    }
  } else if (only(era, 'paper')) {
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 9.5, 2.2, 14), M({ color: 0x595549, roughness: 1 }));
    mound.position.set(cx, 1.1, cz);
    mound.castShadow = true; mound.receiveShadow = true;
    g.add(mound);
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
  const cx = -56, cz = -54;

  const hill = new THREE.Mesh(new THREE.ConeGeometry(16, 7, 14), M({ color: 0x3e5c33, roughness: 1 }));
  hill.position.set(cx, 3.4, cz);
  hill.receiveShadow = true;
  g.add(hill);

  if (only(era, 'boiling')) {
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
  const cx = -64, cz = 36;

  const hill = new THREE.Mesh(new THREE.ConeGeometry(18, 6, 14), M({ color: 0x42603a, roughness: 1 }));
  hill.position.set(cx, 2.9, cz);
  hill.receiveShadow = true;
  g.add(hill);

  const mkHall = (x, z, w, h, d, color) => {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: brickTex(color, shade(color, -36), 10), color: 0xffffff, roughness: 0.88 }));
    hall.position.set(x, 5.9 + h / 2, z);
    hall.castShadow = true;
    g.add(hall);
  };
  mkHall(cx, cz, 6.5, 3.4, 4, '#9b5a3a'); // East Hall — where the normal school began
  if (since(era, 'mall')) {
    mkHall(cx - 6, cz + 4, 5, 4.4, 4, '#8a7a5c');
    mkHall(cx + 6.5, cz + 3, 5, 5.6, 4, '#7d6a58');
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8, 2.2), M({ color: 0xb8ab90, roughness: 0.8 }));
    tower.position.set(cx + 1, 9.9, cz + 6);
    tower.castShadow = true;
    g.add(tower);
  }

  // brown-and-gold banners down the hill approach (2026+): the Broncos claim
  // their stretch of Michigan Ave between campus and the bridge
  if (since(era, 'living')) {
    const gold = M({ color: 0xffae00, roughness: 0.7 });
    const brown = M({ color: 0x6c4023, roughness: 0.7 });
    const bannerPoleMat = M({ color: 0x2a2c30, roughness: 0.6, metalness: 0.5 });
    [-58, -52.5, -47].forEach(px => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 6), bannerPoleMat);
      pole.position.set(px, 2.3, 14.5);
      g.add(pole);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.72), gold);
      top.position.set(px, 4.0, 14.5);
      const fall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.25, 0.72), brown);
      fall.position.set(px, 3.05, 14.5);
      g.add(top, fall);
    });
  }

  world.pickLandmarks.push(g);
  return g;
}

function buildGibson(era, world) {
  if (!since(era, 'mall')) return null;
  const g = new THREE.Group();
  g.userData.landmark = 'gibson';
  const cx = 28, cz = 50;

  const dead = era.key === 'paper';
  const base = '#9b6a4a';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(13, 7, 8),
    new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -34), 14), color: 0xffffff, roughness: 0.88 })
  );
  body.position.set(cx, 3.5, cz);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

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

  const labels = { mall: ['GIBSON', 'Guitars & Mandolins'], paper: ['HERITAGE', 'est. 1985 — same benches'], living: ['HERITAGE GUITAR', '225 Parsons St.'], returns: ['YODER LUTHERIE', 'salvaged maple • since the floors danced'] };
  const [t, s] = labels[era.key] || labels.living;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.15),
    new THREE.MeshStandardMaterial({ map: signTex(t, { bg: '#26201a', fg: '#e8d9b8', sub: s }), color: 0xffffff }));
  sign.position.set(cx, 6.2, cz - 4.15);
  g.add(sign);

  world.pickLandmarks.push(g);
  return g;
}

function buildChurch(era, world) {
  const g = new THREE.Group();
  const cx = -10, cz = -38;
  const wood = only(era, 'boiling');
  const base = wood ? '#d8d2c4' : '#9b8a74';
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 8),
    wood ? M({ color: base, roughness: 0.9 }) : new THREE.MeshStandardMaterial({ map: brickTex(base, shade(base, -30), 12), color: 0xffffff, roughness: 0.88 }));
  body.position.set(cx, 2.1, cz);
  body.castShadow = true;
  g.add(body);
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
  // NE residential
  for (let i = 0; i < 6; i++) lots.push({ x: 30 + (i % 3) * 7.5, z: 18 + Math.floor(i / 3) * 9, rot: Math.PI });
  // across the river
  for (let i = 0; i < 3; i++) lots.push({ x: -50 - (i % 2) * 7, z: -6 + i * 9, rot: Math.PI / 2 });
  // north of rail: mill cottages (1905+)
  if (since(era, 'celery')) {
    for (let i = 0; i < 5; i++) lots.push({ x: -22 + i * 7, z: 50, rot: Math.PI, cottage: true });
  }

  const palettes = {
    boiling: ['#c9b896', '#b5a079', '#a8916b'],
    celery: ['#8a5a3a', '#6b4438', '#7a6248', '#5c6b58'],
    mall: ['#d4c3a8', '#c2b49a', '#8a9a8a', '#b8a888'],
    paper: ['#6b5b4f', '#7d6a58', '#5c5048', '#8a7a68'],
    living: ['#ded5c8', '#c5b8a8', '#8a9a8a', '#b08968'],
    returns: ['#8fb89f', '#b8ab90', '#9aa88a', '#c5b8a8'],
  };

  lots.forEach((lot, idx) => {
    let house;
    if (era.key === 'boiling' && idx % 2 === 0) {
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
    if (era.key === 'boiling' && house.userData.chimneyTop) {
      const top = house.userData.chimneyTop.clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), house.rotation.y)
        .add(house.position);
      world.hearths.push(top);
    }
  });

  // Harris orchard, 1855: rows of apple trees NE
  if (era.key === 'boiling') {
    for (let i = 0; i < 8; i++) {
      const t = makeTree(34 + (i % 4) * 4.5, 30 + Math.floor(i / 4) * 4.5, 0.62, ['#4f7a3a'], 'round');
      g.add(t);
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

// ------------------------------------------------------------- street signs
// Small blades at the corners: the names locals navigate by. Porcelain black
// in the Victorian city, municipal green from the Mall era on.

function buildStreetSigns(era, world) {
  const g = new THREE.Group();
  world.streetSigns = [];
  if (!since(era, 'celery')) return g;   // the village points with its hands

  const modern = since(era, 'mall');
  const style = modern
    ? { bg: '#1d5232', fg: '#f3f5f0', font: 'bold 58px Georgia' }
    : { bg: '#14161a', fg: '#e8e3d8', font: 'bold 58px Georgia' };

  // [pole x, pole z, E-W street, N-S street]
  const corners = [
    [4.6, 14.2, 'MICHIGAN', 'BURDICK'],
    [-10.6, 14.2, 'MICHIGAN', 'ROSE'],
    [18.6, 14.2, 'MICHIGAN', 'PORTAGE'],
    [4.6, -22.6, 'SOUTH', 'BURDICK'],
    [18.6, -22.6, 'SOUTH', 'PORTAGE'],
  ];
  const poleMat = M({ color: 0x2a2c30, roughness: 0.6, metalness: 0.5 });
  corners.forEach(([x, z, ew, ns]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.0, 6), poleMat);
    pole.position.set(x, 1.5, z);
    g.add(pole);
    // each blade runs parallel to the street it names
    [[ew, 0, 2.86], [ns, Math.PI / 2, 2.52]].forEach(([name, rotY, h]) => {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.34, 0.05),
        new THREE.MeshStandardMaterial({ map: signTex(name, style), color: 0xffffff, roughness: 0.55 })
      );
      blade.position.set(x, h, z);
      blade.rotation.y = rotY;
      g.add(blade);
      world.streetSigns.push(blade);
    });
  });
  return g;
}

// ------------------------------------------------------------- office slab
// One tall 1970s slab east of the core (1985+): massing honesty — downtown
// wasn't all three-story brick by then. Banks built it; eras rename it.

function buildOfficeSlab(era, world) {
  if (!since(era, 'paper')) return null;
  const g = new THREE.Group();
  world.officeSlab = true;
  const cx = 30, cz = 2;
  const floors = 8, fh = 2.7, w = 7.6;

  const concrete = M({ color: 0xa19a8e, roughness: 0.92 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e2830, roughness: 0.2, metalness: 0.45,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
  });
  world.windowMats.push(glassMat);

  const core = new THREE.Mesh(new THREE.BoxGeometry(w, floors * fh, w), glassMat);
  core.position.set(cx, floors * fh / 2 + 0.5, cz);
  core.castShadow = true; core.receiveShadow = true;
  g.add(core);
  for (let f = 0; f <= floors; f++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.55, w + 0.5), concrete);
    band.position.set(cx, 0.5 + f * fh, cz);
    g.add(band);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 1.0, w + 1.6), concrete);
  plinth.position.set(cx, 0.5, cz);
  plinth.castShadow = true; plinth.receiveShadow = true;
  g.add(plinth);
  const mech = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 3.0), M({ color: 0x7d776d, roughness: 0.9 }));
  mech.position.set(cx - 1.4, floors * fh + 1.2, cz + 1.6);
  g.add(mech);

  // rooftop sign faces the core; the building outlives its tenants
  const label = { paper: 'FIRST OF AMERICA', living: 'THE EXCHANGE', returns: 'THE EXCHANGE' }[era.key];
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex(label, { bg: '#15181d', fg: '#e8e3d8', font: 'bold 50px Georgia' }),
    color: 0xffffff, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.6,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.1, 0.18), signMat);
  sign.position.set(cx, floors * fh + 1.3, cz - w / 2 - 0.1);
  g.add(sign);
  world.marqueeMats.push(signMat);

  if (only(era, 'returns')) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 3.4), M({ color: 0x14253a, roughness: 0.25, metalness: 0.55 }));
    panel.position.set(cx + 1.2, floors * fh + 0.75, cz - 2.0);
    panel.rotation.x = -0.3;
    g.add(panel);
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

  if (only(era, 'boiling')) {
    // the portage trail — older than any deed, headed for the ford
    const trail = echoMat(0xd8cfb6, 0.13);
    const from = { x: 30, z: -34 }, to = { x: -30, z: 9 };
    const dx = to.x - from.x, dz = to.z - from.z;
    flat(new THREE.PlaneGeometry(1.0, Math.hypot(dx, dz)), trail,
      (from.x + to.x) / 2, (from.z + to.z) / 2, 0.055, Math.atan2(-dx, -dz));
    // gathering ground under the park oaks: a wide ring nobody planted
    flat(new THREE.RingGeometry(3.6, 4.1, 28), echoMat(0xd8cfb6, 0.11), 20, -14, 0.055);
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
    for (let r = 0; r < 5; r++) flat(new THREE.PlaneGeometry(21, 0.5), m, 36, -46 + r * 3, 0.075);
  } else if (only(era, 'living')) {
    ghostRails();
    // the Fountain of the Pioneers' ring, a pale circle in the park bed —
    // removal leaves a mark too
    flat(new THREE.RingGeometry(3.1, 3.5, 26), echoMat(0xcfc6b0, 0.13), 20, -14, 0.06);
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
    drifters: [], water: null, train: null, onTrain: null,
    time: 0,
  };

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
  scene.add(group);

  group.add(buildRiver(era, world));
  group.add(buildRoads(era, world));
  group.add(buildStorefronts(era, world));
  group.add(buildPark(era, world));
  group.add(buildRail(era, world));
  group.add(buildMillSite(era, world));
  group.add(buildFlats(era, world));
  group.add(buildHouses(era, world));
  group.add(buildChurch(era, world));
  group.add(buildTower(era, world));
  group.add(buildLamps(era, world));
  group.add(buildStringLights(era, world));
  group.add(buildStreetSigns(era, world));
  group.add(buildEchoes(era, world));
  const slab = buildOfficeSlab(era, world); if (slab) group.add(slab);
  const theatre = buildTheatre(era, world); if (theatre) group.add(theatre);
  const superfund = buildSuperfund(era, world); if (superfund) group.add(superfund);
  const wmu = buildWMU(era, world); if (wmu) group.add(wmu);
  const gibson = buildGibson(era, world); if (gibson) group.add(gibson);

  // ---- trees
  const treeKinds = { boiling: ['round', 'oak', 'pine'], celery: ['round', 'round', 'oak'], mall: ['round', 'round'], paper: ['sapling', 'round'], living: ['round', 'round', 'oak'], returns: ['round', 'oak', 'willow', 'pine'] };
  const kinds = treeKinds[era.key];
  let planted = 0, guard = 0;
  while (planted < era.vis.treeCount && guard++ < 400) {
    const x = rand(-86, 86), z = rand(-86, 86);
    if (Math.abs(x) < 12 && z > -32 && z < 16) continue;       // keep downtown clear
    if (x > -46 && x < -22) continue;                          // river corridor
    if (Math.abs(z - 40) < 5) continue;                        // rails
    if (Math.abs(z - 10) < 5 || Math.abs(z + 26) < 4) continue;// streets
    if (x > 22 && x < 50 && z > -50 && z < -28) continue;      // flats
    if (x > 24 && x < 36 && z > -4 && z < 8) continue;         // office slab block
    const kind = pick(kinds);
    group.add(makeTree(x, z, rand(0.7, 1.25), era.vis.foliage, kind));
    planted++;
  }
  // willows by the river
  for (let i = 0; i < (era.key === 'returns' ? 8 : 4); i++) {
    group.add(makeTree(-34 + pick([-1, 1]) * rand(9.5, 12), rand(-80, 80), rand(0.8, 1.2), era.vis.foliage, 'willow'));
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
    const f1 = makeFireflies({ x: -22, z: 0, w: 26, d: 90 }, 50);
    world.fireflies = [f1];
    group.add(f1.points);
    const f2 = makeFireflies({ x: 36, z: -40, w: 26, d: 18 }, 36);
    world.fireflies.push(f2);
    group.add(f2.points);
  }
  if (era.key === 'paper') {
    const ash = makeMotes({ color: '#b8b4ac', count: 80, fall: 0.5, opacity: 0.3 });
    world.motes = ash; group.add(ash.points);
  } else if (era.key === 'boiling') {
    const pollen = makeMotes({ color: '#e8d9a0', count: 60, fall: 0.12, opacity: 0.22 });
    world.motes = pollen; group.add(pollen.points);
  } else if (era.key === 'celery') {
    const soot = makeMotes({ color: '#9a948a', count: 50, fall: 0.25, opacity: 0.2 });
    world.motes = soot; group.add(soot.points);
  }

  // ---- anchors (where life gathers) & residents
  const ANCHOR_SETS = {
    boiling: [
      { x: 0, z: -6, r: 9 }, { x: -16, z: -24, r: 7 }, { x: 20, z: -14, r: 8 },
      { x: 30, z: -36, r: 8 }, { x: -21, z: 10, r: 5 }, { x: 34, z: 24, r: 8 }, { x: 12, z: 42.5, r: 4 },
    ],
    celery: [
      { x: 0, z: -10, r: 9 }, { x: 0, z: -10, r: 9 }, { x: -14, z: -24, r: 7 },
      { x: 20, z: -14, r: 8 }, { x: 12, z: 42.5, r: 4 }, { x: 34, z: -38, r: 9 }, { x: -10, z: 50, r: 7 },
    ],
    mall: [
      { x: 0, z: -10, r: 8 }, { x: 0, z: -2, r: 8 }, { x: 0, z: -18, r: 8 },
      { x: 20, z: -14, r: 8 }, { x: 10, z: -10, r: 5 }, { x: 12, z: 42.5, r: 4 }, { x: 30, z: 20, r: 8 },
    ],
    paper: [
      { x: 0, z: -8, r: 9 }, { x: -14, z: -24, r: 7 }, { x: 20, z: -14, r: 8 },
      { x: 0, z: 2, r: 6 }, { x: 30, z: 20, r: 8 }, { x: 36, z: -40, r: 7 }, { x: -16, z: -46, r: 5 },
    ],
    living: [
      { x: 0, z: -10, r: 8 }, { x: 0, z: -2, r: 8 }, { x: -18, z: -17, r: 7 },
      { x: 20, z: -14, r: 8 }, { x: 34, z: -38, r: 8 }, { x: -21, z: 8, r: 5 }, { x: 10, z: -10, r: 5 },
    ],
    returns: [
      { x: -21, z: -2, r: 5 }, { x: 0, z: -10, r: 8 }, { x: 34, z: -38, r: 8 },
      { x: -19, z: -20, r: 6 }, { x: 20, z: -14, r: 8 }, { x: -21, z: 16, r: 5 }, { x: 0, z: 0, r: 9 },
    ],
  };
  const anchors = ANCHOR_SETS[era.key];
  world.anchors = anchors;

  era.people.forEach((person, i) => {
    const a = anchors[i % anchors.length];
    const spawn = { x: a.x + rand(-4, 4), z: a.z + rand(-4, 4) };
    const agent = new Agent(person, person.look, anchors, spawn);
    world.agents.push(agent);
    group.add(agent.mesh);
  });
  world.agentMeshes = world.agents.map(a => a.mesh);

  // ---- vehicles
  const loopA = { x1: -14, z1: -26, x2: 22, z2: 10 };
  if (era.key === 'boiling') {
    world.cruisers.push(new Shuttle('wagon', null, { x: -8, z: 10 }, { x: 40, z: 10 }, 1.3));
  } else if (era.key === 'celery') {
    world.cruisers.push(new Shuttle('streetcar', null, { x: 0, z: -42 }, { x: 0, z: 32 }, 4.2));
    world.cruisers.push(new Shuttle('wagon', null, { x: 36, z: 10 }, { x: -10, z: 10 }, 1.4));
  } else if (era.key === 'mall') {
    world.cruisers.push(new Cruiser('finned', 0xc23a3a, loopA, 7, 0));
    world.cruisers.push(new Cruiser('finned', 0x4a8ab5, loopA, 6.4, 60));
    world.cruisers.push(new Cruiser('checker', 0xe8b400, loopA, 7.5, 110));
  } else if (era.key === 'paper') {
    world.cruisers.push(new Cruiser('boxy', 0x6e3a3a, loopA, 5.6, 20));
    world.cruisers.push(new Cruiser('boxy', 0x3a4a5c, loopA, 6.2, 90));
    world.cruisers.push(new Cruiser('checker', 0xe8b400, loopA, 6.6, 140));
  } else if (era.key === 'living') {
    world.cruisers.push(new Cruiser('ev', 0x4a6b8a, loopA, 6.2, 0));
    world.cruisers.push(new Cruiser('bus', 0x3a7a5f, loopA, 5.2, 80));
    world.cruisers.push(new Cruiser('bike', 0x2a9d8f, loopA, 3.4, 40));
    world.cruisers.push(new Cruiser('bus', 0x6c4023, loopA, 5.0, 120));  // Bronco shuttle, brown & gold
  } else {
    world.cruisers.push(new Shuttle('bus', 0x4f8a6b, { x: -10, z: 10 }, { x: 42, z: 10 }, 4.5));
    world.cruisers.push(new Cruiser('bike', 0x2a9d8f, loopA, 3.2, 0));
    world.cruisers.push(new Cruiser('bike', 0xc28a2f, loopA, 3.6, 70));
    world.cruisers.push(new Cruiser('bus', 0x6c4023, loopA, 5.0, 110));  // the Bronco shuttle persists
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
      world.sturgeon.position.x = -34 + Math.sin(t * 0.11) * 3;
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

  R = Math.random;   // construction over; runtime randomness stays random

  return world;
}

export { since, only, stage };
