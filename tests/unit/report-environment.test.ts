import { afterEach, describe, expect, it } from 'vitest'
import { stdoutEnvironment } from '../../src/cli/commands/report-environment.js'

const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const originalNoColor = process.env.NO_COLOR

afterEach(() => {
  if (originalIsTty === undefined) {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  } else {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTty)
  }
  if (originalNoColor === undefined) {
    Reflect.deleteProperty(process.env, 'NO_COLOR')
  } else {
    process.env.NO_COLOR = originalNoColor
  }
})

describe('report output environment', () => {
  it('enables colour only for a TTY without NO_COLOR', () => {
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
    Reflect.deleteProperty(process.env, 'NO_COLOR')
    expect(stdoutEnvironment()).toEqual({ colorEnabled: true })

    process.env.NO_COLOR = '1'
    expect(stdoutEnvironment()).toEqual({ colorEnabled: false })

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
    Reflect.deleteProperty(process.env, 'NO_COLOR')
    expect(stdoutEnvironment()).toEqual({ colorEnabled: false })
  })
})
