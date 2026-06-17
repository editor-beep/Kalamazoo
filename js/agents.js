// Living things: residents with walk cycles, vehicles, the eternal train, particles.

import * as THREE from '../vendor/three/three.module.min.js';
import { SKIN_TONES } from './data.js';
import { GEO, inRiver, onRails } from './geo.js';

// ---------------------------------------------------------------- people

const HAT_BUILDERS = {
  top(mat) {
    const g = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 12), mat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.34, 12), mat);
    crown.position.y = 0.18;
    g.add(brim, crown);
    return g;
  },
  brim(mat) {
    const g = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 12), mat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 12), mat);
    crown.position.y = 0.09;
    g.add(brim, crown);
    return g;
  },
  cap(mat) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.16), mat);
    bill.position.set(0, 0.01, 0.22);
    g.add(dome, bill);
    return g;
  },
  bonnet(mat) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    dome.scale.z = 1.15;
    g.add(dome);
    return g;
  },
  fedora(mat) {
    const g = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.035, 12), mat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.2, 12), mat);
    crown.position.y = 0.11;
    g.add(brim, crown);
    return g;
  },
  hard(mat) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.4 }));
    g.add(dome);
    return g;
  },
  beanie(mat) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    dome.scale.y = 1.18;
    g.add(dome);
    return g;
  },
  cloche(mat) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), mat);
    g.add(dome);
    return g;
  },
  bucket(mat) {
    const g = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.18, 12), mat);
    g.add(crown);
    return g;
  },
};

const PROP_BUILDERS = {
  basket(c) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0x9a7440, roughness: 0.9 }));
    m.position.set(0.34, 0.78, 0.12);
    return m;
  },
  pail(c) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x777f87, roughness: 0.5, metalness: 0.6 }));
    m.position.set(0.34, 0.72, 0.1);
    return m;
  },
  book(c) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8a3030, roughness: 0.8 }));
    m.position.set(0.32, 0.95, 0.14);
    m.rotation.z = 0.3;
    return m;
  },
  cup(c) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.11, 8),
      new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 0.6 }));
    m.position.set(0.3, 1.0, 0.16);
    return m;
  },
  guitar(c) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), mat);
    body.rotation.x = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.03), mat);
    neck.position.y = 0.28;
    g.add(body, neck);
    g.position.set(-0.36, 0.85, 0.05);
    g.rotation.z = 0.4;
    return g;
  },
  bag(c) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.85 }));
    m.position.set(0.34, 0.7, 0.08);
    return m;
  },
  cane(c) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.85, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.7 }));
    m.position.set(0.34, 0.45, 0.12);
    return m;
  },
  camera(c) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45 }));
    m.position.set(0, 1.18, 0.22);
    return m;
  },
  clipboard(c) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.85 }));
    m.position.set(0.3, 1.0, 0.16);
    m.rotation.x = -0.5;
    return m;
  },
};

export function makePersonMesh(look = {}) {
  const group = new THREE.Group();
  const bodyColor = new THREE.Color(look.body || '#5c6b73');
  const skin = new THREE.Color(SKIN_TONES[look.skin ?? 0] || SKIN_TONES[0]);

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82 });
  const darker = bodyColor.clone().multiplyScalar(0.72);
  const legMat = new THREE.MeshStandardMaterial({ color: darker, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 });

  // legs pivot at hip
  const legGeo = new THREE.CylinderGeometry(0.085, 0.07, 0.78, 6);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.82, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.52, 4, 10), bodyMat);
  torso.position.y = 1.22;

  const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.62, 6);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.36, 1.48, 0);
  armL.rotation.z = 0.12;
  const armR = armL.clone();
  armR.position.x = 0.36;
  armR.rotation.z = -0.12;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 11), skinMat);
  head.position.y = 1.86;

  [legL, legR, torso, armL, armR, head].forEach(m => { m.castShadow = true; });
  group.add(legL, legR, torso, armL, armR, head);

  if (look.hat && look.hat !== 'none' && HAT_BUILDERS[look.hat]) {
    const hatColor = darker.clone().multiplyScalar(0.8);
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.8 });
    const hat = HAT_BUILDERS[look.hat](hatMat);
    hat.position.y = 2.0;
    group.add(hat);
  }
  if (look.prop && PROP_BUILDERS[look.prop]) {
    group.add(PROP_BUILDERS[look.prop]());
  }

  // selection ring (hidden until hovered/selected)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 28),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  return { group, parts: { legL, legR, armL, armR, torso, head, ring } };
}

