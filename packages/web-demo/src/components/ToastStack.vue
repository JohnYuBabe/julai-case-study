<script setup lang="ts">
import { dismissToast, toasts } from '../toast';
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`is-${toast.kind}`"
      >
        <span class="toast-icon" aria-hidden="true">
          <svg
            v-if="toast.kind === 'success'"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="m3.5 8.4 3 3 6-6.4"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else-if="toast.kind === 'error'" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 4.4v4.4m0 2.6v.2"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <svg v-else viewBox="0 0 16 16" fill="none">
            <path
              d="M8 7.4v4.2M8 4.6v.2"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <p class="toast-text">{{ toast.text }}</p>
        <button
          type="button"
          class="toast-close"
          aria-label="关闭提示"
          @click="dismissToast(toast.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(380px, calc(100vw - 40px));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--toast-line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 18px 46px -26px rgba(28, 33, 29, 0.55);
  animation: toast-in 200ms ease;
}

.toast.is-success {
  --toast-line: #c6e3d4;
  --toast-icon: #0f6a4c;
}

.toast.is-error {
  --toast-line: #eccbc2;
  --toast-icon: #a13c2c;
}

.toast.is-info {
  --toast-line: #c6dcef;
  --toast-icon: #1d5d96;
}

.toast-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-muted);
  color: var(--toast-icon);
}

.toast-icon svg {
  width: 14px;
  height: 14px;
}

.toast-text {
  margin: 1px 0 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.55;
}

.toast-close {
  margin-left: auto;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--muted-soft);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
</style>
