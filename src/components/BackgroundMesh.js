import * as THREE from 'three';
import bgVert from '../shaders/background.vert';
import bgFrag from '../shaders/background.frag';

export class BackgroundMesh {
  constructor(scene, camera) {
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.z = -5;
    scene.add(this.mesh);
    this.resize();
  }

  resize() {
    const dist = this.camera.position.z - this.mesh.position.z;
    const fovRad = this.camera.fov * Math.PI / 180;
    const h = 2 * Math.tan(fovRad / 2) * dist;
    const w = h * this.camera.aspect;
    this.mesh.scale.set(w * 1.25, h * 1.25, 1);
    this.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  }

  update(time, mouse, scroll) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
    this.material.uniforms.uScroll.value = scroll;
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
