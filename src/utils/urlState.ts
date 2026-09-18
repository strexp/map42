import type { Version } from '../types'

interface UrlState {
  version: Version
  // ASN rather than node id: ids are positional and change between datasets.
  asn: string | null
}

const DEFAULT_VERSION: Version = 'ipv6'

const isVersion = (value: string | null): value is Version => value === 'ipv4' || value === 'ipv6'

export const readUrlState = (): UrlState => {
  const params = new URLSearchParams(window.location.search)
  const version = params.get('version')
  return {
    version: isVersion(version) ? version : DEFAULT_VERSION,
    asn: params.get('node'),
  }
}

// Merge a partial state into the current URL without adding history entries.
export const writeUrlState = (patch: Partial<UrlState>) => {
  const params = new URLSearchParams(window.location.search)

  if (patch.version) params.set('version', patch.version)
  if ('asn' in patch) {
    if (patch.asn) params.set('node', patch.asn)
    else params.delete('node')
  }

  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', url)
}
