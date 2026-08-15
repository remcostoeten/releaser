import { UnreachableCase } from './errors.js'

/**
 * Closes a `switch` over a discriminated union. Adding a variant without
 * handling it here is a compile error, and a value that slipped past the type
 * system at runtime — a hand-edited journal, a plan from a future schema — is
 * reported rather than silently ignored.
 */
export function assertNever(value: never, context: string): never {
  throw new UnreachableCase(context, value)
}
