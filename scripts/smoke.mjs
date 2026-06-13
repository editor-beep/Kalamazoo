// Headless smoke test: validates the data layer and builds all nine era worlds
// in Node (no DOM, no WebGL — canvas textures are guarded off).
// Run: node scripts/smoke.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = msg => { failures++; console.error('  ✗', msg); };
const ok = msg => console.log('  ✓', msg);

// ---------------------------------------------------------------- data layer
const { ERAS, STRATA, LINEAGES, SKIN_TONES } = await import('../js/data.js');

console.log('\n[data]');
if (ERAS.length !== 9) fail(`expected 9 eras, got ${ERAS.length}`);
ERAS.forEach((e, i) => { if (e.id !== i) fail(`era ${e.key}: id ${e.id} does not match its index ${i}`); });
const KINDS = new Set(['bright', 'ache', 'wonder']);
const VIS_KEYS = ['ground', 'road', 'skyDay', 'skyGold', 'skyNight', 'fogDay', 'fogNight', 'fogDensity', 'water', 'exposure', 'grade', 'foliage', 'treeCount', 'smoke'];

for (const era of ERAS) {
  const where = `era ${era.year} (${era.key})`;
  if (!era.name || !era.blurb || !era.tagline || !era.welcome) fail(`${where}: missing card text`);
  if (!era.epigraph?.lines) fail(`${where}: missing epigraph`);
  if (!(era.people?.length >= 7 && era.people.length <= 13)) fail(`${where}: ${era.people?.length} people (want 7–13)`);
  if (!(era.events?.length >= 5)) fail(`${where}: only ${era.events?.length} events`);
  if (!(era.riverLines?.length >= 3)) fail(`${where}: river needs more lines`);
  if (!(era.echoes?.length >= 2)) fail(`${where}: needs >=2 echoes — the palimpsest must speak`);
  for (const k of VIS_KEYS) if (era.vis?.[k] === undefined) fail(`${where}: vis.${k} missing`);
  for (const ev of era.events) if (!KINDS.has(ev.kind)) fail(`${where}: bad event kind ${ev.kind}`);
  for (const p of era.people) {
    const pw = `${where} / ${p.name}`;
    if (!p.role || !p.mood || !p.memory) fail(`${pw}: missing role/mood/memory`);
    if (!(p.lines?.length >= 2)) fail(`${pw}: needs >=2 lines`);
    if (!(p.doing?.length >= 2)) fail(`${pw}: needs >=2 doings`);
    if (!(typeof p.roots === 'number')) fail(`${pw}: roots`);
    if (!p.look?.body) fail(`${pw}: look.body`);
    if (p.look.skin !== undefined && !SKIN_TONES[p.look.skin]) fail(`${pw}: bad skin idx`);
    if (p.thread && !LINEAGES[p.thread]) fail(`${pw}: unknown thread ${p.thread}`);
  }
}
ok(`9 eras, ${ERAS.reduce((s, e) => s + e.people.length, 0)} residents, all records complete`);

for (const [key, s] of Object.entries(STRATA)) {
  if (!s.title || !s.kicker || !s.body || !s.layers) fail(`strata ${key}: incomplete`);
  for (const [ek, text] of Object.entries(s.body)) {
    if (!ERAS.find(e => e.key === ek)) fail(`strata ${key}: unknown era ${ek}`);
    if (!text || text.length < 40) fail(`strata ${key}/${ek}: body too thin`);
  }
}
for (const key of ['hotel', 'rickman', 'mission', 'library', 'shakespeares', 'proco', 'fourthcoast']) {
  if (!STRATA[key]) fail(`strata ${key}: missing — the new downtown landmark has no story`);
}
ok(`${Object.keys(STRATA).length} landmark strata complete`);

// ---------------------------------------------------------------- shaders
console.log('\n[shaders]');
const shaders = await import('../js/shaders.js');
for (const name of ['SkyShader', 'WaterShader', 'GradeShader']) {
  const s = shaders[name];
  if (!s?.vertexShader || !s?.fragmentShader || !s?.uniforms) fail(`${name} incomplete`);
}
ok('sky, water, grade shaders present');

// ---------------------------------------------------------------- worlds
console.log('\n[worlds]');
const { buildEraWorld } = await import('../js/world.js');

const ORDER = ['founding', 'boiling', 'celery', 'mall', 'seventies', 'paper', 'nineties', 'living', 'returns'];
const sinceK = (era, key) => ORDER.indexOf(era.key) >= ORDER.indexOf(key);
const inB = (b, x, z, pad = 0) =>
  b.active !== false && x > b.x1 - pad && x < b.x2 + pad && z > b.z1 - pad && z < b.z2 + pad;

