const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

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

  if (!response.ok) {
    throw new ApiError({ status: response.status })
  }

  return (await response.json()) as T
}
