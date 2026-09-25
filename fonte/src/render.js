// FRAG - pipeline de render: 6 presets, deteccao de GPU, pos-processamento, reflexo planar e sonda de ambiente.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// ------------------------------------------------------------------ presets
// scale: fracao da resolucao; dpr: teto do devicePixelRatio; shadows: tamanho do mapa (0 = sem);
// post: pos-processamento; msaa: amostras no alvo HDR; ao: fracao da resolucao do GTAO (0 = sem);
// refl: fracao da resolucao do reflexo planar (0 = so ambiente); tex: textura procedural; seg: malha para AO assada;
// decor: nivel de cenario; lights: luzes pontuais; fx: multiplicador de particulas
export const PRESETS = {
  pp: { name: 'Performance +', desc: 'O mais leve possível: sem sombras nem pós, resolução reduzida. Para notebook fraco.', scale: 0.7, dpr: 1, shadows: 0, canvasAA: false, post: false, msaa: 0, smaa: false, ao: 0, refl: 0, env: 64, tex: 256, aniso: 1, seg: 3, decor: 0, lights: 0, fx: 0.35, bloom: 0, grain: 0, ca: 0, hrtf: false },
  p: { name: 'Performance', desc: 'Sombras simples e antialias nativo, texturas médias.', scale: 0.9, dpr: 1, shadows: 1024, canvasAA: true, post: false, msaa: 0, smaa: false, ao: 0, refl: 0, env: 128, tex: 512, aniso: 2, seg: 1.6, decor: 1, lights: 2, fx: 0.6, bloom: 0, grain: 0, ca: 0, hrtf: false },
  bal: { name: 'Balanceado', desc: 'Pós-processamento (bloom, cor, SMAA), sombras 2048 e reflexos do ambiente.', scale: 1, dpr: 1.25, shadows: 2048, canvasAA: false, post: true, msaa: 0, smaa: true, ao: 0, refl: 0, env: 256, tex: 512, aniso: 4, seg: 1.1, decor: 2, lights: 4, fx: 0.85, bloom: 1, grain: 0, ca: 0, hrtf: false },
  alto: { name: 'Alto', desc: 'Oclusão de ambiente (GTAO), reflexos planares em tempo real na água e no chão, sombras suaves.', scale: 1, dpr: 1.5, shadows: 2048, soft: true, canvasAA: false, post: true, msaa: 0, smaa: true, ao: 0.5, refl: 0.4, env: 256, tex: 512, aniso: 8, seg: 0.8, decor: 2, lights: 6, fx: 1, bloom: 1, grain: 0, ca: 0, hrtf: false },
  malto: { name: 'Muito alto', desc: 'MSAA 4x + SMAA, sombras 4096, oclusão e reflexos em resolução maior, áudio 3D HRTF.', scale: 1, dpr: 2, shadows: 4096, soft: true, canvasAA: false, post: true, msaa: 4, smaa: true, ao: 0.75, refl: 0.6, env: 512, tex: 1024, aniso: 16, seg: 0.6, decor: 2, lights: 8, fx: 1.3, bloom: 1, grain: 0, ca: 0, hrtf: true },
  ext: { name: 'EXTREMO', desc: 'Tudo no máximo: oclusão e reflexos em resolução cheia, grão de filme, aberração cromática, mais partículas e luzes. Placa de vídeo forte.', scale: 1, dpr: 2, shadows: 4096, soft: true, shadowRadius: 3, canvasAA: false, post: true, msaa: 4, smaa: true, ao: 1, refl: 1, env: 512, tex: 1024, aniso: 16, seg: 0.5, decor: 2, lights: 12, fx: 2, bloom: 1.15, grain: 1, ca: 1, hrtf: true },
};

// escolhe um preset pela GPU (so na primeira vez; depois vale o que o jogador escolher)
export function detectQuality() {
  let name = '';
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'pp';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  } catch { return 'bal'; }
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'pp';
  if (/rtx\s?(40|50)\d\d|rx\s?(79|78)\d\d|rx\s?90\d\d|apple m[2-9] (max|ultra)/.test(n)) return 'malto';
  if (/rtx|rx\s?(6[6-9]|7[67])\d\d|apple m[1-9]|arc a7/.test(n)) return 'alto';
  if (/gtx\s?1[0-6]|gtx\s?9|rx\s?5[5-9]\d|radeon rx|radeon pro|arc/.test(n)) return 'bal';
  if (/intel|uhd|hd graphics|iris|mali|adreno|powervr|radeon\(tm\) graphics/.test(n)) return 'p';
  return 'bal';
}

