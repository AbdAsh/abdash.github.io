# abdash.net — Personal Portfolio

Source for [abdash.net](https://abdash.net), the personal portfolio of **Abdulrahman Mahmutoglu** — Senior Frontend & AI Engineer.

Built with [Astro](https://astro.build) as the static site framework, with interactive islands powered by React, Vue, and Svelte.

## ✨ Sections

- **Hero** — intro with availability badge
- **Experience** — animated timeline (React island)
- **Projects** — filterable showcase (Svelte island)
- **Skills** — grid with proficiency indicators (Vue island)
- **AI** — AI & automation project highlights
- **About / Contact** — bio and contact form

## 🗂 Project Structure

```text
src/
├── components/
│   ├── islands/
│   │   ├── ExperienceTimeline.tsx   # React
│   │   ├── ProjectsShowcase.svelte  # Svelte
│   │   └── SkillsGrid.vue           # Vue
│   └── *.astro                      # Static Astro components
├── layouts/
│   └── MainLayout.astro
├── pages/
│   └── index.astro
└── styles/
    └── global.css
```

## 🧞 Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start local dev server at `localhost:4321`  |
| `npm run build`   | Build production site to `./dist/`          |
| `npm run preview` | Preview build locally before deploying      |

## 🛠 Tech Stack

- **Astro** — static site generation with island architecture
- **React** — experience timeline component
- **Vue 3** — skills grid component
- **Svelte 5** — projects showcase component
- **TypeScript** — throughout
- **GitHub Pages** — hosting via `abdash.net` custom domain
