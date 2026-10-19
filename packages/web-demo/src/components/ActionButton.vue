<script setup lang="ts">
import type { ButtonView } from '@julai/shared';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    view: ButtonView;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{ (event: 'action'): void }>();

const disabled = computed(() => props.view.variant === 'disabled' || props.busy);
</script>

<template>
  <button
    type="button"
    class="action-button"
    :class="[`variant-${view.variant}`, { 'is-busy': busy }]"
    :disabled="disabled"
    @click="emit('action')"
  >
    <span v-if="busy" class="spinner" aria-hidden="true" />
    <span class="action-label">{{ busy ? '处理中…' : view.label }}</span>
    <svg
      v-if="view.variant !== 'disabled' && !busy"
      class="arrow"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h11m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<style scoped>
.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  padding: 14px 22px;
  border: 1px solid transparent;
  border-radius: 14px;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.action-button:focus-visible {
  outline: 3px solid var(--accent-ring);
  outline-offset: 2px;
}

.action-button:not(:disabled):active {
  transform: translateY(1px);
}

.variant-primary {
  color: #fffdf6;
  background: var(--accent);
  box-shadow: 0 10px 24px -16px rgba(18, 105, 79, 0.9);
}

.variant-primary:hover:not(:disabled) {
  background: var(--accent-strong);
}

.variant-ghost {
  color: var(--ink);
  background: transparent;
  border-color: var(--line-strong);
}

.variant-ghost:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
  background: #fdf4f1;
}

.variant-disabled {
  color: var(--muted);
  background: var(--surface-muted);
  border-color: var(--line);
  cursor: not-allowed;
}

.arrow {
  width: 20px;
  height: 20px;
  opacity: 0.8;
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: currentColor;
  animation: spin 700ms linear infinite;
}

.variant-ghost .spinner,
.variant-disabled .spinner {
  border-color: rgba(28, 33, 29, 0.2);
  border-top-color: var(--ink);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .action-button {
    transition: none;
  }

  .spinner {
    animation-duration: 2s;
  }
}
</style>
