import type { DetectedSource } from './detect-version-source.js'

export type InitVersionFile = { path: string; contents: string }

export type InitPlan =
  | { kind: 'no-config-needed'; reason: string }
  | {
      kind: 'generate'
      config: Record<string, unknown>
      versionFile: InitVersionFile | null
      summary: string
    }

const SEMVER_CAPTURE = String.raw`(\d+\.\d+\.\d+)`

function baseConfig(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    releaseBranch: null,
    remote: 'origin',
    tagPrefix: 'v',
    commitMessage: 'chore(release): {{version}}',
    tagMessage: '{{version}}',
    npm: { publish: false, access: 'public', tag: null },
    github: { release: true, draft: false },
    replacements: [],
    ...overrides,
  }
}

function generate(
  versionFile: string,
  pattern: string,
  flags: string,
  summary: string,
  fileToCreate: InitVersionFile | null = null,
): InitPlan {
  return {
    kind: 'generate',
    config: baseConfig({
      versionFile,
      versionPattern: { pattern, flags },
    }),
    versionFile: fileToCreate,
    summary,
  }
}

function planForCargo(source: Extract<DetectedSource, { kind: 'cargo' }>): InitPlan {
  return generate(
    source.file,
    String.raw`\[package\][\s\S]*?version\s*=\s*"([^"]+)"`,
    '',
    `Cargo package detected — using the [package] version in ${source.file} as the version source.`,
  )
}

function planForPython(source: Extract<DetectedSource, { kind: 'python' }>): InitPlan {
  return generate(
    source.file,
    String.raw`\[${source.section}\][\s\S]*?version\s*=\s*"([^"]+)"`,
    '',
    `Python project detected — using the [${source.section}] version in ${source.file} as the version source.`,
  )
}

function planForCmake(source: Extract<DetectedSource, { kind: 'cmake' }>): InitPlan {
  return generate(
    source.file,
    String.raw`project\([\w.-]+\s+VERSION\s+${SEMVER_CAPTURE}`,
    '',
    `CMake project detected — using the VERSION in ${source.file}'s project() call as the version source.`,
  )
}

function planForPkgbuild(source: Extract<DetectedSource, { kind: 'pkgbuild' }>): InitPlan {
  return generate(
    source.file,
    '^pkgver=(.+)$',
    'm',
    `PKGBUILD detected at ${source.file} — using pkgver as the version source.`,
  )
}

function planForExistingVersionFile(
  source: Extract<DetectedSource, { kind: 'existing-version-file' }>,
): InitPlan {
  return generate(
    source.file,
    SEMVER_CAPTURE,
    '',
    `Existing ${source.file} detected — using it as the version source.`,
  )
}

function planForNewVersionFile(summary: string): InitPlan {
  return generate('VERSION', SEMVER_CAPTURE, '', summary, { path: 'VERSION', contents: '0.1.0\n' })
}

/**
 * Turns a detected version source into a ready-to-write releaser.config.json.
 * npm.publish is always false here because versionPattern-sourced versions
 * are mutually exclusive with npm publication (see config/schema.ts).
 */
export function buildInitPlan(source: DetectedSource): InitPlan {
  switch (source.kind) {
    case 'npm':
      return {
        kind: 'no-config-needed',
        reason:
          'package.json found; releaser works with its defaults, no configuration file is required.',
      }
    case 'cargo':
      return planForCargo(source)
    case 'python':
      return planForPython(source)
    case 'cmake':
      return planForCmake(source)
    case 'pkgbuild':
      return planForPkgbuild(source)
    case 'existing-version-file':
      return planForExistingVersionFile(source)
    case 'go-module':
      return planForNewVersionFile(
        'Go module detected — go.mod has no version field, so a new VERSION file (0.1.0) will hold the version.',
      )
    case 'none':
      return planForNewVersionFile(
        'No recognizable manifest found — a new VERSION file (0.1.0) will hold the version.',
      )
  }
}
