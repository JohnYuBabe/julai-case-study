<script setup lang="ts">
import type { EventStatus } from '@julai/shared';
import { computed } from 'vue';

const props = defineProps<{ status: EventStatus }>();

const LABELS: Record<EventStatus, string> = {
  OPEN: '报名中',
  CLOSED: '报名截止',
  ONGOING: '进行中',
  FINISHED: '已结束',
  CANCELLED: '已取消',
};

const label = computed(() => LABELS[props.status]);
</script>

<template>
  <span class="status-badge" :class="`is-${status.toLowerCase()}`">
    <span class="dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--status-ink);
  background: var(--status-bg);
  border: 1px solid var(--status-line);
  white-space: nowrap;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.is-open {
  --status-ink: #0f6a4c;
  --status-bg: #e7f3ec;
  --status-line: #c6e3d4;
}

.is-closed {
  --status-ink: #8a5a12;
  --status-bg: #f8efdd;
  --status-line: #ead7b4;
}

.is-ongoing {
  --status-ink: #1d5d96;
  --status-bg: #e6f0f9;
  --status-line: #c6dcef;
}

.is-finished {
  --status-ink: #5c625c;
  --status-bg: #eeeee9;
  --status-line: #dcdcd4;
}

.is-cancelled {
  --status-ink: #a13c2c;
  --status-bg: #f8e9e5;
  --status-line: #eccbc2;
}
</style>
