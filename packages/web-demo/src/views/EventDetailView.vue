<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BUTTON_STATE_META } from '@julai/shared';
import { api, ApiError, type EventDetail } from '../api';
import { askConfirm, settleConfirm } from '../confirm';
import { identity, identityOption } from '../identity';
import { formatDateWithTime, formatDateTime, formatRange } from '../format';
import { goList } from '../router';
import { showToast } from '../toast';
import ActionButton from '../components/ActionButton.vue';
import StatusBadge from '../components/StatusBadge.vue';

const props = defineProps<{ eventId: string }>();

const detail = ref<EventDetail | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref<{ code: string; message: string } | null>(null);

let requestId = 0;
let disposed = false;

async function load(): Promise<void> {
  const current = ++requestId;
  loading.value = true;
  error.value = null;

  try {
    const data = await api.detail(props.eventId, identity.value);
    if (current !== requestId) return;
    detail.value = data;
  } catch (caught) {
    if (current !== requestId) return;
    detail.value = null;
    error.value =
      caught instanceof ApiError
        ? { code: caught.code, message: caught.message }
        : { code: 'UNKNOWN', message: '加载失败，请稍后重试。' };
  } finally {
    if (current === requestId) loading.value = false;
  }
}

watch([() => props.eventId, identity], load, { immediate: true });

// 浏览器后退等操作可能在确认框打开时卸载本视图；把挂起的确认按「取消」处理，
// 避免用户切走后又点确认，写入另一场（或另一个身份）的活动。
onBeforeUnmount(() => {
  disposed = true;
  settleConfirm(false);
});

const meta = computed(() =>
  detail.value ? BUTTON_STATE_META[detail.value.button.state] : null,
);

const viewerLabel = computed(() => detail.value?.viewer?.name ?? '访客');

const avatar = computed(() => {
  const option = identityOption.value;
  if (option.id === null) return '访';
  if (option.id === 'u-organizer') return '队';
  return option.label.match(/\d+/)?.[0] ?? '员';
});

const registrationText = computed(() => {
  const registration = detail.value?.registration;
  if (!registration || registration.status === 'CANCELLED') {
    return '没有报名记录';
  }
  if (registration.status === 'CONFIRMED') return '已确认报名';
  return registration.waitlistRank
    ? `候补中 · 第 ${registration.waitlistRank} 位`
    : '候补中';
});

const ENDPOINTS: Record<NonNullable<EventDetail['button']['action']>, string> = {
  signup: 'POST /api/events/:id/signup',
  join_waitlist: 'POST /api/events/:id/waitlist',
  cancel_signup: 'DELETE /api/events/:id/signup',
  leave_waitlist: 'DELETE /api/events/:id/waitlist',
  manage: '管理页（案例未展开）',
};

const hint = computed(() => {
  const button = detail.value?.button;
  if (!button) return '';
  if (button.reason) return button.reason;
  if (button.requireAuth) return '先在右上角选择演示身份，再点报名。';
  if (button.action === 'manage') {
    return '队长只看到管理入口；本案例聚焦参与侧，管理页未展开。';
  }
  if (button.action === null) return '当前没有可执行的写操作。';
  return `点击后调用 ${ENDPOINTS[button.action]}。`;
});

const notFound = computed(() => error.value?.code === 'EVENT_NOT_FOUND');

function retry(): void {
  void load();
}

