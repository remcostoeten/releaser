import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { InvalidWorkingDirectory } from '../domain/errors.js'

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export async function resolveWorkingDirectory(cwd: string | undefined): Promise<string> {
  const candidate = resolve(cwd ?? process.cwd())
  try {
    return await realpath(candidate)
  } catch (error) {
    if (isMissingPath(error)) {
      throw new InvalidWorkingDirectory(candidate)
    }
    throw error
  }
}
