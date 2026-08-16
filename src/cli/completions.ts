import { UsageError } from '../domain/errors.js'

export type CompletionShell = 'bash' | 'zsh' | 'fish'

const COMMANDS = 'plan status doctor scan resume ship completion'
const OPTIONS =
  '--bump --version --tag --dry-run --yes --no-interactive --json --otp --cwd --verbose --target --message --merge-message --help'

function bashCompletion(): string {
  return [
    '_releaser_completion() {',
    '  local current previous',
    '  current="${COMP_WORDS[COMP_CWORD]}"',
    '  previous="${COMP_WORDS[COMP_CWORD-1]}"',
    '  if [[ "$previous" == "ship" || "$previous" == "--target" ]]; then',
    '    COMPREPLY=( $(compgen -W "$(git branch --format=\'%(refname:short)\' 2>/dev/null)" -- "$current") )',
    '  elif [[ "$current" == -* ]]; then',
    `    COMPREPLY=( $(compgen -W "${OPTIONS}" -- "$current") )`,
    '  else',
    `    COMPREPLY=( $(compgen -W "${COMMANDS}" -- "$current") )`,
    '  fi',
    '}',
    'complete -F _releaser_completion releaser',
  ].join('\n')
}

function zshCompletion(): string {
  return [
    '#compdef releaser',
    '_releaser() {',
    '  local -a commands',
    '  commands=(',
    "    'plan:build and display a release plan'",
    "    'status:show repository and registry state'",
    "    'doctor:run release preflight checks'",
    "    'scan:find version occurrences'",
    "    'resume:continue an interrupted release'",
    "    'ship:commit, merge, and release a feature branch'",
    "    'completion:print shell completion setup'",
    '  )',
    '  _arguments -C',
    "    '1:command:->command'",
    "    '*::argument:->arguments'",
    '  case $state in',
    '    command) _describe command commands ;;',
    '    arguments)',
    "      if [[ $words[2] == ship ]]; then _arguments '--target[release branch]:branch:__git_branch_names' '-m[feature commit message]:message:' '--message[feature commit message]:message:' '--merge-message[merge commit message]:message:'; fi",
    '      ;;',
    '  esac',
    '}',
    '_releaser "$@"',
  ].join('\n')
}

function fishCompletion(): string {
  return [
    'complete -c releaser -f',
    "complete -c releaser -n '__fish_use_subcommand' -a 'plan status doctor scan resume ship completion'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -l target -d 'Release branch' -a '(__fish_git_branches)'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -s m -l message -d 'Feature commit message'",
    "complete -c releaser -n '__fish_seen_subcommand_from ship' -l merge-message -d 'Merge commit message'",
    "complete -c releaser -l bump -a 'patch minor major prerelease'",
    'complete -c releaser -l version',
    'complete -c releaser -l dry-run',
    'complete -c releaser -l yes',
    'complete -c releaser -l no-interactive',
    'complete -c releaser -l json',
  ].join('\n')
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
