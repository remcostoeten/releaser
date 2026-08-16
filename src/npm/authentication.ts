import { NpmRegistryUnavailable } from '../domain/errors.js'
import { NpmUsername } from '../domain/semantic.js'
import type { NpmCommand } from './npm-command.js'
import type { NpmAuthentication } from './types.js'

const AUTH_FAILURE_PATTERN = /(?:\bE401\b|\bE403\b|\bENEEDAUTH\b|not logged in)/iu

function readUsername(output: string): string | null {
  try {
    const value: unknown = JSON.parse(output)
    return typeof value === 'string' ? value : null
  } catch {
    return output.trim() || null
  }
}

export function createAuthenticationReader(command: NpmCommand): {
  readAuthentication(): Promise<NpmAuthentication>
} {
  return {
    async readAuthentication(): Promise<NpmAuthentication> {
      const result = await command.run(['whoami', '--json'])

      if (result.exitCode === 0) {
        const username = readUsername(result.stdout)
        return username === null
          ? { kind: 'anonymous' }
          : { kind: 'authenticated', user: NpmUsername.from(username, 'npm whoami') }
      }

      const output = `${result.stdout}\n${result.stderr}`
      if (AUTH_FAILURE_PATTERN.test(output)) {
        return { kind: 'anonymous' }
      }

      throw new NpmRegistryUnavailable('npm authentication could not be resolved', {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    },
  }
}
