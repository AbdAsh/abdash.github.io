<template>
  <div class="skills-wrapper" ref="wrapperRef">
    <div class="skills-filter">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter technologies..."
        class="filter-input"
        aria-label="Filter skills"
      />
      <div class="category-pills">
        <button
          v-for="cat in categories"
          :key="cat"
          :class="['pill', { active: activeCategory === cat }]"
          @click="activeCategory = activeCategory === cat ? 'All' : cat"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <TransitionGroup name="skill" tag="div" class="skills-grid">
      <div
        v-for="skill in filteredSkills"
        :key="skill.name"
        class="skill-card glass-card"
        :style="{ '--accent': skill.color }"
      >
        <div class="skill-icon" v-html="skill.icon"></div>
        <span class="skill-name">{{ skill.name }}</span>
        <span class="skill-category">{{ skill.category }}</span>
      </div>
    </TransitionGroup>

    <div class="vue-showcase">
      <div class="feature-card">
        <code class="feature-name">v-model</code>
        <span class="feature-desc">Two-way binding — filter input reactively updates the grid</span>
      </div>
      <div class="feature-card">
        <code class="feature-name">&lt;TransitionGroup&gt;</code>
        <span class="feature-desc">Smooth reorder animation when filtering skills</span>
      </div>
      <div class="feature-card">
        <code class="feature-name">computed()</code>
        <span class="feature-desc">Derived filtered list recalculates automatically</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface Skill {
  name: string;
  category: string;
  color: string;
  icon: string;
}

