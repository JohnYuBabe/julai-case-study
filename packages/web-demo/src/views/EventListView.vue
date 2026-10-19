<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError, type EventSummary } from '../api';
import { identity, identityOption } from '../identity';
import { goStates } from '../router';
import { showToast } from '../toast';
import EventCard from '../components/EventCard.vue';

const events = ref<EventSummary[]>([]);
const viewerName = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

let requestId = 0;

async function load(): Promise<void> {
  const current = ++requestId;
  loading.value = true;
  error.value = null;
  // 身份刚切换时，旧响应里的名字不能继续挂在新身份后面。
  viewerName.value = null;

  try {
    const data = await api.list(identity.value);
    if (current !== requestId) return;
    events.value = data.events;
    viewerName.value = data.viewer?.name ?? null;
  } catch (caught) {
    if (current !== requestId) return;
    error.value =
      caught instanceof ApiError ? caught.message : '加载失败，请稍后重试。';
  } finally {
    if (current === requestId) loading.value = false;
  }
}

watch(identity, load, { immediate: true });

const openCount = computed(
  () => events.value.filter((event) => event.status === 'OPEN').length,
);

const currentViewerLabel = computed(() => identityOption.value.label);

function retry(): void {
  showToast('正在重新加载活动列表…', 'info');
  void load();
}
</script>

<template>
  <div class="list-view">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="rule" aria-hidden="true" />
          CASE STUDY · 报名状态
        </p>
        <h1>九种按钮状态，<br /><em>只判定一次</em>。</h1>
        <p class="lede">
          活动时间、名额与我的报名记录，在服务端合成为一个完整的
          <code>ButtonView</code>。前端只渲染，不猜。
        </p>
        <div class="hero-actions">
          <a class="primary-link" href="#/states" @click.prevent="goStates">
            打开 9 态矩阵
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M4 10h11m0 0-4-4m4 4-4 4"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>
          <span class="hero-note">右上角可切换演示身份</span>
        </div>
      </div>

      <aside class="hero-card" aria-label="ButtonView 示例">
        <div class="hero-card-head">
          <span class="mono">GET /api/events/:id</span>
          <span class="pill">ButtonView</span>
        </div>
        <pre><code>{
  "state": "SIGNED_UP",
  "label": "已报名 · 取消报名",
  "variant": "ghost",
  "action": "cancel_signup",
  "confirm": true
}</code></pre>
        <p class="hero-card-foot">
          按钮文案、是否置灰、点哪个接口，全在这里。
        </p>
      </aside>
    </section>

    <section class="stats" aria-label="案例概览">
      <div class="stat">
        <span class="stat-value">{{ events.length || '—' }}</span>
        <span class="stat-label">场演示活动</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ openCount || '—' }}</span>
        <span class="stat-label">场处于报名期</span>
      </div>
      <div class="stat">
        <span class="stat-value">9</span>
        <span class="stat-label">种按钮状态</span>
      </div>
      <div class="stat">
        <span class="stat-value">0</span>
        <span class="stat-label">个状态推进定时任务</span>
      </div>
    </section>

    <section class="list-section">
      <div class="section-head">
        <div>
          <h2>活动</h2>
          <p>状态由服务端按当前时间推导，列表里没有存过 phase。</p>
        </div>
        <span class="viewer-chip">
          当前身份：<strong>{{ currentViewerLabel }}</strong>
          <template v-if="viewerName && viewerName !== currentViewerLabel">
            · {{ viewerName }}
          </template>
        </span>
      </div>

      <div v-if="loading" class="grid" aria-busy="true" aria-label="正在加载活动">
        <div v-for="index in 3" :key="index" class="skeleton-card">
          <span class="skeleton-line short" />
          <span class="skeleton-line title" />
          <span class="skeleton-line" />
          <span class="skeleton-line" />
          <span class="skeleton-meter" />
        </div>
      </div>

      <div v-else-if="error" class="state-box is-error">
        <h3>没能加载活动</h3>
        <p>{{ error }}</p>
        <button type="button" class="text-button" @click="retry">重试</button>
      </div>

      <div v-else-if="events.length === 0" class="state-box">
        <h3>还没有活动</h3>
        <p>先运行 <code>pnpm --filter @julai/server prisma:seed</code> 写入演示数据。</p>
      </div>

      <div v-else class="grid">
        <EventCard
          v-for="(event, index) in events"
          :key="event.id"
          :event="event"
          :index="index"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 48px;
  align-items: center;
  padding: 56px 0 40px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.rule {
  width: 28px;
  height: 1px;
  background: var(--accent);
}

h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(38px, 5vw, 56px);
  font-weight: 600;
  line-height: 1.14;
  letter-spacing: -0.02em;
}

h1 em {
  color: var(--accent-strong);
  font-style: normal;
}

.lede {
  max-width: 34em;
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.75;
}

.lede code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-muted);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.88em;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 28px;
}

.primary-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border-radius: 11px;
  background: var(--accent);
  color: #fffdf6;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 160ms ease;
}

.primary-link:hover {
  background: var(--accent-strong);
}

.primary-link:focus-visible {
  outline: 3px solid var(--accent-ring);
  outline-offset: 2px;
}

.primary-link svg {
  width: 18px;
  height: 18px;
}

.hero-note {
  color: var(--muted-soft);
  font-size: 12px;
}

.hero-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #1f2a23;
  box-shadow: 0 26px 60px -42px rgba(16, 32, 24, 0.9);
  transform: rotate(0.6deg);
}

.hero-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px 12px;
}

.hero-card-head .mono {
  color: rgba(239, 236, 226, 0.56);
  font-family: var(--font-mono);
  font-size: 11px;
}

.pill {
  padding: 3px 9px;
  border: 1px solid rgba(198, 227, 212, 0.3);
  border-radius: 999px;
  color: #a9d8bf;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

pre code {
  color: #d9e8dd;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.75;
}

.hero-card-foot {
  margin: 12px 4px 2px;
  color: rgba(239, 236, 226, 0.56);
  font-size: 11.5px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 22px;
}

.stat + .stat {
  border-left: 1px solid var(--line);
}

.stat-value {
  font-family: var(--font-serif);
  font-size: 26px;
  line-height: 1;
}

.stat-label {
  color: var(--muted);
  font-size: 12px;
}

.list-section {
  padding: 44px 0 0;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
}

.section-head h2 {
  margin: 0 0 5px;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
}

.section-head p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.viewer-chip {
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.viewer-chip strong {
  color: var(--ink);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.skeleton-line,
.skeleton-meter {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--surface-muted) 20%,
    #f1eee6 50%,
    var(--surface-muted) 80%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}

.skeleton-line.short {
  width: 30%;
}

.skeleton-line.title {
  width: 70%;
  height: 20px;
}

.skeleton-meter {
  height: 6px;
  margin-top: 8px;
}

.state-box {
  padding: 44px 24px;
  border: 1px dashed var(--line-strong);
  border-radius: 18px;
  text-align: center;
}

.state-box h3 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 20px;
}

.state-box p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.state-box.is-error {
  border-color: #eccbc2;
  background: #fdf7f5;
}

.state-box code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.text-button {
  margin-top: 16px;
  padding: 8px 16px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 30px;
    padding-top: 36px;
  }

  .hero-card {
    transform: none;
  }

  .stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .stat:nth-child(4) {
    border-top: 1px solid var(--line);
  }
}

@media (max-width: 600px) {
  .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-actions {
    flex-wrap: wrap;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-meter {
    animation: none;
  }
}
</style>
