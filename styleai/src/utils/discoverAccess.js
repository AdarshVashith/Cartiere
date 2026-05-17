export function getDiscoverProfileState(profile = {}) {
  return {
    isWardrobeComplete: Boolean(profile?.isWardrobeComplete),
    styleInterests: Array.isArray(profile?.styleInterests)
      ? profile.styleInterests.filter(Boolean)
      : [],
    lifestyleNeeds: Array.isArray(profile?.lifestyleNeeds)
      ? profile.lifestyleNeeds.filter(Boolean)
      : [],
    targetAesthetic: typeof profile?.targetAesthetic === 'string' ? profile.targetAesthetic : '',
    architectSummary: typeof profile?.architectSummary === 'string' ? profile.architectSummary : ''
  }
}

export function splitPreferenceInput(value) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function getDiscoverStorageKey(userId) {
  return `stylemate:discover-settings:${userId || 'guest'}`
}

export function readLocalDiscoverState(userId) {
  if (typeof window === 'undefined') {
    return getDiscoverProfileState({})
  }

  try {
    const raw = window.localStorage.getItem(getDiscoverStorageKey(userId))
    if (!raw) return getDiscoverProfileState({})
    const parsed = JSON.parse(raw)
    return getDiscoverProfileState(parsed)
  } catch (error) {
    return getDiscoverProfileState({})
  }
}

export function writeLocalDiscoverState(userId, state) {
  if (typeof window === 'undefined') return

  const normalized = getDiscoverProfileState(state)
  window.localStorage.setItem(getDiscoverStorageKey(userId), JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('discover-settings-updated', { detail: { userId, state: normalized } }))
}

export function mergeDiscoverState(profile = {}, userId) {
  const remote = getDiscoverProfileState(profile)
  const local = readLocalDiscoverState(userId)

  return {
    isWardrobeComplete: remote.isWardrobeComplete || local.isWardrobeComplete,
    styleInterests: remote.styleInterests.length ? remote.styleInterests : local.styleInterests,
    lifestyleNeeds: remote.lifestyleNeeds.length ? remote.lifestyleNeeds : local.lifestyleNeeds,
    targetAesthetic: remote.targetAesthetic || local.targetAesthetic,
    architectSummary: remote.architectSummary || local.architectSummary
  }
}
