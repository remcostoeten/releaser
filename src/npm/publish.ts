import { LifecycleScriptFailed, OtpRequired, VersionAlreadyPublished } from '../domain/errors.js'
import type { NpmPublishAction } from '../domain/actions.js'
import type { NpmCommand } from './npm-command.js'
import { commandOutput } from './npm-command.js'

export type PublishAttempt =
  | { kind: 'succeeded'; output: string }
  | { kind: 'unknown'; output: string; exitCode: number }

export type PublishOptions = {
  cwd: string
  otp?: string
}

export type NpmPublisher = {
  publish(
    action: Extract<NpmPublishAction, { kind: 'publish' }>,
    options: PublishOptions,
  ): Promise<PublishAttempt>
}

export function createNpmPublisher(npm: NpmCommand): NpmPublisher {
  return {
    async publish(action, options): Promise<PublishAttempt> {
      const args = ['publish', '--access', action.access, '--tag', action.distTag, '--json']
      if (options.otp !== undefined) {
        args.push('--otp', options.otp)
      }

      const result = await npm.run(args, options.cwd)
      const output = commandOutput(result)
      if (result.exitCode === 0) {
        return { kind: 'succeeded', output }
      }
      if (/EOTP/iu.test(output)) {
        throw new OtpRequired(options.otp === undefined)
      }
      if (/EPUBLISHCONFLICT/iu.test(output)) {
        throw new VersionAlreadyPublished(action.version)
      }
      const lifecycleScript = findLifecycleScript(output)
      if (lifecycleScript !== null) {
        throw new LifecycleScriptFailed(lifecycleScript, output)
      }
      return { kind: 'unknown', output, exitCode: result.exitCode }
    },
  }
}

function findLifecycleScript(output: string): string | null {
  const match = output.match(
    /(?:npm ERR! code ELIFECYCLE[\s\S]*?npm ERR! ([^\s]+)|Lifecycle script [`']([^`']+)[`'] failed)/iu,
  )
  return match?.[1] ?? match?.[2] ?? null
}
