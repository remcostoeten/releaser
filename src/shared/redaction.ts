export const REDACTED = '[redacted]'

export type Redactor = {
  registerSecret(secret: string): void
  redactText(text: string): string
  redactValue<T>(value: T): T
}

const TOKEN_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{16,}/gu,
  /github_pat_[A-Za-z0-9_]{20,}/gu,
  /npm_[A-Za-z0-9]{20,}/gu,
  /\b_authToken\s*=\s*\S+/giu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gu,
  /--otp[=\s]+\d{4,}/gu,
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/gu,
]

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|passwd|authorization|auth|otp|apikey|api_key|credential/iu

const MINIMUM_SECRET_LENGTH = 8

function escapeForRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
}

/**
 * Creates a redaction pass. Register known secret values as they are read from
 * the environment; pattern matching covers the tokens that were never handed
 * to us directly, such as those echoed back by a child process.
 */
export function createRedactor(): Redactor {
  const secrets = new Set<string>()

  function redactText(text: string): string {
    let output = text

    for (const secret of secrets) {
      output = output.replaceAll(new RegExp(escapeForRegExp(secret), 'gu'), REDACTED)
    }

    for (const pattern of TOKEN_PATTERNS) {
      output = output.replaceAll(new RegExp(pattern.source, pattern.flags), REDACTED)
    }

    return output
  }

  function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') {
      return redactText(value)
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    if (seen.has(value)) {
      return '[circular]'
    }
    seen.add(value)

    if (Array.isArray(value)) {
      return value.map((entry) => redactUnknown(entry, seen))
    }

    if (value instanceof Error) {
      const redactedError = new Error(redactText(value.message))
      redactedError.name = value.name
      return redactedError
    }

    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactUnknown(entry, seen)
    }
    return result
  }

  return {
    registerSecret(secret: string): void {
      if (secret.length >= MINIMUM_SECRET_LENGTH) {
        secrets.add(secret)
      }
    },
    redactText,
    redactValue<T>(value: T): T {
      return redactUnknown(value, new WeakSet()) as T
    },
  }
}

export const defaultRedactor: Redactor = createRedactor()
