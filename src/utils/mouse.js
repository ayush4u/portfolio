import { lerp } from './math.js';

export class Mouse {
  constructor() {
    this.x = 0.5;
    this.y = 0.5;
    this.targetX = 0.5;
    this.targetY = 0.5;

    window.addEventListener('mousemove', (e) => {
      this.targetX = e.clientX / window.innerWidth;
      this.targetY = 1.0 - e.clientY / window.innerHeight;
    });

    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this.targetX = t.clientX / window.innerWidth;
      this.targetY = 1.0 - t.clientY / window.innerHeight;
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      this.targetX = t.clientX / window.innerWidth;
      this.targetY = 1.0 - t.clientY / window.innerHeight;
    }, { passive: true });
  }

  update() {
    this.x = lerp(this.x, this.targetX, 0.05);
    this.y = lerp(this.y, this.targetY, 0.05);
  }
}
