uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;
varying vec2 vUv;

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p = rot * p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * 0.15;
  float scrollOffset = uScroll * 0.0008;

  // Warp UVs with noise
  float n1 = fbm(uv * 3.0 + t + scrollOffset);
  float n2 = fbm(uv * 2.0 - t * 0.7 + vec2(n1) * 0.5);
  float n3 = fbm(uv * 4.0 + vec2(n2, n1) * 0.3 + t * 0.3);

  // Mouse influence — subtle warp
  float mouseD = length(uv - uMouse);
  float mouseInfluence = smoothstep(0.5, 0.0, mouseD) * 0.15;

  float final = n3 + mouseInfluence;

  // Color palette — deep cyan / midnight blue
  vec3 col1 = vec3(0.01, 0.01, 0.02);   // near black
  vec3 col2 = vec3(0.0, 0.05, 0.08);    // dark cyan
  vec3 col3 = vec3(0.04, 0.01, 0.06);   // dark purple
  vec3 col4 = vec3(0.0, 0.15, 0.18);    // cyan glow

  vec3 color = mix(col1, col2, smoothstep(-0.3, 0.3, final));
  color = mix(color, col3, smoothstep(0.0, 0.6, n1 + scrollOffset));
  color = mix(color, col4, smoothstep(0.4, 0.8, final) * 0.3);

  // Subtle vignette
  float vig = 1.0 - smoothstep(0.3, 1.2, length(uv - 0.5) * 1.4);
  color *= vig;

  // Subtle grain
  float grain = (fract(sin(dot(uv * uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.03;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
