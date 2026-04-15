// ════════════════════════════════════════
// DITHER — Bayer dither + flow color shift post-process
// ════════════════════════════════════════
import * as THREE from 'three';
import { RENDER_W, RENDER_H, DITHER_SCALE } from '../constants.js';

let rt, ditherScene, ditherCamera, ditherMat;

const FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 res;
  uniform float uFlow;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    vec2 px = vUv * res;

    // Flow color shift — warmer, more saturated
    c.r += uFlow * 0.02;
    c.g += uFlow * 0.006;
    c.b -= uFlow * 0.008;

    // Bloom proportional to flow
    float bloom = uFlow * 0.07;
    vec4 bl = texture2D(tDiffuse, vUv + vec2(.004, .004))
            + texture2D(tDiffuse, vUv - vec2(.004, .004))
            + texture2D(tDiffuse, vUv + vec2(.004,-.004))
            + texture2D(tDiffuse, vUv - vec2(.004,-.004));
    c.rgb = mix(c.rgb, (bl.rgb * 0.25) * 1.08, bloom);

    // Bayer 4×4 ordered dither
    int ix = int(mod(px.x, 4.0));
    int iy = int(mod(px.y, 4.0));
    float th = 0.0;
    if      (iy==0) { if(ix==0) th= 0.0; else if(ix==1) th= 8.0; else if(ix==2) th= 2.0; else th=10.0; }
    else if (iy==1) { if(ix==0) th=12.0; else if(ix==1) th= 4.0; else if(ix==2) th=14.0; else th= 6.0; }
    else if (iy==2) { if(ix==0) th= 3.0; else if(ix==1) th=11.0; else if(ix==2) th= 1.0; else th= 9.0; }
    else            { if(ix==0) th=15.0; else if(ix==1) th= 7.0; else if(ix==2) th=13.0; else th= 5.0; }
    th /= 16.0;

    // Posterize — fewer levels = crunchier. Flow increases levels (smoother at peak).
    float lv = 10.0 + uFlow * 6.0;
    c.rgb += (th - 0.5) * (1.0 / lv);
    c.rgb = floor(c.rgb * lv + 0.5) / lv;

    // Scanline
    c.rgb *= 1.0 - step(0.5, mod(px.y, 2.0)) * (0.025 * (1.0 - uFlow * 0.5));

    // Vignette — opens up with flow
    vec2 uv = vUv * 2.0 - 1.0;
    c.rgb *= 1.0 - dot(uv, uv) * (0.22 - uFlow * 0.12);

    gl_FragColor = c;
  }
`;

export function init() {
  const rtW = Math.floor(RENDER_W * DITHER_SCALE);
  const rtH = Math.floor(RENDER_H * DITHER_SCALE);

  rt = new THREE.WebGLRenderTarget(rtW, rtH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  ditherMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      res: { value: new THREE.Vector2(rtW, rtH) },
      uFlow: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }',
    fragmentShader: FRAG,
  });

  ditherScene = new THREE.Scene();
  ditherCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ditherScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMat));
}

export function render(renderer, mainScene, mainCamera, flow, time) {
  ditherMat.uniforms.uFlow.value = Math.min(flow / 15, 1);
  ditherMat.uniforms.uTime.value = time;

  renderer.setRenderTarget(rt);
  renderer.render(mainScene, mainCamera);
  renderer.setRenderTarget(null);
  renderer.render(ditherScene, ditherCamera);
}