const skills: Skill[] = [
  { name: 'Vue.js', category: 'Frontend', color: '#42B883', icon: '<svg width="28" height="28" viewBox="0 0 261 226" fill="none"><path d="M161 3.3L130.5 56 100 3.3H0l130.5 222L261 3.3z" fill="#42B883"/><path d="M161 3.3L130.5 56 100 3.3H52l78.5 134.5L209 3.3z" fill="#35495E"/></svg>' },
  { name: 'React', category: 'Frontend', color: '#61DAFB', icon: '<svg width="28" height="28" viewBox="0 0 512 512"><circle cx="256" cy="256" r="36" fill="#61DAFB"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none" transform="rotate(60 256 256)"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none" transform="rotate(120 256 256)"/></svg>' },
  { name: 'Svelte', category: 'Frontend', color: '#FF3E00', icon: '<svg width="28" height="28" viewBox="0 0 98 118"><path d="M90 15c-12-11-32-9-43 3L22 47c-3 3-5 7-6 11-1 5 0 10 3 14-2 3-4 7-4 11 0 6 2 12 6 16 12 11 32 9 43-3l25-29c3-3 5-7 6-11 1-5 0-10-3-14 2-3 4-7 4-11 0-6-2-12-6-16z" fill="#FF3E00"/><path d="M40 103c-7-2-12-7-14-13 0-1 0-2 1-3l1-2 1-1 2-2 25-29 2-2 2-1c6-3 14-2 19 3 2 3 4 6 4 10 0 2-1 4-2 5l-1 2-1 1-1 2-25 29-3 2-2 1c-3 1-6 1-8 0z" fill="#fff"/></svg>' },
  { name: 'Nuxt', category: 'Frontend', color: '#00DC82', icon: '<svg width="28" height="28" viewBox="0 0 400 400"><path d="M227 339H51L176 124z" fill="#00DC82"/><path d="M292 339h57L237 124l-54 93 55 95z" fill="#00DC82" opacity=".6"/></svg>' },
  { name: 'Next.js', category: 'Frontend', color: '#fff', icon: '<svg width="28" height="28" viewBox="0 0 180 180"><mask id="a" maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180"><circle cx="90" cy="90" r="90" fill="#fff"/></mask><g mask="url(#a)"><circle cx="90" cy="90" r="90" fill="#000" stroke="#fff" stroke-width="6"/><path d="M149.5 157L75 65v50h10V80l64 82z" fill="url(#b)"/><defs><linearGradient id="b" x1="109" y1="116" x2="144" y2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs></g></svg>' },
  { name: 'TypeScript', category: 'Frontend', color: '#3178C6', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><rect width="128" height="128" rx="10" fill="#3178C6"/><path d="M72 68v-8H40v8h11v36h10V68zM92 60c-5 0-9 2-11 5-2 2-3 5-3 9 0 3 1 6 3 8 2 3 5 4 10 6 4 1 6 2 7 3s2 3 2 5c0 2-1 3-2 4-1 2-3 2-6 2-4 0-8-2-11-5v9c3 3 7 4 11 4 5 0 9-1 12-4 2-3 4-6 4-10 0-4-1-7-3-9-2-3-5-4-10-6-3-1-5-2-7-3-1-1-2-3-2-5s1-3 2-4c1-1 3-2 5-2 4 0 7 1 10 4v-9c-3-2-7-3-11-3z" fill="#fff"/></svg>' },
  { name: 'SCSS', category: 'Frontend', color: '#CD6799', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><circle cx="64" cy="64" r="60" fill="#CD6799"/><path d="M97 54c-1-8-7-12-14-14 1-4 1-7 0-10-2-6-8-6-14-3l-5 3C61 29 57 28 54 28c-12 0-20 9-22 18h1c2-8 9-16 21-16 3 0 6 1 9 2l-7 5c-7 5-14 10-14 18 0 4 3 7 6 8 5 2 10 0 14-4 2-2 4-5 5-8l5-2c-1 5-1 10 3 14 3 3 7 3 10 2 6-2 11-8 12-15zM65 80c-3 3-7 5-10 3-2-1-3-3-2-6 1-5 6-9 11-13l5-4c0 1 0 2-1 4-1 6-2 10-4 15z" fill="#fff"/></svg>' },
  { name: 'Storybook', category: 'Frontend', color: '#FF4785', icon: '<svg width="28" height="28" viewBox="0 0 64 64"><rect width="48" height="56" x="10" y="4" rx="4" fill="#FF4785"/><path d="M38 12l1-8 3 0-1 8zM22 30c0-3 0-5 12-5s12 2 12 5c0 4-3 6-6 7 3 1 5 3 5 7 0 4-4 7-11 7-8 0-12-3-12-7h6c0 2 2 3 6 3s5-1 5-3-2-3-5-3h-3v-4h3c3 0 5-1 5-3s-2-3-5-3-6 0-6 2h-6z" fill="#fff"/></svg>' },
  { name: 'Python', category: 'Languages', color: '#3776AB', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><path d="M64 8C47 8 39 15 39 25v13h26v4H29C18 42 9 50 9 67s8 24 18 24h12V78c0-12 10-22 22-22h25c10 0 18-8 18-18V25C104 15 96 8 78 8zm-14 10c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7z" fill="#3776AB"/><path d="M64 120c17 0 25-7 25-17V90H63v-4h36c11 0 20-8 20-25s-8-24-18-24H89v13c0 12-10 22-22 22H42c-10 0-18 8-18 18v13c0 10 8 17 22 17zm14-10c-4 0-7-3-7-7s3-7 7-7 7 3 7 7-3 7-7 7z" fill="#FFD43B"/></svg>' },
  { name: 'JavaScript', category: 'Languages', color: '#F7DF1E', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><rect width="128" height="128" fill="#F7DF1E"/><path d="M34 106l9-5c2 3 3 6 7 6 3 0 6-2 6-6V64h11v37c0 10-6 15-14 15-8 0-12-4-15-9zM78 105l9-5c2 4 5 7 11 7 4 0 7-2 7-5 0-4-3-5-8-7l-3-1c-8-3-13-8-13-16 0-8 6-14 16-14 7 0 12 2 15 8l-8 5c-2-3-4-5-7-5-3 0-5 2-5 5 0 3 2 4 7 6l3 1c9 4 14 8 14 17 0 10-8 15-18 15-10 0-17-5-20-11z" fill="#000"/></svg>' },
  { name: 'Java', category: 'Languages', color: '#ED8B00', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><path d="M47 96s-4 2 3 3c8 1 12 1 21-1 0 0 2 1 5 3-19 8-43-1-29-5zM44 83s-5 3 3 4c10 1 15 1 27-2 0 0 2 2 4 3-23 7-49 1-34-5z" fill="#ED8B00"/><path d="M67 60c5-6-1-11-1-11s13 7 7 15c-5 8-9 12 13 25 0 0-34-9-19-29z" fill="#ED8B00"/><path d="M97 106s3 3-4 5c-12 3-50 4-61 0-4-1 4-4 6-4 2-1 3-1 3-1-4-3-24 5-10 7 38 7 69-3 66-7zM49 69s-17 4-6 5c5 1 14 1 23-1 7-1 15-2 15-2l-5 3c-19 5-55 3-45-2 9-4 18-3 18-3zM88 93c19-10 10-20 4-18-1 0-2 1-2 1s1-1 2-2c12-4 22 12-4 19 0 0 0-1 0 0z" fill="#ED8B00"/><path d="M73 2s11 11-10 28c-17 14-4 21 0 30-10-9-18-17-13-25C57 24 77 15 73 2z" fill="#ED8B00"/></svg>' },
  { name: 'C/C++', category: 'Languages', color: '#00599C', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><path d="M115 56c0-2-1-3-2-4L70 24c-2-1-5-1-7 0L20 52c-2 1-3 3-3 5v56c0 2 1 4 3 5l43 28c1 0 2 1 3 1s2 0 3-1l43-28c2-1 3-3 3-5z" fill="#00599C"/><path d="M64 90c-14 0-26-12-26-26s12-26 26-26c8 0 16 4 21 10l-10 7c-3-4-7-6-11-6-8 0-15 7-15 15s7 15 15 15c5 0 9-2 12-7l10 6c-5 8-13 12-22 12z" fill="#fff"/><path d="M93 72h-3v-3h-4v3h-3v4h3v3h4v-3h3zM109 72h-3v-3h-4v3h-3v4h3v3h4v-3h3z" fill="#fff"/></svg>' },
  { name: 'LLMs', category: 'AI/ML', color: '#8B5CF6', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.5"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M12 7v0m-3 5c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3m0 0v4"/><circle cx="8" cy="9" r="1" fill="#8B5CF6"/><circle cx="16" cy="9" r="1" fill="#8B5CF6"/></svg>' },
  { name: 'RAG', category: 'AI/ML', color: '#A855F7', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="1.5"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8.5 7.5L10.5 16M15.5 7.5L13.5 16M7.5 8.5L16.5 8.5"/></svg>' },
  { name: 'n8n', category: 'AI/ML', color: '#EA4B71', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="2" y="8" width="8" height="8" rx="2" stroke="#EA4B71" stroke-width="1.5"/><rect x="14" y="8" width="8" height="8" rx="2" stroke="#EA4B71" stroke-width="1.5"/><path d="M10 12h4" stroke="#EA4B71" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="#EA4B71"/></svg>' },
  { name: 'Agentic AI', category: 'AI/ML', color: '#6366F1', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.5"><rect x="6" y="3" width="12" height="16" rx="2"/><circle cx="10" cy="9" r="1.5" fill="#6366F1" stroke="none"/><circle cx="14" cy="9" r="1.5" fill="#6366F1" stroke="none"/><path d="M9 14h6M8 19v2M16 19v2"/></svg>' },
  { name: 'Prompt Engineering', category: 'AI/ML', color: '#EC4899', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 21 12 16.5 5.8 21l2.4-7.1L2 9.4h7.6z" fill="none"/></svg>' },
  { name: 'Docker', category: 'DevOps', color: '#2496ED', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><path d="M124 52c-2-2-7-3-12-2-1-5-4-9-8-12l-2-1-1 2c-2 3-3 7-3 11 0 4 1 7 3 10-2 1-3 2-6 2H5l-1 3c-1 6-1 12 1 18 2 5 5 10 9 13 5 4 12 6 19 6 18 0 33-8 44-26 5 0 11-1 14-5 2-3 3-6 4-9l0-1h-1zM29 56h-9c-1 0-1 0-1 1v8c0 1 0 1 1 1h9c1 0 1 0 1-1v-8c0-1 0-1-1-1zM44 56h-9c-1 0-1 0-1 1v8c0 1 0 1 1 1h9c1 0 1 0 1-1v-8c0-1 0-1-1-1zM59 56h-9c-1 0-1 0-1 1v8c0 1 0 1 1 1h9c1 0 1 0 1-1v-8c0-1 0-1-1-1zM73 56h-9c0 0-1 0-1 1v8c0 1 1 1 1 1h9c1 0 1 0 1-1v-8c0-1 0-1-1-1zM44 42h-9c-1 0-1 1-1 1v8c0 1 0 1 1 1h9c1 0 1 0 1-1v-8c0 0 0-1-1-1zM59 42h-9c-1 0-1 1-1 1v8c0 1 0 1 1 1h9c1 0 1 0 1-1v-8c0 0 0-1-1-1zM73 42h-9c0 0-1 1-1 1v8c0 1 1 1 1 1h9c1 0 1 0 1-1v-8c0 0 0-1-1-1zM73 28h-9c0 0-1 0-1 1v8c0 1 1 1 1 1h9c1 0 1 0 1-1v-8c0-1 0-1-1-1z" fill="#2496ED"/></svg>' },
  { name: 'GitHub Actions', category: 'DevOps', color: '#2088FF', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#2088FF"><path d="M12 1C5.4 1 0 6.4 0 13a12 12 0 008.2 11.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11 11 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0024 13C24 6.4 18.6 1 12 1z"/></svg>' },
  { name: 'Nginx', category: 'DevOps', color: '#009639', icon: '<svg width="28" height="28" viewBox="0 0 128 128"><path d="M64 3L10 34v60l54 31 54-31V34zm22 88c0 4-3 6-6 6s-5-1-7-4L52 59v32c0 4-2 6-6 6-3 0-6-2-6-6V37c0-4 3-6 6-6 3 0 5 1 7 4l21 34V37c0-4 2-6 6-6 3 0 6 2 6 6z" fill="#009639"/></svg>' },
  { name: 'Monorepo', category: 'DevOps', color: '#2EC4B6', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="8.5" y="14" width="7" height="7" rx="1"/><path d="M6.5 10v2.5a1 1 0 001 1H12m5-3.5v2.5a1 1 0 01-1 1H12m0 0v1.5"/></svg>' },
  { name: 'Supabase', category: 'Backend', color: '#3FCF8E', icon: '<svg width="28" height="28" viewBox="0 0 109 113"><path d="M63 110c-2 3-7 1-7-3V68H5C1 68-1 63 1 60L46 3c2-3 7-1 7 3v39h51c4 0 6 5 4 8z" fill="#3FCF8E"/><path d="M63 110c-2 3-7 1-7-3V68H5C1 68-1 63 1 60L46 3c2-3 7-1 7 3v39h51c4 0 6 5 4 8z" fill="url(#sb)" fill-opacity=".2"/><defs><linearGradient id="sb" x1="53" y1="54" x2="94" y2="72" gradientUnits="userSpaceOnUse"><stop stop-color="#249361"/><stop offset="1" stop-color="#3FCF8E" stop-opacity="0"/></linearGradient></defs></svg>' },
  { name: 'REST APIs', category: 'Backend', color: '#FF6C37', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6C37" stroke-width="1.5"><path d="M4 6h16M4 12h16M4 18h8"/><circle cx="20" cy="18" r="2" fill="#FF6C37" stroke="none"/><circle cx="20" cy="12" r="2" fill="#FF6C37" stroke="none"/></svg>' },
  { name: 'React Native', category: 'Mobile', color: '#61DAFB', icon: '<svg width="28" height="28" viewBox="0 0 512 512"><circle cx="256" cy="256" r="36" fill="#61DAFB"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none" transform="rotate(60 256 256)"/><ellipse cx="256" cy="256" rx="210" ry="80" stroke="#61DAFB" stroke-width="14" fill="none" transform="rotate(120 256 256)"/></svg>' },
];

const searchQuery = ref('');
const activeCategory = ref('All');
const wrapperRef = ref<HTMLElement | null>(null);

const categories = ['All', 'Frontend', 'Languages', 'AI/ML', 'DevOps', 'Backend', 'Mobile'];

const filteredSkills = computed(() => {
  return skills.filter((s) => {
    const matchCategory = activeCategory.value === 'All' || s.category === activeCategory.value;
    const matchSearch = s.name.toLowerCase().includes(searchQuery.value.toLowerCase());
    return matchCategory && matchSearch;
  });
});

onMounted(() => {
  console.log(`[Vue] SkillsGrid mounted — ${skills.length} skills loaded`);
});

onUnmounted(() => {
  console.log('[Vue] SkillsGrid unmounted');
});
</script>

<style scoped>
.skills-wrapper {
  width: 100%;
}

.skills-filter {
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-input {
  width: 100%;
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid rgba(66, 184, 131, 0.2);
  background: rgba(255, 255, 255, 0.03);
  color: #E8EDF2;
  font-family: 'Inter', sans-serif;
  font-size: 0.95rem;
  outline: none;
  transition: all 0.3s;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.filter-input:focus {
  border-color: #42B883;
  box-shadow: 0 0 20px rgba(66, 184, 131, 0.15);
}

.filter-input::placeholder {
  color: #A0A4A8;
}

.category-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
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

.pill:hover {
  border-color: rgba(66, 184, 131, 0.4);
  color: #E8EDF2;
}

.pill.active {
  background: rgba(66, 184, 131, 0.15);
  border-color: #42B883;
  color: #42B883;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.skill-card {
  padding: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-color: rgba(255, 255, 255, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.skill-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 25px color-mix(in srgb, var(--accent) 15%, transparent);
}

.skill-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: #E8EDF2;
}

.skill-category {
  font-size: 0.65rem;
  color: #A0A4A8;
  font-family: 'JetBrains Mono', monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* TransitionGroup animations */
.skill-enter-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.skill-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
}

.skill-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(20px);
}

.skill-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.skill-move {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.vue-showcase {
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.feature-card {
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(66, 184, 131, 0.05);
  border: 1px solid rgba(66, 184, 131, 0.12);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feature-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #42B883;
}

.feature-desc {
  font-size: 0.75rem;
  color: #A0A4A8;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .skills-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}
</style>
