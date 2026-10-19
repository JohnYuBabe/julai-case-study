<script setup lang="ts">
import { computed } from 'vue';
import type { EventSummary } from '../api';
import { formatDateWithTime, formatRange } from '../format';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ event: EventSummary; index: number }>();

const percent = computed(() => {
  if (props.event.capacity <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((props.event.confirmedCount / props.event.capacity) * 100)),
  );
});

const occupancyNote = computed(() => {
  switch (props.event.status) {
    case 'CANCELLED':
      return '活动已取消';
    case 'FINISHED':
      return '活动已结束';
    case 'ONGOING':
      return '比赛已开始';
    case 'CLOSED':
      return '报名已截止';
    case 'OPEN':
      return props.event.remaining > 0
        ? `剩余 ${props.event.remaining} 位`
        : `已满 · 已发候补号 ${props.event.waitlistCount}`;
  }
});
</script>

<template>
  <a
    class="event-card"
    :href="`#/events/${encodeURIComponent(event.id)}`"
    :style="{ '--delay': `${Math.min(index, 8) * 40}ms` }"
  >
    <div class="card-top">
      <StatusBadge :status="event.status" />
      <span class="card-id">{{ event.id }}</span>
    </div>

    <h2>{{ event.title }}</h2>

    <ul class="meta">
      <li>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2.2"
            y="3.2"
            width="11.6"
            height="10.6"
            rx="2"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path
            d="M2.6 6.4h10.8M5.4 2v2.4M10.6 2v2.4"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
        {{ formatRange(event.startAt, event.endAt) }}
      </li>
      <li>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="5.8"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path
            d="M8 4.8V8l2.2 1.4"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        报名截止 {{ formatDateWithTime(event.signupDeadline) }}
      </li>
    </ul>

    <p v-if="event.cancelReason" class="cancel-note">
      取消原因：{{ event.cancelReason }}
    </p>

    <div class="occupancy">
      <div class="occupancy-head">
        <span>名额</span>
        <span>
          <strong>{{ event.confirmedCount }}</strong> / {{ event.capacity }}
        </span>
      </div>
      <div
        class="meter"
        role="progressbar"
        :aria-valuenow="event.confirmedCount"
        :aria-valuemin="0"
        :aria-valuemax="event.capacity"
        :aria-label="`${event.title} 的报名人数`"
      >
        <span :style="{ width: `${percent}%` }" />
      </div>
      <div class="occupancy-foot">
        <span>{{ occupancyNote }}</span>
        <span class="go">查看详情 →</span>
      </div>
    </div>
  </a>
</template>

<style scoped>
.event-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  box-shadow: 0 1px 0 rgba(28, 33, 29, 0.02);
  animation: card-in 420ms ease both;
  animation-delay: var(--delay);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.event-card:hover {
  transform: translateY(-3px);
  border-color: var(--line-strong);
  box-shadow: 0 18px 40px -30px rgba(28, 33, 29, 0.55);
}

.event-card:focus-visible {
  outline: 3px solid var(--accent-ring);
  outline-offset: 2px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-id {
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
}

h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0.01em;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
  font-size: 13px;
}

.meta li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta svg {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--muted-soft);
}

.cancel-note {
  margin: 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: #f8e9e5;
  color: #8d3a2b;
  font-size: 12px;
}

.occupancy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding-top: 6px;
}

.occupancy-head,
.occupancy-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
}

.occupancy-head strong {
  color: var(--ink);
  font-size: 13px;
}

.meter {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-muted);
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 320ms ease;
}

.go {
  color: var(--accent-strong);
  font-weight: 600;
  white-space: nowrap;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .event-card {
    animation: none;
    transition: none;
  }
}
</style>
