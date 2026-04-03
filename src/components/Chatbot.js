import { createClient } from '@supabase/supabase-js';

// ============================================================
// PORTFOLIO CHATBOT
// Calls Supabase Edge Function (which holds the NVIDIA NIM key)
// Chat history stored in Supabase PostgreSQL
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Unique session per browser tab
const SESSION_ID = crypto.randomUUID();

// System prompt — teaches the AI about Ayush
const SYSTEM_PROMPT = `ROLE: You are the AI assistant embedded in Ayush Tomar's personal portfolio website. Your ONLY job is to answer questions about Ayush Tomar specifically — his career, skills, projects, personality, and availability. Never answer as a generic AI or discuss anything unrelated to Ayush.

If someone asks about Ayush, answer from the facts below. Never say "I don't know who Ayush is" — you know everything about him that is listed here.

Be helpful, concise, warm, and professional.

About Ayush:
- Software Engineer with 4+ years at Marsh McLennan (pension industry), Mumbai
- Specializes in Intelligent Automation (UiPath RPA), AI/ML, RAG systems
- Built RAG chatbot with OpenAI LLM, embeddings, MongoDB vector store (35% query resolution improvement)
- Created custom UiPath packages for email automation (40% manual effort reduction)
- Skills: Python, React, Node.js, TypeScript, Three.js, GLSL, AWS, Docker, Supabase
- Certifications: AWS Cloud Practitioner, UiPath Advanced RPA Developer, Google Professional ML Engineer, Anthropic — Claude Code in Action (verify: https://verify.skilljar.com/c/z45xrycpcwer), Anthropic — Introduction to Model Context Protocol (verify: https://verify.skilljar.com/c/atxeopf3qctc), Hugging Face — Fundamentals of LLMs (The LLM Course), Hugging Face — Fundamentals of MCP (The MCP Course)
- Education: B.E. in IT from Pillai HOC College of Engineering
- Projects: Indian Monitor (real-time India dashboard), DocuBot-AI (RAG chatbot), RAG Without Vectors (10 alternative RAG architectures), NeonBrew & Florescence (Three.js creative), Learning AI (ML/DL curriculum)
- Open to roles: Intelligent Automation Engineer, AI/ML Engineer, Full Stack Developer
- Contact: ayush.tomar55@gmail.com, LinkedIn: ayushtomar-rpa-ai, GitHub: ayush4u
- Availability: Generally free on weekday evenings (IST) and weekends. Best way to reach him is via email — he usually responds within a day.
- Hobbies & Interests: loves building things (software and otherwise), avid cricket player, exploring cafes and coffee culture — a true coffee enthusiast

FREELANCE / HIRING / GIG INQUIRIES:
Ayush is open to freelance work, contract gigs, and full-time opportunities. When someone expresses interest in hiring or working with Ayush:
1. Show enthusiasm — say something like "That's great! Ayush would love to hear about your project."
2. Politely collect the following details one at a time in a conversational way:
   - Their name
   - Company or organization (if any)
   - Brief description of the project or role
   - Their preferred contact method (email, LinkedIn, etc.)
3. After collecting the info, confirm by summarizing what they shared and let them know Ayush will reach out soon.
4. Always provide Ayush's email (ayush.tomar55@gmail.com) and LinkedIn (linkedin.com/in/ayushtomar-rpa-ai) so they can also reach out directly.
5. Be warm but professional — this is a lead, treat it with care.

If someone just asks "is he available?" or "can I hire him?", confirm he's open to opportunities and start the lead-capture flow.

Answer questions about his work, skills, projects, or personality. Keep responses under 150 words. Be warm and personable — share hobbies if someone asks what he's like outside of work.`;

