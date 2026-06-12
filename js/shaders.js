// Custom shaders: gradient sky dome with sun/stars, living water, cinematic grade.

export const SkyShader = {
  uniforms: {
    uZenith:   { value: null },   // THREE.Color set per frame
    uHorizon:  { value: null },
    uSunDir:   { value: null },   // THREE.Vector3
    uSunColor: { value: null },
    uStarAmt:  { value: 0.0 },
    uTime:     { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uStarAmt;
    uniform float uTime;

    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    void main() {
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 col = mix(uHorizon, uZenith, pow(h, 0.62));

      // sun glow + disc
      float sunDot = max(dot(vDir, normalize(uSunDir)), 0.0);
      col += uSunColor * pow(sunDot, 90.0) * 1.1;     // halo
      col += uSunColor * smoothstep(0.9994, 0.9999, sunDot) * 6.0; // disc

      // stars (only meaningful at night via uStarAmt)
      if (uStarAmt > 0.001 && vDir.y > 0.02) {
        vec2 sp = vDir.xz / (vDir.y + 0.18);
        vec2 cell = floor(sp * 90.0);
        float star = step(0.992, hash21(cell));
        float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash21(cell + 7.0) * 40.0);
        col += vec3(0.9, 0.95, 1.0) * star * tw * uStarAmt * smoothstep(0.02, 0.3, vDir.y);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const WaterShader = {
  uniforms: {
    uTime:     { value: 0 },
    uColorA:   { value: null },  // shallow / lit
    uColorB:   { value: null },  // deep
    uMurk:     { value: 0.3 },
    uSunDir:   { value: null },
    uSunColor: { value: null },
    uFogColor: { value: null },
    uFogDensity: { value: 0.005 },
    uNightDim: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying float vWave;

    void main() {
      vUv = uv;
      vec3 p = position;
      // layered travelling waves (plane is rotated flat; z is along-stream before rotation)
      float w =
        sin(p.x * 0.55 + uTime * 0.9) * 0.09 +
        sin(p.y * 0.38 - uTime * 0.62) * 0.12 +
        sin((p.x + p.y) * 0.21 + uTime * 0.45) * 0.07;
      p.z += w; // plane local z == world up after -PI/2 x-rotation
      vWave = w;
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorldPos = world.xyz;
      vec4 mv = viewMatrix * world;
      vViewPos = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uMurk;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uNightDim;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying float vWave;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y);
    }

    void main() {
      // flowing streaks along stream (v axis)
      float flow = noise(vec2(vUv.x * 14.0, vUv.y * 60.0 - uTime * 0.55));
      float flow2 = noise(vec2(vUv.x * 30.0 + 13.0, vUv.y * 110.0 - uTime * 1.1));
      float streak = flow * 0.65 + flow2 * 0.35;

      vec3 col = mix(uColorB, uColorA, streak * 0.6 + vWave * 1.4 + 0.25);

      // murk flattens contrast toward a gray-brown
      vec3 murkCol = mix(col, vec3(0.32, 0.33, 0.28), uMurk * 0.75);
      col = murkCol;

      // sun glint
      vec3 normal = normalize(vec3(vWave * 1.6, 1.0, vWave * 1.2));
      vec3 worldView = normalize(cameraPosition - vWorldPos);
      vec3 halfDir = normalize(normalize(uSunDir) + worldView);
      float spec = pow(max(dot(normal, halfDir), 0.0), 140.0);
      col += uSunColor * spec * (1.0 - uMurk * 0.7) * 1.4;

      // sparkle
      float sparkle = step(0.985, noise(vUv * vec2(80.0, 260.0) + uTime * 0.8));
      col += uSunColor * sparkle * 0.25 * (1.0 - uMurk);

      // fresnel sky-ish rim
      float fres = pow(1.0 - max(dot(worldView, vec3(0.0, 1.0, 0.0)), 0.0), 2.0);
      col = mix(col, uFogColor, fres * 0.35);

      col *= (1.0 - uNightDim * 0.55);

      // manual exp2 fog
      float dist = length(vViewPos);
      float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

      gl_FragColor = vec4(col, 0.93);
    }
  `,
};

// Final post pass: vignette, grain, era tint, desaturation, grief pulse.
export const GradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     { value: 0 },
    uVignette: { value: 0.34 },
    uGrain:    { value: 0.07 },
    uTint:     { value: null },   // THREE.Vector3
    uTintAmt:  { value: 0.5 },
    uDesat:    { value: 0.0 },
    uGrief:    { value: 0.0 },    // transient pulse on 'ache' events
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec3 uTint;
    uniform float uTintAmt;
    uniform float uDesat;
    uniform float uGrief;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // tint (multiply toward era cast)
      col = mix(col, col * uTint, uTintAmt);

      // desaturate (era) + grief pulse desat
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float ds = clamp(uDesat + uGrief * 0.55, 0.0, 0.85);
      col = mix(col, vec3(lum), ds);
      col *= (1.0 - uGrief * 0.12);

      // vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.32, 0.95, length(d) * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette + uGrief * 0.2);

      // grain
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 43.0) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(col, tex.a);
    }
  `,
};
