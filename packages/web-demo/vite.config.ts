import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 本地开发直接代理到 server 的默认端口；部署时用 VITE_API_BASE 指向 /julai/api。
const target = 'http://127.0.0.1:3030';

export default defineConfig({
  plugins: [vue()],
  // 相对路径：构建产物可以放在任意子路径下（例如 /julai/）。
  base: './',
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
});