export function initChatbot() {
  const toggle = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const close = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');

  if (!toggle || !panel) return;

  // Toggle panel
  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('chat-open');
    panel.classList.toggle('chat-open');
    panel.classList.toggle('chat-closed');
    if (!isOpen) input.focus();
  });

  close.addEventListener('click', () => {
    panel.classList.remove('chat-open');
    panel.classList.add('chat-closed');
  });

  // Scroll isolation — prevent chatbot scroll from leaking to page
  messages.addEventListener('wheel', (e) => {
    const { scrollTop, scrollHeight, clientHeight } = messages;
    const atTop = scrollTop === 0 && e.deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atBottom) {
      e.preventDefault();
    }
    e.stopPropagation();
  }, { passive: false });

  // Also trap touch scroll inside chatbot
  let touchStartY = 0;
  messages.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  messages.addEventListener('touchmove', (e) => {
    const deltaY = touchStartY - e.touches[0].clientY;
    const { scrollTop, scrollHeight, clientHeight } = messages;
    const atTop = scrollTop === 0 && deltaY < 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && deltaY > 0;
    if (atTop || atBottom) {
      e.preventDefault();
    }
    e.stopPropagation();
  }, { passive: false });

  // Conversation history for context
  const history = [{ role: 'system', content: SYSTEM_PROMPT }];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    input.value = '';
    input.disabled = true;

    history.push({ role: 'user', content: text });

    const typing = appendTyping();

    try {
      let reply;
      if (SUPABASE_URL && SUPABASE_KEY) {
        let msgDiv = null;
        let msgContent = null;

        reply = await sendMessageStreaming(history, (partial) => {
          if (!msgDiv) {
            typing.remove();
            msgDiv = appendMessage('assistant', '');
            msgContent = msgDiv.querySelector('.chat-content');
          }
          msgContent.innerHTML = renderMarkdown(partial);
          messages.scrollTop = messages.scrollHeight;
        });

        if (!msgDiv) {
          typing.remove();
          appendMessage('assistant', reply || 'I didn\'t get a response. Try again?');
        }
      } else {
        reply = getFallbackResponse(text);
        typing.remove();
        appendMessage('assistant', reply);
      }

      if (reply) {
        history.push({ role: 'assistant', content: reply });
        storeMessage(text, reply);
      }
    } catch (err) {
      typing.remove();
      appendMessage('assistant', 'Sorry, I\'m having trouble connecting. Please try again later.');
      console.error('Chat error:', err);
    }

    input.disabled = false;
    input.focus();
  });

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const content = document.createElement('div');
    content.className = 'chat-content';
    if (role === 'assistant' && text) {
      content.innerHTML = renderMarkdown(text);
    } else {
      content.textContent = text;
    }
    div.appendChild(content);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg assistant typing';
    div.innerHTML = '<p><span></span><span></span><span></span></p>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }
}

