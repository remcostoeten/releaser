import type { OutputEnvironment } from '../../ui/index.js'

export function stdoutEnvironment(): OutputEnvironment {
  return {
    colorEnabled: process.stdout.isTTY === true && process.env.NO_COLOR === undefined,
  }
}
