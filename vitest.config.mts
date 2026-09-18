import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    // 默认 node（绝大多数测试是纯逻辑）。
    // 组件测试用文件头的 `// @vitest-environment jsdom` 单独切换，
    // 免得让所有纯逻辑测试都背上 jsdom 的启动开销。
    environment: 'node',
  },
})
