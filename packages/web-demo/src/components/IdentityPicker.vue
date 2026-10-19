<script setup lang="ts">
import { computed } from 'vue';
import {
  IDENTITY_OPTIONS,
  identity,
  identityOption,
  setIdentity,
} from '../identity';

const avatar = computed(() => {
  const option = identityOption.value;
  if (option.id === null) return '访';
  if (option.id === 'u-organizer') return '队';
  const number = option.label.match(/\d+/)?.[0];
  return number ?? '员';
});

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  setIdentity(value === 'guest' ? null : value);
}
</script>

<template>
  <div class="identity-picker">
    <span class="avatar" aria-hidden="true">{{ avatar }}</span>
    <label class="sr-only" for="identity-select">演示身份</label>
    <select
      id="identity-select"
      class="identity-select"
      :value="identity ?? 'guest'"
      @change="onChange"
    >
      <option
        v-for="option in IDENTITY_OPTIONS"
        :key="option.id ?? 'guest'"
        :value="option.id ?? 'guest'"
      >
        {{ option.label }}
      </option>
    </select>
    <svg class="chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
.identity-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 30px 4px 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  transition: border-color 160ms ease;
}

.identity-picker:hover {
  border-color: var(--line-strong);
}

.avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 700;
}

.identity-select {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 4px 2px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  outline: none;
}

.identity-select:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 2px;
  border-radius: 6px;
}

.chevron {
  position: absolute;
  right: 12px;
  width: 14px;
  height: 14px;
  color: var(--muted);
  pointer-events: none;
}
</style>