// ---------------------------------------------------------------- navigation
// Buildings register footprint AABBs ({x1,z1,x2,z2}) in world.obstacles;
// live traffic lanes register in world.noStand. Boxes with active === false
// are dormant (the rail crossing only blocks while the train is passing).

export const inBox = (b, x, z, pad = 0) =>
  b.active !== false && x > b.x1 - pad && x < b.x2 + pad && z > b.z1 - pad && z < b.z2 + pad;

function pushOut(b, t, pad) {
  // shove the point to the nearest face of the box
  const dxl = t.x - (b.x1 - pad), dxr = (b.x2 + pad) - t.x;
  const dzl = t.z - (b.z1 - pad), dzr = (b.z2 + pad) - t.z;
  const m = Math.min(dxl, dxr, dzl, dzr);
  if (m === dxl) t.x = b.x1 - pad;
  else if (m === dxr) t.x = b.x2 + pad;
  else if (m === dzl) t.z = b.z1 - pad;
  else t.z = b.z2 + pad;
}

const BODY_PAD = 0.45;      // standing clearance from walls
const WALL_PAD = 0.3;       // movement clearance (smaller, so targets stay reachable)
// inRiver / onRails live in geo.js so the law is defined in exactly one place.

export class Agent {
  constructor(person, look, anchors, spawn, nav) {
    this.person = person;                  // data record
    const { group, parts } = makePersonMesh(look);
    this.mesh = group;
    this.parts = parts;
    this.anchors = anchors;
    this.nav = nav || { obstacles: [], zones: [] };
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.target = new THREE.Vector3(spawn.x, 0, spawn.z);
    // never spawn inside a wall or a traffic lane
    if (!this.sanitizeTarget()) this.target.set(0, 0, -16);   // Burdick mall, reliably clear
    this.pos.copy(this.target);
    this.speed = 1.1 + Math.random() * 0.9;
    this.phase = Math.random() * Math.PI * 2;
    this.doingIdx = Math.floor(Math.random() * (person.doing?.length || 1));
    this.pauseT = 0;
    this.chatT = 0;
    this.chatCooldown = Math.random() * 10;
    this.mesh.position.copy(this.pos);
    this.pickTarget();
    this.mesh.userData.agent = this;
  }

  get doing() {
    const d = this.person.doing;
    return d && d.length ? d[this.doingIdx % d.length] : 'out in the streets of Kalamazoo';
  }

  nextDoing() { this.doingIdx++; }

  blockedAt(x, z, pad = WALL_PAD) {
    for (const b of this.nav.obstacles) if (inBox(b, x, z, pad)) return true;
    return false;
  }

  // Clamp the river/rails law, then nudge the target off traffic lanes and out
  // of buildings. Returns false if it couldn't settle somewhere legal.
  sanitizeTarget() {
    const t = this.target;
    for (let pass = 0; pass < 4; pass++) {
      // nobody walks on the river, nobody loiters on the rails
      // (the depot platform at z≈42.5 stays reachable). River is east now, so
      // a target in the water gets shoved back toward downtown (its west bank).
      if (inRiver(t.x)) t.x = GEO.river.min - 1;
      if (onRails(t.z)) t.z = t.z < GEO.railZ ? GEO.rail.min - 0.5 : GEO.depotPlatformZ;
      let dirty = false;
      for (const b of this.nav.zones) {
        if (inBox(b, t.x, t.z)) { pushOut(b, t, 0.35); dirty = true; }
      }
      for (const b of this.nav.obstacles) {
        if (inBox(b, t.x, t.z, BODY_PAD)) { pushOut(b, t, BODY_PAD + 0.05); dirty = true; }
      }
      if (!dirty) return true;
    }
    return !inRiver(t.x) && !onRails(t.z) &&
      !this.nav.zones.some(b => inBox(b, t.x, t.z)) &&
      !this.blockedAt(t.x, t.z, BODY_PAD);
  }

  pickTarget() {
    for (let tries = 0; tries < 6; tries++) {
      if (this.anchors.length && Math.random() < 0.62) {
        const a = this.anchors[Math.floor(Math.random() * this.anchors.length)];
        this.target.set(
          a.x + (Math.random() - 0.5) * (a.r || 7),
          0,
          a.z + (Math.random() - 0.5) * (a.r || 7)
        );
      } else {
        this.target.set((Math.random() - 0.5) * 64, 0, (Math.random() - 0.5) * 64);
      }
      if (this.sanitizeTarget()) return;
    }
    this.target.set(this.pos.x, 0, this.pos.z);   // stay put; try again later
  }

