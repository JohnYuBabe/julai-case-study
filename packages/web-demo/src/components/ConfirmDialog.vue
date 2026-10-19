<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { confirmState, settleConfirm } from '../confirm';

const panel = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);

let previouslyFocused: HTMLElement | null = null;
let appRoot: HTMLElement | null = null;

function focusableElements(): HTMLElement[] {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (!confirmState.value) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    settleConfirm(false);
    return;
  }

  if (event.key !== 'Tab') return;

  const items = focusableElements();
  if (items.length === 0) {
    event.preventDefault();
    return;
  }

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  const inside = active !== null && panel.value?.contains(active) === true;

  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

function releaseBackground(): void {
  if (appRoot) {
    appRoot.inert = false;
    appRoot = null;
  }
}

watch(confirmState, async (state) => {
  if (state) {
    previouslyFocused = document.activeElement as HTMLElement | null;
    appRoot = document.getElementById('app');
    if (appRoot) appRoot.inert = true;

    await nextTick();
    // 危险操作默认停在「再想想」，避免误按回车直接取消报名。
    (state.tone === 'danger' ? cancelButton : confirmButton).value?.focus();
    return;
  }

  releaseBackground();
  await nextTick();
  if (previouslyFocused && document.contains(previouslyFocused)) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  releaseBackground();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="confirmState"
      class="backdrop"
      @click.self="settleConfirm(false)"
    >
      <div
        ref="panel"
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        :aria-describedby="confirmState.body ? 'confirm-body' : undefined"
      >
        <span class="dialog-kicker">请确认</span>
        <h2 id="confirm-title">{{ confirmState.title }}</h2>
        <p v-if="confirmState.body" id="confirm-body">
          {{ confirmState.body }}
        </p>
        <div class="actions">
          <button
            ref="cancelButton"
            type="button"
            class="button ghost"
            @click="settleConfirm(false)"
          >
            {{ confirmState.cancelLabel ?? '先不了' }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="button solid"
            :class="{ danger: confirmState.tone === 'danger' }"
            @click="settleConfirm(true)"
          >
            {{ confirmState.confirmLabel ?? '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(28, 33, 29, 0.36);
  backdrop-filter: blur(3px);
  animation: fade 140ms ease;
}

.dialog {
  width: min(420px, 100%);
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 30px 80px -30px rgba(28, 33, 29, 0.5);
  animation: rise 180ms ease;
}

.dialog-kicker {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

h2 {
  margin: 8px 0 10px;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
}

p {
  margin: 0 0 22px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.button:focus-visible {
  outline: 3px solid var(--accent-ring);
  outline-offset: 2px;
}

.ghost {
  border-color: var(--line-strong);
  background: transparent;
  color: var(--ink);
}

.solid {
  background: var(--accent);
  color: #fffdf6;
}

.solid.danger {
  background: var(--danger);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .dialog {
    animation: none;
  }
}
</style>
