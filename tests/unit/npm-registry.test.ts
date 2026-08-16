import { describe, expect, it } from 'vitest'
import { NpmRegistryUnauthorized, NpmRegistryUnavailable } from '../../src/domain/errors.js'
import { createAuthenticationReader } from '../../src/npm/authentication.js'
import { createNpmCommand } from '../../src/npm/npm-command.js'
import { createRegistryReader } from '../../src/npm/registry.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

function setup() {
  const runner = createFakeCommandRunner()
  const command = createNpmCommand(runner, '/workspace')
  return {
    runner,
    registry: createRegistryReader(command),
    authentication: createAuthenticationReader(command),
  }
}

describe('npm registry state', () => {
  it('reads versions and the latest dist-tag through npm', async () => {
    const { runner, registry } = setup()
    runner.stub('npm view @example/tool', {
      stdout: JSON.stringify({
        name: '@example/tool',
        versions: ['1.0.0', '1.1.0'],
        'dist-tags': { latest: '1.1.0' },
      }),
    })

    await expect(registry.readPackage('@example/tool')).resolves.toEqual({
      kind: 'found',
      package: {
        name: '@example/tool',
        versions: ['1.0.0', '1.1.0'],
        latest: '1.1.0',
      },
    })
    await expect(registry.versionExists('@example/tool', '1.1.0')).resolves.toBe(true)
    expect(runner.commandLines()[0]).toBe('npm view @example/tool name versions dist-tags --json')
  })

  it('distinguishes an unpublished package from registry failures', async () => {
    const notFound = setup()
    notFound.runner.stub('npm view new-package', { exitCode: 1, stderr: 'npm error code E404' })
    await expect(notFound.registry.readPublishedVersions('new-package')).resolves.toEqual({
      kind: 'never-published',
    })

    const forbidden = setup()
    forbidden.runner.stub('npm view hidden-package', { exitCode: 1, stderr: 'npm error code E403' })
    await expect(forbidden.registry.readPackage('hidden-package')).rejects.toBeInstanceOf(
      NpmRegistryUnauthorized,
    )

    const unreachable = setup()
    unreachable.runner.stub('npm view existing-package', {
      exitCode: 1,
      stderr: 'npm error code EAI_AGAIN',
    })
    await expect(unreachable.registry.readPackage('existing-package')).rejects.toBeInstanceOf(
      NpmRegistryUnavailable,
    )
  })
})

describe('npm authentication', () => {
  it('returns the authenticated npm username', async () => {
    const { runner, authentication } = setup()
    runner.stub('npm whoami --json', { stdout: '"release-bot"\n' })

    await expect(authentication.readAuthentication()).resolves.toEqual({
      kind: 'authenticated',
      user: 'release-bot',
    })
  })

  it('returns anonymous for authentication failures and not for network failures', async () => {
    const anonymous = setup()
    anonymous.runner.stub('npm whoami --json', { exitCode: 1, stderr: 'npm error code ENEEDAUTH' })
    await expect(anonymous.authentication.readAuthentication()).resolves.toEqual({
      kind: 'anonymous',
    })

    const unreachable = setup()
    unreachable.runner.stub('npm whoami --json', {
      exitCode: 1,
      stderr: 'npm error code ECONNRESET',
    })
    await expect(unreachable.authentication.readAuthentication()).rejects.toBeInstanceOf(
      NpmRegistryUnavailable,
    )
  })
})
