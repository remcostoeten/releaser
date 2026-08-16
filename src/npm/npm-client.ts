import type { CommandRunner } from '../shared/command-runner.js'
import { createAuthenticationReader } from './authentication.js'
import { createPackageInspector } from './inspection.js'
import { createNpmCommand } from './npm-command.js'
import { createPublisher } from './publisher.js'
import { createRegistryReader } from './registry.js'

export function createNpmClient(runner: CommandRunner, cwd: string) {
  const command = createNpmCommand(runner, cwd)
  return {
    command,
    ...createRegistryReader(command),
    ...createAuthenticationReader(command),
    ...createPackageInspector(command),
    ...createPublisher(command),
  }
}
