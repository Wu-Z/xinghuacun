// 用途：确认账号到底能用哪些模型。
//
// 官方文档不同版本出现过 deepseek-chat / deepseek-coder / deepseek-v4-flash /
// deepseek-v4-pro 等互相矛盾的名字，另有第三方站点称旧标识已移除。
// 所以不猜 —— 直接问接口。
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    // 没有 .env.local 就只靠进程环境变量
  }
}

loadEnvLocal()

const key = process.env.DEEPSEEK_API_KEY
const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')

if (!key) {
  console.error('未配置 DEEPSEEK_API_KEY（可写进 .env.local）')
  process.exit(1)
}

const res = await fetch(`${base}/models`, {
  headers: { authorization: `Bearer ${key}` },
}).catch((error) => {
  console.error(`无法连接 ${base}：${error.message}`)
  process.exit(1)
})

if (!res.ok) {
  console.error(`请求失败：HTTP ${res.status}`)
  process.exit(1)
}

const data = await res.json().catch(() => null)
const ids = (data?.data ?? []).map((m) => m?.id).filter(Boolean)

if (ids.length === 0) {
  console.error('接口没有返回任何模型，原始响应：')
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log(`端点：${base}`)
console.log(`可用模型（${ids.length} 个）：`)
for (const id of ids) console.log(`  ${id}`)

const current = process.env.DEEPSEEK_MODEL
if (current) {
  console.log(
    ids.includes(current)
      ? `\n当前配置的 DEEPSEEK_MODEL=${current} 在列表里，可用。`
      : `\n⚠ 当前配置的 DEEPSEEK_MODEL=${current} 不在列表里，请改。`,
  )
} else {
  console.log('\n把选中的那个填进 .env.local 的 DEEPSEEK_MODEL')
}
