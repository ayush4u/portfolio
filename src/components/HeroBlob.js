import * as THREE from 'three';
import blobVert from '../shaders/blob.vert';
import blobFrag from '../shaders/blob.frag';

const WIREFRAME_FRAG = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;
  varying vec3 vViewDirection;

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = normalize(vViewDirection);
    float fresnel = pow(1.0 - abs(dot(viewDir, norm)), 2.0);
    vec3 color = mix(vec3(0.0, 0.898, 1.0), vec3(1.0, 0.2, 0.4), fresnel);
    float alpha = fresnel * 0.3 + 0.02;
    gl_FragColor = vec4(color, alpha);
  }
`;

const CORE_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDirection = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  void main() {
    vec3 viewDir = normalize(vViewDirection);
    vec3 norm = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDir, norm)), 1.5);
    vec3 color = mix(vec3(0.0, 0.898, 1.0), vec3(1.0, 0.2, 0.4), sin(uTime * 0.3) * 0.5 + 0.5);
    gl_FragColor = vec4(color, fresnel * 0.25);
  }
`;

export class HeroBlob {
  constructor(scene) {
    // Main blob — high detail icosphere with displacement
    const geometry = new THREE.IcosahedronGeometry(2.2, 5);

    this.material = new THREE.ShaderMaterial({
      vertexShader: blobVert,
      fragmentShader: blobFrag,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uDistortionFreq: { value: 0.8 },
        uDistortionAmp: { value: 0.4 },
        uOpacity: { value: 0.92 },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    scene.add(this.mesh);

    // Wireframe overlay — lower detail for visible wireframe lines
    const wireGeo = new THREE.IcosahedronGeometry(2.35, 3);
    this.wireMaterial = new THREE.ShaderMaterial({
      vertexShader: blobVert,
      fragmentShader: WIREFRAME_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uDistortionFreq: { value: 0.8 },
        uDistortionAmp: { value: 0.4 },
        uOpacity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });

    this.wireMesh = new THREE.Mesh(wireGeo, this.wireMaterial);
    scene.add(this.wireMesh);

    // Inner glow core — small sphere with additive glow
    const coreGeo = new THREE.IcosahedronGeometry(0.5, 3);
    this.coreMaterial = new THREE.ShaderMaterial({
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.coreMesh = new THREE.Mesh(coreGeo, this.coreMaterial);
    scene.add(this.coreMesh);
  }

  update(time, mouse, scrollNorm, profile) {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uMouse.value.set(mouse.x, mouse.y);
    uniforms.uScroll.value = scrollNorm;

    // Smoothly lerp distortion to section profile
    if (profile) {
      const lerpSpeed = 0.03;
      uniforms.uDistortionFreq.value += (profile.freq - uniforms.uDistortionFreq.value) * lerpSpeed;
      uniforms.uDistortionAmp.value += (profile.amp - uniforms.uDistortionAmp.value) * lerpSpeed;

      // Smoothly move blob position
      const targetX = profile.x;
      const targetY = profile.y;
      const targetScale = profile.scale;
      this.mesh.position.x += (targetX - this.mesh.position.x) * lerpSpeed;
      this.mesh.position.y += (targetY - this.mesh.position.y) * lerpSpeed;
      const s = this.mesh.scale.x + (targetScale - this.mesh.scale.x) * lerpSpeed;
      this.mesh.scale.setScalar(s);
      this.wireMesh.position.copy(this.mesh.position);
      this.wireMesh.scale.setScalar(s);
      this.coreMesh.position.copy(this.mesh.position);
      this.coreMesh.scale.setScalar(s * 0.8);
    }

    const wireUniforms = this.wireMaterial.uniforms;
    wireUniforms.uTime.value = time;
    wireUniforms.uMouse.value.set(mouse.x, mouse.y);
    wireUniforms.uScroll.value = scrollNorm;
    wireUniforms.uDistortionFreq.value = uniforms.uDistortionFreq.value;
    wireUniforms.uDistortionAmp.value = uniforms.uDistortionAmp.value;

    this.coreMaterial.uniforms.uTime.value = time;
  }

  dispose() {
    this.material.dispose();
    this.wireMaterial.dispose();
    this.coreMaterial.dispose();
    this.mesh.geometry.dispose();
    this.wireMesh.geometry.dispose();
    this.coreMesh.geometry.dispose();
  }
}