  startChat(partner, dur) {
    this.chatT = dur;
    this.chatPartner = partner;
  }

  update(dt, t) {
    const m = this.mesh;
    this.chatCooldown = Math.max(0, this.chatCooldown - dt);

    if (this.chatT > 0) {
      // paused, facing partner, gesturing
      this.chatT -= dt;
      if (this.chatPartner) {
        const dx = this.chatPartner.pos.x - this.pos.x;
        const dz = this.chatPartner.pos.z - this.pos.z;
        const want = Math.atan2(dx, dz);
        let dr = want - m.rotation.y;
        while (dr > Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y += dr * Math.min(1, dt * 5);
      }
      this.parts.armR.rotation.x = Math.sin(t * 3.1 + this.phase) * 0.3 - 0.25;
      this.parts.armL.rotation.x = Math.sin(t * 2.3 + this.phase) * 0.18;
      this.parts.legL.rotation.x = 0;
      this.parts.legR.rotation.x = 0;
      if (this.chatT <= 0) { this.chatCooldown = 14 + Math.random() * 12; this.pickTarget(); }
      return;
    }

    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.parts.legL.rotation.x *= 0.9;
      this.parts.legR.rotation.x *= 0.9;
      return;
    }

    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.9) {
      if (Math.random() < 0.45) this.pauseT = 1.5 + Math.random() * 4;
      if (Math.random() < 0.35) this.nextDoing();
      this.pickTarget();
      return;
    }

    const step = Math.min(this.speed * dt, dist);
    let nx = this.pos.x + (dx / dist) * step;
    let nz = this.pos.z + (dz / dist) * step;
    // walls are walls: slide along them instead of phasing through
    if (this.blockedAt(nx, nz)) {
      if (!this.blockedAt(nx, this.pos.z)) nz = this.pos.z;
      else if (!this.blockedAt(this.pos.x, nz)) nx = this.pos.x;
      else { this.pickTarget(); return; }   // cornered — go somewhere else
    }
    this.pos.x = nx;
    this.pos.z = nz;
    m.position.x = this.pos.x;
    m.position.z = this.pos.z;

    // walk cycle
    this.phase += dt * this.speed * 4.4;
    const swing = Math.sin(this.phase) * 0.52;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.7;
    this.parts.armR.rotation.x = swing * 0.7;
    m.position.y = Math.abs(Math.sin(this.phase)) * 0.045;

    const want = Math.atan2(dx, dz);
    let dr = want - m.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    m.rotation.y += dr * Math.min(1, dt * 6);
  }
}

// try to pair nearby agents into conversations
const inTraffic = ag => ag.nav?.zones?.some(b => inBox(b, ag.pos.x, ag.pos.z));
export function updateChats(agents, dt) {
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.chatT > 0 || a.chatCooldown > 0 || inTraffic(a)) continue;
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j];
      if (b.chatT > 0 || b.chatCooldown > 0 || inTraffic(b)) continue;
      const d = a.pos.distanceTo(b.pos);
      if (d < 2.6 && Math.random() < 0.02) {
        const dur = 4 + Math.random() * 5;
        a.startChat(b, dur);
        b.startChat(a, dur);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- vehicles

function carBody(color, opts = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.15, metalness: 0.4 });

  const L = opts.length || 4.4, W = opts.width || 1.9, H = opts.height || 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), mat);
  body.position.y = 0.52;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, H * 0.78, L * (opts.cabinL || 0.45)), opts.glass === false ? mat : glassMat);
  cabin.position.set(0, 0.52 + H * 0.78, (opts.cabinZ || -0.1) * L);
  cabin.castShadow = true;
  g.add(body, cabin);

  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (W / 2), 0.3, sz * (L * 0.32));
    g.add(wheel);
  });

  if (opts.fins) {
    const finMat = mat;
    [-1, 1].forEach(sx => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.9), finMat);
      fin.position.set(sx * (W / 2 - 0.08), 0.86, -L / 2 + 0.45);
      g.add(fin);
    });
  }
  if (opts.checker) {
    // taxi roof sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xf3ede2, emissive: 0x665522, roughness: 0.5 }));
    sign.position.set(0, 1.18, 0.1);
    g.add(sign);
  }
  return g;
}

