export const formatTimestamp = (unixSeconds: number): string => {
  if (!unixSeconds) return 'unknown'
  return new Date(unixSeconds * 1000).toLocaleString()
}

export const formatRelativeTime = (unixSeconds: number, now = Date.now()): string => {
  if (!unixSeconds) return 'unknown'

  const diffMs = now - unixSeconds * 1000
  if (diffMs < 60_000) return 'just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`

  return `${Math.floor(hours / 24)} d ago`
}
