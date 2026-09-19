import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    // 根目录那一条是 proxy.ts —— 它必须待在仓库根（Next 的文件约定），
    // 所以它的测试也只能在根，收不到就得单独列一条。
    include: [
      'lib/**/*.test.ts',
      'app/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      '*.test.ts',
    ],
    // 默认 node（绝大多数测试是纯逻辑）。
    // 组件测试用文件头的 `// @vitest-environment jsdom` 单独切换，
    // 免得让所有纯逻辑测试都背上 jsdom 的启动开销。
    environment: 'node',
  },
})
