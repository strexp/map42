const isSubsequence = (query: string, text: string): boolean => {
  let q = 0
  for (let t = 0; t < text.length && q < query.length; t++) {
    if (text[t] === query[q]) q++
  }
  return q === query.length
}

/**
 * Score how well `query` matches `text`. Returns null when there is no match.
 * Exact substrings rank highest, then subsequence matches with consecutive bonuses.
 */
export const fuzzyScore = (query: string, text: string): number | null => {
  if (!query) return 0

  const q = query.toLowerCase()
  const t = text.toLowerCase()

  const index = t.indexOf(q)
  if (index !== -1) {
    // Prefer prefix matches and shorter fields.
    return 1000 - index * 2 - (t.length - q.length) * 0.1
  }

  if (!isSubsequence(q, t)) return null

  let score = 0
  let qIndex = 0
  let streak = 0
  for (let tIndex = 0; tIndex < t.length && qIndex < q.length; tIndex++) {
    if (t[tIndex] === q[qIndex]) {
      streak++
      score += 5 + streak * 2 - tIndex * 0.05
      qIndex++
    } else {
      streak = 0
    }
  }
  return score
}
