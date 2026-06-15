// Catálogo de corpos GLSL para transições (compatíveis com GL-Transitions).
// Cada string representa o conteúdo de `vec4 transition(vec2 uv){ ... }`.
// Uniforms padrão sempre disponíveis: `progress`, `ratio`,
// helpers: `getFromColor(uv)`, `getToColor(uv)`.

export const SHADERS = {
  // ===== Básicas =====
  fade: `
    return mix(getFromColor(uv), getToColor(uv), progress);
  `,
  dissolve: `
    float n = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    return mix(getFromColor(uv), getToColor(uv), step(n, progress));
  `,
  flashWhite: `
    float p = progress;
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    float w = smoothstep(0.0, 0.5, p) * (1.0 - smoothstep(0.5, 1.0, p));
    vec4 base = mix(a, b, smoothstep(0.4, 0.6, p));
    return mix(base, vec4(1.0), w * 0.95);
  `,
  flashBlack: `
    float p = progress;
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    float w = smoothstep(0.0, 0.5, p) * (1.0 - smoothstep(0.5, 1.0, p));
    vec4 base = mix(a, b, smoothstep(0.4, 0.6, p));
    return mix(base, vec4(0.0, 0.0, 0.0, 1.0), w * 0.95);
  `,
  crossFade: `
    float p = smoothstep(0.0, 1.0, progress);
    return mix(getFromColor(uv), getToColor(uv), p);
  `,

  // ===== Slides (deslocamento real) =====
  slideLeft: `
    vec2 a = uv + vec2(progress, 0.0);
    vec2 b = uv - vec2(1.0 - progress, 0.0);
    if (a.x <= 1.0) return getFromColor(a);
    return getToColor(b);
  `,
  slideRight: `
    vec2 a = uv - vec2(progress, 0.0);
    vec2 b = uv + vec2(1.0 - progress, 0.0);
    if (a.x >= 0.0) return getFromColor(a);
    return getToColor(b);
  `,
  slideUp: `
    vec2 a = uv + vec2(0.0, progress);
    vec2 b = uv - vec2(0.0, 1.0 - progress);
    if (a.y <= 1.0) return getFromColor(a);
    return getToColor(b);
  `,
  slideDown: `
    vec2 a = uv - vec2(0.0, progress);
    vec2 b = uv + vec2(0.0, 1.0 - progress);
    if (a.y >= 0.0) return getFromColor(a);
    return getToColor(b);
  `,
  // Push: o quadro novo empurra o antigo. (Mesmo efeito visual, ambas imagens deslocam juntas)
  pushLeft: `
    if (uv.x > 1.0 - progress) return getToColor(uv - vec2(1.0 - progress, 0.0));
    return getFromColor(uv + vec2(progress, 0.0));
  `,
  pushRight: `
    if (uv.x < progress) return getToColor(uv + vec2(1.0 - progress, 0.0));
    return getFromColor(uv - vec2(progress, 0.0));
  `,

  // ===== Zoom =====
  zoomIn: `
    float s = mix(1.0, 2.0, progress);
    vec2 a = (uv - 0.5) / s + 0.5;
    vec4 ca = getFromColor(clamp(a, 0.0, 1.0));
    vec4 cb = getToColor(uv);
    return mix(ca, cb, progress);
  `,
  zoomOut: `
    float s = mix(2.0, 1.0, progress);
    vec2 b = (uv - 0.5) / s + 0.5;
    vec4 cb = getToColor(clamp(b, 0.0, 1.0));
    vec4 ca = getFromColor(uv);
    return mix(ca, cb, progress);
  `,
  dreamyZoom: `
    float p = progress;
    float s1 = 1.0 + p * 0.7;
    float s2 = 1.7 - p * 0.7;
    vec2 a = (uv - 0.5) / s1 + 0.5;
    vec2 b = (uv - 0.5) / s2 + 0.5;
    vec4 ca = getFromColor(clamp(a, 0.0, 1.0));
    vec4 cb = getToColor(clamp(b, 0.0, 1.0));
    return mix(ca, cb, smoothstep(0.2, 0.8, p));
  `,
  zoomBlur: `
    const int N = 12;
    vec2 dir = uv - 0.5;
    vec4 sum = vec4(0.0);
    float amt = progress * 0.25;
    for (int i = 0; i < 12; i++) {
      float k = float(i) / float(11);
      vec2 a = uv - dir * amt * k;
      vec2 b = uv + dir * amt * (1.0 - k);
      sum += mix(getFromColor(clamp(a, 0.0, 1.0)), getToColor(clamp(b, 0.0, 1.0)), progress);
    }
    return sum / float(N);
  `,
  smoothZoom: `
    float p = smoothstep(0.0, 1.0, progress);
    float s = mix(1.0, 1.3, p);
    vec2 a = (uv - 0.5) / s + 0.5;
    return mix(getFromColor(clamp(a, 0.0, 1.0)), getToColor(uv), p);
  `,

  // ===== Glitch =====
  rgbSplit: `
    float p = progress;
    float k = sin(p * 3.14159) * 0.05;
    vec4 a = getFromColor(uv);
    vec4 b;
    b.r = getToColor(uv + vec2(k, 0.0)).r;
    b.g = getToColor(uv).g;
    b.b = getToColor(uv - vec2(k, 0.0)).b;
    b.a = 1.0;
    return mix(a, b, p);
  `,
  digitalGlitch: `
    float p = progress;
    float band = step(0.5, fract(uv.y * 18.0 + p * 5.0));
    float jx = (fract(sin(floor(uv.y * 36.0) * 91.1 + p * 13.0) * 4373.0) - 0.5) * 0.15 * sin(p * 3.14159);
    vec2 off = vec2(jx * band, 0.0);
    vec4 a = getFromColor(clamp(uv + off, 0.0, 1.0));
    vec4 b = getToColor(clamp(uv - off, 0.0, 1.0));
    return mix(a, b, smoothstep(0.3, 0.7, p));
  `,
  vhs: `
    float p = progress;
    float lines = sin(uv.y * 600.0) * 0.04;
    float jx = (fract(sin(floor(uv.y * 48.0) * 91.1) * 4373.0) - 0.5) * 0.04 * sin(p * 3.14159);
    vec4 a = getFromColor(clamp(uv + vec2(jx, 0.0), 0.0, 1.0));
    vec4 b = getToColor(clamp(uv - vec2(jx, 0.0), 0.0, 1.0));
    vec4 c = mix(a, b, smoothstep(0.2, 0.8, p));
    c.rgb += lines * sin(p * 3.14159);
    return c;
  `,
  signalError: `
    float p = progress;
    float n = fract(sin(dot(floor(uv * 80.0), vec2(12.9, 78.2))) * 43758.5);
    float mask = step(0.85 - p * 0.4, n);
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    vec4 base = mix(a, b, smoothstep(0.3, 0.7, p));
    return mix(base, vec4(n, n, n, 1.0), mask * (1.0 - abs(p - 0.5) * 2.0));
  `,
  tvNoise: `
    float p = progress;
    float n = fract(sin(dot(uv * vec2(1234.0, 5678.0), vec2(12.9, 78.2)) + p * 100.0) * 43758.5);
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    vec4 noise = vec4(vec3(n), 1.0);
    float w = sin(p * 3.14159);
    return mix(mix(a, b, smoothstep(0.3, 0.7, p)), noise, w * 0.7);
  `,

  // ===== Cinema =====
  crossWarp: `
    float p = progress;
    vec2 c = uv - 0.5;
    float r = length(c);
    float t = atan(c.y, c.x);
    vec2 a = uv + c * sin(p * 3.14159) * 0.1;
    vec2 b = uv - c * sin(p * 3.14159) * 0.1;
    return mix(getFromColor(clamp(a, 0.0, 1.0)), getToColor(clamp(b, 0.0, 1.0)), smoothstep(0.0, 1.0, p));
  `,
  motionBlur: `
    const int N = 10;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 10; i++) {
      float k = float(i) / float(9);
      vec2 off = vec2(0.08 * sin(progress * 3.14159) * (k - 0.5), 0.0);
      sum += mix(getFromColor(clamp(uv + off, 0.0, 1.0)), getToColor(clamp(uv + off, 0.0, 1.0)), progress);
    }
    return sum / float(N);
  `,
  directionalBlur: `
    const int N = 12;
    vec4 sum = vec4(0.0);
    vec2 dir = vec2(1.0, 0.0);
    float amt = sin(progress * 3.14159) * 0.12;
    for (int i = 0; i < 12; i++) {
      float k = (float(i) / float(11) - 0.5);
      vec2 off = dir * amt * k;
      sum += mix(getFromColor(clamp(uv + off, 0.0, 1.0)), getToColor(clamp(uv + off, 0.0, 1.0)), progress);
    }
    return sum / float(N);
  `,
  lightLeak: `
    float p = progress;
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    vec4 base = mix(a, b, smoothstep(0.2, 0.8, p));
    float leak = exp(-pow((uv.x - p) * 3.0, 2.0)) * sin(p * 3.14159);
    vec3 warm = vec3(1.0, 0.7, 0.35) * leak;
    return vec4(base.rgb + warm, 1.0);
  `,
  filmBurn: `
    float p = progress;
    vec4 a = getFromColor(uv);
    vec4 b = getToColor(uv);
    float n = fract(sin(dot(uv * 50.0, vec2(12.9, 78.2))) * 43758.5);
    float burn = smoothstep(p - 0.1, p + 0.05, uv.x + n * 0.1);
    vec3 fire = mix(vec3(1.0, 0.55, 0.1), vec3(1.0, 0.95, 0.6), n);
    vec4 base = mix(a, b, burn);
    float edge = smoothstep(0.02, 0.0, abs((uv.x + n * 0.1) - p));
    return vec4(base.rgb + fire * edge, 1.0);
  `,

  // ===== 3D =====
  cube: `
    float p = progress;
    float persp = 0.0;
    if (uv.x < 1.0 - p) {
      float lu = uv.x / (1.0 - p);
      return getFromColor(vec2(lu, uv.y));
    } else {
      float ru = (uv.x - (1.0 - p)) / p;
      return getToColor(vec2(ru, uv.y));
    }
  `,
  cubePerspective: `
    float p = progress;
    if (uv.x < 1.0 - p) {
      float lu = uv.x / (1.0 - p);
      float bend = (lu - 1.0) * p * 0.4;
      vec2 a = vec2(lu, (uv.y - 0.5) * (1.0 + bend) + 0.5);
      return getFromColor(clamp(a, 0.0, 1.0));
    } else {
      float ru = (uv.x - (1.0 - p)) / p;
      float bend = ru * (1.0 - p) * 0.4;
      vec2 b = vec2(ru, (uv.y - 0.5) * (1.0 + bend) + 0.5);
      return getToColor(clamp(b, 0.0, 1.0));
    }
  `,
  flip: `
    float p = progress;
    float ang = p * 3.14159;
    float sx = cos(ang);
    if (sx >= 0.0) {
      vec2 a = vec2((uv.x - 0.5) / max(sx, 0.001) + 0.5, uv.y);
      if (a.x < 0.0 || a.x > 1.0) return vec4(0.0);
      return getFromColor(a);
    } else {
      vec2 b = vec2((uv.x - 0.5) / -sx + 0.5, uv.y);
      if (b.x < 0.0 || b.x > 1.0) return vec4(0.0);
      return getToColor(vec2(1.0 - b.x, b.y));
    }
  `,
  fold: `
    float p = progress;
    if (uv.x < 1.0 - p) {
      float lu = uv.x / (1.0 - p);
      return getFromColor(vec2(lu, uv.y));
    }
    float ru = (uv.x - (1.0 - p)) / p;
    return getToColor(vec2(1.0 - ru, uv.y));
  `,
  doorOpen: `
    float p = progress;
    if (uv.x < 0.5) {
      float lu = uv.x / max(0.5 - p * 0.5, 0.001);
      if (lu > 1.0) return getToColor(uv);
      return getFromColor(vec2(lu, uv.y));
    }
    float ru = (uv.x - 0.5) / max(0.5 - p * 0.5, 0.001);
    if (ru > 1.0) return getToColor(uv);
    return getFromColor(vec2(1.0 - ru, uv.y));
  `,
  doorClose: `
    float p = 1.0 - progress;
    if (uv.x < 0.5) {
      float lu = uv.x / max(0.5 - p * 0.5, 0.001);
      if (lu > 1.0) return getFromColor(uv);
      return getToColor(vec2(lu, uv.y));
    }
    float ru = (uv.x - 0.5) / max(0.5 - p * 0.5, 0.001);
    if (ru > 1.0) return getFromColor(uv);
    return getToColor(vec2(1.0 - ru, uv.y));
  `,

  // ===== Máscaras =====
  circleOpen: `
    float p = progress;
    float d = distance(uv, vec2(0.5));
    float r = p * 0.72;
    float m = smoothstep(r + 0.02, r - 0.02, d);
    return mix(getFromColor(uv), getToColor(uv), m);
  `,
  circleClose: `
    float p = 1.0 - progress;
    float d = distance(uv, vec2(0.5));
    float r = p * 0.72;
    float m = smoothstep(r + 0.02, r - 0.02, d);
    return mix(getToColor(uv), getFromColor(uv), m);
  `,
  diamond: `
    float p = progress;
    vec2 d = abs(uv - 0.5);
    float md = d.x + d.y;
    float r = p * 0.8;
    float m = smoothstep(r + 0.02, r - 0.02, md);
    return mix(getFromColor(uv), getToColor(uv), m);
  `,
  star: `
    float p = progress;
    vec2 d = uv - 0.5;
    float ang = atan(d.y, d.x);
    float r = length(d);
    float star = 0.36 + 0.1 * cos(ang * 5.0);
    float m = smoothstep(star * (1.0 - p) + 0.01, star * (1.0 - p) - 0.01, r * (1.0 - p));
    m = smoothstep(0.0, 1.0, p) > 0.99 ? 1.0 : smoothstep(r * (1.0 - p) + 0.02, r * (1.0 - p) - 0.02, star * p);
    return mix(getFromColor(uv), getToColor(uv), clamp(p > 0.99 ? 1.0 : step(r, star * p * 1.3), 0.0, 1.0));
  `,
  heart: `
    float p = progress;
    vec2 d = (uv - vec2(0.5, 0.55)) * vec2(1.0, -1.0) / (p * 0.8 + 0.001);
    float h = pow(d.x*d.x + d.y*d.y - 0.05, 3.0) - d.x*d.x * d.y*d.y*d.y;
    float m = step(h, 0.0);
    return mix(getFromColor(uv), getToColor(uv), m);
  `,
} as const;

export type ShaderKey = keyof typeof SHADERS;
