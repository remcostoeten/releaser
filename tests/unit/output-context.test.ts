import { describe, expect, it } from 'vitest'
import { createCliOutputContext } from '../../src/cli/output-context.js'

describe('CLI output context', () => {
  it('propagates verbose and uses each stream TTY state', () => {
    const context = createCliOutputContext(
      { verbose: true },
      { stdout: { isTTY: true }, stderr: { isTTY: false } },
      {},
    )

    expect(context).toEqual({
      json: false,
      verbose: true,
      stdout: { colorEnabled: true },
      stderr: { colorEnabled: false },
    })
  })

  it('disables colour for JSON and NO_COLOR output', () => {
    const streams = { stdout: { isTTY: true }, stderr: { isTTY: true } }

    expect(createCliOutputContext({ json: true, verbose: true }, streams, {})).toEqual({
      json: true,
      verbose: true,
      stdout: { colorEnabled: false },
      stderr: { colorEnabled: false },
    })
    expect(createCliOutputContext({}, streams, { NO_COLOR: '' })).toEqual({
      json: false,
      verbose: false,
      stdout: { colorEnabled: false },
      stderr: { colorEnabled: false },
    })
  })
})
