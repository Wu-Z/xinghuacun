export type DeepseekFailure = {
  kind: 'unavailable' | 'empty' | 'invalid-json'
  detail: string
}

export type StreamEvent =
  /**
   * 推理阶段开始的信号 —— **刻意不带内容**。
   * 模型的内部独白展示给用户既难懂又容易误导，前端只需要知道
   * 「它在思考，不是卡住了」，这样 0.7s 就能给出真实反馈。
   */
  | { type: 'reasoning' }
  | { type: 'content'; text: string }
  | { type: 'done'; finishReason: string }

export class DeepseekStreamError extends Error {
  readonly failure: DeepseekFailure

  constructor(failure: DeepseekFailure) {
    super(failure.detail)
    this.name = 'DeepseekStreamError'
    this.failure = failure
  }
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

/**
 * 流式版。逐块吐出 `content` 增量，由调用方边收边解析。
 *
 * 注意 delta 里还有一个 `reasoning_content` 字段 —— 这个模型是推理模型，
 * 会先在那边输出很长一段内部推理，**期间 content 一直是 null**。
 * 实测推理占约 40% 的时间、写 JSON 占 60%，所以真正的收益在后面那段：
 * 每个地点一写完就能立刻拿去高德核实，不必等整份 JSON 结束。
 *
 * 推理内容本身不吐给调用方 —— 那是模型的内部独白，展示给用户既难懂又容易误导。
 */
export async function* streamDeepseekJson(opts: Options): AsyncGenerator<StreamEvent> {
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
        stream: true,
      }),
      cache: 'no-store',
    })
  } catch {
    // 故意丢弃原始 error：它可能带着含 apiKey 的请求信息
    throw new DeepseekStreamError({ kind: 'unavailable', detail: '无法连接 DeepSeek' })
  }

  if (!res.ok || !res.body) {
    throw new DeepseekStreamError({
      kind: 'unavailable',
      detail: `DeepSeek 返回 HTTP ${res.status}`,
    })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason = 'stop'
  let sawContent = false
  let sawReasoning = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        let parsed: {
          choices?: {
            delta?: { content?: string | null; reasoning_content?: string | null }
            finish_reason?: string | null
          }[]
        }
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue // 半截的 SSE 行，下一轮会补全
        }

        const choice = parsed.choices?.[0]
        if (choice?.finish_reason) finishReason = choice.finish_reason

        if (choice?.delta?.reasoning_content && !sawReasoning) {
          sawReasoning = true
          yield { type: 'reasoning' }
        }

        const text = choice?.delta?.content
        if (text) {
          sawContent = true
          yield { type: 'content', text }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!sawContent) {
    throw new DeepseekStreamError({ kind: 'empty', detail: 'DeepSeek 返回了空内容' })
  }

  yield { type: 'done', finishReason }
}
