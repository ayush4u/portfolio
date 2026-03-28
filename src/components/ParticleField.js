import * as THREE from 'three';
import partVert from '../shaders/particles.vert';
import partFrag from '../shaders/particles.frag';

export class ParticleField {
  constructor(scene) {
    const count = window.innerWidth < 768 ? 300 : 800;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const speeds = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    const palette = [
      [0.0, 0.898, 1.0],    // accent cyan
      [1.0, 0.2, 0.4],      // hot pink
      [0.66, 0.33, 0.97],   // purple
      [0.9, 0.9, 0.9],      // white
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 60% concentrated near the blob, 40% wider scatter
      if (i < count * 0.6) {
        const r = 2.8 + Math.random() * 4.0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = r * Math.cos(phi);
      } else {
        positions[i3]     = (Math.random() - 0.5) * 18;
        positions[i3 + 1] = (Math.random() - 0.5) * 14;
        positions[i3 + 2] = (Math.random() - 0.5) * 10 - 2;
      }

      scales[i] = Math.random() * 2.5 + 0.5;
      speeds[i] = Math.random() * 0.6 + 0.15;
      phases[i] = Math.random();

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i3]     = c[0];
      colors[i3 + 1] = c[1];
      colors[i3 + 2] = c[2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: partVert,
      fragmentShader: partFrag,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    scene.add(this.points);
    this.geometry = geometry;
  }

  update(time, scroll, mouse) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScroll.value = scroll;
    if (mouse) {
      this.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
    }
  }

  dispose() {
    this.material.dispose();
    this.geometry.dispose();
  }
}
