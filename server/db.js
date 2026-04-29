import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve('data');
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve('uploads');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'snapdesk.db'));

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    bio TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    avatar_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    caption TEXT NOT NULL,
    location TEXT NOT NULL,
    image_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    followee_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dm_key TEXT NOT NULL UNIQUE DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    entity_id INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    opened_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 day')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL,
    viewer_id INTEGER NOT NULL,
    viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (story_id, viewer_id),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    user_id INTEGER PRIMARY KEY,
    body TEXT NOT NULL DEFAULT '',
    spotify_url TEXT NOT NULL DEFAULT '',
    song_title TEXT NOT NULL DEFAULT '',
    artist_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS note_likes (
    note_user_id INTEGER NOT NULL,
    liker_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_user_id, liker_id),
    FOREIGN KEY (note_user_id) REFERENCES notes(user_id) ON DELETE CASCADE,
    FOREIGN KEY (liker_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((entry) => entry.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('users', 'avatar_path', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'spotify_access_token', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'spotify_refresh_token', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'spotify_token_expires_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('conversation_participants', 'is_muted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('conversation_participants', 'is_hidden', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('snaps', 'replayed_at', 'TEXT');
ensureColumn('snaps', 'saved_in_chat', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('messages', 'image_path', "TEXT NOT NULL DEFAULT ''");

function cleanupPlaceholderPosts() {
  db.prepare("DELETE FROM posts WHERE image_path LIKE 'https://images.unsplash.com/%'").run();
}

function createNotification(userId, actorId, type, entityId, text) {
  if (Number(userId) === Number(actorId)) {
    return;
  }

  db.prepare(
    `
      INSERT INTO notifications (user_id, actor_id, type, entity_id, text)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(userId, actorId, type, entityId, text);
}

function deleteNotification(userId, actorId, type, entityId) {
  db.prepare(
    `
      DELETE FROM notifications
      WHERE user_id = ? AND actor_id = ? AND type = ? AND entity_id = ?
    `,
  ).run(userId, actorId, type, entityId);
}

function avatarFallback(name) {
  const safeName = `${name || ''}`.trim();

  if (!safeName) {
    return '?';
  }

  return safeName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function serializeUserRecord(user) {
  const safeName = user.name || 'Unknown user';

  return {
    id: Number(user.userId || user.id || 0),
    name: safeName,
    handle: user.handle || '',
    bio: user.bio || '',
    avatarPath: user.avatar_path || user.avatarPath || '',
    avatarFallback: avatarFallback(safeName),
  };
}

function cleanupSeededUsers() {
  const seededHandles = ['parker', 'lenavale', 'nkmoves', 'mayamakes'];

  const usersToDelete = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE handle IN (${seededHandles.map(() => '?').join(', ')})
      `,
    )
    .all(...seededHandles);

  usersToDelete.forEach((user) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
}

cleanupPlaceholderPosts();
cleanupSeededUsers();

export function createSession(sessionId, userId) {
  db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(sessionId, userId);
}

export function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getUserBySession(sessionId) {
  return db
    .prepare(`
      SELECT users.id, users.name, users.handle, users.bio, users.avatar_path, users.created_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ?
    `)
    .get(sessionId);
}

export function getUserByHandle(handle) {
  return db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
}

export function getUserById(id) {
  return db
    .prepare(`
      SELECT id, name, handle, bio, avatar_path, created_at
      FROM users
      WHERE id = ?
    `)
    .get(id);
}

export function createUser({ name, handle, bio, passwordHash }) {
  const result = db
    .prepare(`
      INSERT INTO users (name, handle, bio, password_hash)
      VALUES (?, ?, ?, ?)
    `)
    .run(name, handle, bio, passwordHash);

  return getUserById(Number(result.lastInsertRowid));
}

export function updateUserProfile(userId, { name, bio, avatarPath }) {
  const current = getUserById(userId);
  const nextAvatarPath = avatarPath === undefined ? current.avatar_path : avatarPath;

  db.prepare(
    `
      UPDATE users
      SET name = ?, bio = ?, avatar_path = ?
      WHERE id = ?
    `,
  ).run(name, bio, nextAvatarPath, userId);

  return getUserById(userId);
}

export function updateUserSpotifyAuth(userId, { accessToken, refreshToken, expiresAt }) {
  const current = getUserById(userId);

  db.prepare(
    `
      UPDATE users
      SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires_at = ?
      WHERE id = ?
    `,
  ).run(
    accessToken ?? current.spotify_access_token ?? '',
    refreshToken ?? current.spotify_refresh_token ?? '',
    expiresAt ?? current.spotify_token_expires_at ?? '',
    userId,
  );

  return db
    .prepare(`
      SELECT spotify_access_token AS accessToken,
             spotify_refresh_token AS refreshToken,
             spotify_token_expires_at AS expiresAt
      FROM users
      WHERE id = ?
    `)
    .get(userId);
}

export function getUserSpotifyAuth(userId) {
  return db
    .prepare(`
      SELECT spotify_access_token AS accessToken,
             spotify_refresh_token AS refreshToken,
             spotify_token_expires_at AS expiresAt
      FROM users
      WHERE id = ?
    `)
    .get(userId);
}

export function createPost({ userId, caption, location, imagePath }) {
  const result = db
    .prepare(`
      INSERT INTO posts (user_id, caption, location, image_path)
      VALUES (?, ?, ?, ?)
    `)
    .run(userId, caption, location, imagePath);

  return Number(result.lastInsertRowid);
}

export function deletePost(postId, userId) {
  const ownedPost = db
    .prepare('SELECT id, image_path AS imagePath FROM posts WHERE id = ? AND user_id = ?')
    .get(postId, userId);

  if (!ownedPost) {
    return null;
  }

  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  return ownedPost;
}

function withStats(viewerId) {
  const viewer = Number(viewerId || 0);

  return db
    .prepare(`
      SELECT
        posts.id,
        posts.caption,
        posts.location,
        posts.image_path AS imagePath,
        posts.created_at AS createdAt,
        users.id AS userId,
        users.name AS userName,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath,
        COALESCE(like_counts.count, 0) AS likes,
        COALESCE(comment_counts.count, 0) AS comments,
        COALESCE(save_counts.count, 0) AS saves,
        EXISTS(
          SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?
        ) AS liked,
        EXISTS(
          SELECT 1 FROM saves WHERE saves.post_id = posts.id AND saves.user_id = ?
        ) AS saved,
        EXISTS(
          SELECT 1 FROM follows
          WHERE follows.followee_id = users.id AND follows.follower_id = ?
        ) AS following
      FROM posts
      JOIN users ON users.id = posts.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM likes GROUP BY post_id
      ) AS like_counts ON like_counts.post_id = posts.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM comments GROUP BY post_id
      ) AS comment_counts ON comment_counts.post_id = posts.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM saves GROUP BY post_id
      ) AS save_counts ON save_counts.post_id = posts.id
      ORDER BY posts.id DESC
    `)
    .all(viewer, viewer, viewer);
}

function getUserStats(userId) {
  return db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE user_id = ?) AS posts,
        (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
        (SELECT COUNT(*)
         FROM likes
         JOIN posts ON posts.id = likes.post_id
         WHERE posts.user_id = ?) AS totalLikes
    `)
    .get(userId, userId, userId, userId);
}

function getPostOwner(postId) {
  return db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId);
}

export function getFeed(viewerId) {
  return withStats(viewerId);
}

export function getProfile(userId, viewerId) {
  const user = getUserById(userId);

  if (!user) {
    return null;
  }

  const stats = getUserStats(userId);
  const posts = withStats(viewerId).filter((post) => post.userId === Number(userId));
  const following = Number(userId) === Number(viewerId)
    ? false
    : Boolean(
        db
          .prepare('SELECT 1 FROM follows WHERE followee_id = ? AND follower_id = ?')
          .get(userId, viewerId),
      );
  return { user, stats, posts, following, isSelf: Number(userId) === Number(viewerId) };
}

export function toggleLike(postId, userId) {
  const existing = db
    .prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?')
    .get(postId, userId);
  const owner = getPostOwner(postId);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
    if (owner) {
      deleteNotification(owner.user_id, userId, 'like', postId);
    }
    return false;
  }

  db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(postId, userId);
  if (owner) {
    createNotification(owner.user_id, userId, 'like', postId, '');
  }
  return true;
}

export function toggleSave(postId, userId) {
  const existing = db
    .prepare('SELECT 1 FROM saves WHERE post_id = ? AND user_id = ?')
    .get(postId, userId);

  if (existing) {
    db.prepare('DELETE FROM saves WHERE post_id = ? AND user_id = ?').run(postId, userId);
    return false;
  }

  db.prepare('INSERT INTO saves (post_id, user_id) VALUES (?, ?)').run(postId, userId);
  return true;
}

export function toggleFollow(followeeId, followerId) {
  if (Number(followeeId) === Number(followerId)) {
    return false;
  }

  const existing = db
    .prepare('SELECT 1 FROM follows WHERE followee_id = ? AND follower_id = ?')
    .get(followeeId, followerId);

  if (existing) {
    db.prepare('DELETE FROM follows WHERE followee_id = ? AND follower_id = ?').run(
      followeeId,
      followerId,
    );
    deleteNotification(followeeId, followerId, 'follow', followeeId);
    return false;
  }

  db.prepare('INSERT INTO follows (followee_id, follower_id) VALUES (?, ?)').run(
    followeeId,
    followerId,
  );
  createNotification(followeeId, followerId, 'follow', followeeId, '');
  return true;
}

export function addComment(postId, userId, body) {
  db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)').run(
    postId,
    userId,
    body,
  );

  const owner = getPostOwner(postId);
  if (owner) {
    createNotification(owner.user_id, userId, 'comment', postId, body);
  }
}

export function getComments(postId) {
  return db
    .prepare(`
      SELECT comments.id, comments.body, comments.created_at AS createdAt, users.name, users.handle
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.post_id = ?
      ORDER BY comments.id DESC
    `)
    .all(postId);
}

function conversationKeyFor(userIds) {
  return [...new Set(userIds.map((id) => Number(id)))]
    .sort((first, second) => first - second)
    .join(':');
}

export function getOrCreateConversation(userId, otherUserIds) {
  const participantIds = [...new Set([Number(userId), ...otherUserIds.map((id) => Number(id))])];

  if (participantIds.length < 2) {
    return null;
  }

  const allUsersExist = participantIds.every((participantId) => getUserById(participantId));
  if (!allUsersExist) {
    return null;
  }

  const key = conversationKeyFor(participantIds);
  const existing = db.prepare('SELECT id FROM conversations WHERE dm_key = ?').get(key);

  if (existing) {
    return Number(existing.id);
  }

  const created = db.prepare('INSERT INTO conversations (dm_key) VALUES (?)').run(key);
  const conversationId = Number(created.lastInsertRowid);

  const insertParticipant = db.prepare(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
  );

  participantIds.forEach((participantId) => {
    insertParticipant.run(conversationId, participantId);
  });

  return conversationId;
}

export function getMessages(viewerId) {
  return db
    .prepare(`
      SELECT
        conversations.id,
        COALESCE(last_message.body, 'Start the conversation') AS preview,
        COALESCE(last_message.created_at, conversations.created_at) AS updatedAt,
        COALESCE(mine.is_muted, 0) AS isMuted,
        (
          SELECT COUNT(*)
          FROM conversation_participants AS participant_count
          WHERE participant_count.conversation_id = conversations.id
        ) AS participantCount,
        (
          SELECT users.id
          FROM conversation_participants AS first_other
          JOIN users ON users.id = first_other.user_id
          WHERE first_other.conversation_id = conversations.id
            AND first_other.user_id != ?
          ORDER BY users.name ASC
          LIMIT 1
        ) AS userId,
        (
          SELECT users.name
          FROM conversation_participants AS first_other
          JOIN users ON users.id = first_other.user_id
          WHERE first_other.conversation_id = conversations.id
            AND first_other.user_id != ?
          ORDER BY users.name ASC
          LIMIT 1
        ) AS name,
        (
          SELECT users.handle
          FROM conversation_participants AS first_other
          JOIN users ON users.id = first_other.user_id
          WHERE first_other.conversation_id = conversations.id
            AND first_other.user_id != ?
          ORDER BY users.name ASC
          LIMIT 1
        ) AS handle,
        (
          SELECT users.bio
          FROM conversation_participants AS first_other
          JOIN users ON users.id = first_other.user_id
          WHERE first_other.conversation_id = conversations.id
            AND first_other.user_id != ?
          ORDER BY users.name ASC
          LIMIT 1
        ) AS bio,
        (
          SELECT users.avatar_path
          FROM conversation_participants AS first_other
          JOIN users ON users.id = first_other.user_id
          WHERE first_other.conversation_id = conversations.id
            AND first_other.user_id != ?
          ORDER BY users.name ASC
          LIMIT 1
        ) AS avatarPath,
        (
          SELECT GROUP_CONCAT(users.name, ', ')
          FROM conversation_participants AS everyone_else
          JOIN users ON users.id = everyone_else.user_id
          WHERE everyone_else.conversation_id = conversations.id
            AND everyone_else.user_id != ?
        ) AS participantNames,
        (
          SELECT COUNT(*)
          FROM messages AS unread_messages
          JOIN conversation_participants AS participant
            ON participant.conversation_id = unread_messages.conversation_id
           AND participant.user_id = ?
          WHERE unread_messages.conversation_id = conversations.id
            AND unread_messages.sender_id != ?
            AND unread_messages.created_at > participant.last_read_at
        ) AS unreadCount
      FROM conversations
      JOIN conversation_participants AS mine
        ON mine.conversation_id = conversations.id
       AND mine.user_id = ?
       AND COALESCE(mine.is_hidden, 0) = 0
      LEFT JOIN messages AS last_message
        ON last_message.id = (
          SELECT id
          FROM messages
          WHERE conversation_id = conversations.id
          ORDER BY id DESC
          LIMIT 1
        )
      ORDER BY updatedAt DESC
    `)
    .all(viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId)
    .filter((entry) => Number(entry.userId) > 0 && entry.name)
    .map((entry) => ({
      id: Number(entry.id),
      preview: entry.preview,
      updatedAt: entry.updatedAt,
      unreadCount: Number(entry.unreadCount),
      muted: Boolean(entry.isMuted),
      participantCount: Number(entry.participantCount),
      title:
        Number(entry.participantCount) > 2
          ? entry.participantNames
          : entry.name,
      user: serializeUserRecord({
        ...entry,
        name:
          Number(entry.participantCount) > 2
            ? entry.participantNames || entry.name
            : entry.name,
      }),
    }));
}

export function setConversationMuted(conversationId, userId, muted) {
  const participant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    )
    .get(conversationId, userId);

  if (!participant) {
    return false;
  }

  db.prepare(
    `
      UPDATE conversation_participants
      SET is_muted = ?
      WHERE conversation_id = ? AND user_id = ?
    `,
  ).run(muted ? 1 : 0, conversationId, userId);

  if (muted) {
    db.prepare(
      `
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = ? AND type = 'message' AND entity_id = ?
      `,
    ).run(userId, conversationId);
  }

  return true;
}

export function hideConversation(conversationId, userId) {
  const participant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    )
    .get(conversationId, userId);

  if (!participant) {
    return false;
  }

  db.prepare(
    `
      UPDATE conversation_participants
      SET is_hidden = 1
      WHERE conversation_id = ? AND user_id = ?
    `,
  ).run(conversationId, userId);

  db.prepare(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND type = 'message' AND entity_id = ?
    `,
  ).run(userId, conversationId);

  return true;
}

export function getConversationMessages(conversationId, userId) {
  const participant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    )
    .get(conversationId, userId);

  if (!participant) {
    return null;
  }

  return db
    .prepare(`
      SELECT
        messages.id,
        messages.body,
        messages.image_path AS imagePath,
        messages.created_at AS createdAt,
        messages.sender_id AS senderId
      FROM messages
      WHERE messages.conversation_id = ?
      ORDER BY messages.id ASC
    `)
    .all(conversationId)
    .map((entry) => ({
      id: Number(entry.id),
      body: entry.body,
      imagePath: entry.imagePath || '',
      createdAt: entry.createdAt,
      senderId: Number(entry.senderId),
    }));
}

export function sendMessage(conversationId, senderId, { body = '', imagePath = '' }) {
  const participant = db
    .prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    )
    .get(conversationId, senderId);

  if (!participant) {
    return null;
  }

  const result = db
    .prepare(`
      INSERT INTO messages (conversation_id, sender_id, body, image_path)
      VALUES (?, ?, ?, ?)
    `)
    .run(conversationId, senderId, body, imagePath);

  db.prepare(
    `
      UPDATE conversation_participants
      SET last_read_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ? AND user_id = ?
    `,
  ).run(conversationId, senderId);

  const recipients = db
    .prepare(
      `
        SELECT user_id, COALESCE(is_muted, 0) AS isMuted
        FROM conversation_participants
        WHERE conversation_id = ? AND user_id != ?
      `,
    )
    .all(conversationId, senderId);

  recipients.forEach((recipient) => {
    if (!Number(recipient.isMuted)) {
      createNotification(
        recipient.user_id,
        senderId,
        'message',
        conversationId,
        body || (imagePath ? 'Sent a photo' : ''),
      );
    }
  });

  return Number(result.lastInsertRowid);
}

export function markConversationRead(conversationId, userId) {
  db.prepare(
    `
      UPDATE conversation_participants
      SET last_read_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ? AND user_id = ?
    `,
  ).run(conversationId, userId);

  db.prepare(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND type = 'message' AND entity_id = ?
    `,
  ).run(userId, conversationId);
}

export function createSnap({ senderId, recipientId, imagePath, caption }) {
  const recipient = getUserById(recipientId);

  if (!recipient || Number(senderId) === Number(recipientId)) {
    return null;
  }

  const result = db
    .prepare(`
      INSERT INTO snaps (sender_id, recipient_id, image_path, caption)
      VALUES (?, ?, ?, ?)
    `)
    .run(senderId, recipientId, imagePath, caption);

  const snapId = Number(result.lastInsertRowid);
  createNotification(recipientId, senderId, 'snap', snapId, caption);
  return snapId;
}

export function getSnapThreads(viewerId) {
  return db
    .prepare(`
      WITH visible_snaps AS (
        SELECT
          snaps.id,
          snaps.sender_id AS senderId,
          snaps.recipient_id AS recipientId,
          snaps.image_path AS imagePath,
          snaps.caption,
          snaps.opened_at AS openedAt,
          snaps.replayed_at AS replayedAt,
          COALESCE(snaps.saved_in_chat, 0) AS savedInChat,
          snaps.created_at AS createdAt,
          CASE
            WHEN snaps.sender_id = ? THEN snaps.recipient_id
            ELSE snaps.sender_id
          END AS otherUserId,
          CASE
            WHEN snaps.sender_id = ? THEN 'sent'
            ELSE 'received'
          END AS direction
        FROM snaps
        WHERE snaps.sender_id = ? OR snaps.recipient_id = ?
      ),
      latest_per_user AS (
        SELECT MAX(id) AS latestId
        FROM visible_snaps
        GROUP BY otherUserId
      )
      SELECT
        visible_snaps.id,
        visible_snaps.caption,
        visible_snaps.openedAt,
        visible_snaps.replayedAt,
        visible_snaps.savedInChat,
        visible_snaps.createdAt,
        visible_snaps.direction,
        users.id AS userId,
        users.name,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath,
        (
          SELECT COUNT(*)
          FROM snaps AS unread
          WHERE unread.recipient_id = ?
            AND unread.sender_id = visible_snaps.otherUserId
            AND unread.opened_at IS NULL
        ) AS unreadCount
      FROM visible_snaps
      JOIN latest_per_user ON latest_per_user.latestId = visible_snaps.id
      JOIN users ON users.id = visible_snaps.otherUserId
      ORDER BY visible_snaps.id DESC
    `)
    .all(viewerId, viewerId, viewerId, viewerId, viewerId)
    .map((entry) => ({
      id: Number(entry.id),
      caption: entry.caption,
      openedAt: entry.openedAt,
      replayedAt: entry.replayedAt,
      savedInChat: Boolean(entry.savedInChat),
      createdAt: entry.createdAt,
      direction: entry.direction,
      unreadCount: Number(entry.unreadCount),
      canOpen: entry.direction === 'received' && !entry.openedAt,
      canReplay:
        entry.direction === 'received' && Boolean(entry.openedAt) && !entry.replayedAt && !Boolean(entry.savedInChat),
      canViewInChat:
        Boolean(entry.savedInChat) ||
        (entry.direction === 'received' && (!entry.openedAt || !entry.replayedAt)),
      user: serializeUserRecord(entry),
    }));
}

export function getSnapThread(otherUserId, viewerId) {
  const otherUser = getUserById(otherUserId);

  if (!otherUser || Number(otherUserId) === Number(viewerId)) {
    return null;
  }

  const snaps = db
    .prepare(`
      SELECT
        snaps.id,
        snaps.sender_id AS senderId,
        snaps.recipient_id AS recipientId,
        snaps.image_path AS imagePath,
        snaps.caption,
        snaps.opened_at AS openedAt,
        snaps.replayed_at AS replayedAt,
        COALESCE(snaps.saved_in_chat, 0) AS savedInChat,
        snaps.created_at AS createdAt
      FROM snaps
      WHERE
        (snaps.sender_id = ? AND snaps.recipient_id = ?)
        OR (snaps.sender_id = ? AND snaps.recipient_id = ?)
      ORDER BY snaps.id ASC
    `)
    .all(viewerId, otherUserId, otherUserId, viewerId)
    .map((entry) => {
      const direction = Number(entry.senderId) === Number(viewerId) ? 'sent' : 'received';
      const savedInChat = Boolean(entry.savedInChat);

      return {
        id: Number(entry.id),
        senderId: Number(entry.senderId),
        recipientId: Number(entry.recipientId),
        imagePath: entry.imagePath,
        caption: entry.caption,
        openedAt: entry.openedAt,
        replayedAt: entry.replayedAt,
        savedInChat,
        createdAt: entry.createdAt,
        direction,
        canOpen: direction === 'received' && !entry.openedAt,
        canReplay: direction === 'received' && Boolean(entry.openedAt) && !entry.replayedAt && !savedInChat,
        canViewInChat: savedInChat || (direction === 'received' && (!entry.openedAt || !entry.replayedAt)),
      };
    });

  return {
    user: serializeUserRecord(otherUser),
    snaps,
  };
}

function getSnapForViewer(snapId, viewerId) {
  const snap = db
    .prepare(`
      SELECT
        snaps.id,
        snaps.sender_id AS senderId,
        snaps.recipient_id AS recipientId,
        snaps.image_path AS imagePath,
        snaps.caption,
        snaps.opened_at AS openedAt,
        snaps.replayed_at AS replayedAt,
        COALESCE(snaps.saved_in_chat, 0) AS savedInChat,
        snaps.created_at AS createdAt,
        users.id AS userId,
        users.name,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath
      FROM snaps
      JOIN users ON users.id = snaps.sender_id
      WHERE snaps.id = ? AND (snaps.sender_id = ? OR snaps.recipient_id = ?)
    `)
    .get(snapId, viewerId, viewerId);

  return snap || null;
}

function buildSnapPayload(snap) {
  return {
    id: Number(snap.id),
    imagePath: snap.imagePath,
    caption: snap.caption,
    createdAt: snap.createdAt,
    openedAt: snap.openedAt,
    replayedAt: snap.replayedAt,
    savedInChat: Boolean(snap.savedInChat),
    sender: serializeUserRecord(snap),
  };
}

export function openSnap(snapId, viewerId) {
  const snap = getSnapForViewer(snapId, viewerId);

  if (!snap) {
    return null;
  }

  if (Boolean(snap.savedInChat)) {
    return { status: 'saved-chat', snap: buildSnapPayload(snap) };
  }

  if (Number(snap.recipientId) !== Number(viewerId)) {
    return { status: 'forbidden', snap };
  }

  if (snap.openedAt) {
    return { status: 'opened', snap };
  }

  db.prepare(
    `
      UPDATE snaps
      SET opened_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_id = ? AND opened_at IS NULL
    `,
  ).run(snapId, viewerId);

  db.prepare(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND type = 'snap' AND entity_id = ?
    `,
  ).run(viewerId, snapId);

  return {
    status: 'opened-now',
    snap: buildSnapPayload({
      ...snap,
      openedAt: new Date().toISOString(),
    }),
  };
}

export function replaySnap(snapId, viewerId) {
  const snap = getSnapForViewer(snapId, viewerId);

  if (!snap) {
    return null;
  }

  if (Boolean(snap.savedInChat)) {
    return { status: 'saved-chat', snap: buildSnapPayload(snap) };
  }

  if (Number(snap.recipientId) !== Number(viewerId)) {
    return { status: 'forbidden', snap };
  }

  if (!snap.openedAt) {
    return { status: 'open-first', snap };
  }

  if (snap.replayedAt) {
    return { status: 'replayed', snap };
  }

  db.prepare(
    `
      UPDATE snaps
      SET replayed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND recipient_id = ? AND replayed_at IS NULL
    `,
  ).run(snapId, viewerId);

  return {
    status: 'replayed-now',
    snap: buildSnapPayload({
      ...snap,
      replayedAt: new Date().toISOString(),
    }),
  };
}

export function saveSnapInChat(snapId, viewerId) {
  const snap = getSnapForViewer(snapId, viewerId);

  if (!snap) {
    return null;
  }

  db.prepare(
    `
      UPDATE snaps
      SET saved_in_chat = 1
      WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
    `,
  ).run(snapId, viewerId, viewerId);

  return {
    ok: true,
    snap: buildSnapPayload({
      ...snap,
      savedInChat: 1,
    }),
  };
}

export function createStory({ userId, imagePath, caption }) {
  const result = db
    .prepare(`
      INSERT INTO stories (user_id, image_path, caption)
      VALUES (?, ?, ?)
    `)
    .run(userId, imagePath, caption);

  return Number(result.lastInsertRowid);
}

export function getActiveStories(viewerId) {
  db.prepare("DELETE FROM stories WHERE expires_at <= CURRENT_TIMESTAMP").run();

  return db
    .prepare(`
      SELECT
        stories.id,
        stories.caption,
        stories.image_path AS imagePath,
        stories.created_at AS createdAt,
        stories.expires_at AS expiresAt,
        EXISTS(
          SELECT 1
          FROM story_views
          WHERE story_views.story_id = stories.id
            AND story_views.viewer_id = ?
        ) AS viewedByViewer,
        (
          SELECT COUNT(*)
          FROM story_views
          WHERE story_views.story_id = stories.id
        ) AS viewerCount,
        users.id AS userId,
        users.name,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath
      FROM stories
      JOIN users ON users.id = stories.user_id
      WHERE stories.expires_at > CURRENT_TIMESTAMP
      ORDER BY
        CASE
          WHEN stories.user_id = ? THEN 0
          WHEN EXISTS(
            SELECT 1
            FROM follows
            WHERE follows.followee_id = stories.user_id
              AND follows.follower_id = ?
          ) THEN 1
          ELSE 2
        END,
        stories.created_at DESC
    `)
    .all(viewerId, viewerId, viewerId)
    .map((entry) => ({
      id: Number(entry.id),
      caption: entry.caption,
      imagePath: entry.imagePath,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      user: serializeUserRecord(entry),
      isOwnStory: Number(entry.userId) === Number(viewerId),
      viewedByViewer: Boolean(entry.viewedByViewer),
      viewerCount: Number(entry.userId) === Number(viewerId) ? Number(entry.viewerCount || 0) : null,
    }));
}

export function markStoriesViewed(storyIds, viewerId) {
  const insertView = db.prepare(`
    INSERT OR IGNORE INTO story_views (story_id, viewer_id)
    VALUES (?, ?)
  `);

  storyIds.forEach((storyId) => {
    insertView.run(storyId, viewerId);
  });
}

export function getStoryViewers(storyId, ownerId) {
  const story = db
    .prepare(`
      SELECT id
      FROM stories
      WHERE id = ?
        AND user_id = ?
        AND expires_at > CURRENT_TIMESTAMP
    `)
    .get(storyId, ownerId);

  if (!story) {
    return null;
  }

  return db
    .prepare(`
      SELECT
        users.id AS userId,
        users.name,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath,
        story_views.viewed_at AS viewedAt
      FROM story_views
      JOIN users ON users.id = story_views.viewer_id
      WHERE story_views.story_id = ?
      ORDER BY story_views.viewed_at DESC
    `)
    .all(storyId)
    .map((entry) => ({
      user: serializeUserRecord(entry),
      viewedAt: entry.viewedAt,
    }));
}

export function setUserNote(userId, { body, spotifyUrl, songTitle, artistName }) {
  if (!body && !spotifyUrl && !songTitle && !artistName) {
    db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
    return;
  }

  db.prepare(
    `
      INSERT INTO notes (user_id, body, spotify_url, song_title, artist_name, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        body = excluded.body,
        spotify_url = excluded.spotify_url,
        song_title = excluded.song_title,
        artist_name = excluded.artist_name,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(userId, body, spotifyUrl, songTitle, artistName);
}

export function toggleNoteLike(noteUserId, likerId) {
  if (Number(noteUserId) === Number(likerId)) {
    return null;
  }

  const note = db.prepare('SELECT user_id FROM notes WHERE user_id = ?').get(noteUserId);

  if (!note) {
    return null;
  }

  const existing = db
    .prepare('SELECT 1 FROM note_likes WHERE note_user_id = ? AND liker_id = ?')
    .get(noteUserId, likerId);

  if (existing) {
    db.prepare('DELETE FROM note_likes WHERE note_user_id = ? AND liker_id = ?').run(noteUserId, likerId);
    deleteNotification(noteUserId, likerId, 'note', noteUserId);
    return false;
  }

  db.prepare('INSERT INTO note_likes (note_user_id, liker_id) VALUES (?, ?)').run(noteUserId, likerId);
  createNotification(noteUserId, likerId, 'note', noteUserId, '');
  return true;
}

export function getInboxNotes(viewerId) {
  return db
    .prepare(`
      SELECT
        notes.body,
        notes.spotify_url AS spotifyUrl,
        notes.song_title AS songTitle,
        notes.artist_name AS artistName,
        notes.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM note_likes
          WHERE note_likes.note_user_id = notes.user_id
        ) AS likeCount,
        EXISTS(
          SELECT 1
          FROM note_likes
          WHERE note_likes.note_user_id = notes.user_id
            AND note_likes.liker_id = ?
        ) AS likedByViewer,
        users.id AS userId,
        users.name,
        users.handle,
        users.bio,
        users.avatar_path AS avatarPath
      FROM notes
      JOIN users ON users.id = notes.user_id
      WHERE notes.updated_at > datetime('now', '-1 day')
        AND (
          notes.user_id = ?
          OR EXISTS(
            SELECT 1
            FROM follows
            WHERE follows.followee_id = notes.user_id
              AND follows.follower_id = ?
          )
          OR EXISTS(
            SELECT 1
            FROM conversation_participants AS mine
            JOIN conversation_participants AS theirs
              ON theirs.conversation_id = mine.conversation_id
            WHERE mine.user_id = ?
              AND theirs.user_id = notes.user_id
          )
        )
      ORDER BY
        CASE WHEN notes.user_id = ? THEN 0 ELSE 1 END,
        notes.updated_at DESC
      LIMIT 12
    `)
    .all(viewerId, viewerId, viewerId, viewerId, viewerId)
    .map((entry) => ({
      body: entry.body,
      spotifyUrl: entry.spotifyUrl,
      songTitle: entry.songTitle,
      artistName: entry.artistName,
      updatedAt: entry.updatedAt,
      likeCount: Number(entry.likeCount),
      likedByViewer: Boolean(entry.likedByViewer),
      user: serializeUserRecord(entry),
      isOwnNote: Number(entry.userId) === Number(viewerId),
    }));
}

export function searchAll(query, viewerId) {
  const term = `%${query.trim().toLowerCase()}%`;
  const users = db
    .prepare(`
      SELECT id, name, handle, bio, avatar_path
      FROM users
      WHERE LOWER(name) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(bio) LIKE ?
      ORDER BY name ASC
      LIMIT 8
    `)
    .all(term, term, term)
    .map((user) => ({
      ...serializeUserRecord(user),
      following: Boolean(
        db
          .prepare('SELECT 1 FROM follows WHERE followee_id = ? AND follower_id = ?')
          .get(user.id, viewerId),
      ),
    }));

  const posts = withStats(viewerId)
    .filter((post) => {
      const combined = `${post.caption} ${post.location} ${post.userName} ${post.handle}`.toLowerCase();
      return combined.includes(query.trim().toLowerCase());
    })
    .slice(0, 12);

  return { users, posts };
}

export function listPeople(viewerId) {
  return db
    .prepare(`
      SELECT id, name, handle, bio, avatar_path
      FROM users
      WHERE id != ?
      ORDER BY name ASC
      LIMIT 16
    `)
    .all(viewerId)
    .map((user) => ({
      ...serializeUserRecord(user),
      following: Boolean(
        db
          .prepare('SELECT 1 FROM follows WHERE followee_id = ? AND follower_id = ?')
          .get(user.id, viewerId),
      ),
    }));
}

export function getActivity(userId) {
  return db
    .prepare(`
      SELECT
        notifications.id,
        notifications.type,
        notifications.text,
        notifications.created_at AS createdAt,
        notifications.is_read AS isRead,
        users.name AS actorName,
        users.handle AS actorHandle,
        users.avatar_path AS actorAvatarPath
      FROM notifications
      JOIN users ON users.id = notifications.actor_id
      WHERE notifications.user_id = ?
      ORDER BY notifications.id DESC
      LIMIT 30
    `)
    .all(userId)
    .map((entry) => ({
      id: Number(entry.id),
      type: entry.type,
      text: entry.text,
      createdAt: entry.createdAt,
      isRead: Boolean(entry.isRead),
      actorName: entry.actorName,
      actorHandle: entry.actorHandle,
      actorAvatarPath: entry.actorAvatarPath || '',
      actorAvatarFallback: avatarFallback(entry.actorName),
    }));
}

export function markAllActivityRead(userId) {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
}

export function getUnreadCounts(userId) {
  const activity = db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId).count;
  const conversations = getMessages(userId);
  const messages = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const snaps = db
    .prepare('SELECT COUNT(*) AS count FROM snaps WHERE recipient_id = ? AND opened_at IS NULL')
    .get(userId).count;

  return {
    activity: Number(activity),
    messages: Number(messages),
    snaps: Number(snaps),
  };
}
