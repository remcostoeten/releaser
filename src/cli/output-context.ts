import type { OutputEnvironment } from '../ui/index.js'

export type CliOutputOptions = {
  json?: boolean
  verbose?: boolean
}

export type CliOutputContext = {
  json: boolean
  verbose: boolean
  stdout: OutputEnvironment
  stderr: OutputEnvironment
}

type OutputStream = {
  isTTY?: boolean
}

type OutputContextEnvironment = {
  NO_COLOR?: string
}

export function createCliOutputContext(
  options: CliOutputOptions,
  streams: { stdout: OutputStream; stderr: OutputStream } = process,
  environment: OutputContextEnvironment = process.env,
): CliOutputContext {
  const colorAllowed = options.json !== true && environment.NO_COLOR === undefined
  return {
    json: options.json === true,
    verbose: options.verbose === true,
    stdout: { colorEnabled: colorAllowed && streams.stdout.isTTY === true },
    stderr: { colorEnabled: colorAllowed && streams.stderr.isTTY === true },
  }
}
