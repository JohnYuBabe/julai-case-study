<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppHeader from './components/AppHeader.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import ToastStack from './components/ToastStack.vue';
import { route } from './router';
import EventDetailView from './views/EventDetailView.vue';
import EventListView from './views/EventListView.vue';
import StateMatrixView from './views/StateMatrixView.vue';

const detailId = computed(() =>
  route.value.name === 'detail' ? route.value.id : '',
);

const main = ref<HTMLElement | null>(null);
let firstRoute = true;

watch(
  route,
  async (next) => {
    document.title =
      next.name === 'detail'
        ? '局来 · 活动详情'
        : next.name === 'matrix'
          ? '局来 · 九态矩阵'
          : '局来 · 报名状态案例';

    // 首次进入交给浏览器；之后的 hash 跳转把焦点送回主内容，
    // 键盘用户不会从 <body> 重新 Tab 一遍页头。
    if (firstRoute) {
      firstRoute = false;
      return;
    }
    await nextTick();
    main.value?.focus();
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main ref="main" class="page" tabindex="-1">
      <EventListView v-if="route.name === 'list'" />
      <EventDetailView
        v-else-if="route.name === 'detail'"
        :key="detailId"
        :event-id="detailId"
      />
      <StateMatrixView v-else />
    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <span>julai-case-study · 演示数据全部为合成</span>
        <span class="footer-stack">Vue 3 · Vite · NestJS · MySQL</span>
      </div>
    </footer>

    <ConfirmDialog />
    <ToastStack />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.page {
  flex: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 90px;
}

.site-footer {
  border-top: 1px solid var(--line);
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 22px 24px 28px;
  color: var(--muted-soft);
  font-size: 11.5px;
}

.footer-stack {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.page:focus {
  outline: none;
}

@media (max-width: 600px) {
  .page {
    padding: 0 18px 70px;
  }

  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
