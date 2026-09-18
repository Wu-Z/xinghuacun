export type DeepseekFailure = {
  kind: 'unavailable' | 'empty' | 'invalid-json'
  detail: string
}

export type DeepseekResult = { ok: true; text: string } | { ok: false; failure: DeepseekFailure }

type Options = {
  apiKey: string
  baseUrl: string
  model: string
  system: string
  user: string
  maxTokens?: number
  /** 注入是为了让测试不碰网络 */
  fetchImpl?: typeof fetch
}

/**
 * 默认值必须给得宽裕，原因是实测发现的两件事：
 *
 * 1. `deepseek-flash` 是**推理模型**，它会在输出 JSON 之前先做内部推理，
 *    而推理 token 与正文共用同一个 max_tokens 预算（响应里体现为
 *    `completion_tokens_details.reasoning_tokens` 与 `reasoning_content`）。
 * 2. 这个 skill 的输出很重 —— 每条推荐都带 fit 证据、crowd_note、itinerary、
 *    trade_off，外加 excluded 与 meta，中文 JSON 本身就上千 token。
 *
 * 原来设 8192 时实际撞过 `finish_reason: 'length'`，JSON 被截断后整次推荐失败。
 * 实测 16384 / 32768 都被接受，且 max_tokens 只是上限、用不到不额外计费。
 */
const DEFAULT_MAX_TOKENS = 16384

/**
 * 调 DeepSeek 的 OpenAI 兼容接口，要求返回 JSON。
 *
 * 三个来自官方文档的硬要求，缺一个就出问题：
 * 1. 必须带 `response_format: {type:'json_object'}`
 * 2. **system/user 里必须出现 "json" 字样并给出样例**，否则模型可能一直生成
 *    空格直到撞上 max_tokens，表现为请求卡死 —— 这一步由调用方保证（提示词里写）
 * 3. `json_object` 只保证语法合法，**不保证字段符合我们的 schema**，业务校验在 schema.ts
 *
 * 另外官方承认 JSON 模式下有概率返回空 content，所以「空」被当成一类独立失败，
 * 不和「不合法 JSON」混为一谈 —— 两者的排查方向完全不同。
 */
export async function callDeepseekJson(opts: Options): Promise<DeepseekResult> {
  const doFetch = opts.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      cache: 'no-store',
    })
  } catch {
    // 故意丢弃原始 error：它可能带着含 apiKey 的请求信息
    return { ok: false, failure: { kind: 'unavailable', detail: '无法连接 DeepSeek' } }
  }

  if (!res.ok) {
    return {
      ok: false,
      failure: { kind: 'unavailable', detail: `DeepSeek 返回 HTTP ${res.status}` },
    }
  }

  let data: { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  try {
    data = await res.json()
  } catch {
    return { ok: false, failure: { kind: 'unavailable', detail: 'DeepSeek 返回了非 JSON 响应' } }
  }

  const choice = data.choices?.[0]
  const text = choice?.message?.content ?? ''

  if (!text.trim()) {
    return { ok: false, failure: { kind: 'empty', detail: 'DeepSeek 返回了空内容' } }
  }

  try {
    JSON.parse(text)
  } catch {
    const truncated = choice?.finish_reason === 'length'
    return {
      ok: false,
      failure: {
        kind: 'invalid-json',
        detail: truncated
          ? '回包被 max_tokens 截断。该模型是推理模型，推理也占额度，调大 .env.local 里的 DEEPSEEK_MAX_TOKENS 再试'
          : '回包不是合法 JSON',
      },
    }
  }

  return { ok: true, text }
}
