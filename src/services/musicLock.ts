const activeByChat = new Map<string, boolean>();

export function tryAcquireMusicLock (chatId: string): boolean {
  if (activeByChat.get(chatId)) return false;
  activeByChat.set(chatId, true);
  return true;
}

export function releaseMusicLock (chatId: string): void {
  activeByChat.delete(chatId);
}
