import type { Command } from 'commander'
import { renderCompletion } from '../completions.js'

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion <shell>')
    .description('Print shell completion setup for bash, zsh, or fish')
    .action((shell: string) => {
      console.log(renderCompletion(shell))
    })
}
