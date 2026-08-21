import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { AuthUser, Project, ProjectVisibility } from "./types.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, "..", "data")
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads")
export const DB_PATH = path.join(DATA_DIR, "rakumanual.db")

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    db = new DatabaseSync(DB_PATH)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")
    migrate(db)
  }
  return db
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id, owner_id)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS qa_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      message_id TEXT NOT NULL,
      question TEXT NOT NULL,
      feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qa_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      question TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT,
      action_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oplogs_user ON operation_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_oplogs_action ON operation_logs(action_type, created_at);

    CREATE TABLE IF NOT EXISTS llm_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT,
      action TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      cost_yen REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage(user_id, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS design_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#2563eb',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS csat_responses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT,
      source TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      comment TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS llm_io_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT,
      action TEXT NOT NULL,
      provider TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_io_user ON llm_io_logs(user_id, created_at);
  `)

  const schema = database.prepare("SELECT sql FROM sqlite_master WHERE name = 'projects'").get() as
    | { sql: string }
    | undefined
  if (schema?.sql && !schema.sql.includes("PRIMARY KEY (id, owner_id)")) {
    database.exec(`
      ALTER TABLE projects RENAME TO projects_legacy;
      CREATE TABLE projects (
        id TEXT NOT NULL,
        owner_id TEXT NOT NULL REFERENCES users(id),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, owner_id)
      );
      INSERT INTO projects (id, owner_id, data, updated_at)
        SELECT id, owner_id, data, updated_at FROM projects_legacy;
      DROP TABLE projects_legacy;
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    `)
  }

  const userCols = database.prepare("PRAGMA table_info(users)").all() as { name: string }[]
  if (!userCols.some((c) => c.name === "role")) {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'creator'")
  }
  const userColsAfterRole = database.prepare("PRAGMA table_info(users)").all() as { name: string }[]
  if (!userColsAfterRole.some((c) => c.name === "avatar_url")) {
    database.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT")
  }
  database.prepare("UPDATE users SET role = 'creator' WHERE id = 'user-yamada'").run()
  database.prepare("UPDATE users SET role = 'viewer' WHERE id = 'user-sato'").run()
  database.prepare("UPDATE users SET role = 'admin' WHERE id = 'user-admin'").run()

  const insertUser = database.prepare(
    "INSERT OR IGNORE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)",
  )
  insertUser.run("user-yamada", "山田 太郎", "yamada.taro@example.com", "creator")
  insertUser.run("user-sato", "佐藤 太郎", "sato.taro@example.com", "viewer")
  insertUser.run("user-admin", "管理 花子", "admin@example.com", "admin")
  insertUser.run("user-pilot1", "鈴木 一郎", "suzuki.ichiro@example.com", "creator")
  insertUser.run("user-pilot2", "高橋 美咲", "takahashi.misaki@example.com", "creator")
  database.prepare("UPDATE users SET role = 'creator' WHERE id IN ('user-pilot1', 'user-pilot2')").run()

  const budget = database
    .prepare(`SELECT value FROM app_settings WHERE key = 'llm_budget_yen'`)
    .get() as { value: string } | undefined
  if (!budget) {
    database
      .prepare(`INSERT INTO app_settings (key, value) VALUES ('llm_budget_yen', '50000')`)
      .run()
  }

  const templateCount = database.prepare(`SELECT COUNT(*) AS c FROM design_templates`).get() as {
    c: number
  }
  if (templateCount.c === 0) {
    const now = Date.now()
    const insertTpl = database.prepare(
      `INSERT INTO design_templates (id, name, theme, description, color, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    insertTpl.run(
      "corporate",
      "コーポレート標準",
      "corporate",
      "社内ブランドガイドライン準拠",
      "#2563eb",
      now,
    )
    insertTpl.run(
      "simple",
      "シンプル",
      "simple",
      "余白多めの読みやすいレイアウト",
      "#0f766e",
      now,
    )
    insertTpl.run(
      "training",
      "研修用",
      "training",
      "ステップ強調・初心者向け",
      "#c2410c",
      now,
    )
  }
}

