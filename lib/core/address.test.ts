import { describe, expect, it } from 'vitest'
import { blurAddress } from './address'

describe('blurAddress', () => {
  it('只拼到街道，丢掉门牌号', () => {
    expect(
      blurAddress({
        province: '北京市',
        city: '北京市',
        district: '朝阳区',
        township: '三里屯街道',
        street: '工体北路',
      }),
    ).toBe('北京市朝阳区三里屯街道工体北路')
  })

  it('直辖市的省市重名只保留一份', () => {
    expect(blurAddress({ province: '上海市', city: '上海市', district: '徐汇区' })).toBe(
      '上海市徐汇区',
    )
  })

  it('字段缺失时跳过，不留空档', () => {
    expect(blurAddress({ city: '杭州市', district: '西湖区' })).toBe('杭州市西湖区')
  })

  it('全都缺失时给兜底文案', () => {
    expect(blurAddress({})).toBe('已选位置')
  })
})
