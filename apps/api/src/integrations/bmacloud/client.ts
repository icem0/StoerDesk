/**
 * Read-only client of the BMAcloud API v2 (`specs/17-bmacloud-sync.md` §17.2,
 * ADR-0003).
 *
 * Every call is a `GET`: the private request helper hard-codes the method, so
 * the write endpoints of BMAcloud (`POST /anlagen`, `PUT /anlagen/{id}`,
 * `PUT /anlagen/{id}/melder`) are unreachable from here. The bearer key never
 * appears in an error message, an error param or a log line.
 */

/**
 * One row of `GET /anlagentypen` — the reference list that turns anlage `typ` into a
 * human-readable type name (§17.2); the shared `bmaAnlagentypSchema` validates it.
 */
export interface BmaAnlagentyp {
  typid: number
  descr: string
  herstellername?: string | null
}

export interface BmaCloudConfig {
  /** Base URL of the API, e.g. https://bmacloud.de/api/v2/ */
  baseUrl: string
  /** Bearer key of the tenant; empty disables the client. */
  apiKey: string
}

/**
 * One Anlage as far as StörDesk reads it (§17.3). The wire format of `aid` is an
 * integer (`Anlagen-ID` in the OpenAPI spec); `bmaAnlageSchema` normalises it.
 */
export interface BmaAnlage {
  aid: string | number
  nr: string
  firma: string
  anlagenort?: string | null
  str?: string | null
  plz?: string | null
  ort?: string | null
  status?: string | null
  /** `Anlage-Typ` id; resolved through `anlagentypen()` (WP-M2-65). */
  typ?: number | null
}

export type BmaCloudErrorCode = 'bma_not_configured' | 'bma_request_failed' | 'bma_bad_response'

export class BmaCloudError extends Error {
  readonly code: BmaCloudErrorCode

  constructor(code: BmaCloudErrorCode, message: string) {
    super(message)
    this.name = 'BmaCloudError'
    this.code = code
  }
}

export interface BmaCloudClient {
  /** Complete object set of the tenant — one `GET /anlagen` call per run. */
  listAnlagen(): Promise<BmaAnlage[]>
  /** A single Anlage, or `null` for an unknown `aid`. */
  anlage(aid: string): Promise<BmaAnlage | null>
  /** Reference list of the Anlage types of the tenant — one `GET /anlagentypen` call. */
  anlagentypen(): Promise<BmaAnlagentyp[]>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createBmaCloudClient(
  config: BmaCloudConfig,
  fetchImpl: typeof fetch = fetch,
): BmaCloudClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const apiKey = config.apiKey.trim()

  async function get(path: string): Promise<Response> {
    if (apiKey === '') {
      throw new BmaCloudError('bma_not_configured', 'BMA_API_KEY is not set')
    }

    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
      })
    } catch {
      // The cause may carry the URL but never the key; keep the message generic.
      throw new BmaCloudError('bma_request_failed', 'BMAcloud request failed')
    }
  }

  async function json(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new BmaCloudError('bma_bad_response', 'BMAcloud answered no JSON')
    }
  }

  return {
    async listAnlagen(): Promise<BmaAnlage[]> {
      const response = await get('/anlagen')

      if (!response.ok) {
        throw new BmaCloudError('bma_request_failed', `BMAcloud answered ${response.status}`)
      }

      const body = await json(response)

      if (!Array.isArray(body)) {
        throw new BmaCloudError('bma_bad_response', 'BMAcloud /anlagen is not an array')
      }

      return body as BmaAnlage[]
    },

    async anlage(aid: string): Promise<BmaAnlage | null> {
      const response = await get(`/anlagen/${encodeURIComponent(aid)}`)

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new BmaCloudError('bma_request_failed', `BMAcloud answered ${response.status}`)
      }

      const body = await json(response)

      if (!isRecord(body)) {
        throw new BmaCloudError('bma_bad_response', 'BMAcloud /anlagen/{aid} is not an object')
      }

      return body as unknown as BmaAnlage
    },

    async anlagentypen(): Promise<BmaAnlagentyp[]> {
      const response = await get('/anlagentypen')

      if (!response.ok) {
        throw new BmaCloudError('bma_request_failed', `BMAcloud answered ${response.status}`)
      }

      const body = await json(response)

      if (!Array.isArray(body)) {
        throw new BmaCloudError('bma_bad_response', 'BMAcloud /anlagentypen is not an array')
      }

      return body as BmaAnlagentyp[]
    },
  }
}
