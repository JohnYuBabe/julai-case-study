import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 本地开发直接代理到 server 的默认端口；生产构建固定走 /julai/ 子路径。
const target = 'http://127.0.0.1:3030';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // 生产构建用绝对前缀：这样即使 nginx 的 SPA 回退把 /julai/某个路径 也
  // 返回 index.html，资源仍从 /julai/assets/ 加载，不会白屏。
  // 开发仍从根路径提供，避免 Vite 的 HMR 和代理路径对不上。
  base: command === 'build' ? '/julai/' : '/',
  server: {
    port: 5176,
    strictPort: true,
    proxy: { '/api': { target } },
  },
  preview: {
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target } },
  },
}));
