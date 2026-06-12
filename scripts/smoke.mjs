// Headless smoke test: validates the data layer and builds all six era worlds
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
if (ERAS.length !== 6) fail(`expected 6 eras, got ${ERAS.length}`);
const KINDS = new Set(['bright', 'ache', 'wonder']);
const VIS_KEYS = ['ground', 'road', 'skyDay', 'skyGold', 'skyNight', 'fogDay', 'fogNight', 'fogDensity', 'water', 'exposure', 'grade', 'foliage', 'treeCount', 'smoke'];

for (const era of ERAS) {
  const where = `era ${era.year} (${era.key})`;
  if (!era.name || !era.blurb || !era.tagline || !era.welcome) fail(`${where}: missing card text`);
  if (!era.epigraph?.lines) fail(`${where}: missing epigraph`);
  if (!(era.people?.length >= 7 && era.people.length <= 13)) fail(`${where}: ${era.people?.length} people (want 7–13)`);
  if (!(era.events?.length >= 5)) fail(`${where}: only ${era.events?.length} events`);
  if (!(era.riverLines?.length >= 3)) fail(`${where}: river needs more lines`);
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
ok(`6 eras, ${ERAS.reduce((s, e) => s + e.people.length, 0)} residents, all records complete`);

for (const [key, s] of Object.entries(STRATA)) {
  if (!s.title || !s.kicker || !s.body || !s.layers) fail(`strata ${key}: incomplete`);
  for (const [ek, text] of Object.entries(s.body)) {
    if (!ERAS.find(e => e.key === ek)) fail(`strata ${key}: unknown era ${ek}`);
    if (!text || text.length < 40) fail(`strata ${key}/${ek}: body too thin`);
  }
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

for (const era of ERAS) {
  try {
    const w = buildEraWorld(era);
    if (w.agents.length !== era.people.length) fail(`${era.key}: ${w.agents.length} agents vs ${era.people.length} people`);
    if (!w.water) fail(`${era.key}: no river`);
    if (!w.train) fail(`${era.key}: no train — the rails are non-negotiable`);
    if (!(w.pickLandmarks.length >= 8)) fail(`${era.key}: only ${w.pickLandmarks.length} clickable landmarks`);
    if (!(w.scene.children.length >= 5)) fail(`${era.key}: scene suspiciously empty`);
    // run the simulation a few steps to shake out runtime errors
    for (let i = 0; i < 30; i++) w.update(1 / 30, i / 30, i % 2 ? 0.8 : 0.1);
    // exercise a train pass
    w.train.start(); for (let i = 0; i < 10; i++) w.train.update(0.5);
    // nobody gathers in the river or on the rails
    const inRiver = (x) => x > -46 && x < -22.5;
    const onRails = (z) => z > 38 && z < 42;
    for (const a of w.anchors) {
      if (inRiver(a.x)) fail(`${era.key}: anchor (${a.x},${a.z}) is in the river`);
      if (onRails(a.z)) fail(`${era.key}: anchor (${a.x},${a.z}) is on the rails`);
    }
    // fuzz wander targets through the safety clamp
    const scout = w.agents[0];
    for (let i = 0; i < 400; i++) {
      scout.pickTarget();
      if (inRiver(scout.target.x)) fail(`${era.key}: wander target walked on water (x=${scout.target.x.toFixed(1)})`);
      if (onRails(scout.target.z)) fail(`${era.key}: wander target loiters on rails (z=${scout.target.z.toFixed(1)})`);
    }
    w.dispose();
    ok(`${era.year} ${era.name}: built, simulated 30 frames, disposed (${w.pickLandmarks.length} landmarks, ${w.agents.length} residents)`);
  } catch (e) {
    fail(`${era.key} threw: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
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
