// FRAG - construcao visual dos mapas a partir das caixas de colisao (que nao mudam).
// Cada caixa vira um objeto com cara de objeto (muro com cornija, caixote com moldura, mesa, monitor...),
// sempre DENTRO do volume de colisao ou saltando no maximo alguns centimetros, para o que se ve bater com o que se colide.
import * as THREE from 'three';
import { box, bx, bc, prim, tint, Batch, makeGrid } from './geo.js';
import { pbrMaterial, getTextures, glassMaterial, canvasTex, windowsTex, screenTex, signTex } from './textures.js';

const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ------------------------------------------------------------------ ceu (domo com gradiente, sol, nuvens e estrelas)
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p; }`;
const SKY_FS = `
uniform vec3 top, horizon, bottom, sunDir, sunColor; uniform float sunSize, clouds, stars, time, hdr;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0. ? mix(horizon, top, 1. - pow(1. - clamp(h,0.,1.), 3.2)) : mix(horizon, bottom, pow(clamp(-h,0.,1.), .35));
  float cs = dot(d, normalize(sunDir));
  col += sunColor * (pow(max(cs,0.), 6.) * .22 + pow(max(cs,0.), 60.) * .6) * hdr;
  float disk = smoothstep(cos(sunSize * 1.15), cos(sunSize), cs);
  if (clouds > 0. && h > -0.02) {
    vec2 uv = d.xz / (h + .18) * 1.3 + vec2(time * .006, time * .002);
    float c = fbm(uv * 1.4); c = smoothstep(.64 - clouds * .2, .97, c) * smoothstep(-.02, .18, h);
    vec3 cc = mix(horizon * 1.02, vec3(1.) * (0.55 + 0.45 * hdr), .62) + sunColor * pow(max(cs,0.), 4.) * .6 * hdr;
    col = mix(col, cc * (stars > .5 ? .18 : 1.), c * .85);
    disk *= 1. - c;
  }
  col += sunColor * disk * 18. * hdr;
  if (stars > 0. && h > 0.) {
    vec3 q = floor(d * 420.); float s = h21(q.xy + q.z * 17.13);
    col += vec3(.9,.95,1.) * step(.9975, s) * smoothstep(0.,.25,h) * (0.6 + 2.4 * h21(q.zy)) * stars;
  }
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function makeSky(a) {
  const u = {
    top: { value: new THREE.Color(a.skyTop) }, horizon: { value: new THREE.Color(a.skyHorizon) }, bottom: { value: new THREE.Color(a.skyBottom) },
    sunDir: { value: new THREE.Vector3(...a.sun[2]).normalize() }, sunColor: { value: new THREE.Color(a.sunColor) },
    sunSize: { value: a.sunSize }, clouds: { value: a.clouds }, stars: { value: a.stars }, time: { value: 0 }, hdr: { value: a.stars ? 0.35 : 1 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(320, 40, 20), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.matrixAutoUpdate = false;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.setFromMatrixPosition(cam.matrixWorld); mesh.updateMatrix(); mesh.updateMatrixWorld(true); };
  mesh.userData.sky = true;
  return { mesh, u };
}

// ------------------------------------------------------------------ texturas de canvas especificas do cenario
function frondTex() {
  return canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#5b4a22'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + 6, h / 2, w / 2, 4); g.stroke();
    for (let i = 0; i < 34; i++) {
      const y = h - 20 - i * 14, L = 58 * Math.sin(Math.PI * (0.12 + 0.85 * i / 34));
      for (const s of [-1, 1]) {
        g.fillStyle = ['#3f6a26', '#4c7a2c', '#35591f'][i % 3];
        g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * L * 0.6, y - 10, w / 2 + s * L, y + 14); g.quadraticCurveTo(w / 2 + s * L * 0.5, y + 2, w / 2, y + 5); g.fill();
      }
    }
  });
}
function leafTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45, cx = w / 2, cy = h - 6;
      g.save(); g.translate(cx, cy); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, 0, -110); gr.addColorStop(0, '#24481c'); gr.addColorStop(1, '#4f8a38');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(26, -60, 0, -112); g.quadraticCurveTo(-26, -60, 0, 0); g.fill();
      g.strokeStyle = 'rgba(200,230,160,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -105); g.stroke();
      g.restore();
    }
  });
}
function bannerTex(col, seed) {
  const r = rng(seed);
  return canvasTex(128, 384, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.fillStyle = '#E8C77E'; g.fillRect(10, 0, 6, h); g.fillRect(w - 16, 0, 6, h);
    g.strokeStyle = '#E8C77E'; g.lineWidth = 5;
    const cx = w / 2, cy = h * 0.38;
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); } g.stroke();
    g.beginPath(); g.arc(cx, cy, 22, 0, TAU); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24, h * 0.65 + i * 26); g.lineTo(w / 2, h * 0.65 + i * 26 + 14); g.lineTo(w - 24, h * 0.65 + i * 26); g.stroke(); }
    g.fillStyle = '#E8C77E'; for (let x = 8; x < w; x += 16) { g.beginPath(); g.moveTo(x - 7, h - 16); g.lineTo(x + 7, h - 16); g.lineTo(x, h - 2 - r() * 4); g.fill(); }
  });
}
function artTex(seed) {
  const r = rng(seed);
  return canvasTex(256, 192, (g, w, h) => {
    const pal = [['#1f3b57', '#e07a3f', '#f2d27c', '#e9e4d8'], ['#2c2a3a', '#7fb7a4', '#e5c35c', '#f0ebe0'], ['#3b2a22', '#c9573c', '#88a0a8', '#efe7da']][seed % 3];
    g.fillStyle = pal[3]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = pal[i % 3]; g.globalAlpha = 0.85;
      if (r() > 0.5) { g.beginPath(); g.arc(r() * w, r() * h, 12 + r() * 50, 0, TAU); g.fill(); }
      else g.fillRect(r() * w * 0.8, r() * h * 0.8, 20 + r() * 110, 10 + r() * 70);
    }
    g.globalAlpha = 1; g.strokeStyle = '#1a1a1a'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
  });
}

