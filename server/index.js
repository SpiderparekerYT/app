import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import {
  addComment,
  createStory,
  createSnap,
  createPost,
  createSession,
  createUser,
  deletePost,
  deleteSession,
  getActivity,
  getComments,
  getConversationMessages,
  getFeed,
  getActiveStories,
  getStoryViewers,
  getInboxNotes,
  listPeople,
  getMessages,
  getOrCreateConversation,
  getProfile,
  hideConversation,
  markStoriesViewed,
  getSnapThread,
  getSnapThreads,
  getUserSpotifyAuth,
  getUnreadCounts,
  getUserByHandle,
  getUserBySession,
  markAllActivityRead,
  markConversationRead,
  openSnap,
  replaySnap,
  searchAll,
  saveSnapInChat,
  setConversationMuted,
  updateUserSpotifyAuth,
  setUserNote,
  sendMessage,
  toggleFollow,
  toggleLike,
  toggleNoteLike,
  toggleSave,
  updateUserProfile,
} from './db.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve('uploads');
const distDir = path.resolve('dist');
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || '';
const appOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const spotifyRedirectUri = `${appOrigin}/api/spotify/callback`;
const spotifyScopes = ['user-read-email', 'user-read-private'].join(' ');
const secureCookies = appOrigin.startsWith('https://');
const sessionSameSite = secureCookies ? 'none' : 'lax';
const allowedOrigins = new Set([
  appOrigin,
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

fs.mkdirSync(uploadsDir, { recursive: true });
app.set('trust proxy', 1);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname) || '.jpg';
    callback(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

function sanitizeHandle(handle) {
  return handle.trim().toLowerCase().replace(/^@+/, '');
}

function avatarFallback(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fileUrl(filePath) {
  if (!filePath) {
    return '';
  }

  return filePath.startsWith('http') ? filePath : `/${filePath}`;
}

function uploadDiskPath(publicPath) {
  if (!publicPath || !publicPath.startsWith('uploads/')) {
    return '';
  }

  return path.join(uploadsDir, path.basename(publicPath));
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function fetchSpotifyToken(params) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Spotify authentication failed.');
  }

  return data;
}

async function ensureSpotifyAccessToken(userId) {
  const auth = getUserSpotifyAuth(userId);

  if (!auth?.accessToken || !auth?.refreshToken || !spotifyClientId) {
    return null;
  }

  const expiresAt = auth.expiresAt ? new Date(auth.expiresAt).getTime() : 0;
  if (expiresAt > Date.now() + 30_000) {
    return auth.accessToken;
  }

  const refreshed = await fetchSpotifyToken({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    client_id: spotifyClientId,
  });

  updateUserSpotifyAuth(userId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || auth.refreshToken,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });

  return refreshed.access_token;
}

function serializeUser(user) {
  return {
    id: Number(user.id),
    name: user.name,
    handle: user.handle,
    bio: user.bio,
    avatarUrl: fileUrl(user.avatar_path || user.avatarPath || ''),
    avatarFallback: avatarFallback(user.name),
  };
}

function normalizePost(post) {
  return {
    id: Number(post.id),
    caption: post.caption,
    location: post.location,
    imageUrl: fileUrl(post.imagePath),
    createdAt: post.createdAt,
    likes: Number(post.likes),
    comments: Number(post.comments),
    saves: Number(post.saves),
    liked: Boolean(post.liked),
    saved: Boolean(post.saved),
    following: Boolean(post.following),
    user: serializeUser({
      id: post.userId,
      name: post.userName,
      handle: post.handle,
      bio: post.bio,
      avatarPath: post.avatarPath,
    }),
  };
}

function normalizeSnapThread(thread) {
  return {
    id: Number(thread.id),
    caption: thread.caption,
    createdAt: thread.createdAt,
    openedAt: thread.openedAt,
    replayedAt: thread.replayedAt,
    savedInChat: Boolean(thread.savedInChat),
    direction: thread.direction,
    unreadCount: Number(thread.unreadCount),
    canOpen: Boolean(thread.canOpen),
    canReplay: Boolean(thread.canReplay),
    canViewInChat: Boolean(thread.canViewInChat),
    user: serializeUser(thread.user),
  };
}

function normalizeSnapItem(snap, user) {
  return {
    id: Number(snap.id),
    imageUrl: fileUrl(snap.imagePath),
    caption: snap.caption,
    createdAt: snap.createdAt,
    openedAt: snap.openedAt,
    replayedAt: snap.replayedAt,
    savedInChat: Boolean(snap.savedInChat),
    direction: snap.direction,
    canOpen: Boolean(snap.canOpen),
    canReplay: Boolean(snap.canReplay),
    canViewInChat: Boolean(snap.canViewInChat),
    user: serializeUser(user),
  };
}

function normalizeStory(story) {
  return {
    id: Number(story.id),
    caption: story.caption,
    imageUrl: fileUrl(story.imagePath),
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    isOwnStory: Boolean(story.isOwnStory),
    viewedByViewer: Boolean(story.viewedByViewer),
    viewerCount: typeof story.viewerCount === 'number' ? story.viewerCount : null,
    user: serializeUser(story.user),
  };
}

function normalizeNote(note) {
  return {
    body: note.body,
    spotifyUrl: note.spotifyUrl,
    songTitle: note.songTitle,
    artistName: note.artistName,
    updatedAt: note.updatedAt,
    likeCount: Number(note.likeCount || 0),
    likedByViewer: Boolean(note.likedByViewer),
    isOwnNote: Boolean(note.isOwnNote),
    user: serializeUser(note.user),
  };
}

function normalizeMessage(message) {
  return {
    id: Number(message.id),
    body: message.body,
    imageUrl: fileUrl(message.imagePath || ''),
    createdAt: message.createdAt,
    senderId: Number(message.senderId),
  };
}

function requireAuth(req, res, next) {
  const sessionId = req.cookies.snapdesk_session;
  const user = sessionId ? getUserBySession(sessionId) : null;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  req.user = user;
  return next();
}

function sendSession(res, user) {
  const sessionId = crypto.randomUUID();
  createSession(sessionId, user.id);
  res.cookie('snapdesk_session', sessionId, {
    httpOnly: true,
    sameSite: sessionSameSite,
    secure: secureCookies,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/spotify/status', requireAuth, (req, res) => {
  const auth = getUserSpotifyAuth(req.user.id);
  res.json({
    connected: Boolean(auth?.accessToken && auth?.refreshToken),
    clientConfigured: Boolean(spotifyClientId),
  });
});

app.get('/api/spotify/connect', requireAuth, (req, res) => {
  if (!spotifyClientId) {
    return res.status(500).json({ error: 'Spotify client ID is not configured.' });
  }

  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomUUID();

  res.cookie('spotify_pkce_verifier', verifier, {
    httpOnly: true,
    sameSite: sessionSameSite,
    secure: secureCookies,
    maxAge: 1000 * 60 * 10,
  });
  res.cookie('spotify_oauth_state', state, {
    httpOnly: true,
    sameSite: sessionSameSite,
    secure: secureCookies,
    maxAge: 1000 * 60 * 10,
  });

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: spotifyClientId,
    redirect_uri: spotifyRedirectUri,
    state,
    scope: spotifyScopes,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  }).toString();

  return res.redirect(authUrl.toString());
});

