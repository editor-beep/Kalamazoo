// One-off layout study: project the survey-correct reference map into world
// coordinates and render a top-down plan. Survey-true relative positions for the
// downtown core; outliers radially compressed toward the core (bearing preserved)
// so the city stays the same size, not 2x. Not part of the smoke test.
//
//   node scripts/layout_preview.mjs > layout_preview.svg

// --- reference pins (your SVG, image px, y-down) ----------------------------
const MAP = {
  'Checker Cab #1':        [886.8,  44.2, 'north'],
  'Gospel Mission #2':     [798.5, 405.0, 'core'],
  'Bus Station #3':        [764.1, 407.0, 'core'],
  'E Michigan Bridge #4':  [920.3, 412.0, 'river'],
  'Pro Co Sound #5':       [826.8, 414.0, 'core'],
  "Shakespeare's #6":      [869.2, 426.1, 'core'],
  'Rickman #7':            [792.7, 431.0, 'core'],
  'Masonic Temple #8':     [742.8, 446.6, 'core'],
  'Water St Coffee #9':    [860.3, 471.4, 'core'],
  'Flipside #10':          [789.0, 473.4, 'core'],
  'Burdick Hotel #11':     [758.4, 474.3, 'core'],
  'Planet Clare #12':      [829.4, 483.3, 'core'],
  'Bronson Park #13':      [725.5, 520.2, 'flag'],   // map pin reads too far south
  'Library #14':           [762.7, 535.8, 'flag'],   // map pin reads east of Burdick
  'Upjohn #15':            [830.8, 540.4, 'core'],
  'Gibson #17':            [806.0, 275.4, 'north'],
  'Northwest Hosp #18':    [251.2, 304.0, 'south'],
  'East Hall #19':         [634.2, 663.1, 'south'],
  'State Hospital #21':    [648.7, 742.2, 'south'],
  'WMU #22':               [326.2, 860.0, 'south'],
  'Superfund #23':         [917.1, 995.4, 'flag'],   // map pin reads far east
  'State Theater *':       [799.9, 504.0, 'core'],
  'Gazette *':             [829.1, 513.0, 'core'],
  'Michigan News *':       [676.7, 473.0, 'core'],
};

// --- current code positions (world units) for before/after connectors -------
const CURRENT = {
  'Burdick Hotel #11': [11.5, 18.4], 'Rickman #7': [10, 33.5],
  'Gospel Mission #2': [-8.4, 34.25], 'Library #14': [-19.9, -36.5],
  "Shakespeare's #6": [25.4, 3.4], 'Pro Co Sound #5': [25.4, -2.3],
  'Bronson Park #13': [20, -14], 'State Theater *': [10, -10.5],
  'WMU #22': [-64, 36], 'Gibson #17': [28, 50], 'Superfund #23': [-18, -52],
  'State Hospital #21': [-56, -54],
};

// --- the transform: rotate +38.4 deg CCW (Burdick -> +z), scale 0.27 --------
const TH = 38.4 * Math.PI / 180, C = Math.cos(TH), S = Math.sin(TH), SC = 0.27;
const TX = -240.0, TZ = -8.8;
function project(px, py) {
  const E = px, N = -py;                 // image y-down -> compass
  const Ep = E * C - N * S, Np = E * S + N * C;
  return [SC * Ep + TX, SC * Np + TZ];
}

// --- outlier compression: pull anything past R0 in toward the core ----------
const CX = 6, CZ = 24, R0 = 35, SOFT = 25;
function compress(x, z) {
  const dx = x - CX, dz = z - CZ, r = Math.hypot(dx, dz);
  if (r <= R0) return [x, z];
  const r2 = R0 + SOFT * Math.log(1 + (r - R0) / SOFT);
  const k = r2 / r;
  return [CX + dx * k, CZ + dz * k];
}

const COLORS = { core: '#0a84ff', river: '#32d4c8', north: '#9b8cff',
                 south: '#ff9f0a', flag: '#ff3b30' };

// --- world -> svg (z up) ----------------------------------------------------
const W = 1000, PXU = 5.5, MIDZ = 17.5;
const sx = x => 500 + x * PXU;
const sy = z => 500 - (z - MIDZ) * PXU;

