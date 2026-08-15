import { EXIT_CODES } from './exit-codes.js'

/**
 * Reports a command that has no implementation yet. The exit code is set so a
 * script or CI job invoking a stub fails loudly instead of reading silence on
 * stdout as a completed release.
 */
export function reportNotImplemented(command: string): void {
  console.error(`releaser ${command}: not implemented yet`)
  process.exitCode = EXIT_CODES.internalError
}
