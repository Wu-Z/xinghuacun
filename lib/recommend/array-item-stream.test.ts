import { describe, expect, it } from 'vitest'
import { ArrayItemStream } from './array-item-stream'

function feed(chunks: string[], key = 'recommendations'): string[] {
  const s = new ArrayItemStream(key)
  const out: string[] = []
  for (const c of chunks) out.push(...s.push(c))
  return out
}

/** 按 [i, i+1) 切开，用于遍历所有单点切分 */
function splitAt(text: string, i: number): string[] {
  return [text.slice(0, i), text.slice(i)]
}

const FULL = '{"recommendations":[{"name":"龙舟池","why":"倒影"},{"name":"集美大社","why":"古厝"}],"excluded":[]}'

describe('ArrayItemStream', () => {
  it('一次喂完，提取出全部对象', () => {
    expect(feed([FULL])).toEqual(['{"name":"龙舟池","why":"倒影"}', '{"name":"集美大社","why":"古厝"}'])
  })

  it('在任意位置切分，结果都一致 —— 这是流式最容易出的 bug', () => {
    const expected = feed([FULL])
    for (let i = 1; i < FULL.length; i++) {
      expect(feed(splitAt(FULL, i)), `在第 ${i} 个字符处切分`).toEqual(expected)
    }
  })

  it('逐字符喂，结果也一致', () => {
    expect(feed([...FULL])).toEqual(feed([FULL]))
  })

  it('还没闭合的对象不产出', () => {
    expect(feed(['{"recommendations":[{"name":"龙舟池"'])).toEqual([])
  })

  it('闭合的瞬间才产出', () => {
    const half = '{"recommendations":[{"name":"a"}'
    expect(feed([half])).toEqual(['{"name":"a"}'])
    expect(feed([half + ',{"name":"b"}'])).toEqual(['{"name":"a"}', '{"name":"b"}'])
  })

  it('对象里含嵌套对象与数组也能正确配对', () => {
    const text = '{"recommendations":[{"fit":[{"tag":"拍照","why":"x"}],"n":1}]}'
    expect(feed([text])).toEqual(['{"fit":[{"tag":"拍照","why":"x"}],"n":1}'])
  })

  it('字符串里的括号和引号不会骗过配对', () => {
    const text = '{"recommendations":[{"why":"他说「{这样}」不行","n":1}]}'
    expect(feed([text])).toEqual(['{"why":"他说「{这样}」不行","n":1}'])
  })

  it('转义引号不会中断字符串', () => {
    const text = '{"recommendations":[{"why":"a\\"b{c}","n":1}]}'
    expect(feed([text])).toEqual(['{"why":"a\\"b{c}","n":1}'])
  })

  it('数组结束后不再产出', () => {
    expect(feed([FULL + ',"more":{"a":1}'])).toEqual(feed([FULL]))
  })

  it('不误取其它同名字段之外的东西', () => {
    const text = '{"meta":{"recommendations_like":1},"recommendations":[{"n":1}]}'
    expect(feed([text])).toEqual(['{"n":1}'])
  })

  it('空数组不产出', () => {
    expect(feed(['{"recommendations":[]}'])).toEqual([])
  })

  it('数组里夹空白与换行也能提取', () => {
    const text = '{\n  "recommendations": [\n    {"n": 1},\n    {"n": 2}\n  ]\n}'
    expect(feed([text])).toEqual(['{"n": 1}', '{"n": 2}'])
  })

  it('同一个 key 出现两次时，只认第一个数组', () => {
    const text = '{"recommendations":[{"n":1}],"x":{"recommendations":[{"n":2}]}}'
    expect(feed([text])).toEqual(['{"n":1}'])
  })
})
