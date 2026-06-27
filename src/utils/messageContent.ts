export function unwrapMessageContent (message: any): any {
  if (!message) return null
  if (message.ephemeralMessage?.message) return unwrapMessageContent(message.ephemeralMessage.message)
  if (message.viewOnceMessage?.message) return unwrapMessageContent(message.viewOnceMessage.message)
  return message
}

export function normalizeQuotedContent (quoted: any): any {
  if (!quoted) return null
  if (quoted.message && typeof quoted.message === 'object') {
    return unwrapMessageContent(quoted.message)
  }
  return unwrapMessageContent(quoted)
}

export function extractTextFromMessageContent (content: any): string {
  if (!content) return ''

  const normalized = normalizeQuotedContent(content) || unwrapMessageContent(content) || content

  const direct =
    normalized.conversation ||
    normalized.extendedTextMessage?.text ||
    normalized.imageMessage?.caption ||
    normalized.videoMessage?.caption ||
    normalized.documentMessage?.caption ||
    ''

  if (typeof direct === 'string' && direct.trim()) {
    return direct.replace(/^\s+|\s+$/g, '')
  }

  const findText = (node: any, depth = 0): string => {
    if (!node || typeof node !== 'object' || depth > 10) return ''
    if (typeof node.text === 'string' && node.text.trim()) return node.text
    if (typeof node.conversation === 'string' && node.conversation.trim()) return node.conversation
    if (typeof node.caption === 'string' && node.caption.trim()) return node.caption

    for (const key of Object.keys(node)) {
      if (key === 'contextInfo' || key === 'messageContextInfo') continue
      const found = findText(node[key], depth + 1)
      if (found) return found
    }

    return ''
  }

  return findText(content).replace(/^\s+|\s+$/g, '')
}

export function getContextInfoFromPayload (message: any): any {
  const msgContent = unwrapMessageContent(message?.message || message?.content || {}) || {}

  const candidates = [
    message?.contextInfo,
    msgContent.contextInfo,
    msgContent.extendedTextMessage?.contextInfo,
    msgContent.imageMessage?.contextInfo,
    msgContent.videoMessage?.contextInfo,
    msgContent.documentMessage?.contextInfo,
    msgContent.audioMessage?.contextInfo,
    msgContent.stickerMessage?.contextInfo,
    msgContent.buttonsResponseMessage?.contextInfo,
    msgContent.listResponseMessage?.contextInfo
  ].filter(Boolean)

  for (const context of candidates) {
    const id =
      context.stanzaId ||
      context.stanzaID ||
      context.quotedStanzaId ||
      context.quotedMessage?.key?.id ||
      context.QuotedMessage?.key?.id

    if (id) return context
  }

  return candidates[0] || null
}

export function extractReplyContextFromPayload (message: any): {
  quotedId?: string
  quoted?: any
  quotedParticipant?: string
  quotedFromMe?: boolean
  mentionedJid: string[]
} {
  const context = getContextInfoFromPayload(message)
  if (!context) {
    return { mentionedJid: [] }
  }

  const quoted =
    context.quotedMessage ||
    context.QuotedMessage ||
    null

  const quotedId =
    context.stanzaId ||
    context.stanzaID ||
    context.quotedStanzaId ||
    quoted?.key?.id

  const quotedParticipant =
    context.participant ||
    context.Participant ||
    quoted?.key?.participant

  const quotedFromMe =
    quoted?.key?.fromMe ??
    context.quotedMessage?.key?.fromMe ??
    context.QuotedMessage?.key?.fromMe

  return {
    quotedId,
    quoted,
    quotedParticipant,
    quotedFromMe,
    mentionedJid: Array.isArray(context.mentionedJid) ? context.mentionedJid : []
  }
}
