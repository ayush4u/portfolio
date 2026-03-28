uniform float uTime;
uniform float uScroll;
uniform float uPixelRatio;
uniform vec2 uMouse;

attribute float aScale;
attribute float aSpeed;
attribute vec3 aColor;
attribute float aPhase;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = position;
  float t = uTime * 0.3;
  float phase = aPhase * 6.28318;

  // Orbital motion — particles orbit at unique speed/radius
  float orbitSpeed = aSpeed * 0.4;
  float currentAngle = atan(pos.z, pos.x) + t * orbitSpeed + phase;
  float radius = length(pos.xz);
  pos.x = cos(currentAngle) * radius;
  pos.z = sin(currentAngle) * radius;

  // Vertical oscillation — organic floating
  pos.y += sin(t * 0.8 + phase * 2.0) * 0.7 * aSpeed;

  // Noise-like displacement for organic drift
  float nx = sin(pos.x * 0.5 + t) * cos(pos.z * 0.3 + t * 0.7);
  float ny = cos(pos.y * 0.4 + t * 0.8) * sin(pos.x * 0.6 + t * 0.5);
  float nz = sin(pos.z * 0.5 + t * 0.6) * cos(pos.y * 0.3 + t * 0.9);
  pos += vec3(nx, ny, nz) * 0.4;

  // Mouse repulsion — strong push, particles flee from cursor
  vec2 mouseWorld = (uMouse - 0.5) * 10.0;
  vec2 toParticle = pos.xy - mouseWorld;
  float dist = length(toParticle);
  float repulsion = smoothstep(5.0, 0.0, dist) * 2.5;
  pos.xy += normalize(toParticle + 0.001) * repulsion;

  // Subtle attraction at distance — particles drift toward cursor orbit
  float attraction = smoothstep(12.0, 5.0, dist) * 0.3;
  pos.xy -= normalize(toParticle + 0.001) * attraction;

  // Scroll offset
  pos.y += uScroll * 2.0;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  float size = aScale * uPixelRatio * 5.0;
  size *= (1.0 / -mvPos.z);
  gl_PointSize = clamp(size, 1.0, 18.0);

  gl_Position = projectionMatrix * mvPos;

  vColor = aColor;
  float depth = -mvPos.z;
  vAlpha = smoothstep(20.0, 6.0, depth) * smoothstep(0.5, 2.0, depth) * 0.85;
}