export const VEHICLE_STYLES = {
  wagon(color) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.2), wood);
    bed.position.y = 0.75;
    bed.castShadow = true;
    g.add(bed);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), wood);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.85, 0.42, sz * 1.1);
      g.add(wheel);
    });
    // horse
    const horseMat = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 0.85 });
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.5), horseMat);
    horse.position.set(0, 1.0, 2.6);
    horse.castShadow = true;
    const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.4), horseMat);
    horseHead.position.set(0, 1.55, 3.3);
    [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.35], [0.25, -0.35]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.85, 5), horseMat);
      leg.position.set(x, 0.45, 2.6 + z * 1.4);
      g.add(leg);
    });
    g.add(horse, horseHead);
    return g;
  },
  streetcar(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8e2f1f, roughness: 0.45, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 7.2), mat);
    body.position.y = 1.55;
    body.castShadow = true;
    g.add(body);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xd9c98a, emissive: 0x554411, emissiveIntensity: 0.6, roughness: 0.3 });
    for (let i = -2; i <= 2; i++) {
      [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.85), winMat);
        w.position.set(s * 1.12, 1.95, i * 1.25);
        g.add(w);
      });
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 6.6),
      new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.7 }));
    roof.position.y = 2.78;
    g.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.set(0, 3.5, -1);
    pole.rotation.x = 0.5;
    g.add(pole);
    return g;
  },
  finned(color) { return carBody(color, { fins: true, length: 5.2, height: 0.58, cabinZ: 0.02 }); },
  boxy(color) { return carBody(color, { length: 4.6, height: 0.66, cabinZ: -0.04 }); },
  checker(color) { return carBody(0xe8b400, { checker: true, length: 5.0, height: 0.72, cabinZ: -0.02 }); },
  ev(color) { return carBody(color, { length: 4.3, height: 0.56, cabinL: 0.58, cabinZ: 0.0 }); },
  bus(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: color || 0x3a7a5f, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.4, 8.5), mat);
    body.position.y = 1.5;
    body.castShadow = true;
    g.add(body);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.2 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.7, 7.6), winMat);
    band.position.y = 2.05;
    g.add(band);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10),
        new THREE.MeshStandardMaterial({ color: 0x1c1e22 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.15, 0.38, sz * 2.8);
      g.add(wheel);
    });
    return g;
  },
  bike(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: color || 0x2a9d8f, roughness: 0.5, metalness: 0.5 });
    [-0.45, 0.45].forEach(z => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 14), mat);
      wheel.position.set(0, 0.32, z);
      g.add(wheel);
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), mat);
    frame.position.y = 0.55;
    frame.rotation.x = 0.25;
    g.add(frame);
    return g;
  },
};

// vehicle cruising a rectangular loop (clockwise), axis-aligned
export class Cruiser {
  constructor(style, color, loop, speed, offset = 0) {
    this.mesh = VEHICLE_STYLES[style](color);
    this.loop = loop;        // {x1, z1, x2, z2}
    this.speed = speed;
    const { x1, z1, x2, z2 } = loop;
    this.per = 2 * (Math.abs(x2 - x1) + Math.abs(z2 - z1));
    this.t = offset % this.per;
    this.place(0);
  }
  place(dt) {
    this.t = (this.t + this.speed * dt) % this.per;
    const { x1, z1, x2, z2 } = this.loop;
    const w = Math.abs(x2 - x1), h = Math.abs(z2 - z1);
    let d = this.t, x, z, rot;
    if (d < w)              { x = x1 + d; z = z1; rot = Math.PI / 2; }
    else if (d < w + h)     { x = x2; z = z1 + (d - w); rot = 0; }
    else if (d < w + h + w) { x = x2 - (d - w - h); z = z2; rot = -Math.PI / 2; }
    else                    { x = x1; z = z2 - (d - w - h - w); rot = Math.PI; }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = rot + Math.PI; // models face +z
  }
  update(dt) { this.place(dt); }
}

