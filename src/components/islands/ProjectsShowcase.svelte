<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';

  interface Project {
    title: string;
    description: string;
    tech: string[];
    category: string;
    icon: string;
    link?: string;
  }

  const projects: Project[] = [
    {
      title: 'AI Business Plan Generator',
      description: 'Full agentic AI system for automated business plan creation with document segmentation, RAG pipelines, and multi-agent orchestration via n8n.',
      tech: ['LLMs', 'RAG', 'n8n', 'MCP', 'Webhooks'],
      category: 'AI',
      icon: '🧠',
    },
    {
      title: 'CourseFox — AI Learning Platform',
      description: 'Mobile learning app with cooperating AI agents for content generation, flashcard creation, and knowledge retrieval via MCP tools.',
      tech: ['React Native', 'Supabase', 'AI Agents', 'MCP'],
      category: 'AI',
      icon: '🦊',
    },
    {
      title: 'UI Component Library (Monorepo)',
      description: 'Enterprise-grade NPM libraries of UI components with CI/CD using Lerna & Nx, Storybook documentation, and multi-framework support.',
      tech: ['Vue 2/3', 'Storybook', 'Lerna', 'Nx', 'SCSS'],
      category: 'Frontend',
      icon: '📦',
    },
    {
      title: 'E-Voting Blockchain System',
      description: 'Solidity smart contract for online elections, tested on Ganache (Ethereum) and Moonbeam (Polkadot) with a Vue.js + DrizzleJS frontend.',
      tech: ['Solidity', 'Vue.js', 'Truffle', 'Blockchain'],
      category: 'Fullstack',
      icon: '🗳️',
    },
    {
      title: 'Microfrontend Code Generator',
      description: 'Automated frontend code generation using Microfrontends, Mako Templates, and Python to improve development speed and efficiency.',
      tech: ['Python', 'Mako', 'Microfrontends'],
      category: 'Frontend',
      icon: '⚙️',
    },
    {
      title: 'Restaurant Management App',
      description: 'Interactive restaurant management web app using React.js, Firebase NoSQL database, and Stripe API for payments.',
      tech: ['React.js', 'Firebase', 'Stripe'],
      category: 'Fullstack',
      icon: '🍽️',
    },
  ];

  const categories = ['All', ...new Set(projects.map(p => p.category))];
  let activeFilter = $state('All');
  let hoveredIndex = $state(-1);

  const scale = tweened(1, { duration: 200, easing: cubicOut });

  let filteredProjects = $derived(
    activeFilter === 'All'
      ? projects
      : projects.filter(p => p.category === activeFilter)
  );

  function handleHover(index: number) {
    hoveredIndex = index;
    scale.set(1.02);
  }

  function handleLeave() {
    hoveredIndex = -1;
    scale.set(1);
  }
</script>

<div class="projects-wrapper">
  <div class="filter-bar">
    {#each categories as cat}
      <button
        class="filter-pill"
        class:active={activeFilter === cat}
        onclick={() => activeFilter = cat}
      >
        {cat}
      </button>
    {/each}
  </div>

  <div class="projects-grid">
    {#each filteredProjects as project, i (project.title)}
      <div
        class="project-card"
        role="article"
        onmouseenter={() => handleHover(i)}
        onmouseleave={handleLeave}
        style="transform: scale({hoveredIndex === i ? $scale : 1})"
        animate:flip={{ duration: 350 }}
      >
        <div class="project-icon">{project.icon}</div>
        <h3 class="project-title">{project.title}</h3>
        <p class="project-desc">{project.description}</p>
        <div class="project-tags">
          {#each project.tech as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
        <span class="project-category">{project.category}</span>
      </div>
    {/each}
  </div>

  <div class="svelte-showcase">
    <div class="feature-card">
      <code class="feature-name">tweened()</code>
      <span class="feature-desc">Svelte motion store — smooth card hover scaling</span>
    </div>
    <div class="feature-card">
      <code class="feature-name">animate:flip</code>
      <span class="feature-desc">Automatic layout transition when filtering projects</span>
    </div>
    <div class="feature-card">
      <code class="feature-name">$derived</code>
      <span class="feature-desc">Reactive declarations — filtered list recalculates automatically</span>
    </div>
  </div>
</div>

<style>
  .projects-wrapper {
    width: 100%;
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 32px;
  }

  .filter-pill {
    padding: 6px 16px;
    border-radius: 100px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: #A0A4A8;
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-pill:hover {
    border-color: rgba(255, 62, 0, 0.4);
    color: #E8EDF2;
  }

  .filter-pill.active {
    background: rgba(255, 62, 0, 0.12);
    border-color: #FF3E00;
    color: #FF3E00;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 20px;
  }

  .project-card {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 24px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: default;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .project-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 62, 0, 0.2);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 30px rgba(255, 62, 0, 0.08);
  }

  .project-icon {
    font-size: 2rem;
  }

  .project-title {
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 1.15rem;
    color: #fff;
    margin: 0;
  }

  .project-desc {
    color: #A0A4A8;
    font-size: 0.88rem;
    line-height: 1.6;
    margin: 0;
  }

  .project-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .tag {
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
    background: rgba(255, 62, 0, 0.08);
    color: #FF7A47;
    border: 1px solid rgba(255, 62, 0, 0.15);
  }

  .project-category {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.25);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: 'JetBrains Mono', monospace;
    margin-top: auto;
  }

  .svelte-showcase {
    margin-top: 32px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .feature-card {
    padding: 12px 16px;
    border-radius: 10px;
    background: rgba(255, 62, 0, 0.05);
    border: 1px solid rgba(255, 62, 0, 0.12);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .feature-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #FF3E00;
  }

  .feature-desc {
    font-size: 0.75rem;
    color: #A0A4A8;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .projects-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
