import { describe, expect, it } from 'vitest'
import { createNpmCommand } from '../../src/npm/npm-command.js'
import { createPackageInspector } from '../../src/npm/package-inspection.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

const inspection = {
  id: '@scope/example@1.0.0',
  name: '@scope/example',
  version: '1.0.0',
  filename: 'scope-example-1.0.0.tgz',
  size: 100,
  unpackedSize: 200,
  shasum: 'abc',
  integrity: 'sha512-abc',
  files: [{ path: 'dist/index.js', size: 20, mode: 420 }],
}

describe('npm package inspection', () => {
  it('normalizes npm pack --dry-run output', async () => {
    const runner = createFakeCommandRunner()
    runner.stub('npm pack', { stdout: JSON.stringify([inspection]) })
    const inspector = createPackageInspector(createNpmCommand(runner))

    await expect(inspector.packDryRun('/repo')).resolves.toEqual(inspection)
    expect(runner.commandLines()).toEqual(['npm pack --dry-run --json'])
  })

  it('passes explicit publish dry-run options', async () => {
    const runner = createFakeCommandRunner()
    runner.stub('npm publish', { stdout: JSON.stringify([inspection]) })
    const inspector = createPackageInspector(createNpmCommand(runner))

    await expect(
      inspector.publishDryRun('/repo', { access: 'restricted', tag: 'next' }),
    ).resolves.toEqual(inspection)
    expect(runner.commandLines()).toEqual([
      'npm publish --dry-run --json --access restricted --tag next',
    ])
  })
})
