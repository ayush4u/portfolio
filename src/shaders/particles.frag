varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);

  // Soft circle with exponential glow falloff
  float circle = smoothstep(0.5, 0.08, d);
  float glow = exp(-d * 5.0) * 0.5;

  float alpha = (circle + glow) * vAlpha;
  if (alpha < 0.01) discard;

  // Brighten center
  vec3 color = vColor * (1.0 + glow * 0.8);

  gl_FragColor = vec4(color, alpha);
}