export interface DesignTemplate {
  id: string
  name: string
  theme: string
  description: string
  color: string
  updatedAt: number
}

function mapUserRow(row: {
  id: string
  name: string
  email: string
  role?: AuthUser["role"] | null
  avatar_url?: string | null
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? "creator",
    avatarUrl: row.avatar_url ?? null,
  }
}

export function listUsers(): AuthUser[] {
  const rows = getDb()
    .prepare(`SELECT id, name, email, role, avatar_url FROM users ORDER BY name`)
    .all() as Array<{
    id: string
    name: string
    email: string
    role?: AuthUser["role"] | null
    avatar_url?: string | null
  }>
  return rows.map(mapUserRow)
}

export function updateUserRole(userId: string, role: AuthUser["role"]): AuthUser | null {
  getDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, userId)
  return getUserById(userId)
}

export function updateUserProfile(
  userId: string,
  patch: { name?: string; avatarUrl?: string | null },
): AuthUser | null {
  const current = getUserById(userId)
  if (!current) return null
  const name = patch.name?.trim() || current.name
  const avatarUrl = patch.avatarUrl === undefined ? current.avatarUrl ?? null : patch.avatarUrl
  if (!name) return null
  getDb()
    .prepare(`UPDATE users SET name = ?, avatar_url = ? WHERE id = ?`)
    .run(name, avatarUrl, userId)
  return getUserById(userId)
}

export function listDesignTemplates(): DesignTemplate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, theme, description, color, updated_at AS updatedAt FROM design_templates ORDER BY name`,
    )
    .all() as unknown as DesignTemplate[]
  return rows
}

export function upsertDesignTemplate(tpl: Omit<DesignTemplate, "updatedAt"> & { updatedAt?: number }) {
  const updatedAt = tpl.updatedAt ?? Date.now()
  getDb()
    .prepare(
      `INSERT INTO design_templates (id, name, theme, description, color, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         theme = excluded.theme,
         description = excluded.description,
         color = excluded.color,
         updated_at = excluded.updated_at`,
    )
    .run(tpl.id, tpl.name, tpl.theme, tpl.description, tpl.color, updatedAt)
  return listDesignTemplates().find((t) => t.id === tpl.id)!
}

export function deleteDesignTemplate(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM design_templates WHERE id = ?`).run(id)
  return result.changes > 0
}