// Lightweight markdown renderer for chatbot responses
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // Escape HTML to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links — render as clickable
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Auto-link bare URLs (not already inside href="...")
  html = html.replace(/(?<!href="|">)(https?:\/\/[^\s<,)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Numbered lists: lines starting with "1. ", "2. " etc.
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="md-num"><span class="li-num">$1.</span> $2</li>');
  // Bullet lists: lines starting with "- " or "* "
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(/((?:<li class="md-num">.*<\/li>\n?)+)/g, '<ol>$1</ol>');
  html = html.replace(/((?:<li>(?!<span).*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Paragraphs — double newlines
  html = html.replace(/\n{2,}/g, '</p><p>');
  // Single newlines into <br> (but not inside lists/pre)
  html = html.replace(/\n/g, '<br>');
  // Wrap in paragraph
  html = `<p>${html}</p>`;
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Clean up <p> wrapping block elements
  html = html.replace(/<p>\s*(<(?:ul|ol|pre)>)/g, '$1');
  html = html.replace(/(<\/(?:ul|ol|pre)>)\s*<\/p>/g, '$1');

  return html;
}

async function sendMessageStreaming(history, onChunk) {
  const url = `${SUPABASE_URL}/functions/v1/chat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify({
      messages: [history[0], ...history.slice(1).slice(-7)],
      session_id: SESSION_ID,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Handle non-streaming JSON response (errors, fallbacks)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const reply = data.reply || '';
    if (reply) onChunk(reply);
    return reply;
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          fullReply += parsed.content;
          onChunk(fullReply);
        }
      } catch {}
    }
  }

  return fullReply;
}

async function storeMessage(userMsg, assistantMsg) {
  if (!supabase) return;
  try {
    await supabase.from('chat_messages').insert([
      { session_id: SESSION_ID, role: 'user', content: userMsg },
      { session_id: SESSION_ID, role: 'assistant', content: assistantMsg },
    ]);
  } catch {
    // Non-critical — silently fail
  }
}

// Fallback when Supabase is not configured (local dev / demo)
function getFallbackResponse(query) {
  const q = query.toLowerCase();
  if (q.includes('role') || q.includes('current') || q.includes('job') || q.includes('position'))
    return 'Ayush is currently a Software Engineer at Marsh McLennan in Mumbai, working on intelligent automation for the pension industry — building RPA bots, AI pipelines, and RAG systems.';
  if (q.includes('experience') || q.includes('work') || q.includes('company'))
    return 'Ayush has 4+ years at Marsh McLennan, building intelligent automation solutions for the pension industry — from custom UiPath packages to RAG chatbots with OpenAI.';
  if (q.includes('skill') || q.includes('tech') || q.includes('stack') || q.includes('tool'))
    return 'His core skills include UiPath RPA, Python, OpenAI/RAG systems, React, Node.js, TypeScript, AWS, Docker, and Supabase.';
  if (q.includes('project'))
    return 'Key projects: Indian Monitor (real-time India dashboard), DocuBot-AI (RAG chatbot), RAG Without Vectors (10 RAG architectures), NeonBrew & Florescence (creative web), and Learning AI (ML/DL curriculum).';
  if (q.includes('hire') || q.includes('freelanc') || q.includes('gig') || q.includes('available') || q.includes('contract') || q.includes('work with') || q.includes('opportunity'))
    return 'Ayush is open to freelance work and new opportunities! He\'d love to learn more about your project. You can reach him at ayush.tomar55@gmail.com or on LinkedIn: linkedin.com/in/ayushtomar-rpa-ai';
  if (q.includes('contact') || q.includes('email') || q.includes('reach') || q.includes('connect'))
    return 'You can reach Ayush at ayush.tomar55@gmail.com or connect on LinkedIn: linkedin.com/in/ayushtomar-rpa-ai — he usually responds within a day!';
  if (q.includes('certif'))
    return 'Ayush holds 7 certifications: AWS Cloud Practitioner, UiPath Advanced RPA Developer, Google Professional ML Engineer, two from Anthropic Education (Claude Code in Action, Intro to MCP), and two from Hugging Face (Fundamentals of LLMs, Fundamentals of MCP).';
  if (q.includes('education') || q.includes('degree') || q.includes('college'))
    return 'B.E. in Information Technology from Pillai HOC College of Engineering & Technology (GPA: 7.15/10).';
  if (q.includes('hobby') || q.includes('interest') || q.includes('fun') || q.includes('outside') || q.includes('free time'))
    return 'Outside work, Ayush loves building things, playing cricket, exploring cafes, and is a true coffee enthusiast ☕';
  if (q.includes('hello') || q.includes('hey') || q.includes('hi') || q.includes('sup') || q.includes('yo'))
    return 'Hey there! 👋 I\'m Ayush\'s AI assistant. You can ask me about his experience, projects, skills, or how to get in touch!';
  if (q.includes('thank') || q.includes('bye') || q.includes('later'))
    return 'You\'re welcome! Feel free to come back anytime. If you want to connect with Ayush directly, drop him an email at ayush.tomar55@gmail.com 🙌';
  return 'I can tell you about Ayush\'s work experience, skills, projects, certifications, or how to contact him. What would you like to know?';
}