// ------------------------------------------------------------------ correcao de cor e efeitos de tela (HDR linear)
const GRADE_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const GRADE_FS = `
  uniform sampler2D tDiffuse; uniform float time, vignette, sat, contrast, dmg, death, ca, grain, scope, flash; uniform vec3 tint; uniform vec2 res;
  varying vec2 vUv;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec2 c = vUv - 0.5; float r2 = dot(c, c);
    vec3 col;
    float k = ca * 0.0022 + dmg * 0.004;
    if (k > 0.0) { vec2 o = c * k * (0.4 + r2 * 3.0); col = vec3(texture2D(tDiffuse, vUv - o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + o).b); }
    else col = texture2D(tDiffuse, vUv).rgb;
    col *= tint;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(l), col, sat * (1.0 - death * 0.85)), 0.0);
    col = exp2((log2(col + 1e-4) - log2(0.18)) * contrast + log2(0.18)) - 1e-4 * contrast;
    col = mix(col, col * vec3(1.35, 0.5, 0.45) + vec3(0.015, 0.0, 0.0), dmg * 0.55);
    col = mix(col, col * vec3(0.8, 0.82, 0.9), death * 0.5);
    float v = smoothstep(0.85, 0.15, r2 * (1.0 + scope * 2.2));
    col *= mix(1.0, v, clamp(vignette + dmg * 0.35 + death * 0.3, 0.0, 1.0));
    col += flash;
    if (grain > 0.0) { float g = h12(vUv * res + fract(time * 13.37) * 100.0) - 0.5; col += g * grain * 0.035 * (0.25 + sqrt(max(l, 0.0))); }
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }`;
class GradePass extends Pass {
  constructor() {
    super();
    this.u = {
      tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.3 }, sat: { value: 1 }, contrast: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) },
      dmg: { value: 0 }, death: { value: 0 }, ca: { value: 0 }, grain: { value: 0 }, scope: { value: 0 }, flash: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: GRADE_VS, fragmentShader: GRADE_FS }));
  }
  render(r, write, read) { this.u.tDiffuse.value = read.texture; r.setRenderTarget(this.renderToScreen ? null : write); this.quad.render(r); }
  setSize(w, h) { this.u.res.value.set(w, h); }
  dispose() { this.quad.dispose(); }
}
// arma (cena propria, camera propria) desenhada por cima com o depth limpo; nao entra no GTAO nem no reflexo
class ViewmodelPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(r, write, read) {
    const ac = r.autoClear; r.autoClear = false;
    r.setRenderTarget(read); r.clearDepth(); r.render(this.scene, this.camera);
    r.autoClear = ac;
  }
}
// GTAO em resolucao reduzida
class ScaledGTAO extends GTAOPass {
  setSize(w, h) { const k = this.aoScale || 1; super.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); }
}