const out = [];
out.push(`<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">`);
out.push(`<rect width="${W}" height="${W}" fill="#0d1320"/>`);
// grid every 10 units
for (let g = -70; g <= 70; g += 10)
  out.push(`<line x1="${sx(g)}" y1="0" x2="${sx(g)}" y2="${W}" stroke="#243044" stroke-width="0.7" opacity="0.5"/>`);
for (let g = -60; g <= 95; g += 10)
  out.push(`<line x1="0" y1="${sy(g)}" x2="${W}" y2="${sy(g)}" stroke="#243044" stroke-width="0.7" opacity="0.5"/>`);
// spine: Burdick (x=0), Michigan (z~18), rail band (z 38..42)
out.push(`<line x1="${sx(0)}" y1="0" x2="${sx(0)}" y2="${W}" stroke="#5a6b82" stroke-width="1.4" opacity="0.7"/>`);
out.push(`<text x="${sx(0)+4}" y="40" fill="#8aa" font-size="12" font-family="monospace">BURDICK (x=0)</text>`);
out.push(`<line x1="0" y1="${sy(18)}" x2="${W}" y2="${sy(18)}" stroke="#4a5668" stroke-width="1" opacity="0.6" stroke-dasharray="6 5"/>`);
out.push(`<text x="14" y="${sy(18)-4}" fill="#789" font-size="11" font-family="monospace">MICHIGAN AVE</text>`);
out.push(`<rect x="0" y="${sy(42)}" width="${W}" height="${sy(38)-sy(42)}" fill="#7a3030" opacity="0.22"/>`);
out.push(`<text x="14" y="${sy(40)+4}" fill="#c87" font-size="11" font-family="monospace">RAIL BAND z 38..42</text>`);

// north arrow
out.push(`<text x="930" y="40" fill="#9fb" font-size="13" font-family="monospace">N up</text>`);
out.push(`<line x1="945" y1="55" x2="945" y2="90" stroke="#9fb" stroke-width="1.5"/><path d="M945,52 l-4,8 l8,0 z" fill="#9fb"/>`);

// plot
for (const [name, [px, py, cat]] of Object.entries(MAP)) {
  const [x0, z0] = project(px, py);
  const [x, z] = compress(x0, z0);
  const col = COLORS[cat] || '#0a84ff';
  // before/after connector
  if (CURRENT[name]) {
    const [cx, cz] = CURRENT[name];
    out.push(`<line x1="${sx(cx)}" y1="${sy(cz)}" x2="${sx(x)}" y2="${sy(z)}" stroke="#445" stroke-width="1" stroke-dasharray="3 3"/>`);
    out.push(`<circle cx="${sx(cx)}" cy="${sy(cz)}" r="4" fill="none" stroke="#667" stroke-width="1.3"/>`);
  }
  // compression connector (survey-true -> compressed)
  if (x0 !== x || z0 !== z)
    out.push(`<line x1="${sx(x0)}" y1="${sy(z0)}" x2="${sx(x)}" y2="${sy(z)}" stroke="${col}" stroke-width="0.8" opacity="0.35"/>`);
  out.push(`<circle cx="${sx(x)}" cy="${sy(z)}" r="6" fill="${col}" stroke="#fff" stroke-width="1.4"/>`);
  out.push(`<text x="${sx(x)+9}" y="${sy(z)+4}" fill="${col}" font-size="11" font-weight="700" font-family="monospace" paint-order="stroke" stroke="#0d1320" stroke-width="3">${name} (${x.toFixed(0)},${z.toFixed(0)})</text>`);
}
// legend
const leg = [['core','downtown core'],['river','river / bridge'],['north','north'],['south','south'],['flag','map pin looks off']];
leg.forEach(([k, t], i) => {
  out.push(`<circle cx="30" cy="${930 + i*0}" r="0" />`);
  out.push(`<circle cx="30" cy="${905 - i*18}" r="5" fill="${COLORS[k]}" stroke="#fff" stroke-width="1"/>`);
  out.push(`<text x="42" y="${909 - i*18}" fill="#bcd" font-size="11" font-family="monospace">${t}</text>`);
});
out.push(`<circle cx="30" cy="${905 - leg.length*18}" r="4" fill="none" stroke="#667" stroke-width="1.3"/><text x="42" y="${909 - leg.length*18}" fill="#bcd" font-size="11" font-family="monospace">current code position</text>`);
out.push('</svg>');
process.stdout.write(out.join('\n'));
