import { Notification } from 'electron'

export function sendNotification({ title, body, noteId, silent }, onActivate) {
  const n = new Notification({
    title: title || '便签提醒',
    body: body || '',
    silent: Boolean(silent)
  })

  n.on('click', () => {
    if (onActivate) onActivate(noteId)
  })

  return n
}
