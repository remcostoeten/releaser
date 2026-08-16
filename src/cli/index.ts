#!/usr/bin/env node
import { createRequire } from 'node:module'
import { isReleaserError } from '../domain/errors.js'
import { defaultRedactor } from '../shared/redaction.js'
import { createProgram } from './create-program.js'
import { renderReleaserError, renderUnknownError } from './error-output.js'
import { EXIT_CODES } from './exit-codes.js'
import { createCliOutputContext } from './output-context.js'

const require = createRequire(import.meta.url)
const manifest = require('../../package.json') as { version: string }

async function main(): Promise<void> {
  const program = createProgram(manifest.version)
  await program.parseAsync(process.argv)
}

main().catch((error: unknown) => {
  const output = createCliOutputContext({
    json: process.argv.includes('--json'),
    verbose: process.argv.includes('--verbose'),
  })
  for (const name of ['GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'NODE_AUTH_TOKEN'] as const) {
    const secret = process.env[name]
    if (secret !== undefined) {
      defaultRedactor.registerSecret(secret)
    }
  }
  if (isReleaserError(error)) {
    console.error(renderReleaserError(error, output.stderr.colorEnabled))
    if (output.verbose && error.stack !== undefined) {
      console.error(defaultRedactor.redactText(error.stack))
    }
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

  console.error(renderUnknownError(error, output.verbose))
  process.exit(EXIT_CODES.internalError)
})
