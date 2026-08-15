import { describe, expect, it } from 'vitest'
import {
  NpmAuthFailed,
  NpmRegistryUnavailable,
  VersionAlreadyPublished,
} from '../../src/domain/errors.js'
import { PackageName, SemVer } from '../../src/domain/semantic.js'
import { createNpmCommand } from '../../src/npm/npm-command.js'
import { assertVersionUnpublished, createRegistryReader } from '../../src/npm/registry.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

const packageName = PackageName.from('@scope/example', 'test package')
const version = SemVer.from('1.2.3', 'test version')

function registry() {
  const runner = createFakeCommandRunner()
  return { reader: createRegistryReader(createNpmCommand(runner)), runner }
}

describe('npm registry', () => {
  it('normalizes published versions and dist-tags', async () => {
    const { reader, runner } = registry()
    runner.stub('npm view', {
      stdout: JSON.stringify({
        versions: ['1.0.0', '1.2.3', '2.0.0-beta.1'],
        'dist-tags': { latest: '1.2.3', beta: '2.0.0-beta.1' },
      }),
    })

    await expect(reader.readPackage(packageName, '/repo')).resolves.toEqual({
      kind: 'published',
      versions: ['1.0.0', '1.2.3', '2.0.0-beta.1'],
      latest: '1.2.3',
      highest: '2.0.0-beta.1',
    })
  })

  it('treats E404 as an unpublished package', async () => {
    const { reader, runner } = registry()
    runner.stub('npm view', { exitCode: 1, stderr: 'npm error code E404' })

    await expect(reader.readPackage(packageName, '/repo')).resolves.toEqual({
      kind: 'never-published',
    })
  })

  it.each(['E401', 'E403'])('maps %s to authentication failure', async (code) => {
    const { reader, runner } = registry()
    runner.stub('npm view', { exitCode: 1, stderr: `npm error code ${code}` })

    await expect(reader.readPackage(packageName, '/repo')).rejects.toBeInstanceOf(NpmAuthFailed)
  })

  it('does not mistake a network failure for an unpublished package', async () => {
    const { reader, runner } = registry()
    runner.stub('npm view', { exitCode: 1, stderr: 'npm error code ENETUNREACH' })

    await expect(reader.readPackage(packageName, '/repo')).rejects.toBeInstanceOf(
      NpmRegistryUnavailable,
    )
  })

  it('detects an already-published version', () => {
    expect(() =>
      assertVersionUnpublished(
        { kind: 'published', versions: [version], latest: version, highest: version },
        version,
      ),
    ).toThrow(VersionAlreadyPublished)
  })

  it('reads authentication through npm whoami', async () => {
    const { reader, runner } = registry()
    runner.stub('npm whoami', { stdout: '{"username":"remco"}' })

    await expect(reader.readAuthentication('/repo')).resolves.toEqual({
      kind: 'authenticated',
      user: 'remco',
    })
  })
})
