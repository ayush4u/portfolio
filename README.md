# Ayush Tomar — Portfolio

Interactive portfolio with Three.js particles, custom GLSL shaders, scroll-driven animations (GSAP + Lenis), and an AI chatbot powered by NVIDIA NIM via Supabase Edge Functions.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Architecture

| Layer | Tech |
|-------|------|
| Frontend | Vite + Three.js + GSAP + Lenis |
| Background | Custom GLSL shaders (FBM noise, particles) |
| Post-processing | Bloom + Vignette (postprocessing lib) |
| Chatbot backend | Supabase Edge Function → NVIDIA NIM |
| Database | Supabase PostgreSQL (chat history) |
| Hosting | GitHub Pages (static, via Actions) |

## Secrets / Environment Variables

**No API keys in frontend code.** The NVIDIA NIM key lives only in Supabase Edge Function secrets.

### GitHub Secrets (Settings → Secrets → Actions)

| Secret | Description |
|--------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

### Supabase Secrets (Edge Function)

```bash
supabase secrets set NVIDIA_API_KEY=nvapi-xxxxx
```

### Local Development

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

## Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_chat_messages.sql` via the SQL Editor
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy chat
   supabase secrets set NVIDIA_API_KEY=nvapi-xxxxx
   ```

## Certifications Section

Disabled by default. To enable, edit `src/main.js`:

```js
const CERTIFICATIONS = {
  enabled: true,
  items: [
    { name: 'AWS Certified Cloud Practitioner', issuer: 'AWS', date: '2024', link: 'https://...' },
    // ...add more
  ],
};
```

## Deployment

Push to `main` → GitHub Actions builds and deploys to GitHub Pages automatically.

## Project Structure

```
portfolio/
├── .github/workflows/deploy.yml   # GitHub Pages deployment
├── supabase/
│   ├── functions/chat/index.ts     # Edge Function (NVIDIA NIM proxy)
│   └── migrations/                 # Database schema
├── src/
│   ├── main.js                     # Entry point, GSAP animations, Lenis
│   ├── Experience.js               # Three.js scene controller
│   ├── components/
│   │   ├── BackgroundMesh.js       # Shader background
│   │   ├── ParticleField.js        # Floating particles
│   │   └── Chatbot.js              # AI chat interface
│   ├── shaders/
│   │   ├── background.vert/frag    # FBM noise background
│   │   └── particles.vert/frag     # Particle system
│   ├── styles/main.css             # Full styles
│   └── utils/                      # Math helpers, mouse tracking
├── index.html
├── package.json
└── vite.config.js
```
