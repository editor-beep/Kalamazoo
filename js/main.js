// kalamazoo • through time — engine & conductor.

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ERAS } from './data.js';
import { GradeShader } from './shaders.js';
import { buildEraWorld } from './world.js';
import * as UI from './ui.js';

// ----------------------------------------------------------------- state

const state = {
  mode: 'select',            // select | era | compare
  era: null,
  world: null,
  compareWorld: null,
  split: 0.5,
  timeOfDay: 0.74,           // 0..1 over 5:30–23:30
  flow: false,
  grief: 0,
  cameraTween: null,
  focusAgent: null,
  riverClicks: 0,
  visitedOnce: false,
};

const worldCache = new Map();   // eraId -> world
const cacheOrder = [];

let renderer, camera, controls, composer, renderPass, bloomPass, gradePass;
const clock = new THREE.Clock();
let elapsed = 0;

const TRAIN_LINES = {
  // (no entry for 'founding' — the iron is fifteen years away in 1831)
  boiling: 'The cars roll through and the whole village stops chewing to listen.',
  celery: 'A celery special thunders toward Chicago, iced and silver. The depot smells like harvest.',
  mall: 'A freight rolls through downtown. Conversation pauses, mid-sentence, the way it always has.',
  seventies: 'A freight rolls through under amber lamps. Someone on the Mall mistakes the rhythm for a bass line.',
  paper: 'The freight sounds different over empty mills — longer, somehow. Everyone pretends not to notice.',
  nineties: 'The freight cuts through last call. Outside Club Soda, everybody talks louder for thirty seconds.',
  living: 'The Wolverine rolls through. Somewhere aboard, a conductor sings out the name, and somebody smiles.',
  returns: 'The quiet electric freight slides through. The town voted to keep the horn. Some sounds are load-bearing.',
};

// North-up + east-right framing. The visual group is reflected in z (see
// world.js: group.scale.z = -1), so authored North (+z) renders at display −z.
// The camera therefore sits on the display-SOUTH side (+z) and looks toward −z
// (north): north is away/top, east is on the right, the river on the right edge —
// a true map. Targets track the reflected downtown core (authored core z negated).
const CAMERA_DEFAULTS = {
  founding: { pos: [2, 28, 74], tgt: [-8, 3, 4] },
  boiling: { pos: [3, 27, 74], tgt: [-6, 3, 6] },
  celery: { pos: [6, 25, 70], tgt: [-2, 4, 6] },
  mall: { pos: [10, 22, 66], tgt: [2, 3, 8] },
  seventies: { pos: [6, 23, 66], tgt: [-2, 3, 6] },
  paper: { pos: [6, 24, 70], tgt: [-2, 3, 8] },
  nineties: { pos: [8, 22, 54], tgt: [0, 3, -8] },
  living: { pos: [8, 21, 64], tgt: [0, 3, 6] },
  returns: { pos: [0, 24, 74], tgt: [-10, 3, 4] },
};

// ----------------------------------------------------------------- boot

function boot() {
  UI.renderEraCards(enterEra);
  UI.initUI({
    enterEra,
    exitEra: exitToSelection,
    advanceTime: () => advanceHours(2),
    cityEvent,
    setTimeOfDay,
    toggleFlow,
    resetCamera,
    openCompare,
    exitCompare,
    onSpoke: () => UI.setPulse(UI.getPulse() + 1),
  });

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('no-webgl').classList.remove('hidden');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('three-container').appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 700);
  camera.position.set(10, 34, 68);    // display-south, looking north (true-map framing)

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 3, 4);

  // post pipeline
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(null, camera);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.5, 0.55, 0.82);
  gradePass = new ShaderPass(GradeShader);
  gradePass.uniforms.uTint.value = new THREE.Vector3(1, 1, 1);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKey);

  // ambient backdrop behind the selection glass: 1985 at golden hour
  state.world = getWorld(5);
  renderPass.scene = state.world.scene;
  state.timeOfDay = 0.74;

  animate();
}

// ----------------------------------------------------------------- worlds

function getWorld(id) {
  if (worldCache.has(id)) {
    touchCache(id);
    return worldCache.get(id);
  }
  const world = buildEraWorld(ERAS[id]);
  world.onTrain = () => {
    if (state.mode !== 'select' && (state.world === world || state.compareWorld === world)) {
      UI.toast(TRAIN_LINES[world.era.key], 'wonder');
    }
  };
  worldCache.set(id, world);
  touchCache(id);
  // evict beyond 3 worlds, never the ones on screen
  while (cacheOrder.length > 3) {
    const oldest = cacheOrder.shift();
    const w = worldCache.get(oldest);
    if (w && w !== state.world && w !== state.compareWorld) {
      w.dispose();
      worldCache.delete(oldest);
    } else if (w) {
      cacheOrder.push(oldest); // still in use; retry later
      break;
    }
  }
  return world;
}
function touchCache(id) {
  const i = cacheOrder.indexOf(id);
  if (i >= 0) cacheOrder.splice(i, 1);
  cacheOrder.push(id);
}

