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

  it('ignores short values that would over-redact', () => {
    const redactor = createRedactor()
    redactor.registerSecret('abc')

    expect(redactor.redactText('abc')).toBe('abc')
  })
})
