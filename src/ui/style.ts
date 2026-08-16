import type { OutputEnvironment, SemanticState } from './models.js'

const ANSI_PATTERN = new RegExp(
  String.raw`\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))`,
  'gu',
)
const CONTROL_PATTERN = new RegExp(
  String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]`,
  'gu',
)

const COLORS: Record<SemanticState, string> = {
  success: '\u001B[32m',
  warning: '\u001B[33m',
  failure: '\u001B[31m',
  active: '\u001B[36m',
  muted: '\u001B[2m',
}

export function sanitizeTerminalText(value: string): string {
  return value.replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '')
}

export function styleText(
  value: string,
  state: SemanticState,
  environment: OutputEnvironment,
): string {
  const safeValue = sanitizeTerminalText(value)
  return environment.colorEnabled ? `${COLORS[state]}${safeValue}\u001B[0m` : safeValue
}