// ------------------------------------------------------------------ reflexo planar horizontal (espelho em y)
const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); dummyTex.needsUpdate = true;
export const reflU = { tReflect: { value: dummyTex }, reflMatrix: { value: new THREE.Matrix4() }, reflOn: { value: 0 }, reflMaxLod: { value: 8 } };
export function patchReflective(mat, strength) {
  if (mat.userData.reflPatched) { mat.userData.reflK.value = strength; return; }
  mat.userData.reflPatched = true; mat.userData.reflK = { value: strength };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    Object.assign(s.uniforms, reflU); s.uniforms.reflK = mat.userData.reflK;
    s.vertexShader = 'uniform mat4 reflMatrix;\nvarying vec4 vReflUv;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = reflMatrix * modelMatrix * vec4(transformed, 1.0);');
    s.fragmentShader = 'uniform sampler2D tReflect;\nuniform float reflOn, reflK, reflMaxLod;\nvarying vec4 vReflUv;\n' + s.fragmentShader.replace('#include <lights_fragment_end>', `
      #if defined( RE_IndirectSpecular )
      if (reflOn > 0.5 && reflK > 0.0) {
        vec2 ruv = vReflUv.xy / vReflUv.w;
        vec3 dn = normal - nonPerturbedNormal;
        ruv += dn.xy * 0.09;
        float e = min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y));
        float w = reflK * smoothstep(0.0, 0.05, e) * (1.0 - smoothstep(0.32, 0.75, material.roughness));
        vec3 rc = textureLod(tReflect, clamp(ruv, 0.001, 0.999), clamp(material.roughness * reflMaxLod * 0.9, 0.0, reflMaxLod)).rgb;
        radiance = mix(radiance, rc, w);
      }
      #endif
      #include <lights_fragment_end>`);
  };
  mat.customProgramCacheKey = () => 'refl|' + mat.type + (prev ? '+' : '');
  mat.needsUpdate = true;
}
class PlanarReflection {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: 0 });
    this.rt.texture.generateMipmaps = true; this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.cam = new THREE.PerspectiveCamera(); this.y = 0; this.scale = 0.5;
    this._n = new THREE.Vector3(0, 1, 0); this._p = new THREE.Vector3(); this._c = new THREE.Vector3(); this._r = new THREE.Matrix4();
    this._look = new THREE.Vector3(); this._t = new THREE.Vector3(); this._v = new THREE.Vector3(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
  }
  setSize(w, h) { this.rt.setSize(Math.max(8, Math.round(w * this.scale)), Math.max(8, Math.round(h * this.scale))); reflU.reflMaxLod.value = Math.max(1, Math.log2(Math.max(8, h * this.scale)) - 1); }
  render(renderer, scene, camera) {
    const n = this._n, P = this._p.set(0, this.y, 0), C = this._c.setFromMatrixPosition(camera.matrixWorld);
    if (C.y < this.y + 0.01) { reflU.reflOn.value = 0; return; }
    const view = this._v.subVectors(P, C); view.reflect(n).negate(); view.add(P);
    view.x = C.x; view.z = C.z; view.y = 2 * this.y - C.y;
    this._r.extractRotation(camera.matrixWorld);
    const look = this._look.set(0, 0, -1).applyMatrix4(this._r).add(C);
    const target = this._t.copy(look); target.y = 2 * this.y - look.y;
    const vc = this.cam;
    vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(this._r).reflect(n); vc.lookAt(target);
    vc.far = camera.far; vc.near = camera.near; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    reflU.reflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // plano de corte obliquo (nada abaixo do espelho entra no reflexo)
    this._plane.setFromNormalAndCoplanarPoint(n, P); this._plane.applyMatrix4(vc.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant), e = vc.projectionMatrix.elements, q = this._q;
    q.x = (Math.sign(cp.x) + e[8]) / e[0]; q.y = (Math.sign(cp.y) + e[9]) / e[5]; q.z = -1; q.w = (1 + e[10]) / e[14];
    cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    reflU.reflOn.value = 0; reflU.tReflect.value = dummyTex;
    const prevT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, vc);
    renderer.setRenderTarget(prevT);
    reflU.tReflect.value = this.rt.texture; reflU.reflOn.value = 1;
  }
  dispose() { this.rt.dispose(); reflU.reflOn.value = 0; reflU.tReflect.value = dummyTex; }
}

