// Technology detection from repository metadata and manifest files.
// Manifests are parsed as data only (JSON / plain text). Repository code is never executed.

const NPM_MAP = {
  react: 'React', 'react-dom': 'React', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit', '@angular/core': 'Angular', 'solid-js': 'Solid', astro: 'Astro', vite: 'Vite',
  express: 'Express', fastify: 'Fastify', koa: 'Koa', '@nestjs/core': 'NestJS', hono: 'Hono',
  tailwindcss: 'Tailwind CSS', bootstrap: 'Bootstrap', sass: 'Sass', 'styled-components': 'styled-components',
  typescript: 'TypeScript', electron: 'Electron', 'react-native': 'React Native', expo: 'Expo',
  three: 'Three.js', d3: 'D3.js', 'chart.js': 'Chart.js', gsap: 'GSAP', 'framer-motion': 'Framer Motion',
  firebase: 'Firebase', '@supabase/supabase-js': 'Supabase', mongoose: 'MongoDB', mongodb: 'MongoDB', prisma: 'Prisma',
  '@prisma/client': 'Prisma', pg: 'PostgreSQL', mysql2: 'MySQL', redis: 'Redis', 'socket.io': 'Socket.IO',
  openai: 'OpenAI API', '@anthropic-ai/sdk': 'Anthropic API', 'groq-sdk': 'Groq', langchain: 'LangChain',
  '@langchain/core': 'LangChain', 'node-telegram-bot-api': 'Telegram Bot API', telegraf: 'Telegram Bot API',
  'discord.js': 'Discord.js', twilio: 'Twilio', stripe: 'Stripe', jest: 'Jest', vitest: 'Vitest', playwright: 'Playwright',
  '@playwright/test': 'Playwright', puppeteer: 'Puppeteer', cheerio: 'Cheerio', graphql: 'GraphQL',
};

const PY_MAP = {
  flask: 'Flask', django: 'Django', fastapi: 'FastAPI', streamlit: 'Streamlit', gradio: 'Gradio',
  pandas: 'Pandas', numpy: 'NumPy', 'scikit-learn': 'scikit-learn', sklearn: 'scikit-learn', scipy: 'SciPy',
  tensorflow: 'TensorFlow', keras: 'Keras', torch: 'PyTorch', pytorch: 'PyTorch', transformers: 'Hugging Face Transformers',
  langchain: 'LangChain', 'langchain-core': 'LangChain', llamaindex: 'LlamaIndex', 'llama-index': 'LlamaIndex',
  openai: 'OpenAI API', anthropic: 'Anthropic API', groq: 'Groq', 'google-generativeai': 'Gemini API',
  beautifulsoup4: 'BeautifulSoup', bs4: 'BeautifulSoup', requests: 'Requests', httpx: 'HTTPX', selenium: 'Selenium',
  playwright: 'Playwright', scrapy: 'Scrapy', matplotlib: 'Matplotlib', seaborn: 'Seaborn', plotly: 'Plotly',
  'opencv-python': 'OpenCV', 'opencv-python-headless': 'OpenCV', pillow: 'Pillow', nltk: 'NLTK', spacy: 'spaCy',
  'python-telegram-bot': 'Telegram Bot API', pytelegrambotapi: 'Telegram Bot API', aiogram: 'Telegram Bot API',
  twilio: 'Twilio', 'qdrant-client': 'Qdrant', chromadb: 'ChromaDB', 'faiss-cpu': 'FAISS', pinecone: 'Pinecone',
  'pinecone-client': 'Pinecone', sqlalchemy: 'SQLAlchemy', pymongo: 'MongoDB', 'psycopg2-binary': 'PostgreSQL',
  psycopg2: 'PostgreSQL', redis: 'Redis', celery: 'Celery', pytest: 'pytest', 'feedparser': 'RSS (feedparser)',
  'sentence-transformers': 'Sentence Transformers', xgboost: 'XGBoost', lightgbm: 'LightGBM', tkinter: 'Tkinter',
  pygame: 'Pygame', pyqt5: 'PyQt', pyside6: 'PySide', uvicorn: 'Uvicorn', gunicorn: 'Gunicorn', jupyter: 'Jupyter',
};

