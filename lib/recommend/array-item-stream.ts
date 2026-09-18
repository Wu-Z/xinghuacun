/**
 * 从**流式到来的、尚未闭合的** JSON 文本里，逐个提取数组中已完整的对象。
 *
 * 为什么需要它：LLM 的 JSON 是一边生成一边到达的，等到整份写完再解析，
 * 前面已经写完的地点就白白干等了 —— 而每个地点写完就能立刻拿去高德核实。
 *
 * 为什么不用现成库：只是「在数组里按括号配对切出完整对象」，手写足够，
 * 而且能保证**任意切分位置结果一致**（流式最常见的 bug 就是把 chunk 当成
 * 完整片段来处理，一遇到跨 chunk 的字符串或转义就错）。
 *
 * 刻意不做的事：不解析、不校验、不修复残缺 JSON。它只负责切分，
 * 切出来的片段由调用方交给真实解析器判断。
 */
export class ArrayItemStream {
  private readonly needle: string
  private buffer = ''
  /** 还没找到目标数组的 `[` */
  private foundArray = false
  /** 已进入目标数组，正在等元素 */
  private inArray = false
  /** 数组是否已闭合，闭合后不再产出 */
  private arrayClosed = false

  private inString = false
  private escaped = false
  /** 当前正在收集的对象已积累的 `{` 深度；0 表示不在对象里 */
  private objectDepth = 0
  private current = ''

  constructor(arrayKey: string) {
    this.needle = `"${arrayKey}"`
  }

  /** 喂一段新到达的文本，返回这次新出现的完整对象（原始 JSON 字符串） */
  push(chunk: string): string[] {
    if (this.arrayClosed) return []

    this.buffer += chunk
    const out: string[] = []

    if (!this.foundArray) {
      const keyAt = this.buffer.indexOf(this.needle)
      if (keyAt === -1) return out

      const bracketAt = this.buffer.indexOf('[', keyAt + this.needle.length)
      if (bracketAt === -1) return out

      this.foundArray = true
      this.inArray = true
      // 从 `[` 之后开始扫；之前的文本（含 key）不再需要
      this.buffer = this.buffer.slice(bracketAt + 1)
      // 目标 key 只认第一个，之后即使再出现同名字段也不看
    }

    const text = this.buffer
    this.buffer = ''

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]

      if (this.inString) {
        this.current += ch
        if (this.escaped) {
          this.escaped = false
        } else if (ch === '\\') {
          this.escaped = true
        } else if (ch === '"') {
          this.inString = false
        }
        continue
      }

      if (this.objectDepth === 0) {
        if (ch === ']') {
          // 数组闭合，收工
          this.inArray = false
          this.arrayClosed = true
          break
        }
        if (ch === '{') {
          this.objectDepth = 1
          this.current = '{'
          continue
        }
        // 逗号、空白等数组元素之间的分隔，忽略
        continue
      }

      // 在对象内部
      this.current += ch

      if (ch === '"') {
        this.inString = true
        continue
      }
      if (ch === '{') {
        this.objectDepth += 1
        continue
      }
      if (ch === '}') {
        this.objectDepth -= 1
        if (this.objectDepth === 0) {
          out.push(this.current)
          this.current = ''
        }
      }
    }

    return out
  }
}
