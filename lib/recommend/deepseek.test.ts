import { describe, expect, it, vi } from 'vitest'
import { callDeepseekJson } from './deepseek'

const OPTS = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'test-model',
  system: 'return json',
  user: '我在北京',
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function completion(content: string, finishReason = 'stop') {
  return { choices: [{ message: { content }, finish_reason: finishReason }] }
}

describe('callDeepseekJson', () => {
  it('正常返回 content 文本', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('{"places":[]}')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('{"places":[]}')
  })

  it('HTTP 失败归为 unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ error: 'boom' }, 500))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('unavailable')
  })

  it('网络异常归为 unavailable，且不抛错', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('unavailable')
  })

  it('空 content 归为 empty —— 官方承认的已知问题，要能和别的失败区分开', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('empty')
  })

  it('content 只有空白也归为 empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('   \n  ')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('empty')
  })

  it('content 不是合法 JSON 归为 invalid-json', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('这不是 json')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.kind).toBe('invalid-json')
  })

  it('被 max_tokens 截断时在 detail 里说明', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('{"places":[', 'length')))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failure.kind).toBe('invalid-json')
      expect(r.failure.detail).toContain('截断')
    }
  })

  it('请求体带 json_object、模型与 max_tokens 来自参数', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('{}')))
    await callDeepseekJson({ ...OPTS, maxTokens: 1234, fetchImpl: fetchImpl as never })
    const [, init] = fetchImpl.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.model).toBe('test-model')
    expect(body.max_tokens).toBe(1234)
  })

  it('baseUrl 结尾的斜杠不会拼出双斜杠', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(completion('{}')))
    await callDeepseekJson({ ...OPTS, baseUrl: 'https://api.deepseek.com/', fetchImpl: fetchImpl as never })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
  })

  it('失败信息里绝不包含 apiKey', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('failed for key test-key'))
    const r = await callDeepseekJson({ ...OPTS, fetchImpl: fetchImpl as never })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.detail).not.toContain('test-key')
  })
})
