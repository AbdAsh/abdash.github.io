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
  { name: 'Vue.js', category: 'Frontend', color: '#42B883', icon: '💚' },
  { name: 'React', category: 'Frontend', color: '#61DAFB', icon: '⚛️' },
  { name: 'Svelte', category: 'Frontend', color: '#FF3E00', icon: '🔥' },
  { name: 'Nuxt', category: 'Frontend', color: '#00DC82', icon: '💠' },
  { name: 'Next.js', category: 'Frontend', color: '#fff', icon: '▲' },
  { name: 'TypeScript', category: 'Frontend', color: '#3178C6', icon: '🔷' },
  { name: 'SCSS', category: 'Frontend', color: '#CD6799', icon: '🎨' },
  { name: 'Storybook', category: 'Frontend', color: '#FF4785', icon: '📕' },
  { name: 'Python', category: 'Languages', color: '#3776AB', icon: '🐍' },
  { name: 'JavaScript', category: 'Languages', color: '#F7DF1E', icon: '⚡' },
  { name: 'Java', category: 'Languages', color: '#ED8B00', icon: '☕' },
  { name: 'C/C++', category: 'Languages', color: '#00599C', icon: '⚙️' },
  { name: 'LLMs', category: 'AI/ML', color: '#8B5CF6', icon: '🧠' },
  { name: 'RAG', category: 'AI/ML', color: '#A855F7', icon: '🔗' },
  { name: 'n8n', category: 'AI/ML', color: '#EA4B71', icon: '🔄' },
  { name: 'Agentic AI', category: 'AI/ML', color: '#6366F1', icon: '🤖' },
  { name: 'Prompt Engineering', category: 'AI/ML', color: '#EC4899', icon: '✨' },
  { name: 'Docker', category: 'DevOps', color: '#2496ED', icon: '🐳' },
  { name: 'GitHub Actions', category: 'DevOps', color: '#2088FF', icon: '⚡' },
  { name: 'Nginx', category: 'DevOps', color: '#009639', icon: '🌐' },
  { name: 'Monorepo', category: 'DevOps', color: '#2EC4B6', icon: '📦' },
  { name: 'Supabase', category: 'Backend', color: '#3FCF8E', icon: '💾' },
  { name: 'REST APIs', category: 'Backend', color: '#FF6C37', icon: '🔌' },
  { name: 'React Native', category: 'Mobile', color: '#61DAFB', icon: '📱' },
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
  font-size: 1.8rem;
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
