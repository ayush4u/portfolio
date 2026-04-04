import './styles/main.css';
import { Experience } from './Experience.js';
import { initChatbot } from './components/Chatbot.js';
import { trackVisit } from './components/Tracker.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from '@studio-freight/lenis';

gsap.registerPlugin(ScrollTrigger);

// ============
// CERTIFICATIONS CONFIG
// Set enabled: true and add items to show the section.
// Each item: { name, issuer, date?, badge?, link?, image? }
// ============
const CERTIFICATIONS = {
  enabled: true,
  items: [
    { name: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', badge: 'CLF-C02' },
    { name: 'Advanced RPA Developer', issuer: 'UiPath Academy', badge: 'UiARD' },
    { name: 'Professional Machine Learning Engineer', issuer: 'Google Cloud', badge: 'GCP-PMLE' },
    { name: 'Claude Code in Action', issuer: 'Anthropic Education', date: 'Apr 2026', link: 'https://verify.skilljar.com/c/z45xrycpcwer', image: import.meta.env.BASE_URL + 'certs/claude-code-in-action.jpg' },
    { name: 'Introduction to Model Context Protocol', issuer: 'Anthropic Education', date: 'Apr 2026', link: 'https://verify.skilljar.com/c/atxeopf3qctc', image: import.meta.env.BASE_URL + 'certs/intro-mcp.jpg' },
    { name: 'Fundamentals of LLMs — The LLM Course', issuer: 'Hugging Face', date: 'Apr 2026', link: 'https://cdn-uploads.huggingface.co/production/uploads/noauth/KU7p_CjheQU0uVtXe9_ha.webp', image: import.meta.env.BASE_URL + 'certs/hf-llm-fundamentals.webp' },
    { name: 'Fundamentals of MCP — The MCP Course', issuer: 'Hugging Face', date: 'Apr 2026', link: 'https://cdn-uploads.huggingface.co/production/uploads/noauth/i-yX-mSolTEFnwwExv2QG.webp', image: import.meta.env.BASE_URL + 'certs/hf-mcp-fundamentals.webp' },
  ],
};

// ============
// LOADER
// ============
const loader = document.getElementById('loader');
const loaderFill = document.querySelector('.loader-fill');
let loadProgress = 0;
const loadInterval = setInterval(() => {
  loadProgress = Math.min(loadProgress + Math.random() * 20, 100);
  loaderFill.style.width = `${loadProgress}%`;
  if (loadProgress >= 100) clearInterval(loadInterval);
}, 200);

// ============
// THREE.JS
// ============
const canvas = document.getElementById('webgl');
const experience = new Experience(canvas);

// ============
// SMOOTH SCROLL (Lenis)
// ============
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
});

lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

lenis.on('scroll', ({ scroll }) => {
  experience.setScroll(scroll);
});

// ============
// ANIMATION LOOP
// ============
function animate() {
  requestAnimationFrame(animate);
  experience.update();
}

// ============
// NAV
// ============
const nav = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.querySelector('.nav-links');

ScrollTrigger.create({
  start: 'top -80',
  onUpdate: (self) => {
    nav.classList.toggle('visible', self.progress > 0);
  },
});

navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('mobile-open');
});

navLinks.querySelectorAll('a').forEach((a) => {
  a.addEventListener('click', () => navLinks.classList.remove('mobile-open'));
});

// ============
// SECTION-AWARE 3D — detect which section is current
// ============
function initSectionObserver() {
  document.querySelectorAll('.scene-section').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 60%',
      end: 'bottom 40%',
      onEnter: () => experience.setSection(section.dataset.sceneState),
      onEnterBack: () => experience.setSection(section.dataset.sceneState),
    });
  });
}

// ============
// HERO ENTRANCE — cinematic character reveals
// ============
function playHeroEntrance() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.to('.hero-label', { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.2);

  // Name lines — slide up from below
  document.querySelectorAll('.name-line').forEach((line, i) => {
    tl.to(line, {
      opacity: 1,
      y: 0,
      duration: 1.2,
      ease: 'power4.out',
    }, 0.3 + i * 0.15);
  });

  tl.to('.hero-desc', { opacity: 1, duration: 0.8 }, 0.9)
    .to('.hero-meta', { opacity: 1, duration: 0.8 }, 1.1)
    .to('.scroll-hint', { opacity: 1, duration: 1 }, 1.4);

  // Fade scroll hint on scroll
  ScrollTrigger.create({
    start: 'top -50',
    onUpdate: (self) => {
      gsap.to('.scroll-hint', { opacity: self.progress > 0 ? 0 : 1, duration: 0.3 });
    },
  });
}

