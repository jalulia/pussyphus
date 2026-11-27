// post.js — the atmosphere pass for the Pussyphus stage (round 3).
// One cause, the air in the atrium, drives four consequences: haze that swallows depth, light shafts where the sun
// comes through the vault, the spread of glow around lamps and neon, and the grade. The depth buffer drives haze,
// the shaft march and the lens. Order: scene → air (in the world) → lens (depth of field) → glare (bloom) →
// grade → ordered dither (last, so the output keeps its pixel grain and the haze never bands).
// WebGL2 at stage resolution; the canvas is upscaled with image-rendering: pixelated. No WebGL2: POST.ok stays false
// and the stage draws as before.
var POST = window.POST || (window.POST = {});
(function () {
  const { W, H, CAM, G } = PS;
  let gl = null, progs = {}, tex = {}, fbo = {}, vao = null;
  POST.ok = false;

  const VS = `#version 300 es
  void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const HEAD = `#version 300 es
  precision highp float; precision highp int;
  out vec4 o;
  uniform vec2 uRes;
  ivec2 stagePx() { ivec2 q = ivec2(gl_FragCoord.xy); return ivec2(q.x, int(uRes.y) - 1 - q.y); }   // CPU buffers: row 0 = top
  float bayer(ivec2 p) { int i = (p.y & 3) * 4 + (p.x & 3);
    int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  `;

  // 1 · AIR: extinction toward the air color with depth, plus in-scatter where the sun's columns cross the ray
  const FS_AIR = HEAD + `
  uniform sampler2D uCol; uniform sampler2D uDep;
  uniform vec4 uCam;          // cx, cy, f, pitch
  uniform float uYaw;
  uniform vec3 uCamPos, uLight, uAir, uSunCol;
  uniform vec4 uSunWin;       // x0, x1, z0, z1
  uniform vec4 uVault;        // VAULT_Y, RIB, sunDX, vaultR
  uniform vec4 uAirK;         // density, height gain, shaft amount, shaft reach (m)
  uniform float uTime; uniform int uDebug;
  bool sunlit(vec3 p) {
    if (p.y > uVault.x + 1.0) return false;
    float s = (uVault.x + 1.6 - p.y) / uLight.y; float qx = p.x + uLight.x * s + uVault.z, qz = p.z + uLight.z * s;
    if (qx < uSunWin.x || qx > uSunWin.y || qz < uSunWin.z || qz > uSunWin.w) return false;
    float b3 = fract(qz / (3.0 * uVault.y)), bx = fract(qx / 2.8); if (b3 < 0.14 || b3 > 0.6 || bx < 0.18 || bx > 0.46) return false;
    if (abs(fract(qz / uVault.y) - 0.5) > 0.475 || abs(fract(qx / 1.05) - 0.5) > 0.465) return false;
    return true; }
  void main() {
    ivec2 sp = stagePx(); vec4 c = texelFetch(uCol, sp, 0); float t = texelFetch(uDep, sp, 0).r;
    float cp = cos(uCam.w), snp = sin(uCam.w);
    float dx = (float(sp.x) + 0.5 - uCam.x) / uCam.z, dy = -(float(sp.y) + 0.5 - uCam.y) / uCam.z;
    vec3 dp = vec3(dx, dy * cp + snp, -dy * snp + cp); float cyw = cos(uYaw), syw = sin(uYaw); vec3 d = vec3(dp.x * cyw + dp.z * syw, dp.y, -dp.x * syw + dp.z * cyw);
    float far = t > 55.0 ? 240.0 : t;                       // the sky and the cast's 'nothing' read as far air
    float len = far * length(d);
    // density grows a little with height: light pools in the upper atrium
    float hAvg = uCamPos.y + d.y * far * 0.5;
    float sigma = uAirK.x * (1.0 + uAirK.y * clamp(hAvg / 14.0, 0.0, 1.0));
    float T = exp(-sigma * len);
    float sunOut = clamp(uAirK.z, 0.0, 1.0);
    vec3 col = c.rgb * T + uAir * (1.0 - T) * (1.0 - 0.32 * sunOut);   // with the sun out, the air between the beams is the dimmer sky-lit air
    // sun shafts: 14 samples along the ray, jittered by the Bayer cell so the steps never band
    float reach = min(far, uAirK.w); float acc = 0.0; float j = bayer(sp);
    for (int i = 0; i < 14; i++) { float tt = reach * (float(i) + j) / 14.0; vec3 p = uCamPos + d * tt;
      if (abs(p.x) < uVault.w && sunlit(p)) acc += exp(-sigma * tt * length(d)); }
    float mu = dot(normalize(d), uLight); float phase = 0.55 + 1.6 * pow(max(0.0, mu), 3.0);   // forward scattering: beams brighten looking toward the sun
    float shaft = acc / 14.0 * uAirK.z * phase * min(1.0, reach / 12.0);
    col += uSunCol * shaft * (1.0 + 0.6 * (1.0 - T));   // lit air glows more where there is more of it
    if (uDebug == 1) col = vec3(shaft * 3.0); if (uDebug == 2) col = vec3(T);
    o = vec4(col, c.a);
  }`;

  // 2 · LENS: depth of field focused on Bo; circle of confusion from depth, gathered over a 24-tap disc
  const FS_DOF = HEAD + `
  uniform sampler2D uSrc; uniform sampler2D uDep; uniform vec3 uLens;   // focus depth, far max px, near max px
  float coc(float z) { z = z > 55.0 ? 240.0 : z; float f = uLens.x; if (abs(z - f) < 0.45) return 0.0;   // her band stays sharp
    return z > f ? uLens.y * smoothstep(0.15, 0.85, 1.0 - (f + 0.45) / z) : uLens.z * clamp((f - 0.45) / z - 1.0, 0.0, 1.0); }
  const vec2 D[24] = vec2[24](vec2(0.0,0.35),vec2(0.33,0.1),vec2(0.2,-0.28),vec2(-0.2,-0.28),vec2(-0.33,0.1),
    vec2(0.0,0.7),vec2(0.5,0.5),vec2(0.7,0.0),vec2(0.5,-0.5),vec2(0.0,-0.7),vec2(-0.5,-0.5),vec2(-0.7,0.0),vec2(-0.5,0.5),
    vec2(0.27,0.96),vec2(0.77,0.64),vec2(1.0,0.0),vec2(0.77,-0.64),vec2(0.27,-0.96),vec2(-0.27,-0.96),vec2(-0.77,-0.64),vec2(-1.0,0.0),vec2(-0.77,0.64),vec2(-0.27,0.96),vec2(0.0,0.0));
  void main() {
    ivec2 g = ivec2(gl_FragCoord.xy); ivec2 sp = ivec2(g.x, int(uRes.y) - 1 - g.y);
    float z0 = texelFetch(uDep, sp, 0).r; float c0 = coc(z0);
    vec4 base = texelFetch(uSrc, g, 0);
    if (c0 < 0.35) { o = base; return; }
    vec3 sum = base.rgb; float wsum = 1.0; float amax = base.a;
    for (int i = 0; i < 24; i++) { vec2 off = D[i] * c0; ivec2 q = g + ivec2(round(off)); q = clamp(q, ivec2(0), ivec2(uRes) - 1);
      ivec2 qs = ivec2(q.x, int(uRes.y) - 1 - q.y); float zq = texelFetch(uDep, qs, 0).r; float cq = coc(zq);
      float w = zq < z0 - 0.05 ? step(length(off) - 0.5, cq) : 1.0;     // a sharper nearer pixel doesn't smear backwards
      vec4 s = texelFetch(uSrc, q, 0); sum += s.rgb * w; wsum += w; amax = max(amax, s.a * w); }
    o = vec4(sum / wsum, mix(base.a, amax, 0.5));
  }`;

  // 3 · GLARE: bright pass at half resolution from the emissive channel, then a separable blur whose reach follows the air
  const FS_BRIGHT = HEAD + `
  uniform sampler2D uSrc; uniform float uThresh;
  void main() { ivec2 g = ivec2(gl_FragCoord.xy) * 2; vec3 s = vec3(0.0);
    for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) { vec4 c = texelFetch(uSrc, g + ivec2(x, y), 0); float e = c.a; s += c.rgb * smoothstep(uThresh, 1.0, e * (0.35 + 0.65 * lum(c.rgb))); }
    o = vec4(s * 0.25, 1.0); }`;
  const FS_BLUR = HEAD + `
  uniform sampler2D uSrc; uniform vec2 uDir; uniform float uRad;
  void main() { vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSrc, 0)); vec2 px = uDir / vec2(textureSize(uSrc, 0));
    vec3 s = texture(uSrc, uv).rgb * 0.2270270270;
    s += texture(uSrc, uv + px * 1.3846153846 * uRad).rgb * 0.3162162162; s += texture(uSrc, uv - px * 1.3846153846 * uRad).rgb * 0.3162162162;
    s += texture(uSrc, uv + px * 3.2307692308 * uRad).rgb * 0.0702702703; s += texture(uSrc, uv - px * 3.2307692308 * uRad).rgb * 0.0702702703;
    o = vec4(s, 1.0); }`;

  // 4 · GRADE + DITHER: bloom added, a time-of-day split tone (shadows toward the air, highlights toward the light),
  // then quantized to 6 bits a channel with the Bayer 4×4, so the image keeps the pixel grain of the ramps
  const FS_FINAL = HEAD + `
  uniform sampler2D uSrc; uniform sampler2D uBloom; uniform float uBloomK; uniform vec3 uShadow, uHigh; uniform float uLevels, uGrade, uExpo;
  // standing ban: no oxblood at any hour (OKLCH L .18-.46, C >= .07, hue 8-34). Caught with margins and pulled to chroma 0.03 at the same L and hue
  vec3 noOxblood(vec3 c) {
    vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    vec3 lms = vec3(dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)), dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)), dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
    lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
    vec3 lab = vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)), dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)), dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
    float C = length(lab.yz), h = degrees(atan(lab.z, lab.y)); if (h < 0.0) h += 360.0;
    if (!(lab.x > 0.15 && lab.x < 0.49 && C > 0.05 && h > 4.0 && h < 38.0)) return c;
    lab.yz *= 0.03 / C;
    vec3 l2 = vec3(lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z, lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z, lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z); l2 = l2 * l2 * l2;
    vec3 rgb = clamp(vec3(4.0767416621 * l2.x - 3.3077115913 * l2.y + 0.2309699292 * l2.z, -1.2684380046 * l2.x + 2.6097574011 * l2.y - 0.3413193965 * l2.z, -0.0041960863 * l2.x - 0.7034186147 * l2.y + 1.7076147010 * l2.z), 0.0, 1.0);
    return mix(12.92 * rgb, 1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, rgb)); }
  void main() { ivec2 g = ivec2(gl_FragCoord.xy); vec3 c = texelFetch(uSrc, g, 0).rgb;
    vec3 b = texture(uBloom, gl_FragCoord.xy / uRes).rgb; c += b * uBloomK;
    c *= uExpo; float l = lum(c); vec3 tone = mix(uShadow, uHigh, smoothstep(0.15, 0.85, l)); c = mix(c, c * tone * 2.0, uGrade);
    c = clamp(c, 0.0, 1.0);
    c = noOxblood(c);
    float d = bayer(ivec2(g.x, int(uRes.y) - 1 - g.y)) - 0.5;
    c = floor(c * uLevels + 0.5 + d) / uLevels;
    { vec3 q = noOxblood(c); if (q != c) c = floor(q * uLevels + 0.5) / uLevels; }   // and once more after the dither, snapped with no dither, so no pixel lands in the band
    o = vec4(clamp(c, 0.0, 1.0), 1.0); }`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); } return { p, u }; }
  function mkTex(w, h, ifmt, fmt, type, filter) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function mkFbo(t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }

  POST.init = function (canvas) {
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, depth: false, stencil: false });
      if (!gl) return false;
      progs.air = prog(FS_AIR); progs.dof = prog(FS_DOF); progs.bright = prog(FS_BRIGHT); progs.blur = prog(FS_BLUR); progs.final = prog(FS_FINAL);
      tex.col = mkTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      tex.dep = mkTex(W, H, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
      tex.air = mkTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST); fbo.air = mkFbo(tex.air);
      tex.dof = mkTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST); fbo.dof = mkFbo(tex.dof);
      const hw = W >> 1, hh = H >> 1;
      tex.b0 = mkTex(hw, hh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); fbo.b0 = mkFbo(tex.b0);
      tex.b1 = mkTex(hw, hh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); fbo.b1 = mkFbo(tex.b1);
      vao = gl.createVertexArray();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      POST.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      return POST.ok;
    } catch (e) { console.warn('POST off:', e.message); POST.ok = false; return false; }
  };

  // the air, by weather and hour: density per meter, the color it scatters, the color of the sun in it
  const AIR = { clear: 0.0095, fair: 0.0125, overcast: 0.015, rain: 0.02, snow: 0.017, mist: 0.034 };
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const ease = (h, a, b) => Math.max(0, Math.min(1, (h - a) / (b - a)));
  POST.airFor = function (hour, weather, shaft, airK = 1) {
    const night = Math.max(1 - ease(hour, 5.0, 6.8), ease(hour, 19.8, 21.4)), dusk = ease(hour, 16.6, 18.2) * (1 - ease(hour, 19.6, 20.8)), dawn = ease(hour, 5.2, 6.4) * (1 - ease(hour, 7.6, 8.8));
    let air = [0.86, 0.86, 0.82], sun = [1.0, 0.9, 0.72], sh = [0.47, 0.5, 0.53], hi = [0.53, 0.51, 0.48];
    if (weather === 'rain' || weather === 'overcast') { air = [0.74, 0.78, 0.82]; sh = [0.46, 0.5, 0.55]; hi = [0.51, 0.51, 0.5]; }
    if (weather === 'snow' || weather === 'mist') { air = [0.88, 0.9, 0.93]; sh = [0.47, 0.5, 0.54]; }
    air = mix3(air, [0.95, 0.74, 0.6], dusk * 0.8); sun = mix3(sun, [1.0, 0.7, 0.45], dusk); hi = mix3(hi, [0.58, 0.5, 0.44], dusk); sh = mix3(sh, [0.48, 0.47, 0.56], dusk);
    air = mix3(air, [0.94, 0.8, 0.82], dawn * 0.7); sun = mix3(sun, [1.0, 0.82, 0.75], dawn);
    air = mix3(air, [0.2, 0.24, 0.38], night); sh = mix3(sh, [0.44, 0.48, 0.6], night); hi = mix3(hi, [0.58, 0.51, 0.42], night); // night: blue air, the lamps stay warm
    const k = AIR[weather] ?? AIR.fair;
    return { density: k * (1 - 0.3 * night) * airK, air, sun, shadow: sh, high: hi, shaft: (shaft ?? 0.7) * (1 - night) * (weather === 'rain' || weather === 'mist' || weather === 'snow' ? 0.35 : 1) };
  };

  let focusZ = 1.4;
  POST.render = function (out, depth, p) {
    if (!POST.ok) return;
    gl.disable(gl.BLEND); gl.bindVertexArray(vao); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, tex.col); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer, out.byteOffset, out.length));
    gl.bindTexture(gl.TEXTURE_2D, tex.dep); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.FLOAT, depth);
    const A = p.air, sun = STAGE.sun ? STAGE.sun() : { dx: 0, win: { x0: -8, x1: 8, z0: 3, z1: 60 } }, lens = p.lens ?? 1;
    focusZ += ((p.focus || focusZ) - focusZ) * Math.min(1, (p.dt || 0.033) * 2.5);           // the lens racks after her, a little behind
    const bind = (u, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u, unit); };
    // 1 air
    let P = progs.air; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.air); gl.viewport(0, 0, W, H);
    bind(P.u.uCol, 0, tex.col); bind(P.u.uDep, 1, tex.dep);
    gl.uniform2f(P.u.uRes, W, H); gl.uniform4f(P.u.uCam, CAM.cx, CAM.cy, CAM.f, CAM.pitch); gl.uniform1f(P.u.uYaw, CAM.yaw || 0); gl.uniform3f(P.u.uCamPos, CAM.x, CAM.y, CAM.z);
    gl.uniform3f(P.u.uLight, PS.LIGHT[0], PS.LIGHT[1], PS.LIGHT[2]); gl.uniform3fv(P.u.uAir, A.air); gl.uniform3fv(P.u.uSunCol, A.sun);
    gl.uniform4f(P.u.uSunWin, sun.win.x0, sun.win.x1, sun.win.z0, sun.win.z1); gl.uniform4f(P.u.uVault, G.VAULT_Y, G.RIB, sun.dx, G.VAULT_R);
    gl.uniform4f(P.u.uAirK, A.density, 0.6, 2.2 * A.shaft, 46); gl.uniform1f(P.u.uTime, p.time || 0); gl.uniform1i(P.u.uDebug, POST.debug | 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2 lens
    P = progs.dof; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.dof);
    bind(P.u.uSrc, 0, tex.air); bind(P.u.uDep, 1, tex.dep); gl.uniform2f(P.u.uRes, W, H); gl.uniform3f(P.u.uLens, focusZ, 1.05 * lens, 3.0 * lens);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 3 glare
    const hw = W >> 1, hh = H >> 1, rad = 1.0 + 9 * Math.min(0.05, A.density);
    P = progs.bright; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.b0); gl.viewport(0, 0, hw, hh); bind(P.u.uSrc, 0, tex.dof); gl.uniform2f(P.u.uRes, hw, hh); gl.uniform1f(P.u.uThresh, 0.22); gl.drawArrays(gl.TRIANGLES, 0, 3);
    P = progs.blur; gl.useProgram(P.p); gl.uniform2f(P.u.uRes, hw, hh);
    for (let i = 0; i < 2; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.b1); bind(P.u.uSrc, 0, tex.b0); gl.uniform2f(P.u.uDir, 1, 0); gl.uniform1f(P.u.uRad, rad * (1 + i)); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.b0); bind(P.u.uSrc, 0, tex.b1); gl.uniform2f(P.u.uDir, 0, 1); gl.uniform1f(P.u.uRad, rad * (1 + i)); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    // 4 grade + dither, to the canvas
    P = progs.final; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    bind(P.u.uSrc, 0, tex.dof); bind(P.u.uBloom, 1, tex.b0); gl.uniform2f(P.u.uRes, W, H);
    gl.uniform1f(P.u.uBloomK, 0.55 + 1.3 * (A.night || 0)); gl.uniform3fv(P.u.uShadow, A.shadow); gl.uniform3fv(P.u.uHigh, A.high); gl.uniform1f(P.u.uLevels, 63); gl.uniform1f(P.u.uExpo, 0.94 - 0.1 * (A.night || 0)); gl.uniform1f(P.u.uGrade, p.grade ?? 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
})();
