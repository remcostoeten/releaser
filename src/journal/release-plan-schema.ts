import { z } from 'zod'
import { InvalidReleasePlan } from '../domain/errors.js'
import type { ReleasePlan } from '../domain/release-plan.js'

const repositoryFingerprintSchema = z.strictObject({
  headSha: z.string(),
  statusDigest: z.string(),
  manifestVersion: z.string(),
  upstreamSha: z.string().nullable(),
})

const releaseBoundarySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('initial'),
    headSha: z.string(),
  }),
  z.strictObject({
    kind: z.literal('since-release'),
    previousRef: z.string(),
    previousSha: z.string(),
    previousVersion: z.string(),
    headSha: z.string(),
  }),
])

const versionSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bump'),
    bump: z.enum(['patch', 'minor', 'major']),
  }),
  z.strictObject({
    kind: z.literal('prerelease'),
    identifier: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal('custom'),
    version: z.string(),
  }),
])

const distTagSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('latest') }),
  z.strictObject({
    kind: z.literal('prerelease'),
    tag: z.string(),
    source: z.enum(['identifier', 'fallback']),
  }),
  z.strictObject({ kind: z.literal('explicit'), tag: z.string() }),
])

const releaseVersionSchema = z.strictObject({
  previousVersion: z.string(),
  nextVersion: z.string(),
  selection: versionSelectionSchema,
  distTag: distTagSchema,
  prerelease: z.boolean(),
})

const textEditSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  deletedText: z.string(),
  insertedText: z.string(),
})

const replacementPatternSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: z.string() }),
  z.strictObject({ kind: z.literal('regex'), source: z.string(), flags: z.string() }),
])

const fileMutationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('manifest-version'),
    path: z.string(),
    previousVersion: z.string(),
    nextVersion: z.string(),
    edits: z.array(textEditSchema),
  }),
  z.strictObject({
    kind: z.literal('lockfile-version'),
    path: z.string(),
    previousVersion: z.string(),
    nextVersion: z.string(),
    edits: z.array(textEditSchema),
  }),
  z.strictObject({
    kind: z.literal('configured-replacement'),
    path: z.string(),
    pattern: replacementPatternSchema,
    expectedMatches: z.number().int().positive(),
    edits: z.array(textEditSchema),
  }),
])

const changeOriginSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('commit'), sha: z.string() }),
  z.strictObject({
    kind: z.literal('pull-request'),
    number: z.number().int().positive(),
    mergeCommitSha: z.string().nullable(),
  }),
])

const changeCategorySchema = z.enum([
  'breaking',
  'features',
  'fixes',
  'performance',
  'documentation',
  'dependencies',
  'maintenance',
  'other',
])

const changeSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  category: changeCategorySchema,
  author: z.string().nullable(),
  origin: changeOriginSchema,
})

const releaseNotesSchema = z.strictObject({
  version: z.string(),
  previousVersion: z.string().nullable(),
  sections: z.array(
    z.strictObject({
      category: changeCategorySchema,
      changes: z.array(changeSchema),
    }),
  ),
})

const gitCommitActionSchema = z.strictObject({
  message: z.string(),
  paths: z.array(z.string()),
})

const gitTagActionSchema = z.strictObject({
  name: z.string(),
  message: z.string(),
})

const gitPushActionSchema = z.strictObject({
  remote: z.string(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('branch'), branch: z.string() }),
    z.strictObject({ kind: z.literal('tag'), tag: z.string() }),
  ]),
})

const npmPublishActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('publish'),
    packageName: z.string(),
    version: z.string(),
    distTag: z.string(),
    access: z.enum(['public', 'restricted']),
  }),
  z.strictObject({ kind: z.literal('skipped'), reason: z.string() }),
])

const githubReleaseActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('create'),
    owner: z.string(),
    repo: z.string(),
    tagName: z.string(),
    name: z.string(),
    body: z.string(),
    draft: z.boolean(),
    prerelease: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('skipped'), reason: z.string() }),
])

export const releasePlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string(),
    createdAt: z.string(),
    repositoryRoot: z.string(),
    packageName: z.string(),
    fingerprint: repositoryFingerprintSchema,
    boundary: releaseBoundarySchema,
    version: releaseVersionSchema,
    fileMutations: z.array(fileMutationSchema).readonly(),
    commit: gitCommitActionSchema,
    tag: gitTagActionSchema,
    pushBranch: gitPushActionSchema,
    pushTag: gitPushActionSchema,
    npmPublish: npmPublishActionSchema,
    githubRelease: githubReleaseActionSchema,
    notes: releaseNotesSchema,
  })
  .readonly()

type AssertEqual<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false

export const releasePlanSchemaMatchesDomain: AssertEqual<
  z.infer<typeof releasePlanSchema>,
  ReleasePlan
> = true

export function parseReleasePlan(input: unknown, source = 'release plan'): ReleasePlan {
  const result = releasePlanSchema.safeParse(input)

  if (!result.success) {
    throw new InvalidReleasePlan(
      source,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return result.data
}

export function deserializeReleasePlan(json: string, source = 'release plan'): ReleasePlan {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new InvalidReleasePlan(source, [
      { path: '', message: error instanceof Error ? error.message : String(error) },
    ])
  }

  return parseReleasePlan(parsed, source)
}
