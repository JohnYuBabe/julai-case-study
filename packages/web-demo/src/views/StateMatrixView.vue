<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BUTTON_STATE_META, type ButtonState, type ButtonView } from '@julai/shared';
import { api, ApiError } from '../api';
import { setIdentity } from '../identity';
import { goDetail } from '../router';

interface Probe {
  state: ButtonState;
  eventId: string;
  identity: string | null;
  viewer: string;
}

/**
 * 每一态都指向一份固定的演示夹具。除访客与队长外，探针身份不在切换器里，
 * 避免有人在别处操作后把这页的状态改掉。
 */
const PROBES: Probe[] = [
  { state: 'CANCELLED', eventId: 'ev-cancelled', identity: null, viewer: '访客' },
  { state: 'FINISHED', eventId: 'ev-finished', identity: null, viewer: '访客' },
  { state: 'MANAGE', eventId: 'ev-open', identity: 'u-organizer', viewer: '队长' },
  { state: 'SIGNED_UP', eventId: 'ev-probe', identity: 'u-probe-signed', viewer: '探针队员' },
  { state: 'WAITLISTED', eventId: 'ev-probe', identity: 'u-probe-queued', viewer: '候补探针' },
  { state: 'CLOSED', eventId: 'ev-closed', identity: null, viewer: '访客' },
  { state: 'JOIN_WAITLIST', eventId: 'ev-probe', identity: 'u-probe-member', viewer: '探针队员' },
  { state: 'SIGNUP_GUEST', eventId: 'ev-open', identity: null, viewer: '访客' },
  { state: 'SIGNUP', eventId: 'ev-open', identity: 'u-probe-member', viewer: '探针队员' },
];

interface Row {
  probe: Probe;
  button: ButtonView | null;
  eventTitle: string | null;
  error: string | null;
}

const rows = ref<Row[]>([]);
const loading = ref(true);

async function load(): Promise<void> {
  loading.value = true;
  rows.value = await Promise.all(
    PROBES.map(async (probe) => {
      try {
        const detail = await api.detail(probe.eventId, probe.identity);
        return {
          probe,
          button: detail.button,
          eventTitle: detail.title,
          error: null,
        };
      } catch (caught) {
        return {
          probe,
          button: null,
          eventTitle: null,
          error:
            caught instanceof ApiError ? caught.message : '这一态加载失败',
        };
      }
    }),
  );
  loading.value = false;
}

onMounted(load);

const mismatches = computed(
  () =>
    rows.value.filter(
      (row) => row.button === null || row.button.state !== row.probe.state,
    ).length,
);

const canOpen = (probe: Probe): boolean =>
  probe.identity === null || probe.identity === 'u-organizer';

function open(row: Row): void {
  if (!canOpen(row.probe)) return;
  setIdentity(row.probe.identity);
  goDetail(row.probe.eventId);
}

const metaOf = (state: ButtonState) => BUTTON_STATE_META[state];
</script>

