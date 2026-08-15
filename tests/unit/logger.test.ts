import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/shared/logger.js'
import { createRedactor, REDACTED } from '../../src/shared/redaction.js'

function capturingLogger(options: { json?: boolean } = {}) {
  const lines: string[] = []
  const logger = createLogger({
    json: options.json ?? false,
    level: 'debug',
    write: (line) => lines.push(line),
  })
  return { logger, lines }
}

describe('logger', () => {
  it('writes an attached error as a readable object rather than an empty one', () => {
    const { logger, lines } = capturingLogger({ json: true })

    logger.error('publish failed', new Error('boom'))

    const record = JSON.parse(lines[0] ?? '{}')
    expect(record.data).toMatchObject({ name: 'Error', message: 'boom' })
    expect(record.data.stack).toContain('boom')
  })

  it('expands an error nested inside attached data', () => {
    const { logger, lines } = capturingLogger({ json: true })

    logger.warn('stage failed', { stage: 'npm-publish', error: new TypeError('bad input') })

    const record = JSON.parse(lines[0] ?? '{}')
    expect(record.data.stage).toBe('npm-publish')
    expect(record.data.error).toMatchObject({ name: 'TypeError', message: 'bad input' })
  })

  it('redacts secrets in the message and the attached data', () => {
    const lines: string[] = []
    const redactor = createRedactor()
    redactor.registerSecret('super-secret-value')
    const logger = createLogger({
      json: true,
      level: 'debug',
      redactor,
      write: (line) => lines.push(line),
    })

    logger.info('using super-secret-value', { token: 'super-secret-value' })

    expect(lines[0]).toContain(REDACTED)
    expect(lines[0]).not.toContain('super-secret-value')
  })

  it('drops entries below the configured level', () => {
    const lines: string[] = []
    const logger = createLogger({ level: 'warn', write: (line) => lines.push(line) })

    logger.debug('quiet')
    logger.info('quiet')
    logger.warn('loud')

    expect(lines).toEqual(['warn: loud'])
  })
})
