import { LidMapService } from './lidMap'
import { prisma } from './database'

function getCanonicalJid (jid: string, lidMap: Record<string, string>): string {
  if (jid.endsWith('@lid')) return lidMap[jid] || jid
  return jid
}

export function collectJidAliases (jid: string, lidMap: Record<string, string>): string[] {
  if (!jid) return []

  const aliases = new Set<string>()
  const add = (value?: string | null): void => {
    if (!value) return
    aliases.add(value)
    aliases.add(value.split('@')[0])
  }

  add(jid)
  add(getCanonicalJid(jid, lidMap))
  add(LidMapService.getLid(jid))

  if (jid.endsWith('@lid') && lidMap[jid]) {
    add(lidMap[jid])
  }

  const canonical = getCanonicalJid(jid, lidMap)
  for (const [lid, real] of Object.entries(lidMap)) {
    if (real === canonical || real.split('@')[0] === canonical.split('@')[0]) {
      add(lid)
      add(real)
    }
  }

  return Array.from(aliases).filter(Boolean)
}

export function normalizePhoneKey (value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 11) return digits.slice(-11)
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

export interface ActivityIndex {
  totalLogs: number
  countsByExactJid: Map<string, number>
  countsByPhone: Map<string, number>
}

export async function buildActivityIndex (
  groupId: string,
  since: Date
): Promise<ActivityIndex> {
  const lidMap = LidMapService.getFullMap()
  const logs = await (prisma as any).messageLog.findMany({
    where: {
      groupId,
      createdAt: { gte: since }
    },
    select: { userJid: true }
  })

  const countsByExactJid = new Map<string, number>()
  const countsByPhone = new Map<string, number>()

  for (const log of logs) {
    countsByExactJid.set(
      log.userJid,
      (countsByExactJid.get(log.userJid) || 0) + 1
    )

    for (const alias of collectJidAliases(log.userJid, lidMap)) {
      const phone = alias.split('@')[0]
      countsByPhone.set(phone, (countsByPhone.get(phone) || 0) + 1)

      const normalized = normalizePhoneKey(phone)
      if (normalized) {
        countsByPhone.set(normalized, (countsByPhone.get(normalized) || 0) + 1)
      }
    }
  }

  return {
    totalLogs: logs.length,
    countsByExactJid,
    countsByPhone
  }
}

export function getActivityCount (
  participantJid: string,
  index: ActivityIndex,
  lidMap: Record<string, string>
): number {
  let max = 0

  for (const alias of collectJidAliases(participantJid, lidMap)) {
    max = Math.max(max, index.countsByExactJid.get(alias) || 0)

    const phone = alias.split('@')[0]
    max = Math.max(max, index.countsByPhone.get(phone) || 0)

    const normalized = normalizePhoneKey(phone)
    if (normalized) {
      max = Math.max(max, index.countsByPhone.get(normalized) || 0)
    }
  }

  return max
}

export function getParticipantDedupeKey (jid: string, lidMap: Record<string, string>): string {
  const canonical = getCanonicalJid(jid, lidMap)
  if (canonical.includes('@s.whatsapp.net')) {
    return normalizePhoneKey(canonical.split('@')[0])
  }

  const mapped = jid.endsWith('@lid') ? lidMap[jid] : LidMapService.getLid(jid)
  if (mapped?.includes('@s.whatsapp.net')) {
    return normalizePhoneKey(mapped.split('@')[0])
  }

  return canonical
}