const FILE_MAP = [
  [/^dockerfile$/i, 'Docker'], [/^docker-compose\.ya?ml$/i, 'Docker'], [/^compose\.ya?ml$/i, 'Docker'],
  [/^vercel\.json$/i, 'Vercel'], [/^netlify\.toml$/i, 'Netlify'], [/^procfile$/i, 'Procfile deploy'],
  [/^firebase\.json$/i, 'Firebase'], [/^wrangler\.toml$/i, 'Cloudflare Workers'], [/^render\.ya?ml$/i, 'Render'],
  [/\.ipynb$/i, 'Jupyter'], [/^tsconfig\.json$/i, 'TypeScript'], [/^tailwind\.config\.(js|ts|cjs|mjs)$/i, 'Tailwind CSS'],
  [/^vite\.config\.(js|ts|mjs)$/i, 'Vite'], [/^next\.config\.(js|ts|mjs)$/i, 'Next.js'], [/^manage\.py$/i, 'Django'],
  [/^pubspec\.yaml$/i, 'Flutter'], [/^cargo\.toml$/i, 'Cargo'], [/^go\.mod$/i, 'Go modules'], [/^pom\.xml$/i, 'Maven'],
  [/^build\.gradle(\.kts)?$/i, 'Gradle'],
];

export const MANIFESTS = ['package.json', 'requirements.txt', 'pyproject.toml'];

export function parsePackageJson(text) {
  try {
    const pkg = JSON.parse(text);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
    return Object.keys(deps);
  } catch {
    return [];
  }
}

export function parseRequirements(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter((l) => l && !l.startsWith('-'))
    .map((l) => l.split(/[<>=!~;\[\s@]/)[0].toLowerCase())
    .filter(Boolean);
}

export function parsePyproject(text) {
  const names = new Set();
  const s = String(text);
  // PEP 621 dependencies = ["a>=1", "b"]
  for (const m of s.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const d of m[1].matchAll(/["']([A-Za-z0-9_.-]+)/g)) names.add(d[1].toLowerCase());
  }
  // Poetry [tool.poetry.dependencies] name = "..."
  const poetry = s.match(/\[tool\.poetry(?:\.group\.\w+)?\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
  if (poetry) for (const d of poetry[1].matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)) names.add(d[1].toLowerCase());
  names.delete('python');
  return [...names];
}

/**
 * Combine signals into an ordered, de-duplicated tech list.
 * Each entry: { name, source } where source ∈ language | topic | manifest | file
 */
export function detectTech({ languages = {}, topics = [], files = [], manifests = {}, hasWorkflows = false }) {
  const out = [];
  const seen = new Set();
  const add = (name, source) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, source });
  };

  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  for (const [lang, bytes] of Object.entries(languages).sort((a, b) => b[1] - a[1])) {
    if (bytes / totalBytes >= 0.02 || out.length === 0) add(lang, 'language');
  }
  const pkgNames = manifests['package.json'] ? parsePackageJson(manifests['package.json']) : [];
  for (const n of pkgNames) if (NPM_MAP[n]) add(NPM_MAP[n], 'manifest');
  const pyNames = [
    ...(manifests['requirements.txt'] ? parseRequirements(manifests['requirements.txt']) : []),
    ...(manifests['pyproject.toml'] ? parsePyproject(manifests['pyproject.toml']) : []),
  ];
  for (const n of pyNames) if (PY_MAP[n]) add(PY_MAP[n], 'manifest');
  for (const f of files) for (const [re, name] of FILE_MAP) if (re.test(f)) add(name, 'file');
  if (hasWorkflows) add('GitHub Actions', 'file');
  for (const t of topics) add(prettyTopic(t), 'topic');
  return out;
}

const TOPIC_NAMES = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', html: 'HTML', css: 'CSS', html5: 'HTML',
  css3: 'CSS', nodejs: 'Node.js', reactjs: 'React', react: 'React', nextjs: 'Next.js', ai: 'AI', ml: 'ML', llm: 'LLM',
  nlp: 'NLP', api: 'API', 'machine-learning': 'Machine Learning', 'deep-learning': 'Deep Learning',
  'github-actions': 'GitHub Actions', 'telegram-bot': 'Telegram Bot', streamlit: 'Streamlit', flask: 'Flask',
  fastapi: 'FastAPI', openai: 'OpenAI', groq: 'Groq', 'generative-ai': 'Generative AI', automation: 'Automation',
};
export function prettyTopic(t) {
  if (TOPIC_NAMES[t]) return TOPIC_NAMES[t];
  return t.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}
