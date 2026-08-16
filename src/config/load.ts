import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseConfig, type ReleaserConfig } from './schema.js'

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function loadConfig(root: string): Promise<ReleaserConfig> {
  const configPath = join(root, 'releaser.config.json')
  const config = await readJson(configPath)
  if (config !== null) {
    return parseConfig(config, configPath)
  }
  const manifestPath = join(root, 'package.json')
  const manifest = await readJson(manifestPath)
  const embedded =
    manifest !== null && typeof manifest === 'object' && 'releaser' in manifest
      ? (manifest as { releaser: unknown }).releaser
      : {}
  return parseConfig(embedded, `${manifestPath}#releaser`)
}