// ----------------------------------------------------------------- era flow

function enterEra(id) {
  if (state.mode === 'compare') exitCompare();
  const era = ERAS[id];
  const sameEra = state.mode === 'era' && state.era?.id === id;
  if (sameEra) return;

  UI.showEpigraph(era, {
    onCovered: () => {
      UI.hideSelection();
      UI.hideStory();
      UI.hidePersonModal();
      state.era = era;
      state.world = getWorld(id);
      renderPass.scene = state.world.scene;
      state.mode = 'era';
      state.timeOfDay = era.defaultTime;
      state.grief = 0;
      echoIdle = 0;   // echoes reward dwelling, not arriving
      applyGrade(era);
      UI.showHUD(era);
      UI.renderResidents(state.world, focusPerson);
      const def = CAMERA_DEFAULTS[era.key];
      // arrive from above, drift down into the streets
      camera.position.set(def.pos[0] * 1.5, def.pos[1] * 2.4, def.pos[2] * 1.5);
      controls.target.set(def.tgt[0], def.tgt[1], def.tgt[2]);
      tweenCamera(def.pos, def.tgt, 3.2);
    },
    onDone: () => {
      UI.toast(era.welcome, 'info', 5600);
      if (!state.visitedOnce) {
        state.visitedOnce = true;
        setTimeout(() => UI.toast('Click people, buildings, even the river. Press ? for the keys to the city.', 'info', 5200), 6200);
      }
    },
  });
}

function exitToSelection() {
  if (state.mode === 'compare') exitCompare();
  state.mode = 'select';
  state.era = null;
  UI.hideHUD();
  UI.hideStory();
  UI.hidePersonModal();
  UI.hideNametag();
  UI.showSelection();
  state.timeOfDay = 0.74;
  state.flow = false;
  UI.setFlowActive(false);
  // keep the current world as the backdrop
  tweenCamera([46, 30, 54], [0, 3, -4], 2.2);
}

function applyGrade(era) {
  const g = era.vis.grade;
  gradePass.uniforms.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]);
  gradePass.uniforms.uTintAmt.value = g.tintAmt;
  gradePass.uniforms.uDesat.value = g.desat;
  gradePass.uniforms.uVignette.value = g.vignette;
  gradePass.uniforms.uGrain.value = g.grain;
  renderer.toneMappingExposure = era.vis.exposure;
}

// ----------------------------------------------------------------- camera

function tweenCamera(pos, tgt, dur = 1.2) {
  state.cameraTween = {
    fromPos: camera.position.clone(),
    fromTgt: controls.target.clone(),
    toPos: new THREE.Vector3(...pos),
    toTgt: new THREE.Vector3(...tgt),
    t: 0, dur,
  };
  controls.enabled = false;
}

function updateCameraTween(dt) {
  const tw = state.cameraTween;
  if (!tw) return;
  tw.t += dt;
  const f = Math.min(1, tw.t / tw.dur);
  const e = 1 - Math.pow(1 - f, 3); // easeOutCubic
  camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
  controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
  if (f >= 1) {
    state.cameraTween = null;
    controls.enabled = true;
  }
}

function resetCamera() {
  if (state.mode === 'select' || !state.era) return;
  const def = CAMERA_DEFAULTS[state.era.key];
  tweenCamera(def.pos, def.tgt, 1.4);
}

function focusPerson(agent) {
  if (state.mode !== 'era') return;
  state.focusAgent && releaseFocus();
  state.focusAgent = agent;
  agent.pauseT = 9999;
  agent.parts.ring.material.opacity = 0.85;
  const p = agent.mesh.position;
  const dir = camera.position.clone().sub(p).setY(0).normalize();
  const camPos = p.clone().add(dir.multiplyScalar(9)).setY(5.2);
  tweenCamera([camPos.x, camPos.y, camPos.z], [p.x, p.y + 1.4, p.z], 0.9);
  UI.showPersonModal(agent, state.era);
}

function releaseFocus() {
  if (!state.focusAgent) return;
  state.focusAgent.pauseT = 0.6;
  state.focusAgent.parts.ring.material.opacity = 0;
  state.focusAgent = null;
}

// ----------------------------------------------------------------- time & light

