import * as THREE from 'three';
import {
  EffectComposer, RenderPass, BloomEffect, EffectPass,
  VignetteEffect, ChromaticAberrationEffect, NoiseEffect,
} from 'postprocessing';
import { Mouse } from './utils/mouse.js';
import { ParticleField } from './components/ParticleField.js';
import { HeroBlob } from './components/HeroBlob.js';

// Section profiles: blob moves to complement text layout, never overlaps
// Mobile uses centered positions behind content, desktop uses offset
const isMobile = () => window.innerWidth < 768;

const SECTION_PROFILES_DESKTOP = {
  hero:     { freq: 0.8,  amp: 0.4,  x:  3.0, y: 0,    scale: 1.0  },
  about:    { freq: 1.2,  amp: 0.3,  x:  4.5, y: 0.3,  scale: 0.7  },
  work:     { freq: 0.5,  amp: 0.5,  x: -4.5, y: 0,    scale: 0.6  },
  projects: { freq: 1.8,  amp: 0.35, x:  5.0, y: -0.5, scale: 0.55 },
  skills:   { freq: 0.4,  amp: 0.5,  x:  5.5, y: 0,    scale: 0.45 },
  contact:  { freq: 2.0,  amp: 0.2,  x:  4.0, y: -1.0, scale: 0.8  },
};

const SECTION_PROFILES_MOBILE = {
  hero:     { freq: 0.8,  amp: 0.35, x:  1.8, y: 1.2,  scale: 0.65 },
  about:    { freq: 1.2,  amp: 0.25, x:  2.2, y: 1.5,  scale: 0.45 },
  work:     { freq: 0.5,  amp: 0.4,  x: -2.0, y: 1.0,  scale: 0.4  },
  projects: { freq: 1.8,  amp: 0.3,  x:  2.5, y: 1.5,  scale: 0.35 },
  skills:   { freq: 0.4,  amp: 0.4,  x:  2.5, y: 1.5,  scale: 0.3  },
  contact:  { freq: 2.0,  amp: 0.2,  x:  1.5, y: 0.5,  scale: 0.55 },
};

export class Experience {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = new Mouse();
    this.scrollY = 0;
    this.currentSection = 'hero';
    this.targetProfile = (isMobile() ? SECTION_PROFILES_MOBILE : SECTION_PROFILES_DESKTOP).hero;

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initPostProcessing();
    this.initObjects();
    this.initResize();

    this.clock = new THREE.Clock();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }

  initScene() {
    this.scene = new THREE.Scene();
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 8);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomEffect = new BloomEffect({
      intensity: 1.8,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.6,
      mipmapBlur: true,
    });

    const chromaticEffect = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0006, 0.0006),
    });

    const vignetteEffect = new VignetteEffect({
      offset: 0.35,
      darkness: 0.75,
    });

    const noiseEffect = new NoiseEffect({ premultiply: true });
    noiseEffect.blendMode.opacity.value = 0.035;

    const effectPass = new EffectPass(
      this.camera,
      bloomEffect,
      chromaticEffect,
      vignetteEffect,
      noiseEffect,
    );
    this.composer.addPass(effectPass);
  }

  initObjects() {
    this.blob = new HeroBlob(this.scene);
    this.particles = new ParticleField(this.scene);
  }

  initResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      // Re-evaluate section profile for new screen size
      const profiles = isMobile() ? SECTION_PROFILES_MOBILE : SECTION_PROFILES_DESKTOP;
      this.targetProfile = profiles[this.currentSection] || profiles.hero;
    });
  }

  setScroll(y) {
    this.scrollY = y;
  }

  setSection(state) {
    if (state && state !== this.currentSection) {
      this.currentSection = state;
      const profiles = isMobile() ? SECTION_PROFILES_MOBILE : SECTION_PROFILES_DESKTOP;
      this.targetProfile = profiles[state] || profiles.hero;
    }
  }

  update() {
    const elapsed = this.clock.getElapsedTime();
    this.mouse.update();

    const scrollNorm = Math.min(this.scrollY / window.innerHeight, 1);
    const p = this.targetProfile;

    // Smoothly animate blob position/distortion toward section target
    this.blob.update(elapsed, this.mouse, scrollNorm, p);
    this.particles.update(elapsed, scrollNorm, this.mouse);

    // Camera parallax — toned down on mobile
    const pStr = isMobile() ? 0.4 : 1.2;
    const pStrY = isMobile() ? 0.3 : 0.8;
    this.camera.position.x += (this.mouse.x * pStr - pStr * 0.5 - this.camera.position.x) * 0.03;
    this.camera.position.y += (this.mouse.y * pStrY - pStrY * 0.5 - this.camera.position.y) * 0.03;

    this.composer.render();
  }

  dispose() {
    this.blob.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.composer.dispose();
  }
}
