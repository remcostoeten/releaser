import { describe, expect, it } from 'vitest'
import {
  LifecycleScriptFailed,
  OtpRequired,
  VersionAlreadyPublished,
} from '../../src/domain/errors.js'
import { DistTagName, PackageName, SemVer } from '../../src/domain/semantic.js'
import { createPackageInspector } from '../../src/npm/inspection.js'
import { createNpmCommand } from '../../src/npm/npm-command.js'
import { createPublisher } from '../../src/npm/publisher.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

const INSPECTION = JSON.stringify([
  {
    name: '@example/tool',
    version: '1.2.3',
    filename: 'example-tool-1.2.3.tgz',
    files: [{ path: 'dist/index.js', size: 12, mode: 420 }],
    size: 100,
    unpackedSize: 200,
    shasum: '0123456789abcdef0123456789abcdef01234567',
    integrity: 'sha512-YWJjZA==',
  },
])
const PUBLISH_INSPECTION = JSON.stringify({ '@example/tool': JSON.parse(INSPECTION)[0] })

const PUBLISH_REQUEST = {
  packageName: PackageName.from('@example/tool', 'test'),
  version: SemVer.from('1.2.3', 'test'),
  access: 'public' as const,
  tag: DistTagName.from('latest', 'test'),
}

function setup() {
  const runner = createFakeCommandRunner()
  const command = createNpmCommand(runner, '/workspace')
  return {
    runner,
    inspector: createPackageInspector(command),
    publisher: createPublisher(command),
  }
}

describe('npm package inspection', () => {
  it('constructs pack and publish dry-run commands and parses package details', async () => {
    const { runner, inspector } = setup()
    runner.stub('npm pack --dry-run --json', { stdout: INSPECTION })
    runner.stub('npm publish --dry-run --json --access restricted --tag next', {
      stdout: PUBLISH_INSPECTION,
    })

    await expect(inspector.packDryRun()).resolves.toMatchObject({
      name: '@example/tool',
      version: '1.2.3',
      packedSize: 100,
      unpackedSize: 200,
      shasum: '0123456789abcdef0123456789abcdef01234567',
    })
    await inspector.publishDryRun('restricted', 'next')

    expect(runner.commandLines()).toEqual([
      'npm pack --dry-run --json',
      'npm publish --dry-run --json --access restricted --tag next',
    ])
  })
})

describe('npm publication', () => {
  it('returns an unknown outcome for an ambiguous publish failure', async () => {
    const { runner, publisher } = setup()
    runner.stub('npm publish', { exitCode: 1, stderr: 'socket closed after upload' })

    await expect(
      publisher.attemptPublish({
        ...PUBLISH_REQUEST,
      }),
    ).resolves.toMatchObject({ kind: 'unknown', exitCode: 1 })
  })

  it('reports OTP requirements without exposing the OTP', async () => {
    const withoutOtp = setup()
    withoutOtp.runner.stub('npm publish', { exitCode: 1, stderr: 'npm error code EOTP' })

    await expect(
      withoutOtp.publisher.attemptPublish({
        ...PUBLISH_REQUEST,
      }),
    ).rejects.toMatchObject({ kind: 'OtpRequired', details: { retryPossible: true } })

    const withOtp = setup()
    withOtp.runner.stub('npm publish', { exitCode: 1, stderr: 'npm error code EOTP' })
    await expect(
      withOtp.publisher.attemptPublish({
        ...PUBLISH_REQUEST,
        otp: '123456',
      }),
    ).rejects.toBeInstanceOf(OtpRequired)
    expect(withOtp.runner.commandLines()[0]).toContain('--otp 123456')
  })
})

describe('npm publication failures', () => {
  it('maps conflicts and lifecycle failures to typed errors', async () => {
    const conflict = setup()
    conflict.runner.stub('npm publish', {
      exitCode: 1,
      stderr: 'npm error code EPUBLISHCONFLICT',
    })
    await expect(
      conflict.publisher.attemptPublish({
        ...PUBLISH_REQUEST,
      }),
    ).rejects.toBeInstanceOf(VersionAlreadyPublished)

    const lifecycle = setup()
    lifecycle.runner.stub('npm publish', {
      exitCode: 1,
      stderr: "npm error code ELIFECYCLE\nnpm error Lifecycle script 'prepack' failed",
    })
    await expect(
      lifecycle.publisher.attemptPublish({
        ...PUBLISH_REQUEST,
      }),
    ).rejects.toBeInstanceOf(LifecycleScriptFailed)
  })
})