// back-and-forth along a route (streetcar, shuttle). Optional `via` waypoints
// keep buses on streets and bridges; waypoints may carry a y (bridge decks).
export class Shuttle {
  constructor(style, color, a, b, speed, via = []) {
    this.mesh = VEHICLE_STYLES[style](color);
    this.pts = [a, ...via, b].map(p => new THREE.Vector3(p.x, p.y || 0, p.z));
    this.lens = [];
    this.total = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const l = this.pts[i].distanceTo(this.pts[i + 1]);
      this.lens.push(l);
      this.total += l;
    }
    this.speed = speed;
    this.d = Math.random() * this.total;
    this.dir = 1;
    this.dwell = 0;
  }
  update(dt) {
    if (this.dwell > 0) { this.dwell -= dt; return; }
    this.d += this.speed * dt * this.dir;
    if (this.d >= this.total) { this.d = this.total; this.dir = -1; this.dwell = 2.5; }
    if (this.d <= 0) { this.d = 0; this.dir = 1; this.dwell = 2.5; }
    let d = this.d, i = 0;
    while (i < this.lens.length - 1 && d > this.lens[i]) { d -= this.lens[i]; i++; }
    const t = this.lens[i] ? Math.min(1, d / this.lens[i]) : 0;
    const p = this.pts[i].clone().lerp(this.pts[i + 1], t);
    this.mesh.position.copy(p);
    const dir = this.pts[i + 1].clone().sub(this.pts[i]).multiplyScalar(this.dir);
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
  }
}

// ---------------------------------------------------------------- the train
// Every era has the train. Since 1846 the rails are the town's proof of elsewhere.

const TRAIN_STYLES = {
  steam(g) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x22241f, roughness: 0.6, metalness: 0.4 });
    const loco = new THREE.Group();
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 4.4, 12), dark);
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(0, 1.5, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 1.8), dark);
    cab.position.set(-2.6, 1.6, 0);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.0, 8), dark);
    stack.position.set(1.6, 2.6, 0);
    loco.add(boiler, cab, stack);
    loco.userData.stackOffset = new THREE.Vector3(1.6, 3.1, 0);
    g.push({ mesh: loco, len: 6.4 });
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.1, 2.2),
        new THREE.MeshStandardMaterial({ color: [0x6b3a2a, 0x5c4a30, 0x4a3a3a][i % 3], roughness: 0.8 }));
      car.position.y = 1.45;
      const wrap = new THREE.Group(); wrap.add(car);
      g.push({ mesh: wrap, len: 6.2 });
    }
  },
  freight(g) {
    const loco = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.6, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x2f4d6b, roughness: 0.5, metalness: 0.3 }));
    body.position.y = 1.7;
    loco.add(body);
    g.push({ mesh: loco, len: 8.0 });
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: [0x7a4a2a, 0x55605c, 0x6b6b5c, 0x4a4a55][i % 4], roughness: 0.85 }));
      car.position.y = 1.55;
      const wrap = new THREE.Group(); wrap.add(car);
      g.push({ mesh: wrap, len: 7.2 });
    }
  },
  amtrak(g) {
    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Group();
      const car = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.5, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.6 }));
      car.position.y = 1.65;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.62, 0.3, 2.42),
        new THREE.MeshStandardMaterial({ color: 0x20456b, roughness: 0.4 }));
      stripe.position.y = 2.1;
      wrap.add(car, stripe);
      g.push({ mesh: wrap, len: 8.4 });
    }
  },
  electric(g) {
    for (let i = 0; i < 3; i++) {
      const wrap = new THREE.Group();
      const car = new THREE.Mesh(new THREE.BoxGeometry(8.0, 2.4, 2.3),
        new THREE.MeshStandardMaterial({ color: 0x9fb8a8, roughness: 0.35, metalness: 0.4 }));
      car.position.y = 1.6;
      const band = new THREE.Mesh(new THREE.BoxGeometry(8.02, 0.5, 2.32),
        new THREE.MeshStandardMaterial({ color: 0x2e6b5c, roughness: 0.4, emissive: 0x113322, emissiveIntensity: 0.4 }));
      band.position.y = 2.0;
      wrap.add(car, band);
      g.push({ mesh: wrap, len: 8.8 });
    }
  },
};

export class Train {
  constructor(style, z, onPass) {
    this.group = new THREE.Group();
    this.cars = [];
    TRAIN_STYLES[style] ? TRAIN_STYLES[style](this.cars) : TRAIN_STYLES.freight(this.cars);
    this.cars.forEach(c => {
      c.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
      // Cars are modeled with their long axis along x; the rails also run along
      // x (z = railZ). No extra yaw — rotating them would turn the cars broadside
      // to the track, so they'd ride sideways and gap apart instead of coupling
      // end to end.
      this.group.add(c.mesh);
    });
    this.z = z;
    this.onPass = onPass;
    this.speed = 14;
    this.running = false;
    this.timer = 18 + Math.random() * 30;   // first train comes fairly soon
    this.group.visible = false;
    this.head = 0;
  }
  get totalLen() { return this.cars.reduce((s, c) => s + c.len, 0); }
  start() {
    this.running = true;
    this.group.visible = true;
    this.head = -110;
    if (this.onPass) this.onPass();
  }
  update(dt) {
    if (!this.running) {
      this.timer -= dt;
      if (this.timer <= 0) this.start();
      return;
    }
    this.head += this.speed * dt;
    let x = this.head;
    for (const c of this.cars) {
      c.mesh.position.set(x - c.len / 2, 0, this.z);
      x -= c.len + 0.5;
    }
    if (this.head - this.totalLen > 115) {
      this.running = false;
      this.group.visible = false;
      this.timer = 75 + Math.random() * 60;
    }
  }
}

