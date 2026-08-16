import { UsageError } from '../domain/errors.js'

export type CompletionShell = 'bash' | 'zsh' | 'fish'

const COMMANDS = 'plan status doctor scan resume ship finalize completion'
const GLOBAL_OPTIONS =
  '-V --cli-version --bump --version --tag --dry-run --yes --no-interactive --json --otp --cwd --verbose --help'
const SHIP_OPTIONS = '--target -m --message --merge-message'
const FINALIZE_OPTIONS = '--no-wait --poll --timeout'
const BUMP_VALUES = 'patch minor major prerelease'
const SHELL_VALUES = 'bash zsh fish'

function bashCompletion(): string {
  return [
    '_releaser_completion() {',
    '  local current previous command options',
    '  current="${COMP_WORDS[COMP_CWORD]}"',
    '  previous="${COMP_WORDS[COMP_CWORD-1]}"',
    '  command="${COMP_WORDS[1]}"',
    `  options="${GLOBAL_OPTIONS}"`,
    '  case "$command" in',
    `    ship) options="$options ${SHIP_OPTIONS}" ;;`,
    `    finalize) options="$options ${FINALIZE_OPTIONS}" ;;`,
    '  esac',
    '  case "$previous" in',
    `    --bump) COMPREPLY=( $(compgen -W "${BUMP_VALUES}" -- "$current") ); return ;;`,
    `    completion) COMPREPLY=( $(compgen -W "${SHELL_VALUES}" -- "$current") ); return ;;`,
    '    --target) COMPREPLY=( $(compgen -W "$(git branch --format=\'%(refname:short)\' 2>/dev/null)" -- "$current") ); return ;;',
    '  esac',
    '  if [[ "$current" == -* ]]; then',
    '    COMPREPLY=( $(compgen -W "$options" -- "$current") )',
    '  elif (( COMP_CWORD == 1 )); then',
    `    COMPREPLY=( $(compgen -W "${COMMANDS}" -- "$current") )`,
    '  elif [[ "$command" == "ship" && "$current" != -* ]]; then',
    '    COMPREPLY=( $(compgen -W "$(git branch --format=\'%(refname:short)\' 2>/dev/null)" -- "$current") )',
    '  fi',
    '}',
    'complete -F _releaser_completion releaser',
  ].join('\n')
}

function zshCompletion(): string {
  return [
    '#compdef releaser',
    '_releaser() {',
    '  local -a commands global_options',
    '  commands=(',
    "    'plan:build and display a release plan'",
    "    'status:show repository and registry state'",
    "    'doctor:run release preflight checks'",
    "    'scan:find version occurrences'",
    "    'resume:continue an interrupted release'",
    "    'ship:commit, merge, and release a feature branch'",
    "    'finalize:publish a draft release after its workflows pass'",
    "    'completion:print shell completion setup'",
    '  )',
    '  global_options=(',
    "    '(-V --cli-version)'{-V,--cli-version}'[output the releaser version]'",
    "    '--bump[release increment]:kind:(patch minor major prerelease)'",
    "    '--version[explicit target version]:semver:'",
    "    '--tag[npm dist-tag]:dist-tag:'",
    "    '--dry-run[perform no persistent writes]'",
    "    '--yes[approve prompts and overridable checks]'",
    "    '--no-interactive[never prompt]'",
    "    '--json[write JSON to stdout]'",
    "    '--otp[sensitive npm one-time password]:code:'",
    "    '--cwd[run against another directory]:directory:_directories'",
    "    '--verbose[include diagnostics and error stacks]'",
    "    '(-h --help)'{-h,--help}'[display help]'",
    '  )',
    '  _arguments -C $global_options',
    "    '1:command:->command'",
    "    '*::argument:->arguments'",
    '  case $state in',
    '    command) _describe command commands ;;',
    '    arguments)',
    '      case $words[2] in',
    "        ship) _arguments '--target[release branch]:branch:__git_branch_names' '(-m --message)'{-m,--message}'[feature commit message]:message:' '--merge-message[merge commit message]:message:' ;;",
    "        finalize) _arguments '--no-wait[publish without waiting]' '--poll[poll interval]:seconds:' '--timeout[timeout]:minutes:' ;;",
    '        completion) _values shell bash zsh fish ;;',
    '      esac',
    '      ;;',
    '  esac',
    '}',
    '_releaser "$@"',
  ].join('\n')
}

function fishCompletion(): string {
  const lines = [
    'complete -c releaser -f',
    `complete -c releaser -n '__fish_use_subcommand' -a '${COMMANDS}'`,
    "complete -c releaser -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -l target -d 'Release branch' -a '(__fish_git_branches)'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -s m -l message -d 'Feature commit message'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -l merge-message -d 'Merge commit message'",
    "complete -c releaser -n '__fish_seen_subcommand_from finalize' -l no-wait -d 'Publish without waiting'",
    "complete -c releaser -n '__fish_seen_subcommand_from finalize' -l poll -d 'Poll interval in seconds'",
    "complete -c releaser -n '__fish_seen_subcommand_from finalize' -l timeout -d 'Timeout in minutes'",
    "complete -c releaser -s V -l cli-version -d 'Output releaser version'",
    "complete -c releaser -l bump -d 'Release increment' -a 'patch minor major prerelease'",
    "complete -c releaser -l version -d 'Explicit target version'",
    "complete -c releaser -l tag -d 'npm dist-tag'",
    "complete -c releaser -l dry-run -d 'Perform no persistent writes'",
    "complete -c releaser -l yes -d 'Approve prompts and overridable checks'",
    "complete -c releaser -l no-interactive -d 'Never prompt'",
    "complete -c releaser -l json -d 'Write JSON to stdout'",
    "complete -c releaser -l otp -d 'Sensitive npm one-time password'",
    "complete -c releaser -l cwd -d 'Run against another directory' -a '(__fish_complete_directories)'",
    "complete -c releaser -l verbose -d 'Include diagnostics and error stacks'",
    "complete -c releaser -s h -l help -d 'Display help'",
  ]
  return lines.join('\n')
}

export function renderCompletion(shell: string): string {
  if (shell === 'bash') {
    return bashCompletion()
  }
  if (shell === 'zsh') {
    return zshCompletion()
  }
  if (shell === 'fish') {
    return fishCompletion()
  }
  throw new UsageError('Completion shell must be bash, zsh, or fish.')
}
