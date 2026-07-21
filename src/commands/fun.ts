import { prisma } from '../services/database'
import { WhatsAppService } from '../services/whatsapp'
import { botTexts } from '../config/texts'
import { getParticipantDedupeKey } from '../services/activity'
import { LidMapService } from '../services/lidMap'

const whatsapp = new WhatsAppService()

/** Membros atuais do grupo (sync + DB limpo). Deduplica LID/número. */
async function getCurrentGroupMembers (groupJid: string): Promise<string[]> {
  await whatsapp.syncGroupParticipants(groupJid)

  const participants: Array<{ userJid: string }> = await (prisma as any).groupParticipant.findMany({
    where: { group: { jid: groupJid } },
    select: { userJid: true }
  })

  const lidMap = LidMapService.getFullMap()
  const seen = new Set<string>()
  const members: string[] = []

  for (const participant of participants) {
    const resolved = await whatsapp.resolveParticipantJid(participant.userJid, groupJid)
    const key = getParticipantDedupeKey(resolved, lidMap)
    if (seen.has(key)) continue
    seen.add(key)
    members.push(resolved)
  }

  return members
}

export const handleFunCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'chance':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.fun.chanceNoText)
        return true
      }
      const percentage = Math.floor(Math.random() * 101)
      const query = args.join(' ')

      const chanceMembers = await getCurrentGroupMembers(msg.remoteJid)
      const luckyJid = chanceMembers[Math.floor(Math.random() * chanceMembers.length)]
      if (!luckyJid) return true

      const mentionText = `@${luckyJid.split('@')[0]}`

      const response = `🎯 *CHANCE DE: ${query.toUpperCase()}*\n\n📈 Resultado: *${percentage}%*\n🕵️ Provável culpado: ${mentionText}`
      await whatsapp.sendMessage(msg.remoteJid, response, [luckyJid])
      return true

    case 'sortear':
    case 'sorteio':
      try {
        const groupUsers = await getCurrentGroupMembers(msg.remoteJid)

        if (groupUsers.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, 'Ainda não tenho gente cadastrada aqui pra sortear!')
          return true
        }

        const quantity = Math.min(Math.max(parseInt(args[0], 10) || 1, 1), groupUsers.length)
        const shuffled = [...groupUsers].sort(() => 0.5 - Math.random())
        const chosen = shuffled.slice(0, quantity)
        const winnersText = chosen.map((jid) => `@${jid.split('@')[0]}`).join(', ')

        await whatsapp.sendMessage(msg.remoteJid, `🎉 *OS SORTEADOS DO FILHOTE SÃO*:\n\n${winnersText}`, chosen)
      } catch (error) {
        console.error('Sorteio Error:', error)
      }
      return true

    case 'dado':
    case 'd6':
    case 'd20':
      const sides = command === 'dado' ? (parseInt(args[0]) || 6) : parseInt(command.slice(1))
      const result = Math.floor(Math.random() * sides) + 1
      await whatsapp.sendMessage(msg.remoteJid, `🎲 Joguei o *d${sides}* aqui e caiu: *${result}*!`)
      return true

    case 'moeda':
      const coin = Math.random() > 0.5 ? 'Cara' : 'Coroa'
      await whatsapp.sendMessage(msg.remoteJid, `🪙 Girei a moeda... caiu *${coin}*!`)
      return true

    case 'viadometro':
    case 'gadometro':
    case 'bafometro':
      const resultPercent = Math.floor(Math.random() * 101)
      let text = ''
      if (command === 'viadometro') text = botTexts.fun.viadometro.replace('#RESULT', resultPercent.toString())
      if (command === 'gadometro') text = botTexts.fun.gadometro.replace('#RESULT', resultPercent.toString())
      if (command === 'bafometro') text = botTexts.fun.bafometro.replace('#RESULT', resultPercent.toString())
      await whatsapp.sendMessage(msg.remoteJid, text)
      return true

    case 'detector':
      const results = ['VERDADE ✅', 'MENTIRA ❌', 'TALVEZ... 🤔', 'KAÔ PURO 🤥', 'SINTO CHEIRO DE MENTIRA 👃']
      const detectorResult = results[Math.floor(Math.random() * results.length)]
      await whatsapp.sendMessage(msg.remoteJid, botTexts.fun.detector.replace('#RESULT', detectorResult))
      return true

    case 'casal':
      try {
        let u1Data: { jid: string; display: string } | null = null
        let u2Data: { jid: string; display: string } | null = null

        const mentioned = msg.mentionedJid || []
        if (mentioned.length >= 2) {
          u1Data = { jid: mentioned[0], display: `@${mentioned[0].split('@')[0]}` }
          u2Data = { jid: mentioned[1], display: `@${mentioned[1].split('@')[0]}` }
        } else {
          const allMembers = await getCurrentGroupMembers(msg.remoteJid)

          if (allMembers.length < 2) {
            await whatsapp.sendMessage(msg.remoteJid, "❌ *ERRO:* Não conheço gente suficiente nesse grupo ainda para formar um casal! Todo mundo precisa mandar pelo menos um 'oi' pro pai aqui registrar vocês.")
            return true
          }

          const shuffled = [...allMembers].sort(() => 0.5 - Math.random())
          u1Data = { jid: shuffled[0], display: `@${shuffled[0].split('@')[0]}` }
          u2Data = { jid: shuffled[1], display: `@${shuffled[1].split('@')[0]}` }
        }

        if (u1Data && u2Data) {
          const casalText = botTexts.fun.casal
            .replace('#USER1', u1Data.display)
            .replace('#USER2', u2Data.display)
          await whatsapp.sendMessage(msg.remoteJid, casalText, [u1Data.jid, u2Data.jid])
        }
      } catch (e) {
        console.error('Error in casal:', e)
      }
      return true

    default:
      return false
  }
}