// ---------------------------------------------------------------- particles
// All point materials are tiny shaders (round, soft) — no textures needed.

function pointsMaterial({ color, size, opacity, additive, soft }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      uniform float uSize;
      attribute float aPhase;
      attribute float aScale;
      varying float vPhase;
      void main() {
        vPhase = aPhase;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * aScale * (160.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vPhase;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, ${soft ? '0.05' : '0.32'}, d) * uOpacity;
        ${additive ? 'a *= 0.55 + 0.45 * sin(uTime * 2.2 + vPhase * 6.2831);' : ''}
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

export function makeSmokeColumn(origin, { color = '#9aa0a4', rate = 1, spread = 1.6, rise = 2.4, count = 70 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const scale = new Float32Array(count);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    life[i] = Math.random();
    phase[i] = Math.random();
    scale[i] = 0.7 + Math.random() * 1.3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
  const mat = pointsMaterial({ color, size: 26, opacity: 0.16, additive: false, soft: true });
  const points = new THREE.Points(geo, mat);
  points.position.copy(origin);
  points.frustumCulled = false;

  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      life[i] += dt * 0.12 * rate * (0.7 + phase[i] * 0.6);
      if (life[i] > 1) life[i] = 0;
      const l = life[i];
      arr[i * 3 + 0] = Math.sin(phase[i] * 40 + l * 6) * spread * l + l * spread * 1.2;
      arr[i * 3 + 1] = l * rise * 4.2;
      arr[i * 3 + 2] = Math.cos(phase[i] * 36 + l * 5) * spread * l;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, update, mat };
}

export function makeFireflies(bounds, count = 60) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const scale = new Float32Array(count);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: bounds.x + (Math.random() - 0.5) * bounds.w,
      z: bounds.z + (Math.random() - 0.5) * bounds.d,
      y: 0.4 + Math.random() * 2.2,
      r: 0.5 + Math.random() * 1.6,
      s: 0.3 + Math.random() * 0.7,
      o: Math.random() * Math.PI * 2,
    });
    phase[i] = Math.random();
    scale[i] = 0.6 + Math.random() * 0.8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
  const mat = pointsMaterial({ color: '#ffe18a', size: 10, opacity: 0.9, additive: true, soft: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  function update(dt, t, nightAmt) {
    mat.uniforms.uTime.value = t;
    mat.uniforms.uOpacity.value = 0.9 * nightAmt;
    points.visible = nightAmt > 0.05;
    if (!points.visible) return;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      arr[i * 3 + 0] = s.x + Math.sin(t * s.s + s.o) * s.r;
      arr[i * 3 + 1] = s.y + Math.sin(t * s.s * 1.7 + s.o * 2.0) * 0.5;
      arr[i * 3 + 2] = s.z + Math.cos(t * s.s * 0.8 + s.o) * s.r;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, update, mat };
}

// slow ambient motes — paper ash (1985), pollen (1855), blossom (1905)
export function makeMotes({ color = '#cfc8b8', count = 90, area = 70, height = 14, fall = 0.35, opacity = 0.35 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const scale = new Float32Array(count);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: (Math.random() - 0.5) * area,
      z: (Math.random() - 0.5) * area,
      y: Math.random() * height,
      drift: 0.3 + Math.random() * 0.8,
      o: Math.random() * Math.PI * 2,
    });
    phase[i] = Math.random();
    scale[i] = 0.5 + Math.random() * 0.8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
  const mat = pointsMaterial({ color, size: 7, opacity, additive: false, soft: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      s.y -= fall * dt * s.drift;
      if (s.y < 0) s.y = height;
      arr[i * 3 + 0] = s.x + Math.sin(t * 0.4 * s.drift + s.o) * 2.2;
      arr[i * 3 + 1] = s.y;
      arr[i * 3 + 2] = s.z + Math.cos(t * 0.3 * s.drift + s.o) * 2.2;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, update, mat };
}
