import { z } from 'zod'
import { InvalidReleasePlan } from '../domain/errors.js'
import type { ReleasePlan } from '../domain/release-plan.js'
import {
  AbsolutePath,
  BranchName,
  Digest,
  DistTagName,
  Iso8601,
  PackageName,
  PlanId,
  RepoRelativePath,
  SemVer,
  type SemanticType,
  Sha,
  TagName,
} from '../domain/semantic.js'

/**
 * Lifts a semantic type into a schema, so a plan read back from disk carries
 * the same branded types it had in memory. Without this the journal would be
 * the one place where a SHA and a tag name are interchangeable again.
 */
function semantic<Value extends string>(type: SemanticType<Value>): z.ZodType<Value> {
  return z.custom<Value>((value) => typeof value === 'string' && type.is(value), {
    message: `expected a valid ${type.name}`,
  })
}

const repositoryFingerprintSchema = z.strictObject({
  headSha: semantic(Sha),
  statusDigest: semantic(Digest),
  manifestVersion: semantic(SemVer),
  upstreamSha: semantic(Sha).nullable(),
})

const releaseBoundarySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('initial'),
    headSha: semantic(Sha),
  }),
  z.strictObject({
    kind: z.literal('since-release'),
    previousRef: semantic(TagName),
    previousSha: semantic(Sha),
    previousVersion: semantic(SemVer),
    headSha: semantic(Sha),
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
    tag: semantic(DistTagName),
    source: z.enum(['identifier', 'fallback']),
  }),
  z.strictObject({ kind: z.literal('explicit'), tag: semantic(DistTagName) }),
])

const releaseVersionSchema = z.strictObject({
  previousVersion: semantic(SemVer),
  nextVersion: semantic(SemVer),
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
    path: semantic(RepoRelativePath),
    previousVersion: semantic(SemVer),
    nextVersion: semantic(SemVer),
    edits: z.array(textEditSchema),
  }),
  z.strictObject({
    kind: z.literal('lockfile-version'),
    path: semantic(RepoRelativePath),
    previousVersion: semantic(SemVer),
    nextVersion: semantic(SemVer),
    edits: z.array(textEditSchema),
  }),
  z.strictObject({
    kind: z.literal('configured-replacement'),
    path: semantic(RepoRelativePath),
    pattern: replacementPatternSchema,
    expectedMatches: z.number().int().positive(),
    edits: z.array(textEditSchema),
  }),
])

const changeOriginSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('commit'), sha: semantic(Sha) }),
  z.strictObject({
    kind: z.literal('pull-request'),
    number: z.number().int().positive(),
    mergeCommitSha: semantic(Sha).nullable(),
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
  version: semantic(SemVer),
  previousVersion: semantic(SemVer).nullable(),
  sections: z.array(
    z.strictObject({
      category: changeCategorySchema,
      changes: z.array(changeSchema),
    }),
  ),
})

const gitCommitActionSchema = z.strictObject({
  message: z.string(),
  paths: z.array(semantic(RepoRelativePath)),
})

const gitTagActionSchema = z.strictObject({
  name: semantic(TagName),
  message: z.string(),
})

const gitPushActionSchema = z.strictObject({
  remote: z.string(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('branch'), branch: semantic(BranchName) }),
    z.strictObject({ kind: z.literal('tag'), tag: semantic(TagName) }),
  ]),
})

const npmPublishActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('publish'),
    packageName: semantic(PackageName),
    version: semantic(SemVer),
    distTag: semantic(DistTagName),
    access: z.enum(['public', 'restricted']),
  }),
  z.strictObject({ kind: z.literal('skipped'), reason: z.string() }),
])

const githubReleaseActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('create'),
    owner: z.string(),
    repo: z.string(),
    tagName: semantic(TagName),
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
    id: semantic(PlanId),
    createdAt: semantic(Iso8601),
    repositoryRoot: semantic(AbsolutePath),
    packageName: semantic(PackageName),
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