function setTimeOfDay(t) {
  state.timeOfDay = Math.max(0.02, Math.min(0.99, t));
}

function advanceHours(h) {
  let t = state.timeOfDay + h / 18;
  if (t > 0.99) t -= 0.97; // wrap to early morning
  state.timeOfDay = Math.max(0.02, t);
  const world = state.world;
  if (world && state.mode !== 'select') {
    world.agents.forEach(a => {
      if (a === state.focusAgent) return;
      if (Math.random() < 0.7) { a.pickTarget(); }
      if (Math.random() < 0.5) a.nextDoing();
    });
    UI.refreshResidentDoings();
    UI.setPulse(UI.getPulse() + (Math.random() < 0.5 ? 1 : -1));
  }
}

function toggleFlow() {
  state.flow = !state.flow;
  UI.setFlowActive(state.flow);
}

function timeString(t) {
  const total = 5.5 + t * 18;
  let hr = Math.floor(total), min = Math.floor((total - hr) * 60);
  const ampm = hr >= 12 && hr < 24 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return `${hr}:${String(min).padStart(2, '0')} ${ampm}`;
}

const _sunDir = new THREE.Vector3();
const _colA = new THREE.Color(), _colB = new THREE.Color(), _colC = new THREE.Color();

function computeDaylight(t) {
  const rise = 0.055, set = 0.875;
  const dayFrac = (t - rise) / (set - rise);
  const elev = (dayFrac > 0 && dayFrac < 1) ? Math.sin(dayFrac * Math.PI) : 0;
  let night;
  if (dayFrac <= 0) night = Math.min(1, -dayFrac * 12 + 0.65);
  else if (dayFrac >= 1) night = Math.min(1, (dayFrac - 1) * 12 + 0.65);
  else night = Math.max(0, 1 - elev * 5);   // brief dusk shoulder
  night = Math.min(1, Math.max(0, night));

  const azim = ((dayFrac < 0 ? 0 : dayFrac > 1 ? 1 : dayFrac) - 0.5) * Math.PI * 1.25;
  _sunDir.set(Math.sin(azim), Math.max(0.06, elev) * 0.9 + 0.08, -Math.cos(azim) * 0.55).normalize();
  return { elev, night, dayFrac };
}

function applyEnvironment(world, day) {
  const vis = world.era.vis;
  const { elev, night } = day;
  const dayAmt = 1 - night;
  const lowSun = 1 - Math.min(1, elev / 0.45);    // 1 near sunrise/sunset

  // sun light
  const sunDist = 120;
  world.sun.position.copy(_sunDir).multiplyScalar(sunDist);
  world.sun.target.position.set(0, 0, 0);
  _colA.set('#fff3df'); _colB.set('#ff8e3d'); _colC.set('#3d4d7a');
  const sunCol = _colA.lerp(_colB, lowSun * 0.85).lerp(_colC, night);
  world.sun.color.copy(sunCol);
  world.sun.intensity = (0.25 + elev * 2.6) * dayAmt + 0.22 * night;
  world.amb.intensity = 0.22 + elev * 0.3 + night * 0.1;
  world.hemi.intensity = 0.25 + elev * 0.55;

  // sky
  const sky = world.sky.mat.uniforms;
  _colA.set(vis.skyDay[0]); _colB.set(vis.skyGold[0]); _colC.set(vis.skyNight[0]);
  sky.uZenith.value.copy(_colB.clone().lerp(_colA, Math.min(1, elev / 0.4)).lerp(_colC, night));
  _colA.set(vis.skyDay[1]); _colB.set(vis.skyGold[1]); _colC.set(vis.skyNight[1]);
  sky.uHorizon.value.copy(_colB.clone().lerp(_colA, Math.min(1, elev / 0.4)).lerp(_colC, night));
  sky.uSunDir.value.copy(_sunDir);
  sky.uSunColor.value.copy(sunCol).multiplyScalar(dayAmt * 0.9 + 0.06);
  sky.uStarAmt.value = night;
  sky.uTime.value = elapsed;

  // fog
  _colA.set(vis.fogDay); _colB.set(vis.fogNight);
  world.scene.fog.color.copy(_colA.lerp(_colB, night));
  world.scene.fog.density = vis.fogDensity * (1 + night * 0.35);

  // water
  if (world.water) {
    const wu = world.water.mat.uniforms;
    wu.uSunDir.value.copy(_sunDir);
    wu.uSunColor.value.copy(sunCol);
    wu.uFogColor.value.copy(world.scene.fog.color);
    wu.uFogDensity.value = world.scene.fog.density;
    wu.uNightDim.value = night;
  }

  // glow: windows, lamps, marquees, string lights
  const eveAmt = Math.max(night, lowSun * 0.55 * dayAmt); // lights start at golden hour
  world.windowMats.forEach(m => { if (m) m.emissiveIntensity = 1.5 * night; });
  world.lampMats.forEach(m => { m.emissiveIntensity = 2.4 * eveAmt; });
  world.lampLights.forEach(l => { l.intensity = 16 * night; });
  // dying signs stutter after dark (1985's marquee)
  const flick = (Math.sin(elapsed * 13) > 0.92 || Math.sin(elapsed * 7.3) < -0.97) ? 0.2 : 1;
  world.marqueeMats.forEach(m => {
    const f = (m.userData.flicker && night > 0.3) ? flick : 1;
    m.emissiveIntensity = 1.7 * Math.max(eveAmt, 0.06) * f;
  });
  world.stringMats.forEach(m => { m.emissiveIntensity = 2.6 * eveAmt; });

  // memory hour: echoes of other layers shimmer in at dusk (palimpsest pass)
  const echoAmt = 0.35 + eveAmt * 0.65;
  world.echoMats.forEach((m, i) => {
    m.opacity = m.userData.echoBase * echoAmt * (0.88 + 0.12 * Math.sin(elapsed * 0.6 + i * 1.7));
  });
}