// ============
// ABOUT — staggered reveals
// ============
function initAboutAnimations() {
  // Lead text
  gsap.utils.toArray('[data-anim="lineReveal"]').forEach((el) => {
    gsap.to(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 80%',
        toggleActions: 'play none none none',
      },
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power3.out',
    });
  });

  // Stats
  gsap.utils.toArray('[data-anim="statReveal"]').forEach((el, i) => {
    gsap.to(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
      opacity: 1,
      y: 0,
      duration: 0.8,
      delay: i * 0.15,
      ease: 'power3.out',
    });
  });

  // Counter animation
  gsap.utils.toArray('[data-count]').forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => {
        gsap.to(el, {
          innerText: target,
          duration: 1.5,
          snap: { innerText: 1 },
          ease: 'power2.out',
        });
      },
      once: true,
    });
  });
}

// ============
// WORK — Horizontal scroll (pinned section)
// ============
function initWorkScroll() {
  const track = document.querySelector('.work-track');
  if (!track) return;

  const scrollWidth = track.scrollWidth - window.innerWidth;

  gsap.to(track, {
    x: -scrollWidth,
    ease: 'none',
    scrollTrigger: {
      trigger: '#work',
      start: 'top top',
      end: () => `+=${scrollWidth}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });
}

// ============
// PROJECTS — bento grid card reveals
// ============
function initProjectShowcases() {
  // Set per-card accent color from data attribute
  document.querySelectorAll('.project-card').forEach((card) => {
    const color = card.dataset.color;
    if (color) {
      card.style.setProperty('--card-accent', color + '15');
    }
  });

  // Staggered reveal
  gsap.utils.toArray('.project-card').forEach((el, i) => {
    gsap.fromTo(el,
      { opacity: 0, y: 40 },
      {
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        opacity: 1,
        y: 0,
        duration: 0.7,
        delay: i * 0.08,
        ease: 'power3.out',
      }
    );
  });
}

// ============
// SKILLS — flow-in reveals
// ============
function initSkillsAnimations() {
  gsap.utils.toArray('[data-anim="flowIn"]').forEach((el, i) => {
    gsap.to(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
      opacity: 1,
      x: 0,
      duration: 0.8,
      delay: i * 0.1,
      ease: 'power3.out',
    });
  });
}

// ============
// CERTIFICATIONS — render cards from config, then animate
// ============
function initCertifications() {
  const section = document.getElementById('certifications');
  if (!section || !CERTIFICATIONS.enabled) return;

  const grid = section.querySelector('.certs-grid');
  CERTIFICATIONS.items.forEach((cert) => {
    const card = document.createElement('div');
    card.className = 'cert-card';
    card.setAttribute('data-anim', 'certReveal');

    const meta = cert.link
      ? `<a href="${encodeURI(cert.link)}" target="_blank" rel="noopener" class="cert-verify">Verify ↗</a>`
      : cert.badge
      ? `<span class="cert-badge">${cert.badge}</span>`
      : '';
    const dateHtml = cert.date ? `<span class="cert-date">${cert.date}</span>` : '';
    const imageHtml = cert.image
      ? `<div class="cert-image"><img src="${encodeURI(cert.image)}" alt="${cert.name}" loading="lazy" /></div>`
      : '';

    card.innerHTML = `
      ${imageHtml}
      <div class="cert-body">
        <div class="cert-issuer">${cert.issuer}</div>
        <h3 class="cert-name">${cert.name}</h3>
        <div class="cert-meta">${dateHtml}${meta}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Show section & nav link
  section.classList.remove('section-hidden');
  const navLink = document.querySelector('a[href="#certifications"]');
  if (navLink) navLink.style.display = '';

  // GSAP scroll-reveal
  grid.querySelectorAll('[data-anim="certReveal"]').forEach((el, i) => {
    gsap.fromTo(el, { opacity: 0, y: 30 }, {
      scrollTrigger: { trigger: el, start: 'top 85%' },
      opacity: 1, y: 0, duration: 0.7, delay: i * 0.1, ease: 'power3.out',
    });
  });
}

// ============
// CONTACT — character-level reveal
// ============
function initContactAnimation() {
  const heading = document.querySelector('.contact-heading');
  if (!heading) return;

  gsap.from(heading, {
    scrollTrigger: {
      trigger: heading,
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 60,
    duration: 1.2,
    ease: 'power4.out',
  });

  // Contact links stagger
  gsap.utils.toArray('.contact-link').forEach((el, i) => {
    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        toggleActions: 'play none none none',
      },
      opacity: 0,
      y: 20,
      duration: 0.6,
      delay: i * 0.1,
      ease: 'power3.out',
    });
  });
}

// ============
// BOOT
// ============
window.addEventListener('load', () => {
  loadProgress = 100;
  loaderFill.style.width = '100%';
  setTimeout(() => {
    loader.classList.add('done');
    playHeroEntrance();
    initSectionObserver();
    initAboutAnimations();
    initWorkScroll();
    initProjectShowcases();
    initSkillsAnimations();
    initCertifications();
    initContactAnimation();
    initChatbot();
    trackVisit();
    animate();
  }, 600);
});
