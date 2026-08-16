import semver from 'semver'
import { MalformedValue } from './errors.js'

declare const brand: unique symbol

export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name }

export type EntityId<Entity extends string> = Brand<string, `EntityId:${Entity}`>
export type Timestamp<Meaning extends string> = Brand<string, `Timestamp:${Meaning}`>
export type Timestamps = Readonly<{
  createdAt: Timestamp<'createdAt'>
  updatedAt: Timestamp<'updatedAt'>
}>
export type BaseEntity<Entity extends string> = Readonly<{
  id: EntityId<Entity>
}> &
  Timestamps

export type Sha = Brand<string, 'Sha'>
export type Digest = Brand<string, 'Digest'>
export type Ref = Brand<string, 'Ref'>
export type BranchName = Brand<string, 'BranchName'>
export type TagName = Brand<string, 'TagName'>
export type SemVer = Brand<string, 'SemVer'>
export type DistTagName = Brand<string, 'DistTagName'>
export type PackageName = Brand<string, 'PackageName'>
export type NpmUsername = Brand<string, 'NpmUsername'>
export type NpmShasum = Brand<string, 'NpmShasum'>
export type NpmIntegrity = Brand<string, 'NpmIntegrity'>
export type AbsolutePath = Brand<string, 'AbsolutePath'>
export type RepoRelativePath = Brand<string, 'RepoRelativePath'>
export type PlanId = EntityId<'ReleasePlan'>
export type ChangeId = EntityId<'Change'>
export type ReleasePlanCreatedAt = Timestamp<'ReleasePlan.createdAt'>
export type CommitAuthoredAt = Timestamp<'Commit.authoredAt'>
export type PullRequestMergedAt = Timestamp<'PullRequest.mergedAt'>

/**
 * Anything Git accepts where it documents a `<commit>` or `<rev>`: a SHA, a
 * branch, a tag, or a fully qualified ref.
 */
export type Revision = Sha | Ref | BranchName | TagName

export type SemanticType<Value extends string> = {
  readonly name: string
  is(value: string): value is Value
  parse(value: string): Value | null
  from(value: string, context: string): Value
}

function semanticType<Value extends string>(
  name: string,
  accepts: (value: string) => boolean,
): SemanticType<Value> {
  function is(value: string): value is Value {
    return accepts(value)
  }

  return {
    name,
    is,
    parse(value: string): Value | null {
      return is(value) ? value : null
    },
    from(value: string, context: string): Value {
      if (!is(value)) {
        throw new MalformedValue(name, value, context)
      }
      return value
    },
  }
}

export function EntityId<Entity extends string>(entity: Entity): SemanticType<EntityId<Entity>> {
  return semanticType(`${entity}Id`, (value) => value.length > 0 && !/\s/u.test(value))
}

export function Timestamp<Meaning extends string>(
  meaning: Meaning,
): SemanticType<Timestamp<Meaning>> {
  return semanticType(`${meaning}Timestamp`, (value) => ISO_8601_PATTERN.test(value))
}

const SHA_PATTERN = /^[0-9a-f]{7,64}$/u
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u
const NPM_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/iu
const NPM_SHASUM_PATTERN = /^[0-9a-f]{40}$/u
const NPM_INTEGRITY_PATTERN = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/u
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/u

function isRefName(value: string): boolean {
  return (
    value.length > 0 &&
    !/\s/u.test(value) &&
    !value.includes('..') &&
    !value.startsWith('-') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.endsWith('.lock') &&
    !value.includes('~') &&
    !value.includes('^') &&
    !value.includes(':') &&
    !value.includes('?') &&
    !value.includes('*') &&
    !value.includes('[') &&
    !value.includes('\\')
  )
}

/**
 * A commit or object SHA as Git prints it. Hexadecimal and at least an
 * abbreviation's worth of characters, wide enough to accept SHA-256 object
 * names from a repository using that format.
 */
export const Sha: SemanticType<Sha> = semanticType('Sha', (value) => SHA_PATTERN.test(value))

/** The SHA-256 of the raw `git status --porcelain=v1` output, per SPEC §8.3. */
export const Digest: SemanticType<Digest> = semanticType('Digest', (value) =>
  DIGEST_PATTERN.test(value),
)

/** Any Git ref, qualified or short: `refs/heads/main`, `origin/main`, `v1.2.0`. */
export const Ref: SemanticType<Ref> = semanticType('Ref', isRefName)

export const BranchName: SemanticType<BranchName> = semanticType('BranchName', isRefName)

export const TagName: SemanticType<TagName> = semanticType('TagName', isRefName)

/** A version string that `semver` parses, in its canonical form. */
export const SemVer: SemanticType<SemVer> = semanticType(
  'SemVer',
  (value) => semver.valid(value) === value,
)

/**
 * An npm dist-tag. npm rejects a tag that parses as SemVer, because it would
 * be ambiguous with a version in every command that accepts either.
 */
export const DistTagName: SemanticType<DistTagName> = semanticType(
  'DistTagName',
  (value) => value.length > 0 && !/\s/u.test(value) && semver.valid(value) === null,
)

export const PackageName: SemanticType<PackageName> = semanticType(
  'PackageName',
  (value) => value.length <= 214 && PACKAGE_NAME_PATTERN.test(value),
)

export const NpmUsername: SemanticType<NpmUsername> = semanticType('NpmUsername', (value) =>
  NPM_USERNAME_PATTERN.test(value),
)

export const NpmShasum: SemanticType<NpmShasum> = semanticType('NpmShasum', (value) =>
  NPM_SHASUM_PATTERN.test(value),
)

export const NpmIntegrity: SemanticType<NpmIntegrity> = semanticType('NpmIntegrity', (value) =>
  NPM_INTEGRITY_PATTERN.test(value),
)

export const AbsolutePath: SemanticType<AbsolutePath> = semanticType(
  'AbsolutePath',
  (value) => value.startsWith('/') || WINDOWS_ABSOLUTE_PATTERN.test(value),
)

/**
 * A path inside the repository, expressed relative to its root. Absolute paths
 * and `..` segments are rejected: a configured replacement that escapes the
 * repository would let a release mutate files outside the tree it describes.
 */
export const RepoRelativePath: SemanticType<RepoRelativePath> = semanticType(
  'RepoRelativePath',
  (value) =>
    value.length > 0 &&
    !value.startsWith('/') &&
    !WINDOWS_ABSOLUTE_PATTERN.test(value) &&
    !value.split(/[\\/]/u).includes('..'),
)

export const PlanId: SemanticType<PlanId> = semanticType(
  'PlanId',
  (value) => value.length > 0 && !/\s/u.test(value),
)

export const ChangeId: SemanticType<ChangeId> = EntityId('Change')
export const ReleasePlanCreatedAt: SemanticType<ReleasePlanCreatedAt> =
  Timestamp('ReleasePlan.createdAt')
export const CommitAuthoredAt: SemanticType<CommitAuthoredAt> = Timestamp('Commit.authoredAt')
export const PullRequestMergedAt: SemanticType<PullRequestMergedAt> =
  Timestamp('PullRequest.mergedAt')
