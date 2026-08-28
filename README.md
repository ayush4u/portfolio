# Ayush Tomar — Portfolio

**🚀 Live Demo:** [https://ayush4u.github.io/portfolio/](https://ayush4u.github.io/portfolio/)

Portfolio showcasing my work as an AI/ML Engineer and Automation Architect. Features a modern UI and a built-in AI chatbot agent powered by NVIDIA NIM and Supabase to answer queries about my experience.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Architecture

| Layer | Tech |
|-------|------|
| Frontend | Vite + Vanilla JS + GSAP + Lenis |
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
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token used by the deployment workflow |
| `SUPABASE_DB_PASSWORD` | Supabase project database password used to run migrations |
| `SUPABASE_PROJECT_REF` | Project reference from the Supabase dashboard URL |

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

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In GitHub Actions secrets, add `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_REF` alongside the two `VITE_` secrets above.
3. In Supabase Edge Function Secrets, set the runtime keys:
   ```bash
   supabase secrets set NVIDIA_API_KEY=nvapi-xxxxx RESEND_API_KEY=re_xxxxx
   ```
4. Push to `main` (or run **Deploy Supabase** manually). The workflow applies every pending SQL migration before deploying all Edge Functions.

For an existing project that was edited in the Supabase dashboard, run `supabase db pull` once before enabling the workflow, then commit the generated baseline migration. This prevents an out-of-sync migration history from blocking `supabase db push`.

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
├── .github/workflows/supabase.yml # Database migrations + Edge Function deployment
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
