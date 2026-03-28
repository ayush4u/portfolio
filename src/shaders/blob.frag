uniform float uTime;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec3 vViewDirection;

// IQ color palette — electric cyan/blue iridescence
vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(0.8, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.50);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec3 norm = normalize(vNormal);
  vec3 viewDir = normalize(vViewDirection);

  // Fresnel — strong edge glow
  float fresnel = pow(1.0 - abs(dot(viewDir, norm)), 3.0);

  // Iridescent color from displacement + viewing angle + time
  float colorParam = vDisplacement * 2.5 + fresnel * 0.3 + uTime * 0.02;
  vec3 dynamicColor = palette(colorParam);

  // Dark base body
  vec3 baseColor = vec3(0.01, 0.01, 0.02);

  // Subtle body color from displacement peaks
  float dispGlow = smoothstep(-0.1, 0.5, vDisplacement);
  vec3 bodyColor = mix(baseColor, dynamicColor * 0.12, dispGlow);

  // Strong iridescent edge glow
  vec3 edgeGlow = dynamicColor * fresnel * 2.0;

  // Electric cyan accent on sharp edges
  vec3 warmEdge = vec3(0.0, 0.898, 1.0) * pow(fresnel, 4.0) * 0.8;

  vec3 finalColor = bodyColor + edgeGlow + warmEdge;

  // Subtle film grain
  float grain = fract(sin(dot(vPosition.xy + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
  finalColor += grain * 0.012;

  gl_FragColor = vec4(finalColor, uOpacity);
}