app.get('/api/spotify/callback', requireAuth, async (req, res) => {
  const code = req.query.code?.toString();
  const state = req.query.state?.toString();
  const verifier = req.cookies.spotify_pkce_verifier;
  const expectedState = req.cookies.spotify_oauth_state;

  res.clearCookie('spotify_pkce_verifier');
  res.clearCookie('spotify_oauth_state');

  if (!code || !state || !verifier || state !== expectedState) {
    return res.redirect('/?spotify=error');
  }

  try {
    const token = await fetchSpotifyToken({
      client_id: spotifyClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri,
      code_verifier: verifier,
    });

    updateUserSpotifyAuth(req.user.id, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    });

    return res.redirect('/?spotify=connected&tab=messages');
  } catch {
    return res.redirect('/?spotify=error');
  }
});

app.get('/api/spotify/search', requireAuth, async (req, res) => {
  const query = req.query.q?.toString().trim() || '';

  if (!query) {
    return res.json({ tracks: [] });
  }

  const accessToken = await ensureSpotifyAccessToken(req.user.id);

  if (!accessToken) {
    return res.status(401).json({ error: 'Connect Spotify first.' });
  }

  const spotifyUrl = new URL('https://api.spotify.com/v1/search');
  spotifyUrl.search = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '8',
  }).toString();

  const response = await fetch(spotifyUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json({ error: data.error?.message || 'Spotify search failed.' });
  }

  return res.json({
    tracks: (data.tracks?.items || []).map((track) => ({
      id: track.id,
      name: track.name,
      artistName: track.artists?.map((artist) => artist.name).join(', ') || '',
      spotifyUrl: track.external_urls?.spotify || '',
      albumArt: track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '',
    })),
  });
});

