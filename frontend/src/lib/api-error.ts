export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 2 &&
    !(error instanceof ApiError && error.status >= 400 && error.status < 500)
  )
}
