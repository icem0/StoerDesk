import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { oncallPools, settings } from '../db/schema'
import { resolveOncallSettings, type OncallSettings } from '@stoerdesk/shared'

type Db = Database['database']

const ONCALL_KEYS = [
  'oncall.week_start_weekday',
  'oncall.start_time',
  'oncall.duration_days',
  'oncall.swap_requires_admin_approval',
  'oncall.escalate_to_group_after_min',
  'oncall.reminder_unconfirmed_h',
  'oncall.unfilled_warning_days',
  'oncall.default_pool_id',
] as const

type OncallSettingKey = (typeof ONCALL_KEYS)[number]

const SETTING_KEY_TO_CAMEL: Record<OncallSettingKey, keyof OncallSettings> = {
  'oncall.week_start_weekday': 'weekStartWeekday',
  'oncall.start_time': 'startTime',
  'oncall.duration_days': 'durationDays',
  'oncall.swap_requires_admin_approval': 'swapRequiresAdminApproval',
  'oncall.escalate_to_group_after_min': 'escalateToGroupAfterMin',
  'oncall.reminder_unconfirmed_h': 'reminderUnconfirmedH',
  'oncall.unfilled_warning_days': 'unfilledWarningDays',
  'oncall.default_pool_id': 'defaultPoolId',
}

function asOncallSettingKey(key: string): OncallSettingKey | undefined {
  return ONCALL_KEYS.includes(key as OncallSettingKey) ? (key as OncallSettingKey) : undefined
}

export class OncallSettingsError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly params: Record<string, unknown>

  constructor(statusCode: number, code: string, params: Record<string, unknown> = {}) {
    super(code)
    this.name = 'OncallSettingsError'
    this.statusCode = statusCode
    this.code = code
    this.params = params
  }
}

function settingRow(key: string, value: unknown) {
  return { key, value, updatedAt: new Date() }
}

export async function readOncallSettings(database: Db): Promise<OncallSettings> {
  const rows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)

  const values: Record<string, unknown> = {}

  for (const row of rows) {
    const settingKey = typeof row.key === 'string' ? asOncallSettingKey(row.key) : undefined

    if (settingKey !== undefined) {
      values[SETTING_KEY_TO_CAMEL[settingKey]] = row.value
    }
  }

  return resolveOncallSettings(values)
}

export async function writeOncallSettings(
  database: Db,
  patch: Record<string, unknown>,
): Promise<OncallSettings> {
  const entries: Array<[OncallSettingKey, unknown]> = []

  for (const [key, value] of Object.entries(patch)) {
    const settingKey = asOncallSettingKey(key)

    if (settingKey === undefined) {
      throw new OncallSettingsError(400, 'invalid_request', { fields: [key] })
    }

    entries.push([settingKey, value])
  }

  const before = await readOncallSettings(database)

  const merged: Record<string, unknown> = {
    weekStartWeekday: before.weekStartWeekday,
    startTime: before.startTime,
    durationDays: before.durationDays,
    swapRequiresAdminApproval: before.swapRequiresAdminApproval,
    escalateToGroupAfterMin: before.escalateToGroupAfterMin,
    reminderUnconfirmedH: before.reminderUnconfirmedH,
    unfilledWarningDays: before.unfilledWarningDays,
  }

  if (before.defaultPoolId !== undefined) {
    merged.defaultPoolId = before.defaultPoolId
  }

  for (const [key, value] of entries) {
    merged[SETTING_KEY_TO_CAMEL[key]] = value
  }

  const resolved = resolveOncallSettings(merged)

  if (resolved.defaultPoolId !== undefined && resolved.defaultPoolId !== null) {
    const [pool] = await database
      .select({ id: oncallPools.id, active: oncallPools.active })
      .from(oncallPools)
      .where(eq(oncallPools.id, resolved.defaultPoolId))
      .limit(1)

    if (pool === undefined || pool.active === false) {
      throw new OncallSettingsError(409, 'oncall_default_pool_not_active', {
        fields: ['oncall.default_pool_id'],
      })
    }
  }

  await database.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await tx
        .insert(settings)
        .values(settingRow(key, value))
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() },
        })
    }
  })

  return resolved
}

export type { OncallSettings }