// ------------------------------------------------------------------ utilitarios de caixa
// face interna de um muro de perimetro: eixo perpendicular, coordenada da face e sentido para dentro
function innerFace(b) {
  if (b.w > b.d) return { axis: 'z', F: b.z - Math.sign(b.z) * b.d / 2, n: -Math.sign(b.z), a0: b.x - b.w / 2, a1: b.x + b.w / 2 };
  return { axis: 'x', F: b.x - Math.sign(b.x) * b.w / 2, n: -Math.sign(b.x), a0: b.z - b.d / 2, a1: b.z + b.d / 2 };
}
// as duas faces longas de uma caixa fina (muro interno, divisoria)
function longFaces(b) {
  if (b.w >= b.d) return [{ axis: 'z', F: b.z + b.d / 2, n: 1, a0: b.x - b.w / 2, a1: b.x + b.w / 2 }, { axis: 'z', F: b.z - b.d / 2, n: -1, a0: b.x - b.w / 2, a1: b.x + b.w / 2 }];
  return [{ axis: 'x', F: b.x + b.w / 2, n: 1, a0: b.z - b.d / 2, a1: b.z + b.d / 2 }, { axis: 'x', F: b.x - b.w / 2, n: -1, a0: b.z - b.d / 2, a1: b.z + b.d / 2 }];
}
// caixa encostada numa face: [a0,a1] ao longo da face, [y0,y1], saliencia 'out' para fora da face
function faceBox(P, a0, a1, y0, y1, out, back = 0.02, opts) {
  const p0 = P.F - P.n * back, p1 = P.F + P.n * out, lo = Math.min(p0, p1), hi = Math.max(p0, p1);
  return P.axis === 'z' ? bx(a0, y0, lo, a1, y1, hi, opts) : bx(lo, y0, a0, hi, y1, a1, opts);
}
// ponto sobre a face (para plaquinhas, luminarias)
function facePoint(P, a, y, out) { return P.axis === 'z' ? new THREE.Vector3(a, y, P.F + P.n * out) : new THREE.Vector3(P.F + P.n * out, y, a); }
function faceYaw(P) { return P.axis === 'z' ? (P.n > 0 ? 0 : Math.PI) : (P.n > 0 ? Math.PI / 2 : -Math.PI / 2); }
// plano virado para fora da face
function facePlane(P, a, y, w, h, out) {
  const p = facePoint(P, a, y, out);
  return prim(new THREE.PlaneGeometry(w, h), { p: [p.x, p.y, p.z], r: [0, faceYaw(P), 0] });
}
// as 12 arestas de uma caixa como vigas (moldura); t = espessura, o = saliencia para fora
function edgeBeams(min, max, t, o, opts) {
  const out = [], [x0, y0, z0] = min, [x1, y1, z1] = max;
  for (const y of [[y0, y0 + t], [y1 - t, y1]]) {
    for (const z of [[z0 - o, z0 - o + t], [z1 + o - t, z1 + o]]) out.push(bx(x0 - o, y[0], z[0], x1 + o, y[1], z[1], opts));
    for (const x of [[x0 - o, x0 - o + t], [x1 + o - t, x1 + o]]) out.push(bx(x[0], y[0], z0 - o + t, x[1], y[1], z1 + o - t, opts));
  }
  for (const x of [[x0 - o, x0 - o + t], [x1 + o - t, x1 + o]]) for (const z of [[z0 - o, z0 - o + t], [z1 + o - t, z1 + o]]) out.push(bx(x[0], y0 + t, z[0], x[1], y1 - t, z[1], opts));
  return out;
}
// viga entre dois pontos (secao quadrada t)
function beam(a, b, t) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.BoxGeometry(t, t, L);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  if (Math.abs(d.y) > 0.99 * L) m.lookAt(a, b, new THREE.Vector3(1, 0, 0));
  m.setPosition(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  return prim(g, m);
}
function aabbOf(b) { return { minx: b.x - b.w / 2, maxx: b.x + b.w / 2, miny: b.y, maxy: b.y + b.h, minz: b.z - b.d / 2, maxz: b.z + b.d / 2 }; }

// materiais animados (tempo no shader)
function waveMaterial(base, kind) {
  base.userData.time = { value: 0 };
  base.onBeforeCompile = (s) => {
    s.uniforms.uTime = base.userData.time;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', kind === 'banner'
      ? `#include <begin_vertex>
      float hang = 1.0 - uv.y; float ph = position.x * 0.9 + position.z * 0.7;
      transformed += normal * (sin(uTime * 2.1 + ph + uv.y * 4.0) * 0.07 + sin(uTime * 3.7 + ph * 1.7) * 0.025) * hang;`
      : `#include <begin_vertex>
      float hh = max(position.y - 3.0, 0.0);
      transformed.x += sin(uTime * 1.3 + position.x * 0.21 + position.z * 0.13) * 0.012 * hh * hh * 0.08;
      transformed.z += cos(uTime * 1.1 + position.z * 0.19) * 0.010 * hh * hh * 0.08;`);
  };
  base.customProgramCacheKey = () => 'wave_' + kind;
  return base;
}

export { rng, shade, innerFace, longFaces, faceBox, facePoint, facePlane, faceYaw, edgeBeams, beam, aabbOf, makeSky, frondTex, leafTex, bannerTex, artTex, waveMaterial, TAU };