app.get('/api/auth/me', (req, res) => {
  const sessionId = req.cookies.snapdesk_session;
  const user = sessionId ? getUserBySession(sessionId) : null;

  if (!user) {
    return res.status(401).json({ error: 'No active session.' });
  }

  return res.json({ user: serializeUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
  const name = req.body.name?.trim();
  const handle = sanitizeHandle(req.body.handle || '');
  const password = req.body.password || '';
  const bio = (req.body.bio || 'New to Prism and ready to post.').trim();

  if (!name || handle.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Enter a name, handle, and password.' });
  }

  if (getUserByHandle(handle)) {
    return res.status(409).json({ error: 'That handle is already taken.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ name, handle, bio, passwordHash });
  sendSession(res, user);
  return res.status(201).json({ user: serializeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const handle = sanitizeHandle(req.body.handle || '');
  const password = req.body.password || '';
  const user = getUserByHandle(handle);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid handle or password.' });
  }

  sendSession(res, user);
  return res.json({ user: serializeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.cookies.snapdesk_session;

  if (sessionId) {
    deleteSession(sessionId);
  }

  res.clearCookie('snapdesk_session', {
    httpOnly: true,
    sameSite: sessionSameSite,
    secure: secureCookies,
  });
  res.json({ ok: true });
});

app.get('/api/feed', requireAuth, (req, res) => {
  res.json({ posts: getFeed(req.user.id).map(normalizePost) });
});

app.get('/api/stories', requireAuth, (req, res) => {
  res.json({ stories: getActiveStories(req.user.id).map(normalizeStory) });
});

app.post('/api/stories', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an image.' });
  }

  const caption = req.body.caption?.trim() || '';
  const storyId = createStory({
    userId: req.user.id,
    imagePath: `uploads/${req.file.filename}`,
    caption,
  });

  const story = getActiveStories(req.user.id).find((entry) => entry.id === storyId);
  return res.status(201).json({ story: normalizeStory(story) });
});

app.post('/api/stories/view', requireAuth, (req, res) => {
  const storyIds = Array.isArray(req.body.storyIds)
    ? req.body.storyIds.map((id) => Number(id)).filter(Boolean)
    : [];

  if (storyIds.length === 0) {
    return res.status(400).json({ error: 'No stories selected.' });
  }

  markStoriesViewed(storyIds, req.user.id);
  return res.json({ ok: true });
});

app.get('/api/stories/:id/viewers', requireAuth, (req, res) => {
  const storyId = Number(req.params.id);

  if (!storyId) {
    return res.status(400).json({ error: 'Invalid story.' });
  }

  const viewers = getStoryViewers(storyId, req.user.id);

  if (viewers === null) {
    return res.status(404).json({ error: 'Story not found.' });
  }

  return res.json({
    viewers: viewers.map((entry) => ({
      user: serializeUser(entry.user),
      viewedAt: entry.viewedAt,
    })),
  });
});

app.get('/api/inbox', requireAuth, (req, res) => {
  const conversations = getMessages(req.user.id).map((conversation) => ({
    ...conversation,
    user: serializeUser(conversation.user),
  }));
  res.json({
    conversations,
    unreadCount: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
  });
});

app.get('/api/notes', requireAuth, (req, res) => {
  res.json({ notes: getInboxNotes(req.user.id).map(normalizeNote) });
});

app.put('/api/notes/me', requireAuth, (req, res) => {
  setUserNote(req.user.id, {
    body: req.body.body?.trim() || '',
    spotifyUrl: req.body.spotifyUrl?.trim() || '',
    songTitle: req.body.songTitle?.trim() || '',
    artistName: req.body.artistName?.trim() || '',
  });

  const note = getInboxNotes(req.user.id).find((entry) => entry.user.id === Number(req.user.id));
  return res.json({ note: note ? normalizeNote(note) : null });
});

app.post('/api/notes/:userId/like', requireAuth, (req, res) => {
  const noteUserId = Number(req.params.userId);
  const liked = toggleNoteLike(noteUserId, req.user.id);

  if (liked === null) {
    return res.status(404).json({ error: 'Note not found.' });
  }

  const note = getInboxNotes(req.user.id).find((entry) => entry.user.id === noteUserId);
  return res.json({ liked, note: note ? normalizeNote(note) : null });
});

app.get('/api/snaps', requireAuth, (req, res) => {
  const threads = getSnapThreads(req.user.id).map(normalizeSnapThread);
  res.json({
    threads,
    unreadCount: threads.reduce((sum, thread) => sum + thread.unreadCount, 0),
  });
});

app.get('/api/snaps/thread/:userId', requireAuth, (req, res) => {
  const thread = getSnapThread(Number(req.params.userId), req.user.id);

  if (!thread) {
    return res.status(404).json({ error: 'Snap thread not found.' });
  }

  return res.json({
    user: serializeUser(thread.user),
    snaps: thread.snaps.map((snap) => normalizeSnapItem(snap, thread.user)),
  });
});

app.post('/api/snaps', requireAuth, upload.single('image'), (req, res) => {
  const recipientId = Number(req.body.recipientId);
  const caption = req.body.caption?.trim() || '';

  if (!recipientId) {
    return res.status(400).json({ error: 'Choose someone to send a snap to.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image first.' });
  }

  const snapId = createSnap({
    senderId: req.user.id,
    recipientId,
    imagePath: `uploads/${req.file.filename}`,
    caption,
  });

  if (!snapId) {
    return res.status(404).json({ error: 'Unable to send that snap.' });
  }

  const threads = getSnapThreads(req.user.id).map(normalizeSnapThread);
  const thread = threads.find((entry) => entry.id === snapId);
  return res.status(201).json({ thread });
});

app.post('/api/snaps/:id/open', requireAuth, (req, res) => {
  const result = openSnap(Number(req.params.id), req.user.id);

  if (!result) {
    return res.status(404).json({ error: 'Snap not found.' });
  }

  if (result.status === 'forbidden') {
    return res.status(403).json({ error: 'That snap cannot be reopened.' });
  }

  if (result.status === 'opened') {
    return res.status(410).json({ error: 'That snap has already been opened.' });
  }

  return res.json({
    snap: {
      id: result.snap.id,
      imageUrl: fileUrl(result.snap.imagePath),
      caption: result.snap.caption,
      createdAt: result.snap.createdAt,
      sender: serializeUser(result.snap.sender),
    },
  });
});

app.post('/api/snaps/:id/replay', requireAuth, (req, res) => {
  const result = replaySnap(Number(req.params.id), req.user.id);

  if (!result) {
    return res.status(404).json({ error: 'Snap not found.' });
  }

  if (result.status === 'forbidden') {
    return res.status(403).json({ error: 'That snap cannot be replayed.' });
  }

  if (result.status === 'open-first') {
    return res.status(409).json({ error: 'Open that snap first.' });
  }

  if (result.status === 'replayed') {
    return res.status(410).json({ error: 'That snap has already been replayed.' });
  }

  return res.json({
    snap: {
      id: result.snap.id,
      imageUrl: fileUrl(result.snap.imagePath),
      caption: result.snap.caption,
      createdAt: result.snap.createdAt,
      openedAt: result.snap.openedAt,
      replayedAt: result.snap.replayedAt,
      savedInChat: Boolean(result.snap.savedInChat),
      sender: serializeUser(result.snap.sender),
    },
  });
});

app.post('/api/snaps/:id/save', requireAuth, (req, res) => {
  const result = saveSnapInChat(Number(req.params.id), req.user.id);

  if (!result) {
    return res.status(404).json({ error: 'Snap not found.' });
  }

  return res.json({
    ok: true,
    snap: {
      id: result.snap.id,
      imageUrl: fileUrl(result.snap.imagePath),
      caption: result.snap.caption,
      createdAt: result.snap.createdAt,
      openedAt: result.snap.openedAt,
      replayedAt: result.snap.replayedAt,
      savedInChat: Boolean(result.snap.savedInChat),
      sender: serializeUser(result.snap.sender),
    },
  });
});

app.post('/api/inbox/conversations', requireAuth, (req, res) => {
  const userIds = Array.isArray(req.body.userIds)
    ? req.body.userIds.map((id) => Number(id))
    : req.body.userId
      ? [Number(req.body.userId)]
      : [];
  const conversationId = getOrCreateConversation(req.user.id, userIds);

  if (!conversationId) {
    return res.status(404).json({ error: 'Unable to start that conversation.' });
  }

  return res.status(201).json({ conversationId });
});

app.get('/api/inbox/:id', requireAuth, (req, res) => {
  const conversationId = Number(req.params.id);
  const messages = getConversationMessages(conversationId, req.user.id);

  if (!messages) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  markConversationRead(conversationId, req.user.id);
  return res.json({ messages: messages.map(normalizeMessage) });
});

app.post('/api/inbox/:id/read', requireAuth, (req, res) => {
  markConversationRead(Number(req.params.id), req.user.id);
  return res.json({ ok: true });
});

app.post('/api/inbox/:id/messages', requireAuth, upload.single('image'), (req, res) => {
  const body = req.body.body?.trim();
  const imagePath = req.file ? `uploads/${req.file.filename}` : '';

  if (!body && !imagePath) {
    return res.status(400).json({ error: 'Add a message or choose a photo.' });
  }

  const messageId = sendMessage(Number(req.params.id), req.user.id, { body, imagePath });

  if (!messageId) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const messages = getConversationMessages(Number(req.params.id), req.user.id);
  return res.status(201).json({ messages: messages.map(normalizeMessage) });
});

app.post('/api/inbox/:id/mute', requireAuth, (req, res) => {
  const conversationId = Number(req.params.id);
  const muted = Boolean(req.body.muted);
  const updated = setConversationMuted(conversationId, req.user.id, muted);

  if (!updated) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  return res.json({ ok: true, muted });
});

app.delete('/api/inbox/:id', requireAuth, (req, res) => {
  const conversationId = Number(req.params.id);
  const deleted = hideConversation(conversationId, req.user.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  return res.json({ ok: true, conversationId });
});

app.get('/api/activity', requireAuth, (req, res) => {
  const activity = getActivity(req.user.id);
  const unreadCounts = getUnreadCounts(req.user.id);
  res.json({ activity, unreadCount: unreadCounts.activity });
});

app.post('/api/activity/read', requireAuth, (req, res) => {
  markAllActivityRead(req.user.id);
  return res.json({ ok: true });
});

app.get('/api/unread-counts', requireAuth, (req, res) => {
  res.json(getUnreadCounts(req.user.id));
});

app.get('/api/search', requireAuth, (req, res) => {
  const query = req.query.q?.toString().trim() || '';

  if (!query) {
    return res.json({ users: [], posts: [] });
  }

  const results = searchAll(query, req.user.id);
  return res.json({
    users: results.users.map((entry) => ({
      ...serializeUser(entry),
      following: entry.following,
    })),
    posts: results.posts.map(normalizePost),
  });
});

app.get('/api/users', requireAuth, (req, res) => {
  const users = listPeople(req.user.id).map((entry) => ({
    ...serializeUser(entry),
    following: entry.following,
  }));
  res.json({ users });
});

app.get('/api/profile/:id', requireAuth, (req, res) => {
  const profile = getProfile(Number(req.params.id), req.user.id);

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  return res.json({
    user: serializeUser(profile.user),
    following: Boolean(profile.following),
    isSelf: Boolean(profile.isSelf),
    stats: {
      posts: Number(profile.stats.posts),
      followers: Number(profile.stats.followers),
      following: Number(profile.stats.following),
      totalLikes: Number(profile.stats.totalLikes),
    },
    posts: profile.posts.map(normalizePost),
  });
});

app.patch('/api/profile/me', requireAuth, upload.single('avatar'), (req, res) => {
  const name = req.body.name?.trim();
  const bio = req.body.bio?.trim();

  if (!name || !bio) {
    return res.status(400).json({ error: 'Name and bio are required.' });
  }

  let avatarPath;
  const currentUser = getUserBySession(req.cookies.snapdesk_session);

  if (req.file) {
    avatarPath = `uploads/${req.file.filename}`;

    if (currentUser.avatar_path?.startsWith('uploads/')) {
      const oldFile = path.resolve(currentUser.avatar_path);
      if (fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    }
  }

  const user = updateUserProfile(req.user.id, { name, bio, avatarPath });
  return res.json({ user: serializeUser(user) });
});

app.get('/api/posts/:id/comments', requireAuth, (req, res) => {
  res.json({ comments: getComments(Number(req.params.id)) });
});

app.post('/api/posts', requireAuth, upload.single('image'), (req, res) => {
  const caption = req.body.caption?.trim() || '';
  const location = req.body.location?.trim() || 'Somewhere on Mac';

  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an image.' });
  }

  const postId = createPost({
    userId: req.user.id,
    caption,
    location,
    imagePath: `uploads/${req.file.filename}`,
  });

  const post = getFeed(req.user.id).find((entry) => entry.id === postId);
  return res.status(201).json({ post: normalizePost(post) });
});

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  toggleLike(Number(req.params.id), req.user.id);
  const post = getFeed(req.user.id).find((entry) => entry.id === Number(req.params.id));
  res.json({ post: normalizePost(post) });
});

app.post('/api/posts/:id/save', requireAuth, (req, res) => {
  toggleSave(Number(req.params.id), req.user.id);
  const post = getFeed(req.user.id).find((entry) => entry.id === Number(req.params.id));
  res.json({ post: normalizePost(post) });
});

app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  toggleFollow(Number(req.params.id), req.user.id);
  const post = getFeed(req.user.id).find((entry) => entry.userId === Number(req.params.id));
  res.json({ userId: Number(req.params.id), following: post ? Boolean(post.following) : false });
});

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const body = req.body.body?.trim();

  if (!body) {
    return res.status(400).json({ error: 'Comment cannot be empty.' });
  }

  addComment(Number(req.params.id), req.user.id, body);
  return res.status(201).json({ comments: getComments(Number(req.params.id)) });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const deleted = deletePost(Number(req.params.id), req.user.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Post not found or you do not own it.' });
  }

  if (deleted.imagePath && deleted.imagePath.startsWith('uploads/')) {
    const filePath = uploadDiskPath(deleted.imagePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return res.json({ ok: true, postId: Number(req.params.id) });
});

if (fs.existsSync(distDir)) {
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Prism API running on http://127.0.0.1:${port}`);
});