// ----------------------------------------------------------------- city events

function cityEvent() {
  if (state.mode === 'select' || !state.world) return;
  const era = state.era;
  const ev = era.events[Math.floor(Math.random() * era.events.length)];
  UI.toast(ev.text, ev.kind, 6400);

  const flashColor = { bright: 0xffd27a, ache: 0x9aa3b8, wonder: 0x7adfff }[ev.kind] || 0xffd27a;
  const flash = new THREE.PointLight(flashColor, 60, 70, 1.6);
  flash.position.set(0, 18, -6);
  const scene = state.world.scene;   // capture: the era may change mid-fade
  scene.add(flash);
  const t0 = elapsed;
  const fade = () => {
    const k = (elapsed - t0) / 1.1;
    if (k >= 1) { scene.remove(flash); return; }
    flash.intensity = 60 * (1 - k);
    requestAnimationFrame(fade);
  };
  fade();

  if (ev.kind === 'ache') {
    state.grief = 0.55;
    UI.setPulse(UI.getPulse() - 2);
  } else {
    UI.setPulse(UI.getPulse() + (ev.kind === 'wonder' ? 4 : 3));
    // people drift toward a gathering place
    const a = state.world.anchors[Math.floor(Math.random() * state.world.anchors.length)];
    state.world.agents.forEach(ag => {
      if (ag !== state.focusAgent && Math.random() < 0.55) {
        ag.target.set(a.x + (Math.random() - 0.5) * 6, 0, a.z + (Math.random() - 0.5) * 6);
        ag.pauseT = 0;
      }
    });
  }
}

// ----------------------------------------------------------------- picking

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
let hoverThrottle = 0;

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

function findAgent(obj) {
  let o = obj;
  while (o) { if (o.userData?.agent) return o.userData.agent; o = o.parent; }
  return null;
}
function findLandmark(obj) {
  let o = obj;
  while (o) { if (o.userData?.landmark) return o.userData.landmark; o = o.parent; }
  return null;
}

function onPointerDown(e) { downXY = [e.clientX, e.clientY]; }

function onPointerUp(e) {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6 || state.mode !== 'era' || !state.world) return;

  setPointer(e);
  raycaster.setFromCamera(pointer, camera);

  const agentHits = raycaster.intersectObjects(state.world.agentMeshes, true);
  if (agentHits.length) {
    const agent = findAgent(agentHits[0].object);
    if (agent) { focusPerson(agent); return; }
  }

  const lmHits = raycaster.intersectObjects(state.world.pickLandmarks, true);
  if (lmHits.length) {
    const key = findLandmark(lmHits[0].object);
    if (key === 'river') {
      state.riverClicks++;
      if (state.riverClicks % 3 === 0) {
        UI.showStory('river', state.era);
      } else {
        const lines = state.era.riverLines;
        UI.riverVoice(lines[Math.floor(Math.random() * lines.length)]);
      }
      return;
    }
    if (key) { UI.showStory(key, state.era); return; }
  }
}

