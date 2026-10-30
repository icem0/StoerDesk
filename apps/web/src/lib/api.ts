const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const apiBaseUrl = baseUrl

export interface ApiErrorOptions {
  status: number
  code?: string
  params?: Record<string, string | number>
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly params?: Record<string, string | number>

  constructor(options: ApiErrorOptions) {
    super(`API request failed with status ${options.status}`)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.params = options.params
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    ...init,
  })

  if (response.status === 204) {
    // `DELETE /api/v1/roles/:key` answers 204 without a body (WP-M1-09d), so there is
    // nothing to parse — the caller only cares that the request succeeded.
    return undefined as T
  }

  if (!response.ok) {
    // The API always answers errors as `{ code, params }` (AGENTS.md); a body that
    // is not JSON degrades to a status-only ApiError instead of throwing again.
    let code: string | undefined
    let params: Record<string, string | number> | undefined

    try {
      const body = (await response.json()) as {
        code?: string
        params?: Record<string, string | number>
      }
      code = typeof body.code === 'string' ? body.code : undefined
      params = typeof body.params === 'object' && body.params !== null ? body.params : undefined
    } catch {
      code = undefined
      params = undefined
    }

    throw new ApiError({ status: response.status, code, params })
  }

  return (await response.json()) as T
}