async function onAction(): Promise<void> {
  const current = detail.value;
  if (!current || busy.value) return;

  const button = current.button;

  if (button.requireAuth && identity.value === null) {
    showToast('这是访客视角：先在右上角选择一个演示身份，再点一次。', 'info');
    return;
  }

  if (button.action === 'manage') {
    showToast('队长视角只展示管理入口；本案例聚焦参与侧，管理页未展开。', 'info');
    return;
  }

  if (button.action === null) return;

  // 确认框打开期间身份仍可能通过键盘被改掉，先把发起操作的人固定下来。
  const actingIdentity = identity.value;

  if (button.confirm) {
    const confirmed = await askConfirm({
      title:
        button.action === 'cancel_signup' ? '取消这次报名？' : '退出候补队列？',
      body: button.confirmText,
      confirmLabel: button.action === 'cancel_signup' ? '取消报名' : '退出候补',
      cancelLabel: '再想想',
      tone: 'danger',
    });
    if (disposed || !confirmed) return;
    if (identity.value !== actingIdentity) {
      showToast('演示身份已切换，这次操作没有执行。', 'info');
      await load();
      return;
    }
  }

  busy.value = true;

  try {
    let mutation;
    switch (button.action) {
      case 'signup':
        mutation = await api.signup(props.eventId, actingIdentity);
        break;
      case 'join_waitlist':
        mutation = await api.joinWaitlist(props.eventId, actingIdentity);
        break;
      case 'cancel_signup':
        mutation = await api.cancelSignup(props.eventId, actingIdentity);
        break;
      case 'leave_waitlist':
        mutation = await api.leaveWaitlist(props.eventId, actingIdentity);
        break;
    }

    // 中转期间切了身份：这次响应属于上一个身份，丢弃后按新身份重读。
    if (identity.value !== actingIdentity) {
      await load();
      return;
    }
    // 写操作已经成功；即使期间详情被另一次读取替换，也必须把结果告诉用户。
    if (current !== detail.value) {
      await load();
      showToast(mutation.message, 'success');
      return;
    }

    detail.value = {
      ...current,
      ...mutation.event,
      viewer: mutation.viewer,
      registration: mutation.registration,
      button: mutation.button,
    };

    // 服务端已经把转正人数写进 message，这里不再二次拼装。
    showToast(mutation.message, 'success');
  } catch (caught) {
    if (caught instanceof ApiError) {
      showToast(`${caught.code} · ${caught.message}`, 'error');
      // 冲突说明本地视图已经过时，重新拉一次服务端的真实状态。
      if (caught.status === 409 || caught.status === 404) {
        await load();
      }
    } else {
      showToast('操作失败，请重试。', 'error');
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="detail-view">
    <a class="back" href="#/" @click.prevent="goList">← 返回活动列表</a>

    <div v-if="loading" class="detail-skeleton" aria-busy="true">
      <span class="skeleton-line short" />
      <span class="skeleton-line title" />
      <span class="skeleton-line" />
      <div class="skeleton-panels">
        <span class="skeleton-panel" />
        <span class="skeleton-panel" />
      </div>
    </div>

    <div v-else-if="error" class="state-box" :class="{ 'is-error': !notFound }">
      <h2>{{ notFound ? '找不到这场活动' : '详情加载失败' }}</h2>
      <p>{{ error.message }}</p>
      <div class="state-actions">
        <button type="button" class="text-button" @click="retry">重试</button>
        <a class="text-link" href="#/" @click.prevent="goList">回到列表</a>
      </div>
    </div>

    <template v-else-if="detail">
      <header class="detail-head">
        <div class="head-meta">
          <StatusBadge :status="detail.status" />
          <code class="state-code">{{ detail.status }}</code>
          <span class="sep" aria-hidden="true">/</span>
          <code class="event-id">{{ detail.id }}</code>
        </div>
        <h1>{{ detail.title }}</h1>
        <p class="when">{{ formatRange(detail.startAt, detail.endAt) }}</p>
        <p class="deadline">
          报名截止 {{ formatDateWithTime(detail.signupDeadline) }}
        </p>
        <p v-if="detail.cancelReason" class="cancel-note">
          活动已取消：{{ detail.cancelReason }}
        </p>
      </header>

      <div class="detail-grid">
        <div class="main">
          <section class="panel">
            <div class="panel-head">
              <h2>名额</h2>
              <span class="panel-meta">confirmed / capacity</span>
            </div>
            <div class="capacity-row">
              <div>
                <span class="big">{{ detail.confirmedCount }}</span>
                <span class="unit">/ {{ detail.capacity }} 已确认</span>
              </div>
              <div class="remaining">
                <span class="big">{{ detail.remaining }}</span>
                <span class="unit">剩余</span>
              </div>
            </div>
            <div
              class="meter"
              role="progressbar"
              :aria-valuenow="detail.confirmedCount"
              :aria-valuemin="0"
              :aria-valuemax="detail.capacity"
              aria-label="报名人数"
            >
              <span
                :style="{
                  width: `${Math.min(100, (detail.confirmedCount / detail.capacity) * 100)}%`,
                }"
              />
            </div>
            <dl class="facts">
              <div>
                <dt>已发候补号</dt>
                <dd>{{ detail.waitlistCount }} 个（只增不减）</dd>
              </div>
              <div>
                <dt>队长</dt>
                <dd>{{ detail.organizerId }}</dd>
              </div>
              <div>
                <dt>结束时间</dt>
                <dd>{{ formatDateTime(detail.endAt) }}</dd>
              </div>
            </dl>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>你的记录</h2>
              <span class="panel-meta">{{ identityOption.label }}</span>
            </div>
            <p class="registration">{{ registrationText }}</p>
            <p class="panel-note">
              演示身份通过请求头 <code>x-demo-user-id</code> 传递；真实产品从会话取。
            </p>
          </section>

          <section class="panel explain">
            <div class="panel-head">
              <h2>这个按钮从哪来</h2>
              <code class="state-chip">{{ detail.button.state }}</code>
            </div>
            <p class="explain-text">{{ meta?.description }}</p>
            <p class="panel-note">
              前端没有第二份判定逻辑；9 种状态、优先级和文案都来自
              <code>@julai/shared</code>。
            </p>
            <p class="precedence">
              已取消 &gt; 已结束 &gt; 队长 &gt; 已报名 &gt; 候补中 &gt; 已开始
              &gt; 已截止 &gt; 满员 &gt; 可报名
            </p>
          </section>
        </div>

        <aside class="action-panel">
          <span class="action-kicker">当前身份</span>
          <div class="action-viewer">
            <span class="avatar" aria-hidden="true">{{ avatar }}</span>
            <div>
              <strong>{{ viewerLabel }}</strong>
              <small>{{ identityOption.hint }}</small>
            </div>
          </div>

          <ActionButton :view="detail.button" :busy="busy" @action="onAction" />
          <p class="action-hint">{{ hint }}</p>

          <dl class="action-facts">
            <div>
              <dt>state</dt>
              <dd>{{ detail.button.state }}</dd>
            </div>
            <div>
              <dt>action</dt>
              <dd>{{ detail.button.action ?? 'null' }}</dd>
            </div>
            <div>
              <dt>requireAuth</dt>
              <dd>{{ detail.button.requireAuth }}</dd>
            </div>
          </dl>

          <button type="button" class="refresh" :disabled="loading || busy" @click="load">
            刷新状态
          </button>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  padding: 30px 0 0;
}

.back {
  display: inline-block;
  margin-bottom: 26px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.back:hover {
  color: var(--ink);
}

.back:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 3px;
  border-radius: 4px;
}

.detail-head {
  max-width: 760px;
}

.head-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.state-code,
.event-id,
.state-chip {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

.event-id {
  color: var(--muted-soft);
}

.sep {
  color: var(--line-strong);
}

h1 {
  margin: 16px 0 12px;
  font-family: var(--font-serif);
  font-size: clamp(30px, 4vw, 42px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.when {
  margin: 0 0 4px;
  color: var(--ink);
  font-size: 15px;
}

.deadline {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.cancel-note {
  display: inline-block;
  margin: 14px 0 0;
  padding: 8px 12px;
  border-radius: 9px;
  background: #f8e9e5;
  color: #8d3a2b;
  font-size: 12.5px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.85fr);
  gap: 24px;
  align-items: start;
  margin-top: 34px;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}

.panel-meta {
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.capacity-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.big {
  font-family: var(--font-serif);
  font-size: 38px;
  line-height: 1;
}

.unit {
  margin-left: 6px;
  color: var(--muted);
  font-size: 12px;
}

.remaining {
  text-align: right;
}

.meter {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-muted);
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 20px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.facts dt {
  color: var(--muted);
  font-size: 11px;
}

.facts dd {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  word-break: break-word;
}

.registration {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.panel-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.panel-note code,
.explain code {
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.explain-text {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.7;
}

.precedence {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.7;
}

.state-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-weight: 600;
}

.action-panel {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--line-strong);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 24px 60px -46px rgba(28, 33, 29, 0.6);
}

.action-kicker {
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.action-viewer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 700;
}

.action-viewer div {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.action-viewer strong {
  font-size: 14px;
}

.action-viewer small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.action-hint {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.action-facts {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 14px 0 0;
  border-top: 1px solid var(--line);
}

.action-facts div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.action-facts dt {
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.action-facts dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink);
}

.refresh {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.refresh:hover {
  color: var(--ink);
}

.state-box {
  max-width: 560px;
  margin: 40px auto;
  padding: 44px 24px;
  border: 1px dashed var(--line-strong);
  border-radius: 18px;
  text-align: center;
}

.state-box.is-error {
  border-color: #eccbc2;
  background: #fdf7f5;
}

.state-box h2 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 24px;
}

.state-box p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.state-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 18px;
}

.text-button,
.text-link {
  padding: 8px 16px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 10px;
}

.skeleton-line,
.skeleton-panel {
  display: block;
  height: 14px;
  border-radius: 8px;
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
  width: 24%;
}

.skeleton-line.title {
  width: 60%;
  height: 36px;
}

.skeleton-panels {
  display: grid;
  grid-template-columns: 1.55fr 0.85fr;
  gap: 24px;
  margin-top: 20px;
}

.skeleton-panel {
  height: 260px;
  border-radius: 18px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 860px) {
  .detail-grid,
  .skeleton-panels {
    grid-template-columns: 1fr;
  }

  .action-panel {
    position: static;
  }
}

@media (max-width: 560px) {
  .facts {
    grid-template-columns: 1fr 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-panel {
    animation: none;
  }
}
</style>
