const STORAGE_KEY = "rakumanual:user-profile"

export interface StoredUserProfile {
  name?: string
  avatarUrl?: string | null
}

function readAll(): Record<string, StoredUserProfile> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, StoredUserProfile>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function loadStoredProfile(userId: string): StoredUserProfile {
  return readAll()[userId] ?? {}
}

export function saveStoredProfile(userId: string, profile: StoredUserProfile): void {
  try {
    const all = readAll()
    all[userId] = {
      ...all[userId],
      ...profile,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* quota 等は無視 */
  }
}

/** 表示用にローカル上書きをマージ */
export function mergeStoredProfile<T extends { id: string; name: string; avatarUrl?: string | null }>(
  user: T,
): T {
  const stored = loadStoredProfile(user.id)
  return {
    ...user,
    name: stored.name?.trim() || user.name,
    avatarUrl: stored.avatarUrl !== undefined ? stored.avatarUrl : user.avatarUrl,
  }
}
