import { describe, expect, it } from 'vitest'
import { createRedactor, REDACTED } from '../../src/shared/redaction.js'

describe('redaction', () => {
  it('redacts a registered secret wherever it appears', () => {
    const redactor = createRedactor()
    redactor.registerSecret('super-secret-value')

    expect(redactor.redactText('token=super-secret-value tail')).toBe(`token=${REDACTED} tail`)
  })

  it('redacts GitHub and npm token shapes it was never told about', () => {
    const redactor = createRedactor()

    expect(redactor.redactText('ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe(REDACTED)
    expect(redactor.redactText('npm_abcdefghijklmnopqrstuvwxyz0123')).toBe(REDACTED)
  })

  it('redacts sensitive object keys entirely', () => {
    const redactor = createRedactor()

    expect(redactor.redactValue({ authToken: 'anything', branch: 'main' })).toEqual({
      authToken: REDACTED,
      branch: 'main',
    })
  })

  it('keeps an error usable while redacting its message, stack and own fields', () => {
    const redactor = createRedactor()
    redactor.registerSecret('super-secret-value')
    const error = Object.assign(new Error('failed with super-secret-value'), {
      kind: 'CommandFailed',
      details: { commandLine: 'npm publish --token super-secret-value' },
    })

    const redacted = redactor.redactValue(error)

    expect(redacted).toBeInstanceOf(Error)
    expect(redacted.message).toBe(`failed with ${REDACTED}`)
    expect(redacted.stack).toContain(REDACTED)
    expect(redacted.stack).not.toContain('super-secret-value')
    expect(redacted.kind).toBe('CommandFailed')
    expect(redacted.details).toEqual({ commandLine: `npm publish --token ${REDACTED}` })
  })

  it('ignores short values that would over-redact', () => {
    const redactor = createRedactor()
    redactor.registerSecret('abc')

    expect(redactor.redactText('abc')).toBe('abc')
  })
})
