export const EXIT_CODES = {
  success: 0,
  internalError: 1,
  usageError: 2,
  preflightFailed: 3,
  cancelled: 4,
  partialRelease: 5,
  authenticationFailure: 6,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]
