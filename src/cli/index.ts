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
    process.exit(EXIT_CODES.internalError)
  }

  console.error(error instanceof Error ? error.message : String(error))
  process.exit(EXIT_CODES.internalError)
})