function onPointerMove(e) {
  if (state.mode !== 'era' || !state.world) return;
  const now = performance.now();
  if (now - hoverThrottle < 70) return;
  hoverThrottle = now;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(state.world.agentMeshes, true);
  if (hits.length) {
    const agent = findAgent(hits[0].object);
    if (agent) {
      UI.nametag(e.clientX, e.clientY, agent.person.name, agent.doing);
      renderer.domElement.style.cursor = 'pointer';
      return;
    }
  }
  UI.hideNametag();
  const lmHits = raycaster.intersectObjects(state.world.pickLandmarks, true);
  renderer.domElement.style.cursor = lmHits.length ? 'pointer' : '';
}

// ----------------------------------------------------------------- compare

function openCompare() {
  if (state.mode !== 'era') return;
  UI.showCompareChooser(state.era, otherId => {
    state.compareWorld = getWorld(otherId);
    state.mode = 'compare';
    state.split = 0.5;
    UI.hideStory();
    UI.hidePersonModal();
    UI.hideNametag();
    renderer.domElement.style.cursor = '';
    UI.showCompareHUD(state.era, ERAS[otherId], f => { state.split = f; });
    UI.toast('Same streets, same river — drag the divider. Esc to come back.', 'info', 5200);
  });
}

function exitCompare() {
  if (state.mode !== 'compare') return;
  state.mode = 'era';
  state.compareWorld = null;
  UI.hideCompareHUD();
}

// ----------------------------------------------------------------- input

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;

  if (k === 'Escape') {
    if (UI.closeTopOverlay()) { releaseFocus(); return; }
    if (state.mode === 'compare') { exitCompare(); return; }
    if (state.mode === 'era') exitToSelection();
    return;
  }
  if (k === '?') { document.getElementById('help-overlay').classList.remove('hidden'); return; }

  if (k >= '1' && k <= '9') { enterEra(parseInt(k) - 1); return; }

  if (state.mode === 'select') return;
  switch (k.toLowerCase()) {
    case 't': advanceHours(2); break;
    case 'm': setTimeOfDay(0.16); break;
    case 'd': setTimeOfDay(0.42); break;
    case 'g': setTimeOfDay(0.74); break;
    case 'n': setTimeOfDay(0.97); break;
    case 'e': if (state.mode === 'era') cityEvent(); break;
    case 'c': if (state.mode === 'era') openCompare(); else if (state.mode === 'compare') exitCompare(); break;
    case 'p': if (state.era) UI.showEpigraph(state.era, {}); break;
    case 'r': resetCamera(); break;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------------------------------------------- loop

let doingRefresh = 0;
let echoIdle = 0, echoNext = 70 + Math.random() * 60;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (state.flow && state.mode !== 'select') {
    state.timeOfDay += dt / 420;            // a full day in ~7 minutes
    if (state.timeOfDay > 0.99) state.timeOfDay = 0.02;
  }

  const day = computeDaylight(state.timeOfDay);
  UI.setHUDTime(timeString(state.timeOfDay));

  updateCameraTween(dt);
  controls.update();

  // if the person modal was closed by any route, let them walk again
  if (state.focusAgent && !UI.personModalOpen()) releaseFocus();

  // grief pulse decay (ache events)
  state.grief = Math.max(0, state.grief - dt * 0.22);
  gradePass.uniforms.uGrief.value = state.grief;
  gradePass.uniforms.uTime.value = elapsed;

  if (state.mode === 'compare' && state.compareWorld) {
    // two worlds, one camera, a divider of years
    const L = state.world, R = state.compareWorld;
    L.update(dt, elapsed, day.night);
    R.update(dt, elapsed, day.night);
    applyEnvironment(L, day);
    applyEnvironment(R, day);
    const w = renderer.domElement.width / renderer.getPixelRatio();
    const h = renderer.domElement.height / renderer.getPixelRatio();
    const sx = Math.floor(w * state.split);
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, sx, h);
    renderer.render(L.scene, camera);
    renderer.setScissor(sx, 0, w - sx, h);
    renderer.render(R.scene, camera);
    renderer.setScissorTest(false);
  } else if (state.world) {
    state.world.update(dt, elapsed, day.night);
    applyEnvironment(state.world, day);
    composer.render();
  }

  // keep modal "right now" line fresh-ish & resident list alive
  doingRefresh += dt;
  if (doingRefresh > 2.5) {
    doingRefresh = 0;
    if (state.mode === 'era') UI.refreshResidentDoings();
  }

  // the city remembers unprompted, rarely — one echo, then a long silence
  if (state.mode === 'era' && state.era?.echoes?.length) {
    echoIdle += dt;
    if (echoIdle > echoNext) {
      echoIdle = 0;
      echoNext = 80 + Math.random() * 80;
      const lines = state.era.echoes;
      UI.toast(lines[Math.floor(Math.random() * lines.length)], 'echo', 7800);
    }
  }
}

boot();