export function insertCsat(input: {
  userId: string
  projectId?: string
  source: string
  score: number
  comment?: string
}) {
  getDb()
    .prepare(
      `INSERT INTO csat_responses (id, user_id, project_id, source, score, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.projectId ?? null,
      input.source,
      input.score,
      input.comment ?? null,
      Date.now(),
    )
}

export function averageCsat(userId?: string): number | null {
  const row = userId
    ? (getDb()
        .prepare(`SELECT AVG(score) AS avg FROM csat_responses WHERE user_id = ?`)
        .get(userId) as { avg: number | null })
    : (getDb().prepare(`SELECT AVG(score) AS avg FROM csat_responses`).get() as {
        avg: number | null
      })
  return row.avg == null ? null : Math.round(row.avg * 10) / 10
}

export function getUserById(id: string): AuthUser | null {
  const row = getDb()
    .prepare("SELECT id, name, email, role, avatar_url FROM users WHERE id = ?")
    .get(id) as
    | {
        id: string
        name: string
        email: string
        role?: AuthUser["role"] | null
        avatar_url?: string | null
      }
    | undefined
  if (!row) return null
  return mapUserRow(row)
}

export function getSessionUser(token: string): AuthUser | null {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as
    | {
        id: string
        name: string
        email: string
        role?: AuthUser["role"] | null
        avatar_url?: string | null
      }
    | undefined
  if (!row) return null
  return mapUserRow(row)
}

export function createSession(userId: string): string {
  const token = crypto.randomUUID()
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
  getDb().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt,
  )
  return token
}

export function deleteSession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

export function listProjectsForUser(userId: string): Project[] {
  const rows = getDb()
    .prepare("SELECT data FROM projects WHERE owner_id = ? ORDER BY updated_at DESC")
    .all(userId) as { data: string }[]
  return rows.map((r) => JSON.parse(r.data) as Project)
}

/** 未設定の既存プロジェクトは組織全体公開（後方互換） */
export function effectiveVisibility(project: Project): ProjectVisibility {
  return project.visibility === "members" ? "members" : "org"
}

/**
 * 公開マニュアルを他ユーザーへ返すときの閲覧用サニタイズ。
 * ヒアリング回答・深掘り回答・変更履歴・下書き本文は業務内部情報のため除去し、
 * 公開スナップショットのみを本文として返す。
 */
export function sanitizeProjectForReader(project: Project): Project {
  const published = (project.publishedSections ?? []) as Project["sections"]
  return {
    ...project,
    hearingAnswers: [],
    deepdive: (project.deepdive ?? []).map((d) => ({ ...d, answers: [] })),
    sections: published,
    history: [],
    sectionRevisions: [],
    restorePoints: [],
  }
}

/** 自分のプロジェクト + 他ユーザーの公開済み(組織公開) + メンバー招待分 */
export function listAccessibleProjects(userId: string): Project[] {
  const own = listProjectsForUser(userId)
  const ownIds = new Set(own.map((p) => p.id))

  const publishedRows = getDb()
    .prepare(
      `SELECT data FROM projects
       WHERE json_extract(data, '$.status') = 'published' AND owner_id != ?
         AND COALESCE(json_extract(data, '$.visibility'), 'org') != 'members'
       ORDER BY updated_at DESC`,
    )
    .all(userId) as { data: string }[]

  const memberRows = getDb()
    .prepare(
      `SELECT p.data FROM project_members m
       JOIN projects p ON p.id = m.project_id AND p.owner_id != ?
       WHERE m.user_id = ?`,
    )
    .all(userId, userId) as { data: string }[]

  const merged = [...own]
  const memberIds = new Set(
    memberRows.map((row) => (JSON.parse(row.data) as Project).id),
  )
  for (const row of [...publishedRows, ...memberRows]) {
    const p = JSON.parse(row.data) as Project
    if (ownIds.has(p.id)) continue
    merged.push(memberIds.has(p.id) ? p : sanitizeProjectForReader(p))
    ownIds.add(p.id)
  }
  return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getProjectForUser(projectId: string, userId: string): Project | null {
  const row = getDb()
    .prepare("SELECT data FROM projects WHERE id = ? AND owner_id = ?")
    .get(projectId, userId) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as Project) : null
}

/** 楽観ロック用。保存済みの更新日時のみを引く */
export function getProjectUpdatedAt(projectId: string, ownerId: string): string | null {
  const row = getDb()
    .prepare("SELECT updated_at AS updatedAt FROM projects WHERE id = ? AND owner_id = ?")
    .get(projectId, ownerId) as { updatedAt: string } | undefined
  return row?.updatedAt ?? null
}

export type ProjectAccess = "owner" | "member" | "published_reader"

export function getAccessibleProject(
  projectId: string,
  userId: string,
): { project: Project; access: ProjectAccess } | null {
  const owned = getProjectForUser(projectId, userId)
  if (owned) return { project: owned, access: "owner" }

  const member = getDb()
    .prepare(
      `SELECT p.data FROM project_members m
       JOIN projects p ON p.id = m.project_id
       WHERE m.project_id = ? AND m.user_id = ?`,
    )
    .get(projectId, userId) as { data: string } | undefined
  if (member) {
    return { project: JSON.parse(member.data) as Project, access: "member" }
  }

  const published = getDb()
    .prepare(
      `SELECT data FROM projects
       WHERE id = ? AND owner_id != ? AND json_extract(data, '$.status') = 'published'
         AND COALESCE(json_extract(data, '$.visibility'), 'org') != 'members'`,
    )
    .get(projectId, userId) as { data: string } | undefined
  if (published) {
    const project = JSON.parse(published.data) as Project
    return { project: sanitizeProjectForReader(project), access: "published_reader" }
  }

  return null
}

export function listProjectMembers(projectId: string): Array<{ userId: string; permission: string }> {
  return getDb()
    .prepare(`SELECT user_id AS userId, permission FROM project_members WHERE project_id = ?`)
    .all(projectId) as Array<{ userId: string; permission: string }>
}

export function upsertProjectMember(projectId: string, userId: string, permission: "view" | "edit" | "admin") {
  getDb()
    .prepare(
      `INSERT INTO project_members (project_id, user_id, permission, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET permission = excluded.permission`,
    )
    .run(projectId, userId, permission, Date.now())
}

/** オーナー変更: projects 行の owner_id を移し、旧オーナーを edit メンバーにする */
export function transferProjectOwnership(
  projectId: string,
  fromUserId: string,
  toUserId: string,
  nextProject: Project,
): Project | null {
  const db = getDb()
  const existing = getProjectForUser(projectId, fromUserId)
  if (!existing) return null
  const toUser = getUserById(toUserId)
  if (!toUser) return null

  const transferred: Project = {
    ...nextProject,
    id: projectId,
    owner: toUser.name,
    ownerId: toUser.id,
  }

  db.exec("BEGIN")
  try {
    db.prepare(`DELETE FROM projects WHERE id = ? AND owner_id = ?`).run(projectId, fromUserId)
    db.prepare(
      `INSERT INTO projects (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id, owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(projectId, toUserId, JSON.stringify(transferred), transferred.updatedAt)
    upsertProjectMember(projectId, fromUserId, "edit")
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return transferred
}

export function insertLlmIoLog(input: {
  userId: string
  projectId?: string
  action: string
  provider: string
  prompt: string
  response: string
  tokens: number
}) {
  getDb()
    .prepare(
      `INSERT INTO llm_io_logs (id, user_id, project_id, action, provider, prompt, response, tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.projectId ?? null,
      input.action,
      input.provider,
      input.prompt.slice(0, 8000),
      input.response.slice(0, 8000),
      input.tokens,
      Date.now(),
    )
}

export function insertProject(userId: string, project: Project) {
  getDb()
    .prepare("INSERT INTO projects (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run(project.id, userId, JSON.stringify(project), project.updatedAt)
}

export function updateProject(userId: string, project: Project) {
  getDb()
    .prepare(
      "UPDATE projects SET data = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
    )
    .run(JSON.stringify(project), project.updatedAt, project.id, userId)
  return getProjectForUser(project.id, userId) !== null
}

export function deleteProject(projectId: string, userId: string): boolean {
  getDb()
    .prepare("DELETE FROM projects WHERE id = ? AND owner_id = ?")
    .run(projectId, userId)
  return getProjectForUser(projectId, userId) === null
}

export function countProjects(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number }
  return row.c
}

export function upsertProject(userId: string, project: Project) {
  getDb()
    .prepare(
      `INSERT INTO projects (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id, owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(project.id, userId, JSON.stringify(project), project.updatedAt)
}

export function insertQaFeedback(
  userId: string,
  messageId: string,
  question: string,
  feedback: "up" | "down",
) {
  getDb()
    .prepare(
      "INSERT INTO qa_feedback (id, user_id, message_id, question, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(crypto.randomUUID(), userId, messageId, question, feedback, Date.now())
}

export function insertQaMessage(userId: string, messageId: string, question: string) {
  getDb()
    .prepare(
      "INSERT INTO qa_messages (id, user_id, question, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(messageId, userId, question, Date.now())
}
