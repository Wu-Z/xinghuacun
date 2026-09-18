import { amapVerifyProvider } from './amap'
import { mockVerifyProvider } from './mock'
import type { VerifyProvider } from './types'

export function getVerifyProvider(): VerifyProvider {
  return process.env.RECOMMEND_VERIFY === 'mock' ? mockVerifyProvider : amapVerifyProvider
}

export type { Verification, VerifyInput, VerifyProvider } from './types'
