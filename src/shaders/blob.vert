uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;
uniform float uDistortionFreq;
uniform float uDistortionAmp;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec3 vViewDirection;

// ===== 3D Simplex Noise =====
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    val += amp * snoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

void main() {
  vec3 pos = position;
  vec3 norm = normal;
  float t = uTime * 0.15;

  // Organic displacement — FBM noise along normals
  float noise = fbm(pos * uDistortionFreq + t);
  float displacement = noise * uDistortionAmp;

  // Secondary faster detail layer
  displacement += snoise(pos * 3.0 + t * 2.0) * uDistortionAmp * 0.2;

  // Mouse influence — strong bulge toward cursor direction
  vec2 mouseDir = (uMouse - 0.5) * 2.0;
  float mouseLen = length(mouseDir);
  float mouseAngle = atan(mouseDir.y, mouseDir.x);
  float posAngle = atan(pos.y, pos.x);
  float angleDiff = abs(posAngle - mouseAngle);
  angleDiff = min(angleDiff, 6.28318 - angleDiff);
  float mouseInfluence = smoothstep(1.8, 0.0, angleDiff) * mouseLen;
  displacement += mouseInfluence * 0.45;

  // Mouse proximity wave — the closer the mouse moves, the more alive it feels
  float mousePulse = sin(t * 8.0 + angleDiff * 3.0) * mouseLen * 0.08;
  displacement += mousePulse;

  // Apply displacement along normal
  pos += norm * displacement;

  // Slow rotation
  float rotAngle = uTime * 0.06 + uScroll * 0.5;
  float cr = cos(rotAngle);
  float sr = sin(rotAngle);
  pos.xz = mat2(cr, -sr, sr, cr) * pos.xz;
  norm.xz = mat2(cr, -sr, sr, cr) * norm.xz;

  // Slow Y tilt
  float tiltAngle = sin(uTime * 0.08) * 0.15;
  float ct = cos(tiltAngle);
  float st = sin(tiltAngle);
  pos.yz = mat2(ct, -st, st, ct) * pos.yz;
  norm.yz = mat2(ct, -st, st, ct) * norm.yz;

  vNormal = normalize(normalMatrix * norm);
  vDisplacement = displacement;
  vPosition = pos;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vViewDirection = cameraPosition - worldPos.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
