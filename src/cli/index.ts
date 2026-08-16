#!/usr/bin/env node
import { createRequire } from 'node:module'
import { isReleaserError } from '../domain/errors.js'
import { createProgram } from './create-program.js'
import { EXIT_CODES } from './exit-codes.js'

const require = createRequire(import.meta.url)
const manifest = require('../../package.json') as { version: string }

async function main(): Promise<void> {
  const program = createProgram(manifest.version)
  await program.parseAsync(process.argv)
}

main().catch((error: unknown) => {
  if (isReleaserError(error)) {
    console.error(`${error.kind}: ${error.message}`)
    console.error(error.remediation)
    const code =
      error.kind === 'UsageError'
        ? EXIT_CODES.usageError
        : error.kind === 'PreflightFailed'
          ? EXIT_CODES.preflightFailed
          : error.kind === 'Cancelled' || error.kind === 'CancelledAfterPreparation'
            ? EXIT_CODES.cancelled
            : error.kind === 'PartialRelease'
              ? EXIT_CODES.partialRelease
              : error.kind.endsWith('AuthFailed') || error.kind === 'OtpRequired'
                ? EXIT_CODES.authenticationFailure
                : EXIT_CODES.internalError
    process.exit(code)
  }

  console.error(error instanceof Error ? error.message : String(error))
  process.exit(EXIT_CODES.internalError)
})
