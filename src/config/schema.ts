import { z } from 'zod'
import { ConfigurationError } from '../domain/errors.js'

export const replacementPatternSchema = z.union([
  z.string().min(1),
  z.strictObject({
    pattern: z.string().min(1),
    flags: z.string().default('g'),
  }),
])

export const replacementSchema = z.strictObject({
  file: z.string().min(1),
  find: replacementPatternSchema,
  replace: z.string(),
  expectedMatches: z.number().int().positive(),
})

export const versionPatternSchema = z.strictObject({
  pattern: z.string().min(1),
  flags: z.string().default('m'),
})

function captureGroupCount(pattern: string, flags: string): number | null {
  try {
    const match = new RegExp(`${pattern}|`, flags).exec('')
    return match === null ? null : match.length - 1
  } catch {
    return null
  }
}

export const releaserConfigSchema = z
  .strictObject({
    releaseBranch: z.string().min(1).nullable().default(null),
    remote: z.string().min(1).default('origin'),
    versionFile: z.string().min(1).default('package.json'),
    versionPattern: versionPatternSchema.nullable().default(null),
    tagPrefix: z.string().default('v'),
    commitMessage: z.string().min(1).default('chore(release): {{version}}'),
    tagMessage: z.string().min(1).default('{{version}}'),
    npm: z
      .strictObject({
        publish: z.boolean().default(true),
        access: z.enum(['public', 'restricted']).default('public'),
        tag: z.string().min(1).nullable().default(null),
      })
      .default({ publish: true, access: 'public', tag: null }),
    github: z
      .strictObject({
        release: z.boolean().default(true),
        draft: z.boolean().default(false),
      })
      .default({ release: true, draft: false }),
    replacements: z.array(replacementSchema).default([]),
  })
  .superRefine((config, context) => {
    if (config.npm.publish && config.versionFile !== 'package.json') {
      context.addIssue({
        code: 'custom',
        path: ['versionFile'],
        message: 'must be package.json when npm publication is enabled',
      })
    }

    if (config.versionPattern === null) {
      return
    }

    if (config.npm.publish) {
      context.addIssue({
        code: 'custom',
        path: ['versionPattern'],
        message: 'must be null when npm publication is enabled',
      })
      return
    }

    const groups = captureGroupCount(config.versionPattern.pattern, config.versionPattern.flags)

    if (groups === null) {
      context.addIssue({
        code: 'custom',
        path: ['versionPattern', 'pattern'],
        message: 'is not a valid regular expression',
      })
      return
    }

    if (groups < 1) {
      context.addIssue({
        code: 'custom',
        path: ['versionPattern', 'pattern'],
        message: 'must contain a capture group surrounding the version',
      })
    }
  })

export type ReplacementPatternConfig = z.infer<typeof replacementPatternSchema>
export type ReplacementConfig = z.infer<typeof replacementSchema>
export type VersionPatternConfig = z.infer<typeof versionPatternSchema>
export type ReleaserConfig = z.infer<typeof releaserConfigSchema>

export const defaultConfig: ReleaserConfig = releaserConfigSchema.parse({})

export function parseConfig(input: unknown, source: string): ReleaserConfig {
  const result = releaserConfigSchema.safeParse(input)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw new ConfigurationError(`Invalid configuration in ${source}`, { source, issues })
  }

  return result.data
}