<template>
  <div class="matrix-view">
    <header class="matrix-head">
      <p class="eyebrow">
        <span class="rule" aria-hidden="true" />
        CONTRACT · 9 STATES
      </p>
      <h1>九种状态，<em>同一份契约</em>。</h1>
      <p class="lede">
        每张卡片都是一次真实的 <code>GET /api/events/:id</code>。上方是契约要求的状态，
        下方是服务端此刻返回的按钮——前端没有参与任何判断。
      </p>
      <div class="precedence" aria-label="状态优先级">
        <span v-for="(item, index) in ['已取消', '已结束', '队长', '已报名', '候补中', '已开始', '已截止', '满员', '可报名']" :key="item">
          {{ item }}
          <b v-if="index < 8" aria-hidden="true">›</b>
        </span>
      </div>
    </header>

    <div v-if="mismatches > 0" class="mismatch-banner" role="status">
      有 {{ mismatches }} 个探针与契约不一致或加载失败：演示数据可能被改动过。重新运行
      <code>pnpm --filter @julai/server prisma:seed</code> 即可恢复。
    </div>

    <div v-if="loading" class="matrix-grid" aria-busy="true">
      <div v-for="index in 9" :key="index" class="matrix-card skeleton">
        <span class="skeleton-line short" />
        <span class="skeleton-button" />
        <span class="skeleton-line" />
        <span class="skeleton-line" />
      </div>
    </div>

    <ul v-else class="matrix-grid">
      <li
        v-for="(row, index) in rows"
        :key="row.probe.state"
        class="matrix-card"
        :class="{
          mismatch:
            row.button !== null && row.button.state !== row.probe.state,
        }"
      >
        <div class="card-head">
          <span class="index">{{ String(index + 1).padStart(2, '0') }}</span>
          <code class="state">{{ row.probe.state }}</code>
          <span
            v-if="row.button"
            class="match"
            :class="{ bad: row.button.state !== row.probe.state }"
          >
            {{ row.button.state === row.probe.state ? '一致' : `实际 ${row.button.state}` }}
          </span>
        </div>

        <div class="preview">
          <span
            class="preview-button"
            :class="row.button ? `variant-${row.button.variant}` : 'variant-disabled'"
          >
            {{ row.button?.label ?? '—' }}
          </span>
        </div>

        <p class="desc">{{ metaOf(row.probe.state).description }}</p>

        <div class="card-foot">
          <span class="source">
            <template v-if="row.error">{{ row.error }}</template>
            <template v-else>
              {{ row.eventTitle }} · {{ row.probe.viewer }}
            </template>
          </span>
          <button
            v-if="canOpen(row.probe)"
            type="button"
            class="open-link"
            @click="open(row)"
          >
            打开 →
          </button>
        </div>
      </li>
    </ul>

    <p class="footnote">
      状态名与说明来自 <code>@julai/shared</code> 的
      <code>BUTTON_STATE_META</code>；按钮文案、样式与动作来自服务端响应。
      探针夹具不参与身份切换，避免被其他页面的操作改写。
    </p>
  </div>
</template>

<style scoped>
.matrix-view {
  padding: 48px 0 0;
}

.matrix-head {
  max-width: 760px;
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
  font-size: clamp(34px, 4.6vw, 50px);
  font-weight: 600;
  line-height: 1.16;
  letter-spacing: -0.02em;
}

h1 em {
  color: var(--accent-strong);
  font-style: normal;
}

.lede {
  max-width: 36em;
  margin: 18px 0 0;
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

.precedence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 22px;
  color: var(--muted);
  font-size: 12px;
}

.precedence span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.precedence b {
  color: var(--line-strong);
  font-weight: 400;
}

.mismatch-banner {
  margin-top: 24px;
  padding: 12px 16px;
  border: 1px solid #eccbc2;
  border-radius: 12px;
  background: #fdf7f5;
  color: #8d3a2b;
  font-size: 13px;
}

.mismatch-banner code {
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.matrix-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
}

.matrix-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}

.matrix-card.mismatch {
  border-color: #eccbc2;
  background: #fdf9f7;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.index {
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.state {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 600;
}

.match {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e7f3ec;
  color: #0f6a4c;
  font-size: 10px;
  font-weight: 600;
}

.match.bad {
  background: #f8e9e5;
  color: #a13c2c;
}

.preview {
  padding: 6px 0;
}

.preview-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 11px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.variant-primary {
  background: var(--accent);
  color: #fffdf6;
}

.variant-ghost {
  border-color: var(--line-strong);
  color: var(--ink);
}

.variant-disabled {
  border-color: var(--line);
  background: var(--surface-muted);
  color: var(--muted);
}

.desc {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.source {
  color: var(--muted-soft);
  font-size: 11px;
  line-height: 1.5;
}

.open-link {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.open-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footnote {
  margin: 28px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  color: var(--muted-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.footnote code {
  font-family: var(--font-mono);
  font-size: 0.95em;
}

.skeleton {
  min-height: 214px;
}

.skeleton-line,
.skeleton-button {
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
  width: 34%;
}

.skeleton-button {
  height: 44px;
  border-radius: 11px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 960px) {
  .matrix-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .matrix-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-button {
    animation: none;
  }
}
</style>