for (const era of ERAS) {
  try {
    const w = buildEraWorld(era);
    if (w.agents.length !== era.people.length) fail(`${era.key}: ${w.agents.length} agents vs ${era.people.length} people`);
    if (!w.water) fail(`${era.key}: no river`);
    // the rails are non-negotiable from 1846 on; in 1831 they are a rumor
    if (era.key === 'founding') {
      if (w.train) fail('founding: a railroad fifteen years early');
      if (!w.pickLandmarks.some(o => o.userData.landmark === 'depot')) fail('founding: the line-to-come ground is not clickable');
    } else if (!w.train) fail(`${era.key}: no train — the rails are non-negotiable`);
    if (!(w.pickLandmarks.length >= 8)) fail(`${era.key}: only ${w.pickLandmarks.length} clickable landmarks`);
    if (!(w.echoMats?.length >= 1)) fail(`${era.key}: no echo layers — the palimpsest is missing`);
    for (const m of w.echoMats) if (!(m.userData.echoBase > 0 && m.userData.echoBase <= 0.2)) fail(`${era.key}: echo opacity ${m.userData.echoBase} outside the faint band`);
    if (!(w.scene.children.length >= 5)) fail(`${era.key}: scene suspiciously empty`);
    const phase2Counts = {};
    w.scene.traverse(o => {
      const tag = o.userData?.phase2;
      if (tag) phase2Counts[tag] = (phase2Counts[tag] || 0) + 1;
    });
    if (!['founding', 'boiling'].includes(era.key) && !(phase2Counts['street-sign'] >= 5)) fail(`${era.key}: missing street-name signs`);
    if (era.key === 'founding' && phase2Counts['street-sign']) fail('founding: street signs before the streets earned names');
    if (['living', 'returns'].includes(era.key)) {
      if (!(phase2Counts.riverwalk >= 1 && phase2Counts['riverwalk-overlook'] >= 2)) fail(`${era.key}: riverwalk/overlooks incomplete`);
      if (!(phase2Counts['wmu-banner'] >= 3 && phase2Counts['wmu-student'] >= 3)) fail(`${era.key}: WMU hill lacks banner/student energy`);
      if (!(phase2Counts['bronco-shuttle'] >= 1)) fail(`${era.key}: missing Bronco shuttle`);
    }
    if (['paper', 'nineties', 'living', 'returns'].includes(era.key) && !(phase2Counts['office-slab'] >= 1)) fail(`${era.key}: missing 1970s downtown office slab`);

    // the new downtown landmarks appear in the right eras, and only those
    const lmKeys = new Set(w.pickLandmarks.map(o => o.userData.landmark));
    const expected = {
      hotel: sinceK(era, 'celery'),
      library: sinceK(era, 'celery'),
      rickman: sinceK(era, 'mall'),
      mission: sinceK(era, 'mall'),
      shakespeares: sinceK(era, 'nineties'),
      fourthcoast: sinceK(era, 'nineties'),
      proco: ['seventies', 'paper', 'nineties'].includes(era.key),
    };
    for (const [k, want] of Object.entries(expected)) {
      if (want !== lmKeys.has(k)) fail(`${era.key}: landmark ${k} ${want ? 'missing' : 'is an anachronism'}`);
    }

    // the city knows where its walls are
    if (!(w.obstacles.length >= 25)) fail(`${era.key}: only ${w.obstacles.length} footprints registered`);
    if (!(w.noStand.length >= 1)) fail(`${era.key}: no traffic lanes registered`);

    // run the simulation a few steps to shake out runtime errors
    for (let i = 0; i < 30; i++) w.update(1 / 30, i / 30, i % 2 ? 0.8 : 0.1);
    // exercise a train pass (1831 has no train to exercise)
    if (w.train) { w.train.start(); for (let i = 0; i < 10; i++) w.train.update(0.5); }
    // nobody gathers in the river or on the rails
    const inRiver = (x) => x > -46 && x < -22.5;
    const onRails = (z) => z > 38 && z < 42;
    for (const a of w.anchors) {
      if (inRiver(a.x)) fail(`${era.key}: anchor (${a.x},${a.z}) is in the river`);
      if (onRails(a.z)) fail(`${era.key}: anchor (${a.x},${a.z}) is on the rails`);
    }
    // people only walk where people ought to walk
    for (const a of w.agents) {
      if (w.obstacles.some(b => inB(b, a.pos.x, a.pos.z))) {
        fail(`${era.key}: ${a.person.name} is standing inside a building at (${a.pos.x.toFixed(1)},${a.pos.z.toFixed(1)})`);
      }
    }
    // fuzz wander targets through the safety clamp
    const scout = w.agents[0];
    for (let i = 0; i < 400; i++) {
      scout.pickTarget();
      const t = scout.target;
      if (inRiver(t.x)) fail(`${era.key}: wander target walked on water (x=${t.x.toFixed(1)})`);
      if (onRails(t.z)) fail(`${era.key}: wander target loiters on rails (z=${t.z.toFixed(1)})`);
      if (w.obstacles.some(b => inB(b, t.x, t.z, 0.05))) fail(`${era.key}: wander target inside a wall (${t.x.toFixed(1)},${t.z.toFixed(1)})`);
      const stayedPut = t.x === scout.pos.x && t.z === scout.pos.z;
      if (!stayedPut && w.noStand.some(b => inB(b, t.x, t.z))) fail(`${era.key}: wander target loiters in traffic (${t.x.toFixed(1)},${t.z.toFixed(1)})`);
    }
    // cars and buses only drive where cars and buses ought to drive
    for (const c of w.cruisers) {
      for (let i = 0; i < 700; i++) {
        c.update(0.16);
        const p = c.mesh.position;
        if (p.y > 0.5) continue;   // on the bridge deck
        if (inRiver(p.x) && Math.abs(p.z - 10) > 3.6) fail(`${era.key}: a vehicle is swimming at (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
        if (w.obstacles.some(b => b !== w.railBlock && inB(b, p.x, p.z, 0.8))) {
          fail(`${era.key}: a vehicle drove into a building at (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
          break;
        }
      }
    }
    w.dispose();
    ok(`${era.year} ${era.name}: built, simulated 30 frames, disposed (${w.pickLandmarks.length} landmarks, ${w.agents.length} residents)`);
  } catch (e) {
    fail(`${era.key} threw: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
  }
}

// ---------------------------------------------------------------- determinism
// Seeded construction: the same era must produce the same city, mesh for mesh.
// Agents/vehicles/train are excluded — their runtime life stays random.
console.log('\n[determinism]');
{
  const hashWorld = w => {
    const skip = new Set([...w.agents.map(a => a.mesh), ...w.cruisers.map(c => c.mesh), w.train?.group]);
    let h = 0, n = 0;
    const walk = o => {
      if (skip.has(o)) return;
      h += o.position.x * 31.7 + o.position.y * 7.3 + o.position.z * 13.1 + o.rotation.y * 3.1;
      n++;
      o.children.forEach(walk);
    };
    walk(w.scene);
    return `${n}:${h.toFixed(2)}`;
  };
  for (const era of [ERAS[0], ERAS[4]]) {
    const a = buildEraWorld(era), ha = hashWorld(a); a.dispose();
    const b = buildEraWorld(era), hb = hashWorld(b); b.dispose();
    if (ha !== hb) fail(`${era.key}: two builds differ (${ha} vs ${hb}) — the city forgot itself`);
    else ok(`${era.key}: built twice, identical (${ha.split(':')[0]} static objects)`);
  }
}

// ---------------------------------------------------------------- ui module imports cleanly (no top-level DOM)
console.log('\n[ui]');
try {
  await import('../js/ui.js');
  ok('ui.js imports without a DOM');
} catch (e) {
  fail(`ui.js: ${e.message}`);
}

// ---------------------------------------------------------------- DOM id cross-check
console.log('\n[dom ids]');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
for (const file of ['js/ui.js', 'js/main.js']) {
  const src = readFileSync(join(root, file), 'utf8');
  const used = [...src.matchAll(/getElementById\(\s*'([^']+)'\s*\)|el\('([^']+)'\)/g)]
    .map(m => m[1] || m[2]);
  const missing = [...new Set(used)].filter(id => !htmlIds.has(id));
  if (missing.length) fail(`${file} references missing ids: ${missing.join(', ')}`);
  else ok(`${file}: all ${new Set(used).size} referenced ids exist in index.html`);
}

// ---------------------------------------------------------------- verdict
console.log('');
if (failures) {
  console.error(`SMOKE FAILED — ${failures} problem(s)\n`);
  process.exit(1);
}
console.log('SMOKE PASSED — the city remembers itself correctly.\n');
