import { describe, expect, it } from 'vitest'
import {
  LifecycleScriptFailed,
  OtpRequired,
  VersionAlreadyPublished,
} from '../../src/domain/errors.js'
import type { NpmPublishAction } from '../../src/domain/actions.js'
import { DistTagName, PackageName, SemVer } from '../../src/domain/semantic.js'
import { createNpmCommand } from '../../src/npm/npm-command.js'
import { createNpmPublisher } from '../../src/npm/publish.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

const action: Extract<NpmPublishAction, { kind: 'publish' }> = {
  kind: 'publish',
  packageName: PackageName.from('@scope/example', 'test package'),
  version: SemVer.from('2.0.0-beta.1', 'test version'),
  distTag: DistTagName.from('beta', 'test dist-tag'),
  access: 'public',
}

function publisher() {
  const runner = createFakeCommandRunner()
  return { publish: createNpmPublisher(createNpmCommand(runner)), runner }
}

describe('npm publication boundary', () => {
  it('constructs an explicit access and dist-tag command', async () => {
    const { publish, runner } = publisher()

    await expect(publish.publish(action, { cwd: '/repo' })).resolves.toMatchObject({
      kind: 'succeeded',
    })
    expect(runner.commandLines()).toEqual(['npm publish --access public --tag beta --json'])
  })

  it('reports an ambiguous failure as unknown and never retries', async () => {
    const { publish, runner } = publisher()
    runner.stub('npm publish', { exitCode: 1, stderr: 'socket closed after upload' })

    await expect(publish.publish(action, { cwd: '/repo' })).resolves.toEqual({
      kind: 'unknown',
      output: 'socket closed after upload',
      exitCode: 1,
    })
    expect(runner.calls).toHaveLength(1)
  })

  it('reports whether EOTP can be retried with an OTP', async () => {
    const { publish, runner } = publisher()
    runner.stub('npm publish', { exitCode: 1, stderr: 'npm error code EOTP' })

    await expect(publish.publish(action, { cwd: '/repo' })).rejects.toMatchObject({
      kind: 'OtpRequired',
      details: { canRetryWithOtp: true },
    })
    await expect(publish.publish(action, { cwd: '/repo', otp: '123456' })).rejects.toMatchObject({
      kind: 'OtpRequired',
      details: { canRetryWithOtp: false },
    })
  })

  it('maps an npm publish conflict', async () => {
    const { publish, runner } = publisher()
    runner.stub('npm publish', { exitCode: 1, stderr: 'npm error code EPUBLISHCONFLICT' })

    await expect(publish.publish(action, { cwd: '/repo' })).rejects.toBeInstanceOf(
      VersionAlreadyPublished,
    )
  })

  it('maps lifecycle script failures with captured output', async () => {
    const { publish, runner } = publisher()
    runner.stub('npm publish', {
      exitCode: 1,
      stderr: 'npm ERR! code ELIFECYCLE\nnpm ERR! prepack failed',
    })

    await expect(publish.publish(action, { cwd: '/repo' })).rejects.toBeInstanceOf(
      LifecycleScriptFailed,
    )
  })

  it('passes an OTP only when explicitly supplied', async () => {
    const { publish, runner } = publisher()
    runner.stub('npm publish', { exitCode: 1, stderr: 'npm error code EOTP' })

    await expect(publish.publish(action, { cwd: '/repo', otp: '654321' })).rejects.toBeInstanceOf(
      OtpRequired,
    )
    expect(runner.calls[0]?.args).toContain('654321')
  })
})
