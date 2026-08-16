import { LifecycleScriptFailed, OtpRequired, VersionAlreadyPublished } from '../domain/errors.js'
import type { NpmCommand } from './npm-command.js'
import { parseInspection } from './inspection.js'
import type { NpmPublishAttempt, NpmPublishRequest } from './types.js'

const OTP_PATTERN = /(?:\bEOTP\b|one-time password)/iu
const CONFLICT_PATTERN = /(?:\bEPUBLISHCONFLICT\b|cannot publish over|previously published)/iu
const LIFECYCLE_PATTERN = /npm error code ELIFECYCLE|npm ERR! code ELIFECYCLE|command failed/iu
const SCRIPT_PATTERN =
  /(?:npm error|npm ERR!)?\s*(?:Lifecycle script [`']?|command failed while executing [`']?)(prepublishOnly|prepack|prepare|postpublish)/iu

function lifecycleScript(output: string): string | null {
  const match = SCRIPT_PATTERN.exec(output)
  if (match?.[1] !== undefined) {
    return match[1]
  }

  for (const script of ['prepublishOnly', 'prepack', 'prepare', 'postpublish']) {
    if (output.includes(script)) {
      return script
    }
  }
  return null
}

export function createPublisher(command: NpmCommand): {
  attemptPublish(request: NpmPublishRequest): Promise<NpmPublishAttempt>
} {
  return {
    async attemptPublish(request): Promise<NpmPublishAttempt> {
      const args = ['publish', '--json', '--access', request.access, '--tag', request.tag]
      if (request.otp !== undefined) {
        args.push('--otp', request.otp)
      }
      const result = await command.run(args)

      if (result.exitCode === 0) {
        return { kind: 'published', inspection: parseInspection(result, 'publishing the package') }
      }

      const output = `${result.stdout}\n${result.stderr}`
      if (OTP_PATTERN.test(output)) {
        throw new OtpRequired(request.otp === undefined)
      }
      if (CONFLICT_PATTERN.test(output)) {
        throw new VersionAlreadyPublished(`${request.packageName}@${request.version}`)
      }
      const script = lifecycleScript(output)
      if (script !== null && LIFECYCLE_PATTERN.test(output)) {
        throw new LifecycleScriptFailed(script, output)
      }

      return {
        kind: 'unknown',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }
    },
  }
}
