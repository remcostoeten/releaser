import { defaultRedactor, type Redactor } from './redaction.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type Logger = {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export type LoggerOptions = {
  level?: LogLevel
  json?: boolean
  write?: (line: string) => void
  redactor?: Redactor
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function writeToStderr(line: string): void {
  process.stderr.write(`${line}\n`)
}

/**
 * Creates a logger. Human output and structured records both go to stderr, so
 * that stdout stays reserved for machine-readable `--json` payloads. Every
 * message and every attached object passes through redaction before it is
 * written.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const json = options.json ?? false
  const write = options.write ?? writeToStderr
  const redactor = options.redactor ?? defaultRedactor

  function emit(entryLevel: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[entryLevel] < LEVEL_ORDER[level]) {
      return
    }

    const safeMessage = redactor.redactText(message)
    const safeData = data === undefined ? undefined : redactor.redactValue(data)

    if (json) {
      write(JSON.stringify({ level: entryLevel, message: safeMessage, data: safeData ?? null }))
      return
    }

    const suffix = safeData === undefined ? '' : ` ${JSON.stringify(safeData)}`
    write(`${entryLevel}: ${safeMessage}${suffix}`)
  }

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  }
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}
