<script setup lang="ts">
import { computed } from 'vue';
import { goList, goStates, route } from '../router';
import IdentityPicker from './IdentityPicker.vue';

// 详情页仍属于「活动列表」这一栏，避免导航没有任何高亮。
const isList = computed(() => route.value.name !== 'matrix');
const isMatrix = computed(() => route.value.name === 'matrix');
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/" @click.prevent="goList">
        <span class="brand-mark" aria-hidden="true">局</span>
        <span class="brand-text">
          <strong>局来</strong>
          <small>报名状态案例</small>
        </span>
      </a>

      <nav class="nav" aria-label="主导航">
        <a
          href="#/"
          :class="{ active: isList }"
          :aria-current="isList ? 'page' : undefined"
          @click.prevent="goList"
        >
          活动列表
        </a>
        <a
          href="#/states"
          :class="{ active: isMatrix }"
          :aria-current="isMatrix ? 'page' : undefined"
          @click.prevent="goStates"
        >
          9 态矩阵
        </a>
      </nav>

      <div class="header-right">
        <span class="identity-caption">演示身份</span>
        <IdentityPicker />
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--line);
  background: rgba(246, 244, 239, 0.88);
  backdrop-filter: blur(14px);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 28px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 14px 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--accent);
  color: #fffdf6;
  font-family: var(--font-serif);
  font-size: 18px;
  line-height: 1;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-text strong {
  font-size: 15px;
  letter-spacing: 0.04em;
}

.brand-text small {
  color: var(--muted);
  font-size: 11px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: auto;
}

.nav a {
  padding: 7px 12px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.nav a:hover {
  color: var(--ink);
}

.nav a.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.nav a:focus-visible,
.brand:focus-visible {
  outline: 2px solid var(--accent-ring);
  outline-offset: 2px;
  border-radius: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.identity-caption {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.06em;
}

@media (max-width: 720px) {
  .header-inner {
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 18px;
  }

  .nav {
    order: 3;
    width: 100%;
    margin: 0;
  }

  .header-right {
    margin-left: auto;
  }

  .identity-caption,
  .brand-text small {
    display: none;
  }
}
</style>