// ------------------------------------------------------------------ o pipeline
export class Pipeline {
  constructor() { this.renderer = null; this.composer = null; this.Q = null; this.refl = null; this.env = null; this.fx = { dmg: 0, death: 0, scope: 0, flash: 0 }; this.aaKey = null; this.vmVisible = true; this.scale = 1; }
  // (re)cria o renderer quando muda o antialias nativo do canvas; devolve true se o canvas mudou
  setup(Q, scale, scene, camera, vmScene, vmCamera, lowLat) {
    const wantAA = !!Q.canvasAA;
    let changed = false;
    if (!this.renderer || this.aaKey !== wantAA || this.lowLat !== !!lowLat) {
      const old = document.getElementById('cv'), cv = document.createElement('canvas'); cv.id = 'cv';
      old.replaceWith(cv);
      if (this.renderer) { this.disposeComposer(); if (this.refl) { this.refl.dispose(); this.refl = null; } if (this.env) { this.env.dispose(); this.env = null; } this.renderer.dispose(); }
      // baixa latencia: canvas "desynchronized" (o quadro vai para a tela sem esperar o compositor da pagina)
      const attrs = { antialias: wantAA, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance', desynchronized: !!lowLat, preserveDrawingBuffer: /[?&]manual=1/.test(location.search) };
      const gl = cv.getContext('webgl2', attrs);
      const r = new THREE.WebGLRenderer(gl ? { canvas: cv, context: gl, antialias: wantAA } : { canvas: cv, antialias: wantAA, powerPreference: 'high-performance', alpha: false, stencil: false });
      r.autoClear = false; r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = r; this.aaKey = wantAA; this.lowLat = !!lowLat; changed = true;
    }
    const r = this.renderer;
    this.Q = Q; this.scale = scale; this.scene = scene; this.camera = camera; this.vmScene = vmScene; this.vmCamera = vmCamera;
    r.shadowMap.enabled = Q.shadows > 0; r.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    this.disposeComposer();
    if (Q.post) this.buildComposer();
    if (Q.refl > 0) { if (!this.refl) this.refl = new PlanarReflection(); this.refl.scale = Q.refl; }
    else if (this.refl) { this.refl.dispose(); this.refl = null; }
    this.resize();
    return changed;
  }
  pixelRatio() { const Q = this.Q; return Math.max(0.35, Math.min(window.devicePixelRatio || 1, Q.dpr) * Q.scale * this.scale); }
  buildComposer() {
    const r = this.renderer, Q = this.Q, w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.msaa || 0 });
    const c = new EffectComposer(r, rt);
    const world = new RenderPass(this.scene, this.camera); c.addPass(world);
    if (Q.ao > 0) {
      const ao = new ScaledGTAO(this.scene, this.camera, w, h);
      ao.aoScale = Q.ao; ao.blendIntensity = 0.9;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.3, thickness: 1.0, scale: 1.0, samples: Q.ao >= 1 ? 16 : 12, distanceFallOff: 1 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: Q.ao >= 1 ? 16 : 12 });
      c.addPass(ao); this.ao = ao;
    }
    c.addPass(new ViewmodelPass(this.vmScene, this.vmCamera));
    if (Q.bloom > 0) { this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.9); c.addPass(this.bloom); }
    this.grade = new GradePass(); c.addPass(this.grade);
    c.addPass(new OutputPass());
    if (Q.smaa) c.addPass(new SMAAPass(w, h));
    this.composer = c;
    if (this.atmo) this.applyAtmo();
  }
  disposeComposer() {
    if (!this.composer) return;
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.composer = null; this.ao = null; this.bloom = null; this.grade = null;
  }
  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight, pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.refl) this.refl.setSize(w * pr, h * pr);
    for (const c of [this.camera, this.vmCamera]) if (c) { c.aspect = w / h; c.updateProjectionMatrix(); }
  }
  applyAtmo() {
    const a = this.atmo;
    this.renderer.toneMappingExposure = a.exposure;
    if (this.bloom) { this.bloom.strength = a.bloom * this.Q.bloom; this.bloom.threshold = a.bloomThr; this.bloom.radius = 0.6; }
  }
  // ajustes por mapa: exposicao, bloom, cor; reflexos; sonda de ambiente (cubemap do proprio mapa -> PMREM)
  setWorld(W) {
    this.atmo = W.map.atmo; this.W = W; this.applyAtmo();
    if (W.reflect) for (const e of W.reflect.entries) patchReflective(e.mat, this.refl ? e.strength : 0);
    if (this.refl && W.reflect) this.refl.y = W.reflect.y;
    this.captureEnv(W);
  }
  captureEnv(W) {
    const r = this.renderer, Q = this.Q, scene = this.scene;
    if (this.env) { this.env.dispose(); this.env = null; }
    const crt = new THREE.WebGLCubeRenderTarget(Q.env || 128, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 360, crt);
    cc.position.copy(W.probe); scene.add(cc); cc.updateMatrixWorld(true);
    scene.environment = null;
    reflU.reflOn.value = 0; reflU.tReflect.value = dummyTex;
    r.shadowMap.needsUpdate = true;
    cc.update(r, scene);
    scene.remove(cc);
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromCubemap(crt.texture);
    pm.dispose(); crt.dispose();
    scene.environment = this.env.texture; scene.environmentIntensity = W.map.atmo.envInt;
    if (this.vmScene) { this.vmScene.environment = this.env.texture; this.vmScene.environmentIntensity = 0.85 + W.map.atmo.envInt * 0.35; }
    r.shadowMap.needsUpdate = true;
  }
  render(dt, t) {
    const r = this.renderer;
    // sombras do cenario sao estaticas: o mapa de sombra e desenhado uma vez por mapa (jogadores usam sombra de contato)
    if (this.refl && this.W && this.W.reflect) this.refl.render(r, this.scene, this.camera);
    if (this.composer) {
      const g = this.grade.u, a = this.atmo || {};
      g.time.value = t; g.sat.value = a.sat || 1; g.contrast.value = a.contrast || 1;
      if (a.grade) g.tint.value.set(a.grade[0], a.grade[1], a.grade[2]);
      g.dmg.value = this.fx.dmg; g.death.value = this.fx.death; g.scope.value = this.fx.scope; g.flash.value = this.fx.flash;
      g.grain.value = this.Q.grain; g.ca.value = this.Q.ca; g.vignette.value = 0.32 + this.fx.scope * 0.4;
      this.composer.passes[this.ao ? 2 : 1].enabled = this.vmVisible;
      this.composer.render(dt);
    } else {
      r.setRenderTarget(null); r.clear(); r.render(this.scene, this.camera);
      if (this.vmVisible) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
    }
  }
}
