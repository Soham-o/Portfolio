<div align="center">

# CalmReader

**Read deeply. Think clearly. Remember what matters.**

*A frictionless, e-ink-inspired reading environment built for comprehension — not consumption.*

[![License: MIT](https://img.shields.io/badge/License-MIT-6B7A5E.svg?style=flat-square)](LICENSE)
[![Built with React](https://img.shields.io/badge/Built%20with-React-61DAFB.svg?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-B5774A.svg?style=flat-square)](CONTRIBUTING.md)
[![Calm Technology](https://img.shields.io/badge/Calm-Technology-8B8779.svg?style=flat-square)](#philosophy)

[Live Demo](#) · [Report a Bug](issues) · [Request a Feature](issues) · [Roadmap](#roadmap)

---

</div>

> Most reading tools are built to keep you reading *more*. CalmReader is built to help you understand *better* — one passage at a time, without notifications, streaks, or noise.

---

## Table of Contents

- [Why CalmReader](#why-calmreader)
- [Philosophy](#philosophy)
- [Features](#features)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why CalmReader

Most reading software optimizes for one metric: time on screen. The result is an environment filled with progress bars, streaks, recommendation feeds, and pop-up encouragement — tools designed to retain your attention, not support your comprehension.

The neuroscience tells a different story. Comprehension depends on working memory — a small, effortful workspace that holds ideas in active relation to each other. Every interruption taxes that workspace. Distraction isn't a minor annoyance; it's the mechanism by which understanding fails to form.

CalmReader is the antithesis of that design pattern. It is a page built like a well-made notebook: it loads your text, gets out of the way, and trusts you to read slowly. When you encounter a hard concept, it surfaces a definition — inline, quietly — without sending you down a browser tab rabbit hole. When you finish a section, it asks one good question instead of offering a five-star rating prompt.

It does not want you to keep using it. It wants you to finish reading.

---

## Philosophy

CalmReader is grounded in [Calm Technology](https://calmtech.com/) principles articulated by Mark Weiser and John Seely Brown: technology should require only as much attention as it deserves, communicate information at the periphery rather than the center, and amplify the best of human capability.

In practice, this means:

- **No feeds or discovery.** You bring the text. CalmReader reads it with you.
- **No streaks, no badges, no gamification.** Reading is intrinsically worth doing.
- **No notifications, ever.** The page is silent unless you ask it something.
- **No tracking.** Your reflections live locally, on your device, under your control.
- **Deep learning over content consumption.** The goal is one idea truly understood, not thirty articles skimmed.

---

## Features

### Import Anything
Bring your own content. Paste raw text directly, upload a `.txt` or `.md` file, or pull in any article via URL using the Jina Reader proxy. No account required. No content library. Just your text.

### Flow Focus
As you read, paragraphs outside your current position softly dim — reducing visual noise and keeping your working memory focused on one idea at a time. Enable it when you want it. Disable it when you don't.

### Socratic Margin
CalmReader doesn't summarize — it questions. When you tap a paragraph, a context-aware prompt appears in the margin: *"Does the conclusion necessarily follow?"* or *"What would someone who disagrees say?"* These aren't generic questions. They're selected based on what the paragraph is doing — making a causal claim, citing evidence, or issuing a value judgment.

Your answer goes into the **Wisdom Ledger**. Not the AI's summary. Yours.

### X-Ray Clarification
Forty-plus academic and conceptual terms are quietly annotated beneath the surface. Tap a term — *neuroplasticity*, *heuristic*, *externality* — and its definition expands inline. Reading continues. You never leave the page.

### Wisdom Ledger
A running log of insights you've written during a session. Every entry is authored by you, not generated. The ledger is searchable, exportable, and stored locally.

### Reflection Archive
Every insight and Pause Point response is saved across sessions in `localStorage`/`IndexedDB`. Search your own thinking across every text you've ever read in CalmReader: type a concept and find the thought you had about it three months ago.

### Pause Points
Every six paragraphs, a quiet interstitial appears: *"Without looking back — what do you remember?"* A small text field invites active recall, which cognitive science identifies as one of the most reliable mechanisms for long-term retention. Not a quiz. Not a score. A question.

### E-ink Inspired Design
Warm paper tones (`#F9F6F0`), generous line height, and two typefaces chosen for reading: **Literata** for body text and **Atkinson Hyperlegible** for UI — a typeface designed by the Braille Institute to maximize legibility for readers with low vision.

---

## Screenshots

> Screenshots coming soon. In the meantime, try the [live demo](#).

| Import Screen | Reading View | Socratic Margin |
|:---:|:---:|:---:|
| ![Import](docs/screenshots/import.png) | ![Reading](docs/screenshots/reading.png) | ![Socratic](docs/screenshots/socratic.png) |

| Wisdom Ledger | Reflection Archive | Mobile View |
|:---:|:---:|:---:|
| ![Ledger](docs/screenshots/ledger.png) | ![Archive](docs/screenshots/archive.png) | ![Mobile](docs/screenshots/mobile.png) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [pnpm](https://pnpm.io/) (recommended) or npm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/calmreader.git
cd calmreader

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) and paste any text to begin.

### Build for Production

```bash
pnpm build
pnpm preview
```

The production build outputs to `dist/` and is deployable to any static host (Vercel, Netlify, Cloudflare Pages).

---

## Local Development

### Environment

CalmReader has no backend and requires no environment variables for local development. Everything runs in the browser.

```bash
# Development server with hot module replacement
pnpm dev

# Type checking (if using TypeScript migration branch)
pnpm typecheck

# Lint
pnpm lint

# Run all checks before committing
pnpm check
```

### Storage

CalmReader uses two storage mechanisms:

| Scope | Mechanism | Purpose |
|---|---|---|
| Session insights | `useState` | Current reading session only |
| Reflection archive | `localStorage` | Persists across sessions, searched globally |

The storage layer is abstracted behind a simple adapter interface, designed for future migration to `IndexedDB` (larger archives) or native SQLite (desktop/mobile). See [`packages/core/src/storage/`](#project-structure) for details.

### URL Import

The URL import feature proxies requests through [Jina Reader](https://r.jina.ai/) (`https://r.jina.ai/{url}`). No API key is required. This makes no requests unless you explicitly use the Link tab — and it is the only network call CalmReader ever makes after the initial page load.

---

## Project Structure

```
calmreader/
├── src/
│   ├── CalmReader.jsx          # Root component — all reading UI
│   ├── main.jsx                # React entry point
│   ├── storage/
│   │   ├── adapter.ts          # StorageAdapter interface
│   │   ├── idb.ts              # IndexedDB implementation
│   │   └── index.ts            # Platform detection, exports adapter
│   ├── lib/
│   │   ├── parser.js           # parseImportedText, buildSegments
│   │   ├── prompts.js          # SOCRATIC_BANK, getPromptForParagraph
│   │   └── terms.js            # TERM_DICTIONARY (X-Ray definitions)
│   └── assets/
│       └── fonts/              # Bundled Literata + Atkinson Hyperlegible
│
├── public/
│   ├── manifest.json           # PWA manifest
│   └── sw.js                   # Service worker (offline support)
│
├── docs/
│   └── screenshots/            # README images
│
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

### Key Design Decisions

**Single-file component architecture.** `CalmReader.jsx` is intentionally large. This is not technical debt — it is a deliberate reflection of the product's philosophy. One text. One session. One file. Splitting it into twenty micro-components would add navigation overhead with no user benefit.

**No state management library.** CalmReader uses only `useState`, `useEffect`, `useMemo`, and `useRef`. The state surface is small enough that Redux or Zustand would be ceremony, not architecture.

**No UI component library.** Every visual element is hand-crafted with inline styles. This keeps the design system tight, makes the palette explicit, and means there are no Tailwind or MUI overrides to fight against.

---

## Roadmap

CalmReader is being developed with the principles of the deployment strategy already in mind. Each platform phase shares the same core — no parallel codebases.

### Now — v1.0
- [x] Paste, file upload, URL import
- [x] Flow Focus (Deep Focus mode)
- [x] Socratic Margin with user-written insights
- [x] X-Ray Clarification
- [x] Wisdom Ledger with search
- [x] Reflection Archive (localStorage-backed)
- [x] Active recall Pause Points
- [x] E-ink-inspired typography system
- [x] PWA manifest

### Next — v1.1
- [ ] Full offline support via service worker
- [ ] IndexedDB migration for larger archives
- [ ] Export archive as Markdown or JSON
- [ ] Custom term definitions (bring your own X-Ray glossary)
- [ ] Dark mode (ink-on-black, not blue-dark)

### Later — v2.0
- [ ] Chrome / Edge extension with one-click "Read in CalmReader"
- [ ] Tauri desktop app (Windows, Mac, Linux) — ~8MB, launches in under 1s
- [ ] Android app via Capacitor
- [ ] iOS app via Capacitor
- [ ] Cross-device sync (optional, end-to-end encrypted, self-hostable)

### Someday — v3.0
- [ ] Expandable X-Ray glossary (domain-specific dictionaries)
- [ ] Spaced repetition surfacing from Reflection Archive
- [ ] Reading session statistics (time, recall score) — opt-in, local only
- [ ] Collaborative margin notes (book clubs)

---

## Contributing

Contributions are welcome. CalmReader is a small, focused project — please keep that spirit in mind when proposing changes.

### Before You Open a PR

- Read the [Philosophy](#philosophy) section. Features that add friction, gamification, or distraction will not be merged — even if they're well-implemented.
- Open an issue first for anything beyond a small bug fix. Discuss the shape of the change before writing code.
- Prefer editing existing files over adding new ones. Prefer simpler over more abstract.

### Development Workflow

```bash
# Fork the repository and clone your fork
git clone https://github.com/yourusername/calmreader.git

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes, then run checks
pnpm check

# Commit with a clear message
git commit -m "feat: add custom glossary support for X-Ray terms"

# Push and open a pull request
git push origin feature/your-feature-name
```

### What We Welcome

- Bug fixes
- Accessibility improvements
- New X-Ray term definitions (edit `src/lib/terms.js`)
- New Socratic prompts (edit `src/lib/prompts.js`)
- Performance improvements
- Documentation improvements
- Platform-specific shell work (extension, desktop, mobile)

### What Belongs in a Fork

- Sync to a cloud service (unless privacy-preserving and opt-in)
- Social features (sharing, public profiles)
- AI-generated summaries or insights
- Gamification of any kind

---

## Acknowledgements

CalmReader draws on ideas from people who thought seriously about attention, typography, and the design of quiet tools:

- **Mark Weiser & John Seely Brown** — [Calm Technology](https://calmtech.com/) (1995)
- **The Braille Institute** — [Atkinson Hyperlegible](https://brailleinstitute.org/freefont) typeface
- **Google Fonts / Type Together** — [Literata](https://fonts.google.com/specimen/Literata) typeface
- **Amber Thomas** and the Readwise team — for proving that serious reading tools have an audience

---

## License

MIT License — see [LICENSE](LICENSE) for details.

You are free to use, modify, and distribute CalmReader. If you build something with it, the only thing we'd ask is that you keep the spirit of the project intact: no dark patterns, no engagement optimization, no noise.

---

<div align="center">

*"A page that disappears is the highest compliment a reading tool can receive."*

**[Try CalmReader →](#)**

</div>
