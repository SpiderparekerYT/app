import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';

const tabs = [
  {
    key: 'Feed',
    shortLabel: 'Feed',
    icon: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-9.5Z',
  },
  {
    key: 'Snaps',
    shortLabel: 'Snaps',
    icon: 'M12 3.5c2.88 0 5.25 2.26 5.25 5.1 0 1.14-.38 2.21-1.02 3.07l.64 3.16-2.86-1.14A5.36 5.36 0 0 1 12 14.7c-2.88 0-5.25-2.26-5.25-5.1S9.12 3.5 12 3.5Zm-2.2 11.9-.98 2.1 2.32-.82.86.17c.8.16 1.63.16 2.43 0l.86-.17 2.32.82-.98-2.1',
  },
  {
    key: 'Messages',
    shortLabel: 'DMs',
    icon: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.5 4v-4.5A2.5 2.5 0 0 1 4 13.5v-7Z',
  },
  {
    key: 'Profile',
    shortLabel: 'Me',
    icon: 'M12 12.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM5 19.25c0-3.04 3.13-4.75 7-4.75s7 1.71 7 4.75V20H5v-.75Z',
  },
];
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').trim();

function formatCount(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return `${value}`;
}

function formatTime(value) {
  const date = new Date(value);
  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.round(diffHours / 24)}d ago`;
}

function buildActivityCopy(item) {
  if (item.type === 'snap') {
    return `${item.actorName} sent you a snap`;
  }

  if (item.type === 'follow') {
    return `${item.actorName} followed you`;
  }

  if (item.type === 'comment') {
    return `${item.actorName} commented: "${item.text}"`;
  }

  if (item.type === 'message') {
    return `${item.actorName} sent you a message`;
  }

  if (item.type === 'note') {
    return `${item.actorName} liked your note`;
  }

  return `${item.actorName} liked one of your posts`;
}

function buildSnapStatusCopy(thread) {
  if (thread.direction === 'sent') {
    if (thread.savedInChat) {
      return thread.openedAt ? 'Opened · Saved in chat' : 'Delivered · Saved in chat';
    }

    return thread.openedAt ? 'Opened' : 'Delivered';
  }

  if (thread.savedInChat) {
    return thread.openedAt ? 'Opened · Saved in chat' : 'New snap · Saved in chat';
  }

  if (thread.canReplay) {
    return 'Replay available';
  }

  return thread.canOpen ? 'New snap' : 'Opened';
}

function buildSnapMessageStatus(snap) {
  if (snap.direction === 'sent') {
    if (snap.savedInChat) {
      return snap.openedAt ? 'Opened · Saved in chat' : 'Delivered · Saved in chat';
    }

    return snap.openedAt ? 'Opened' : 'Delivered';
  }

  if (snap.savedInChat) {
    return snap.openedAt ? 'Opened · Saved in chat' : 'New snap · Saved in chat';
  }

  if (snap.canOpen) {
    return 'Tap to open';
  }

  if (snap.canReplay) {
    return 'Replay once';
  }

  return 'Opened';
}

function normalizeCounts(counts = {}) {
  return {
    activity: Number(counts.activity || 0),
    messages: Number(counts.messages || 0),
    snaps: Number(counts.snaps || 0),
  };
}

function getSpotifyEmbedUrl(url) {
  if (!url) {
    return '';
  }

  const match = url.match(/spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (!match) {
    return '';
  }

  return `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator`;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(`${API_ORIGIN}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }

  return data;
}

function resolveAssetUrl(url) {
  if (!url) {
    return '';
  }

  if (url.startsWith('http://') || url.startsWith('https://') || !API_ORIGIN) {
    return url;
  }

  return `${API_ORIGIN}${url}`;
}

async function impact(style = ImpactStyle.Light) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await Haptics.impact({ style });
  } catch {
    // Ignore haptics failures and continue the main action.
  }
}

async function pickImageFromDevice() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
    quality: 90,
  });

  if (!photo.webPath) {
    return null;
  }

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = photo.format || 'jpeg';
  return new File([blob], `snapdesk-${Date.now()}.${extension}`, {
    type: blob.type || `image/${extension}`,
  });
}

async function shareContent(data) {
  if (Capacitor.isNativePlatform()) {
    await Share.share(data);
    return;
  }

  if (navigator.share) {
    await navigator.share(data);
  }
}

function Avatar({ user, size = '', className = '' }) {
  const classes = ['avatar'];

  if (size) {
    classes.push(size);
  }

  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(' ')}>
      {user?.avatarUrl ? (
        <img alt={user.name} src={resolveAssetUrl(user.avatarUrl)} />
      ) : (
        <span>{user?.avatarFallback || '?'}</span>
      )}
    </div>
  );
}

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function AuthScreen({
  authMode,
  authForm,
  authError,
  authPending,
  onModeChange,
  onChange,
  onSubmit,
}) {
  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <p className="eyebrow">Prism</p>
        <h1>Prism</h1>
        <p className="hero-copy">Share photos, follow people, and chat.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-header">
          <div>
            <p className="eyebrow">Welcome</p>
            <h2>{authMode === 'login' ? 'Log in' : 'Create account'}</h2>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            className={authMode === 'login' ? 'tab active' : 'tab'}
            onClick={() => onModeChange('login')}
          >
            Login
          </button>
          <button
            className={authMode === 'register' ? 'tab active' : 'tab'}
            onClick={() => onModeChange('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {authMode === 'register' && (
            <label>
              Name
              <input name="name" value={authForm.name} onChange={onChange} />
            </label>
          )}

          <label>
            Handle
            <input name="handle" value={authForm.handle} onChange={onChange} />
          </label>

          {authMode === 'register' && (
            <label>
              Bio
              <textarea name="bio" value={authForm.bio} onChange={onChange} />
            </label>
          )}

          <label>
            Password
            <input type="password" name="password" value={authForm.password} onChange={onChange} />
          </label>

          {authError && <p className="form-error">{authError}</p>}

          <button className="primary-action wide" disabled={authPending} type="submit">
            {authPending ? 'Working...' : authMode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('Feed');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    handle: '',
    bio: '',
    password: '',
  });
  const [authError, setAuthError] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [activity, setActivity] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [people, setPeople] = useState([]);
  const [snaps, setSnaps] = useState([]);
  const [stories, setStories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [messageBody, setMessageBody] = useState('');
  const [messagePending, setMessagePending] = useState(false);
  const [messageImageFile, setMessageImageFile] = useState(null);
  const [messageImagePreview, setMessageImagePreview] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [swipedConversationId, setSwipedConversationId] = useState(null);
  const [counts, setCounts] = useState({ activity: 0, messages: 0, snaps: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ users: [], posts: [] });
  const [searchPending, setSearchPending] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', bio: '' });
  const [profileAvatarFile, setProfileAvatarFile] = useState(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profilePending, setProfilePending] = useState(false);
  const [pushPermission, setPushPermission] = useState('prompt');
  const [pushToken, setPushToken] = useState('');
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyCaption, setStoryCaption] = useState('');
  const [storyFile, setStoryFile] = useState(null);
  const [storyPreview, setStoryPreview] = useState('');
  const [storyPending, setStoryPending] = useState(false);
  const [storyViewer, setStoryViewer] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [noteForm, setNoteForm] = useState({
    body: '',
    spotifyUrl: '',
    songTitle: '',
    artistName: '',
  });
  const [notePending, setNotePending] = useState(false);
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: false, clientConfigured: false });
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [spotifySearchPending, setSpotifySearchPending] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteLikeBurstId, setNoteLikeBurstId] = useState(null);
  const [pendingSingleNoteId, setPendingSingleNoteId] = useState(null);
  const [messageComposerOpen, setMessageComposerOpen] = useState(false);
  const [compactMessagesLayout, setCompactMessagesLayout] = useState(false);
  const [messageRecipients, setMessageRecipients] = useState([]);
  const [snapRecipientId, setSnapRecipientId] = useState('');
  const [snapCaption, setSnapCaption] = useState('');
  const [snapFile, setSnapFile] = useState(null);
  const [snapPreview, setSnapPreview] = useState('');
  const [snapPending, setSnapPending] = useState(false);
  const [snapViewer, setSnapViewer] = useState(null);
  const [snapError, setSnapError] = useState('');
  const [cameraModalMode, setCameraModalMode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [selectedSnapThreadUserId, setSelectedSnapThreadUserId] = useState(null);
  const [selectedSnapThreadUser, setSelectedSnapThreadUser] = useState(null);
  const [selectedSnapMessages, setSelectedSnapMessages] = useState([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [publishPending, setPublishPending] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentPending, setCommentPending] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState(null);
  const isNative = Capacitor.isNativePlatform();
  const pullStartY = useRef(null);
  const pullArmed = useRef(false);
  const threadSwipeStartX = useRef(null);
  const threadSwipeStartY = useRef(null);
  const inboxSwipeStartX = useRef(null);
  const inboxSwipeStartY = useRef(null);
  const inboxSwipeConversationId = useRef(null);
  const noteTapTimeout = useRef(null);
  const snapThreadSwipeStartX = useRef(null);
  const snapThreadSwipeStartY = useRef(null);
  const messageImageInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  async function runSearch(query) {
    const trimmed = query.trim();

    if (!trimmed) {
      setSearchResults({ users: [], posts: [] });
      setSearchPending(false);
      return;
    }

    setSearchPending(true);

    try {
      const data = await apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      setSearchResults(data);
    } finally {
      setSearchPending(false);
    }
  }

  async function loadConversation(conversationId) {
    if (!conversationId) {
      setSelectedMessages([]);
      return;
    }

    const data = await apiFetch(`/api/inbox/${conversationId}`);
    setSelectedMessages(data.messages);
    setSelectedConversationId(conversationId);
    const unreadCounts = await apiFetch('/api/unread-counts');
    setCounts(normalizeCounts(unreadCounts));
    setInbox((current) =>
      current.map((entry) =>
        entry.id === conversationId
          ? {
              ...entry,
              unreadCount: 0,
            }
          : entry,
      ),
    );
  }

  async function loadOptionalData() {
    const [snapResult, peopleResult, storyResult, noteResult, spotifyStatusResult] = await Promise.allSettled([
      apiFetch('/api/snaps'),
      apiFetch('/api/users'),
      apiFetch('/api/stories'),
      apiFetch('/api/notes'),
      apiFetch('/api/spotify/status'),
    ]);

    if (snapResult.status === 'fulfilled') {
      setSnaps(snapResult.value.threads);
    } else {
      setSnaps([]);
    }

    if (peopleResult.status === 'fulfilled') {
      setPeople(peopleResult.value.users);
    } else {
      setPeople([]);
    }

    if (storyResult.status === 'fulfilled') {
      setStories(storyResult.value.stories);
    } else {
      setStories([]);
    }

    if (noteResult.status === 'fulfilled') {
      setNotes(noteResult.value.notes);
      const ownNote = noteResult.value.notes.find((entry) => entry.isOwnNote);
      setNoteForm(
        ownNote
          ? {
              body: ownNote.body,
              spotifyUrl: ownNote.spotifyUrl,
              songTitle: ownNote.songTitle,
              artistName: ownNote.artistName,
            }
          : { body: '', spotifyUrl: '', songTitle: '', artistName: '' },
      );
    } else {
      setNotes([]);
    }

    if (spotifyStatusResult.status === 'fulfilled') {
      setSpotifyStatus(spotifyStatusResult.value);
    } else {
      setSpotifyStatus({ connected: false, clientConfigured: false });
    }
  }

  async function loadAppData(userId) {
    try {
      setFeedError('');
      const [feedData, profileData, activityData, inboxData, unreadCounts] = await Promise.all([
        apiFetch('/api/feed'),
        apiFetch(`/api/profile/${userId}`),
        apiFetch('/api/activity'),
        apiFetch('/api/inbox'),
        apiFetch('/api/unread-counts'),
      ]);

      setPosts(feedData.posts);
      setProfile(profileData);
      setActivity(activityData.activity);
      setInbox(inboxData.conversations);
      setCounts(normalizeCounts(unreadCounts));
      setUser(profileData.user);
      setProfileForm({ name: profileData.user.name, bio: profileData.user.bio });

      if (selectedConversationId) {
        const stillExists = inboxData.conversations.find((entry) => entry.id === selectedConversationId);
        if (stillExists) {
          await loadConversation(selectedConversationId);
        } else {
          setSelectedConversationId(null);
          setSelectedMessages([]);
        }
      }

      await loadOptionalData();

      if (selectedSnapThreadUserId) {
        try {
          const snapThreadData = await apiFetch(`/api/snaps/thread/${selectedSnapThreadUserId}`);
          setSelectedSnapThreadUser(snapThreadData.user);
          setSelectedSnapMessages(snapThreadData.snaps);
        } catch {
          setSelectedSnapThreadUserId(null);
          setSelectedSnapThreadUser(null);
          setSelectedSnapMessages([]);
        }
      }
    } catch (error) {
      setFeedError(error.message);
    }
  }

  async function loadSession() {
    try {
      const auth = await apiFetch('/api/auth/me');
      setUser(auth.user);
      setProfileForm({ name: auth.user.name, bio: auth.user.bio });
      await loadAppData(auth.user.id);
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTab = params.get('tab');

    if (params.get('spotify') === 'connected' && nextTab === 'messages') {
      setActiveTab('Messages');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!isNative) {
      return undefined;
    }

    let registrationHandle;
    let registrationErrorHandle;

    async function setupPushState() {
      const permission = await PushNotifications.checkPermissions();
      setPushPermission(permission.receive);
      registrationHandle = await PushNotifications.addListener('registration', (token) => {
        setPushToken(token.value);
        setPushPermission('granted');
      });
      registrationErrorHandle = await PushNotifications.addListener('registrationError', () => {
        setPushPermission('denied');
      });
    }

    setupPushState();

    return () => {
      registrationHandle?.remove();
      registrationErrorHandle?.remove();
    };
  }, [isNative]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!snapFile) {
      setSnapPreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(snapFile);
    setSnapPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [snapFile]);

  useEffect(() => {
    if (!messageImageFile) {
      setMessageImagePreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(messageImageFile);
    setMessageImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [messageImageFile]);

  useEffect(() => {
    if (!storyFile) {
      setStoryPreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(storyFile);
    setStoryPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [storyFile]);

  useEffect(() => {
    if (!profileAvatarFile) {
      setProfileAvatarPreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(profileAvatarFile);
    setProfileAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [profileAvatarFile]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      runSearch(searchQuery);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      const trimmed = spotifyQuery.trim();

      if (!trimmed || !spotifyStatus.connected) {
        setSpotifyResults([]);
        setSpotifySearchPending(false);
        return;
      }

      setSpotifySearchPending(true);

      try {
        const data = await apiFetch(`/api/spotify/search?q=${encodeURIComponent(trimmed)}`);
        setSpotifyResults(data.tracks);
      } catch {
        setSpotifyResults([]);
      } finally {
        setSpotifySearchPending(false);
      }
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [spotifyQuery, spotifyStatus.connected]);

  useEffect(() => {
    function updateCompactMessagesLayout() {
      setCompactMessagesLayout(window.innerWidth <= 860);
    }

    updateCompactMessagesLayout();
    window.addEventListener('resize', updateCompactMessagesLayout);

    return () => window.removeEventListener('resize', updateCompactMessagesLayout);
  }, []);

  useEffect(() => {
    if (!cameraModalMode || !cameraVideoRef.current || !cameraStreamRef.current) {
      return;
    }

    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    void cameraVideoRef.current.play().catch(() => {});
  }, [cameraModalMode]);

  const savedPosts = useMemo(() => posts.filter((post) => post.saved), [posts]);
  const explorePosts = useMemo(
    () => [...posts].sort((first, second) => second.likes - first.likes),
    [posts],
  );
  const selectedConversation = inbox.find((entry) => entry.id === selectedConversationId) || null;
  const ownNote = useMemo(
    () => notes.find((entry) => entry.isOwnNote) || null,
    [notes],
  );
  const snapPeople = useMemo(() => {
    const directory = new Map();

    people.forEach((entry) => {
      if (entry?.id) {
        directory.set(entry.id, entry);
      }
    });

    searchResults.users.forEach((entry) => {
      if (entry?.id) {
        directory.set(entry.id, entry);
      }
    });

    snaps.forEach((thread) => {
      if (thread?.user?.id) {
        directory.set(thread.user.id, thread.user);
      }
    });

    return [...directory.values()];
  }, [people, searchResults.users, snaps]);
  const storyGroups = useMemo(() => {
    const grouped = new Map();

    stories.forEach((story) => {
      if (!story?.user?.id) {
        return;
      }

      const existing = grouped.get(story.user.id);
      if (existing) {
        existing.items.push(story);
      } else {
        grouped.set(story.user.id, {
          id: story.user.id,
          user: story.user,
          items: [story],
          isOwnStory: story.isOwnStory,
        });
      }
    });

    return [...grouped.values()];
  }, [stories]);
  const ownStoryGroup = useMemo(
    () => storyGroups.find((story) => story.isOwnStory) || null,
    [storyGroups],
  );
  const homeStoryGroups = useMemo(() => {
    if (ownStoryGroup) {
      return [ownStoryGroup, ...storyGroups.filter((story) => !story.isOwnStory)];
    }

    return [
      {
        id: `own-${user?.id || 'me'}`,
        user: user || {
          id: 'me',
          name: 'You',
          handle: 'you',
          avatarUrl: '',
          avatarFallback: 'Y',
        },
        items: [],
        isOwnStory: true,
      },
      ...storyGroups,
    ];
  }, [ownStoryGroup, storyGroups, user]);
  const suggestedPeople = useMemo(
    () => people.filter((entry) => entry.id !== user?.id).slice(0, 4),
    [people, user?.id],
  );
  const messageNotes = useMemo(() => {
    const trimmed = messageSearchQuery.trim().toLowerCase();
    const noteSeed = ownNote
      ? [ownNote, ...notes.filter((entry) => !entry.isOwnNote)]
      : [
          {
            isOwnNote: true,
            user,
            body: '',
            spotifyUrl: '',
            songTitle: '',
            artistName: '',
          },
          ...notes,
        ];

    if (!trimmed) {
      return noteSeed.slice(0, 10);
    }

    return noteSeed
      .filter((entry) =>
        [entry.user.name, entry.user.handle, entry.body, entry.songTitle, entry.artistName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(trimmed),
      )
      .slice(0, 10);
  }, [messageSearchQuery, notes, ownNote, user]);
  const filteredInbox = useMemo(() => {
    const trimmed = messageSearchQuery.trim().toLowerCase();

    if (!trimmed) {
      return inbox;
    }

    return inbox.filter((entry) =>
      [entry.title, entry.user.name, entry.user.handle, entry.preview]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(trimmed),
    );
  }, [inbox, messageSearchQuery]);
  const totalInboxCount = counts.activity + counts.messages + counts.snaps;
  const unreadActivityCount = activity.filter((item) => !item.isRead).length;
  const selectedSnapRecipient = useMemo(
    () => snapPeople.find((entry) => String(entry.id) === String(snapRecipientId)) || null,
    [snapPeople, snapRecipientId],
  );
  async function refreshAppContent() {
    if (!user || pullRefreshing) {
      return;
    }

    setPullRefreshing(true);

    try {
      await loadAppData(user.id);
    } finally {
      setPullRefreshing(false);
      setPullDistance(0);
      pullArmed.current = false;
      pullStartY.current = null;
    }
  }

  function tabLabel(tab) {
    if (tab === 'Snaps' && counts.snaps > 0) {
      return `Snaps (${counts.snaps})`;
    }

    if (tab === 'Activity' && counts.activity > 0) {
      return `Activity (${counts.activity})`;
    }

    if (tab === 'Messages' && counts.messages > 0) {
      return `Messages (${counts.messages})`;
    }

    return tab;
  }

  function renderPageHeader() {
    if (activeTab === 'Messages') {
      return null;
    }

    const utilityActions = (
      <div className="header-icon-actions">
        <button
          className="icon-button header-utility-button"
          onClick={() => setActiveTab('Explore')}
          type="button"
          aria-label="Open search"
        >
          <Icon path="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.44 4.44 1.06-1.06-4.44-4.44A6.5 6.5 0 0 0 10.5 4Z" />
        </button>
        <button
          className="icon-button header-utility-button header-bell-button"
          onClick={() => setActiveTab('Notifications')}
          type="button"
          aria-label="Open notifications"
        >
          <Icon path="M12 4.75a4.25 4.25 0 0 0-4.25 4.25v1.22c0 .72-.2 1.42-.59 2.02L5.9 14.2A1 1 0 0 0 6.74 15.7h10.52a1 1 0 0 0 .84-1.5l-1.26-1.96a3.7 3.7 0 0 1-.59-2.02V9A4.25 4.25 0 0 0 12 4.75Zm0 15.25a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 20Z" />
          {counts.activity > 0 && <span className="header-badge">{counts.activity}</span>}
        </button>
      </div>
    );

    if (activeTab === 'Explore') {
      return (
        <header className="topbar page-header page-header-explore">
          <div>
            <p className="eyebrow">Discover</p>
            <h2>Explore</h2>
          </div>

          <div className="topbar-actions">
            <label className="search-shell">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search people and posts"
              />
            </label>
            <button className="ghost-button" onClick={() => runSearch(searchQuery)}>
              Search
            </button>
            {utilityActions}
          </div>
        </header>
      );
    }

    if (activeTab === 'Snaps') {
      return (
        <header className="topbar page-header page-header-snaps">
          <div>
            <p className="eyebrow">Camera</p>
            <h2>Snaps</h2>
          </div>

          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => setActiveTab('Messages')}>
              Inbox
            </button>
            <button className="primary-action" onClick={() => document.querySelector('.snap-compose-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              New Snap
            </button>
            {utilityActions}
          </div>
        </header>
      );
    }

    if (activeTab === 'Notifications') {
      return (
        <header className="topbar page-header page-header-activity">
          <div>
            <p className="eyebrow">Updates</p>
            <h2>Notifications</h2>
          </div>

          <div className="topbar-actions">
            <button className="primary-action" onClick={markActivityRead}>
              Mark Read
            </button>
            {utilityActions}
          </div>
        </header>
      );
    }

    if (activeTab === 'Profile') {
      return (
        <header className="topbar page-header page-header-profile">
          <div>
            <p className="eyebrow">Your Space</p>
            <h2>Profile</h2>
          </div>

          <div className="topbar-actions">
            <button className="ghost-button" onClick={shareProfile}>
              Share
            </button>
            <button className="primary-action" onClick={() => setProfileEditorOpen(true)}>
              Edit Profile
            </button>
            {utilityActions}
          </div>
        </header>
      );
    }

      return (
        <header className="topbar page-header page-header-feed">
          <div>
            <p className="eyebrow">For You</p>
            <h2>Prism</h2>
          </div>

          <div className="topbar-actions feed-header-actions">{utilityActions}</div>
        </header>
      );
    }

  function handleAppTouchStart(event) {
    if (event.touches.length !== 1) {
      return;
    }

    if (event.currentTarget.scrollTop > 0) {
      pullStartY.current = null;
      return;
    }

    pullStartY.current = event.touches[0].clientY;
    pullArmed.current = false;
  }

  function handleAppTouchMove(event) {
    if (pullStartY.current === null || pullRefreshing) {
      return;
    }

    const delta = event.touches[0].clientY - pullStartY.current;

    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    const nextDistance = Math.min(96, delta * 0.45);
    setPullDistance(nextDistance);
    pullArmed.current = nextDistance > 56;
  }

  function handleAppTouchEnd() {
    if (pullArmed.current) {
      refreshAppContent();
      return;
    }

    setPullDistance(0);
    pullStartY.current = null;
    pullArmed.current = false;
  }

  function selectTab(tabKey) {
    setActiveTab(tabKey);

    if (tabKey === 'Messages') {
      setSelectedConversationId(null);
      setSelectedMessages([]);
      setSwipedConversationId(null);
    }

    if (tabKey === 'Snaps') {
      setSelectedSnapThreadUserId(null);
      setSelectedSnapThreadUser(null);
      setSelectedSnapMessages([]);
    }
  }

  function handleThreadTouchStart(event) {
    if (!compactMessagesLayout || !selectedConversation || event.touches.length !== 1) {
      return;
    }

    threadSwipeStartX.current = event.touches[0].clientX;
    threadSwipeStartY.current = event.touches[0].clientY;
  }

  function handleThreadTouchEnd(event) {
    if (!compactMessagesLayout || !selectedConversation || threadSwipeStartX.current === null) {
      return;
    }

    const deltaX = event.changedTouches[0].clientX - threadSwipeStartX.current;
    const deltaY = Math.abs(event.changedTouches[0].clientY - threadSwipeStartY.current);

    threadSwipeStartX.current = null;
    threadSwipeStartY.current = null;

    if (deltaX > 72 && deltaY < 48) {
      setSelectedConversationId(null);
    }
  }

  function handleSnapThreadTouchStart(event) {
    if (!compactMessagesLayout || !selectedSnapThreadUser || event.touches.length !== 1) {
      return;
    }

    snapThreadSwipeStartX.current = event.touches[0].clientX;
    snapThreadSwipeStartY.current = event.touches[0].clientY;
  }

  function handleSnapThreadTouchEnd(event) {
    if (!compactMessagesLayout || !selectedSnapThreadUser || snapThreadSwipeStartX.current === null) {
      return;
    }

    const deltaX = event.changedTouches[0].clientX - snapThreadSwipeStartX.current;
    const deltaY = Math.abs(event.changedTouches[0].clientY - snapThreadSwipeStartY.current);

    snapThreadSwipeStartX.current = null;
    snapThreadSwipeStartY.current = null;

    if (deltaX > 72 && deltaY < 48) {
      setSelectedSnapThreadUserId(null);
      setSelectedSnapThreadUser(null);
      setSelectedSnapMessages([]);
    }
  }

  function handleInboxRowTouchStart(event, conversationId) {
    if (!compactMessagesLayout || event.touches.length !== 1) {
      return;
    }

    inboxSwipeStartX.current = event.touches[0].clientX;
    inboxSwipeStartY.current = event.touches[0].clientY;
    inboxSwipeConversationId.current = conversationId;
  }

  function handleInboxRowTouchEnd(event, conversationId) {
    if (!compactMessagesLayout || inboxSwipeStartX.current === null) {
      return;
    }

    const deltaX = event.changedTouches[0].clientX - inboxSwipeStartX.current;
    const deltaY = Math.abs(event.changedTouches[0].clientY - inboxSwipeStartY.current);
    const touchedConversationId = inboxSwipeConversationId.current;

    inboxSwipeStartX.current = null;
    inboxSwipeStartY.current = null;
    inboxSwipeConversationId.current = null;

    if (touchedConversationId !== conversationId) {
      return;
    }

    if (deltaX < -52 && deltaY < 42) {
      setSwipedConversationId(conversationId);
      return;
    }

    if (deltaX > 42 && deltaY < 42) {
      setSwipedConversationId(null);
    }
  }

  async function toggleConversationMute(event, conversationId, muted) {
    event.stopPropagation();
    event.preventDefault?.();
    await apiFetch(`/api/inbox/${conversationId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ muted }),
    });

    setInbox((current) =>
      current.map((entry) =>
        entry.id === conversationId
          ? {
              ...entry,
              muted,
            }
          : entry,
      ),
    );
    setSwipedConversationId(null);
  }

  async function deleteConversation(event, conversationId) {
    event.stopPropagation();
    event.preventDefault?.();
    await apiFetch(`/api/inbox/${conversationId}`, {
      method: 'DELETE',
    });

    setInbox((current) => current.filter((entry) => entry.id !== conversationId));
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
      setSelectedMessages([]);
    }
    setSwipedConversationId(null);
    await loadAppData(user.id);
  }

  function triggerConversationMute(event, conversationId, muted) {
    void toggleConversationMute(event, conversationId, muted);
  }

  function triggerConversationDelete(event, conversationId) {
    void deleteConversation(event, conversationId);
  }

  function updatePost(updatedPost) {
    setPosts((current) =>
      current.map((post) => (post.id === updatedPost.id ? updatedPost : post)),
    );
    setProfile((current) =>
      current
        ? {
            ...current,
            posts: current.posts.map((post) => (post.id === updatedPost.id ? updatedPost : post)),
          }
        : current,
    );
    setSearchResults((current) => ({
      ...current,
      posts: current.posts.map((post) => (post.id === updatedPost.id ? updatedPost : post)),
    }));
  }

  function prependPost(createdPost) {
    setPosts((current) => [createdPost, ...current]);
    setProfile((current) =>
      current
        ? {
            ...current,
            stats: {
              ...current.stats,
              posts: Number(current.stats.posts || 0) + 1,
            },
            posts: [createdPost, ...current.posts],
          }
        : current,
    );
    setSearchResults((current) => ({
      ...current,
      posts: [createdPost, ...current.posts],
    }));
  }

  function removePostLocally(postId) {
    setPosts((current) => current.filter((post) => post.id !== postId));
    setProfile((current) =>
      current
        ? {
            ...current,
            stats: {
              ...current.stats,
              posts: Math.max(0, current.stats.posts - 1),
            },
            posts: current.posts.filter((post) => post.id !== postId),
          }
        : current,
    );
    setSearchResults((current) => ({
      ...current,
      posts: current.posts.filter((post) => post.id !== postId),
    }));
  }

  function updateFollowState(userId, following) {
    setPosts((current) =>
      current.map((post) =>
        post.user.id === userId
          ? {
              ...post,
              following,
            }
          : post,
      ),
    );
    setSearchResults((current) => ({
      ...current,
      users: current.users.map((entry) =>
        entry.id === userId
          ? {
              ...entry,
              following,
            }
          : entry,
      ),
      posts: current.posts.map((post) =>
        post.user.id === userId
          ? {
              ...post,
              following,
            }
          : post,
      ),
    }));
  }

  function buildNoteDraft(note = null) {
    return {
      body: note?.body || '',
      spotifyUrl: note?.spotifyUrl || '',
      songTitle: note?.songTitle || '',
      artistName: note?.artistName || '',
    };
  }

  function updateNoteLocally(nextNote) {
    if (!nextNote?.user?.id) {
      return;
    }

    setNotes((current) =>
      current.map((entry) =>
        entry.user.id === nextNote.user.id
          ? { ...entry, ...nextNote }
          : entry,
      ),
    );
  }

  function getNotePreview(note) {
    if (!note) {
      return 'Share a note...';
    }

    if (note.body) {
      return note.body;
    }

    if (note.songTitle) {
      return note.songTitle;
    }

    return note.isOwnNote ? 'Share a note...' : 'Listening';
  }

  function getNoteCredit(note) {
    if (!note?.songTitle && !note?.artistName) {
      return '';
    }

    return [note.songTitle, note.artistName].filter(Boolean).join(' · ');
  }

  function openNoteEditor(note = ownNote) {
    setNoteForm(buildNoteDraft(note));
    setSpotifyQuery(note?.songTitle || '');
    setSpotifyResults([]);
    setNoteEditorOpen(true);
  }

  function handleAuthChange(event) {
    setAuthForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthPending(true);
    setAuthError('');

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        authMode === 'login'
          ? { handle: authForm.handle, password: authForm.password }
          : authForm;

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!data.user?.id) {
        throw new Error('Could not reach the Prism server.');
      }

      setUser(data.user);
      setAuthForm({ name: '', handle: '', bio: '', password: '' });
      await loadAppData(data.user.id);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthPending(false);
    }
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setPosts([]);
    setProfile(null);
    setActivity([]);
    setInbox([]);
    setPeople([]);
    setSnaps([]);
    setStories([]);
    setNotes([]);
    setSelectedConversationId(null);
    setSelectedMessages([]);
    setCounts({ activity: 0, messages: 0, snaps: 0 });
    setMessageImageFile(null);
    setMessageImagePreview('');
    setPushToken('');
    setSearchQuery('');
    setSearchResults({ users: [], posts: [] });
    setSnapRecipientId('');
    setSnapCaption('');
    setSnapFile(null);
    setSnapViewer(null);
    setStoryCaption('');
    setStoryFile(null);
    setStoryViewer(null);
    setActiveTab('Feed');
  }

  async function toggleLike(postId) {
    await impact(ImpactStyle.Light);
    const data = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
    updatePost(data.post);
    setCounts(normalizeCounts(await apiFetch('/api/unread-counts')));
  }

  async function toggleSave(postId) {
    await impact(ImpactStyle.Light);
    const data = await apiFetch(`/api/posts/${postId}/save`, { method: 'POST' });
    updatePost(data.post);
  }

  async function toggleFollow(userId) {
    await impact(ImpactStyle.Medium);
    const data = await apiFetch(`/api/users/${userId}/follow`, { method: 'POST' });
    updateFollowState(data.userId, data.following);
    await loadAppData(user.id);
  }

  async function startConversation(userIds) {
    await impact(ImpactStyle.Light);
    const normalizedUserIds = Array.isArray(userIds) ? userIds : [userIds];
    const data = await apiFetch('/api/inbox/conversations', {
      method: 'POST',
      body: JSON.stringify({ userIds: normalizedUserIds }),
    });
    await loadAppData(user.id);
    await loadConversation(data.conversationId);
    setActiveTab('Messages');
    setMessageComposerOpen(false);
    setMessageRecipients([]);
  }

  async function sendCurrentMessage(event) {
    event.preventDefault();

    if (!selectedConversationId || (!messageBody.trim() && !messageImageFile)) {
      return;
    }

    setMessagePending(true);

    try {
      await impact(ImpactStyle.Light);
      const formData = new FormData();
      formData.append('body', messageBody.trim());
      if (messageImageFile) {
        formData.append('image', messageImageFile);
      }
      const data = await apiFetch(`/api/inbox/${selectedConversationId}/messages`, {
        method: 'POST',
        body: formData,
      });
      setSelectedMessages(data.messages);
      setMessageBody('');
      setMessageImageFile(null);
      await loadAppData(user.id);
    } finally {
      setMessagePending(false);
    }
  }

  async function publishPost(event) {
    event.preventDefault();

    if (!imageFile) {
      setPublishError('Choose an image first.');
      return;
    }

    setPublishPending(true);
    setPublishError('');

    try {
      await impact(ImpactStyle.Medium);
      const formData = new FormData();
      formData.append('caption', caption.trim());
      formData.append('location', location);
      formData.append('image', imageFile);

      const data = await apiFetch('/api/posts', {
        method: 'POST',
        body: formData,
      });

      if (data.post) {
        prependPost(data.post);
      }
      setCaption('');
      setLocation('');
      setImageFile(null);
      setPublishError('');
      setComposerOpen(false);
      setActiveTab('Feed');
      void loadAppData(user.id);
      if (searchQuery.trim()) {
        void runSearch(searchQuery);
      }
    } catch (error) {
      setPublishError(error.message);
    } finally {
      setPublishPending(false);
    }
  }

  async function deletePost(postId) {
    setDeletePendingId(postId);

    try {
      await impact(ImpactStyle.Medium);
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
      removePostLocally(postId);
      await loadAppData(user.id);
      if (selectedPost?.id === postId) {
        setSelectedPost(null);
      }
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setDeletePendingId(null);
    }
  }

  async function openComments(post) {
    setSelectedPost(post);
    const data = await apiFetch(`/api/posts/${post.id}/comments`);
    setComments(data.comments);
  }

  async function submitComment(event) {
    event.preventDefault();

    if (!selectedPost || !commentBody.trim()) {
      return;
    }

    setCommentPending(true);

    try {
      await impact(ImpactStyle.Light);
      const data = await apiFetch(`/api/posts/${selectedPost.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody }),
      });
      setComments(data.comments);
      setCommentBody('');
      await loadAppData(user.id);
    } finally {
      setCommentPending(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfilePending(true);

    try {
      await impact(ImpactStyle.Medium);
      const formData = new FormData();
      formData.append('name', profileForm.name);
      formData.append('bio', profileForm.bio);
      if (profileAvatarFile) {
        formData.append('avatar', profileAvatarFile);
      }

      const data = await apiFetch('/api/profile/me', {
        method: 'PATCH',
        body: formData,
      });

      setUser(data.user);
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileEditorOpen(false);
      await loadAppData(data.user.id);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setProfilePending(false);
    }
  }

  async function markActivityRead() {
    await impact(ImpactStyle.Light);
    await apiFetch('/api/activity/read', { method: 'POST' });
    setActivity((current) => current.map((item) => ({ ...item, isRead: true })));
    setCounts((current) => ({ ...current, activity: 0 }));
  }

  async function choosePostImage() {
    const file = await pickImageFromDevice();

    if (file) {
      setImageFile(file);
    }
  }

  async function chooseAvatarImage() {
    const file = await pickImageFromDevice();

    if (file) {
      setProfileAvatarFile(file);
    }
  }

  async function chooseStoryImage() {
    const file = await pickImageFromDevice();

    if (file) {
      setStoryFile(file);
    }
  }

  function stopBrowserCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }

  async function openBrowserCamera(mode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is unavailable in this browser.');
      return;
    }

    try {
      stopBrowserCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraError('');
      setCameraModalMode(mode);
    } catch {
      setCameraError('Could not open the camera.');
    }
  }

  function closeCameraModal() {
    stopBrowserCamera();
    setCameraModalMode('');
    setCameraError('');
  }

  async function captureBrowserPhoto() {
    if (!cameraVideoRef.current) {
      return;
    }

    const video = cameraVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1440;
    const context = canvas.getContext('2d');

    if (!context) {
      setCameraError('Could not capture that photo.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));

    if (!blob) {
      setCameraError('Could not capture that photo.');
      return;
    }

    const file = new File([blob], `prism-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });

    if (cameraModalMode === 'snap') {
      setSnapFile(file);
    } else if (cameraModalMode === 'message') {
      setMessageImageFile(file);
    }

    closeCameraModal();
  }

  async function chooseSnapImage() {
    if (isNative) {
      const file = await pickImageFromDevice();
      if (file) {
        setSnapFile(file);
      }
      return;
    }

    await openBrowserCamera('snap');
  }

  async function enablePushNotifications() {
    try {
      await impact(ImpactStyle.Light);

      if (!isNative) {
        setFeedError('Push notifications only work in the iPhone app.');
        return;
      }

      const permission = await PushNotifications.requestPermissions();
      setPushPermission(permission.receive);

      if (permission.receive === 'granted') {
        await PushNotifications.register();
        setFeedError('');
      } else {
        setFeedError('Notifications are not available until permission is granted.');
      }
    } catch {
      setFeedError('Notifications are unavailable in this simulator session.');
    }
  }

  async function sharePost(post) {
    await impact(ImpactStyle.Light);
    await shareContent({
      title: `${post.user.name} on Prism`,
      text: post.caption,
      url: API_ORIGIN || window.location.origin,
    });
  }

  async function shareProfile() {
    await impact(ImpactStyle.Light);
    await shareContent({
      title: `${user.name} on Prism`,
      text: `Follow @${user.handle} on Prism`,
      url: API_ORIGIN || window.location.origin,
    });
  }

  async function sendSnap(event) {
    event.preventDefault();

    if (!snapRecipientId || !snapFile) {
      return;
    }

    setSnapPending(true);
    setSnapError('');

    try {
      await impact(ImpactStyle.Medium);
      const formData = new FormData();
      formData.append('recipientId', snapRecipientId);
      formData.append('caption', snapCaption);
      formData.append('image', snapFile);

      await apiFetch('/api/snaps', {
        method: 'POST',
        body: formData,
      });

      setSnapRecipientId('');
      setSnapCaption('');
      setSnapFile(null);
      await loadAppData(user.id);
    } catch (error) {
      setSnapError(error.message);
    } finally {
      setSnapPending(false);
    }
  }

  async function loadSnapThread(userId) {
    const data = await apiFetch(`/api/snaps/thread/${userId}`);
    setSelectedSnapThreadUserId(String(userId));
    setSelectedSnapThreadUser(data.user);
    setSelectedSnapMessages(data.snaps);
  }

  async function openSnap(snap) {
    if (!snap.canOpen && !snap.savedInChat) {
      return;
    }

    setSnapError('');

    try {
      await impact(ImpactStyle.Heavy);
      const data = await apiFetch(`/api/snaps/${snap.id}/open`, { method: 'POST' });
      setSnapViewer(data.snap);
      await loadAppData(user.id);
    } catch (error) {
      setSnapError(error.message);
      await loadAppData(user.id);
    }
  }

  async function replaySnapItem(snapId) {
    setSnapError('');

    try {
      await impact(ImpactStyle.Medium);
      const data = await apiFetch(`/api/snaps/${snapId}/replay`, { method: 'POST' });
      setSnapViewer(data.snap);
      await loadAppData(user.id);
    } catch (error) {
      setSnapError(error.message);
      await loadAppData(user.id);
    }
  }

  async function saveSnapToChat(snapId) {
    setSnapError('');

    try {
      await impact(ImpactStyle.Light);
      await apiFetch(`/api/snaps/${snapId}/save`, { method: 'POST' });
      await loadAppData(user.id);
    } catch (error) {
      setSnapError(error.message);
    }
  }

  async function publishStory(event) {
    event.preventDefault();

    if (!storyFile) {
      return;
    }

    setStoryPending(true);

    try {
      await impact(ImpactStyle.Medium);
      const formData = new FormData();
      formData.append('caption', storyCaption);
      formData.append('image', storyFile);
      await apiFetch('/api/stories', {
        method: 'POST',
        body: formData,
      });
      setStoryCaption('');
      setStoryFile(null);
      setStoryComposerOpen(false);
      await loadOptionalData();
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setStoryPending(false);
    }
  }

  function openStoryGroup(group) {
    setStoryViewer(group);
  }

  async function saveNote(event) {
    event.preventDefault();
    setNotePending(true);

    try {
      await impact(ImpactStyle.Light);
      await apiFetch('/api/notes/me', {
        method: 'PUT',
        body: JSON.stringify(noteForm),
      });
      await loadOptionalData();
      setNoteEditorOpen(false);
      setSpotifyQuery('');
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setNotePending(false);
    }
  }

  async function clearNote() {
    setNotePending(true);

    try {
      await impact(ImpactStyle.Light);
      const emptyNote = buildNoteDraft();
      await apiFetch('/api/notes/me', {
        method: 'PUT',
        body: JSON.stringify(emptyNote),
      });
      setNoteForm(emptyNote);
      setSpotifyQuery('');
      await loadOptionalData();
      setNoteEditorOpen(false);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setNotePending(false);
    }
  }

  function connectSpotify() {
    window.location.href = `${API_ORIGIN}/api/spotify/connect`;
  }

  function pickSpotifyTrack(track) {
    setNoteForm((current) => ({
      ...current,
      spotifyUrl: track.spotifyUrl,
      songTitle: track.name,
      artistName: track.artistName,
    }));
    setSpotifyQuery(track.name);
  }

  function toggleMessageRecipient(userId) {
    setMessageRecipients((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function handleNotePress(note) {
    if (note.isOwnNote) {
      openNoteEditor(ownNote);
      return;
    }

    await startConversation(note.user.id);
  }

  async function likeNote(note) {
    if (note.isOwnNote) {
      return;
    }

    const data = await apiFetch(`/api/notes/${note.user.id}/like`, {
      method: 'POST',
    });

    if (data.note) {
      updateNoteLocally(data.note);
      if (data.liked) {
        setNoteLikeBurstId(note.user.id);
        window.setTimeout(() => {
          setNoteLikeBurstId((current) => (current === note.user.id ? null : current));
        }, 520);
      }
    }
  }

  function handleNoteTap(note) {
    if (noteTapTimeout.current) {
      window.clearTimeout(noteTapTimeout.current);
      noteTapTimeout.current = null;

      if (pendingSingleNoteId === note.user.id) {
        setPendingSingleNoteId(null);
        void likeNote(note);
        return;
      }
    }

    setPendingSingleNoteId(note.user.id);
    noteTapTimeout.current = window.setTimeout(() => {
      noteTapTimeout.current = null;
      setPendingSingleNoteId(null);
      void handleNotePress(note);
    }, 220);
  }

  if (booting) {
    return <div className="loading-screen">Loading Prism...</div>;
  }

  if (!user) {
    return (
      <AuthScreen
        authMode={authMode}
        authForm={authForm}
        authError={authError}
        authPending={authPending}
        onModeChange={setAuthMode}
        onChange={handleAuthChange}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <div className="page-shell">
      <main
        className="app-frame"
        onTouchEnd={handleAppTouchEnd}
        onTouchMove={handleAppTouchMove}
        onTouchStart={handleAppTouchStart}
      >
        <div
          className={pullRefreshing || pullDistance > 0 ? 'pull-indicator visible' : 'pull-indicator'}
          style={{ height: `${pullRefreshing ? 56 : pullDistance}px` }}
        >
          <span>{pullRefreshing ? 'Refreshing...' : pullDistance > 56 ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
        {renderPageHeader()}

        <nav
          className={
            ((activeTab === 'Messages' && compactMessagesLayout && selectedConversation)
              || (activeTab === 'Snaps' && compactMessagesLayout && selectedSnapThreadUser))
              ? 'tabbar tabbar-five tabbar-hidden'
              : 'tabbar tabbar-five'
          }
          style={{ '--tab-count': 5 }}
        >
          {tabs.slice(0, 2).map((tab) => (
            <button
              key={tab.key}
              className={tab.key === activeTab ? 'tab active' : 'tab'}
              onClick={() => selectTab(tab.key)}
              aria-label={tabLabel(tab.key)}
            >
              <Icon path={tab.icon} />
              <span className="tab-text desktop-label">{tabLabel(tab.key)}</span>
              <span className="tab-text mobile-label">{tab.shortLabel}</span>
            </button>
          ))}
          <button
            className="tab create-tab"
            onClick={() => setComposerOpen(true)}
            aria-label="Create post"
          >
            <span className="create-tab-circle">+</span>
          </button>
          {tabs.slice(2).map((tab) => (
            <button
              key={tab.key}
              className={tab.key === activeTab ? 'tab active' : 'tab'}
              onClick={() => selectTab(tab.key)}
              aria-label={tabLabel(tab.key)}
            >
              <Icon path={tab.icon} />
              <span className="tab-text desktop-label">{tabLabel(tab.key)}</span>
              <span className="tab-text mobile-label">{tab.shortLabel}</span>
            </button>
          ))}
        </nav>

        {feedError && <p className="form-error banner-error">{feedError}</p>}

        {activeTab === 'Feed' && (
          <section className="feed-only-layout">
            <div className="feed-column">
              <section className="stories-panel">
                <div className="stories-row">
                  {homeStoryGroups.map((story) => (
                    <article
                      key={story.id}
                      className={story.isOwnStory ? 'story-bubble own-story-bubble' : 'story-bubble live-story'}
                    >
                      <div
                        className="story-trigger"
                        onClick={() => {
                          if (story.items.length > 0) {
                            openStoryGroup(story);
                          } else if (story.isOwnStory) {
                            setStoryComposerOpen(true);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (story.items.length > 0) {
                              openStoryGroup(story);
                            } else if (story.isOwnStory) {
                              setStoryComposerOpen(true);
                            }
                          }
                        }}
                      >
                        <div className={story.isOwnStory ? 'story-ring own-story-ring' : 'story-ring active-story-ring'}>
                          <div className="story-core">
                            {story.user.avatarUrl ? (
                              <img alt={story.user.name} src={resolveAssetUrl(story.user.avatarUrl)} />
                            ) : (
                              <span>{story.user.avatarFallback}</span>
                            )}
                          </div>
                          {story.isOwnStory && (
                            <button
                              className="story-add-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStoryComposerOpen(true);
                              }}
                              type="button"
                              aria-label="Add story"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <p>{story.isOwnStory ? 'Your story' : story.user.name.split(' ')[0]}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {posts.length === 0 && (
                <section className="empty-state">
                  <h3>No posts yet</h3>
                  <button className="primary-action" onClick={() => setComposerOpen(true)}>
                    New Post
                  </button>
                </section>
              )}

              <section className="feed-stack">
                {posts.map((post) => (
                  <article key={post.id} className="post-card">
                    <div className="post-header">
                      <div className="post-user">
                        <Avatar user={post.user} />
                        <div>
                          <div className="post-meta-row">
                            <strong>{post.user.name}</strong>
                            <span>{formatTime(post.createdAt)}</span>
                          </div>
                          <p>
                            @{post.user.handle} · {post.location}
                          </p>
                        </div>
                      </div>

                      {post.user.id !== user.id ? (
                        <div className="post-owner-actions">
                          <button className="follow-chip" onClick={() => toggleFollow(post.user.id)}>
                            {post.following ? 'Following' : 'Follow'}
                          </button>
                          <button className="ghost-button" onClick={() => startConversation(post.user.id)}>
                            Message
                          </button>
                        </div>
                      ) : (
                        <button
                          className="danger-chip"
                          disabled={deletePendingId === post.id}
                          onClick={() => deletePost(post.id)}
                        >
                          {deletePendingId === post.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>

                    <div className="post-visual">
                      <img alt={post.caption} src={resolveAssetUrl(post.imageUrl)} />
                    </div>

                    <div className="post-actions">
                      <div className="action-row">
                        <button
                          className={post.liked ? 'icon-button liked' : 'icon-button'}
                          onClick={() => toggleLike(post.id)}
                          aria-label="Like post"
                        >
                          <Icon path="M12 21s-6.716-4.35-9.193-8.074C1.46 10.902 2.25 7.77 4.99 6.56 7.063 5.643 9.2 6.48 10.5 8.09 11.8 6.48 13.937 5.643 16.01 6.56c2.74 1.21 3.53 4.342 2.183 6.366C18.716 16.65 12 21 12 21Z" />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Comment on post"
                          onClick={() => openComments(post)}
                        >
                          <Icon path="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-4.5 4v-4.5A2.5 2.5 0 0 1 4 12.5v-7Z" />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Share post"
                          onClick={() => sharePost(post)}
                        >
                          <Icon path="M20 4 9 15m11-11-7 16-4-9-9-4 20-3Z" />
                        </button>
                      </div>

                      <button
                        className={post.saved ? 'save-button active' : 'save-button'}
                        onClick={() => toggleSave(post.id)}
                      >
                        Save
                      </button>
                    </div>

                    <div className="post-copy">
                      <p>
                        <strong>{formatCount(post.likes)} likes</strong> · {post.comments} comments
                        {' · '}
                        {formatCount(post.saves)} saves
                      </p>
                      <p>{post.caption}</p>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          </section>
        )}

        {activeTab === 'Explore' && (
          <section className="explore-layout explore-page">
            <section className="search-results-panel">
              <div className="section-heading">
                <h3>Discover</h3>
                <span>{searchPending ? 'Searching...' : 'Curated for you'}</span>
              </div>

              <div className="discover-chip-row">
                <button className="ghost-button">Creators</button>
                <button className="ghost-button">Moments</button>
                <button className="ghost-button">Moodboards</button>
                <button className="ghost-button">Saved energy</button>
              </div>

              {!searchQuery.trim() && <p className="rail-copy">Search people, posts, and the vibe around Prism.</p>}

              {searchQuery.trim() && (
                <div className="search-results">
                  <div className="search-column">
                    <h4>People</h4>
                    {searchResults.users.length === 0 && <p>No results.</p>}
                    {searchResults.users.map((entry) => (
                      <article key={entry.id} className="search-user-card">
                        <div className="post-user">
                          <Avatar user={entry} />
                          <div>
                            <strong>{entry.name}</strong>
                            <p>@{entry.handle}</p>
                          </div>
                        </div>
                        <p>{entry.bio}</p>
                        <div className="search-user-actions">
                          {entry.id !== user.id && (
                            <>
                              <button
                                className="ghost-button"
                                onClick={() => {
                                  setSnapRecipientId(String(entry.id));
                                  setActiveTab('Snaps');
                                }}
                              >
                                Snap
                              </button>
                              <button className="follow-chip" onClick={() => toggleFollow(entry.id)}>
                                {entry.following ? 'Following' : 'Follow'}
                              </button>
                              <button className="ghost-button" onClick={() => startConversation(entry.id)}>
                                Message
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="search-column">
                    <h4>Posts</h4>
                    {searchResults.posts.length === 0 && <p>No results.</p>}
                    {searchResults.posts.map((post) => (
                      <article key={post.id} className="search-post-card" onClick={() => openComments(post)}>
                        <img alt={post.caption} src={resolveAssetUrl(post.imageUrl)} />
                        <div>
                          <strong>{post.user.name}</strong>
                          <p>{post.caption}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="creator-shelf">
              <div className="section-heading">
                <h3>People to follow</h3>
                <span>{suggestedPeople.length}</span>
              </div>
              <div className="creator-row">
                {suggestedPeople.map((entry) => (
                  <article key={entry.id} className="creator-card">
                    <Avatar user={entry} />
                    <strong>{entry.name}</strong>
                    <p>@{entry.handle}</p>
                    <button className="follow-chip" onClick={() => toggleFollow(entry.id)}>
                      {entry.following ? 'Following' : 'Follow'}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="explore-grid">
              {explorePosts.map((post) => (
                <article key={post.id} className="explore-card">
                  <img alt={post.caption} src={resolveAssetUrl(post.imageUrl)} />
                  <div className="explore-overlay">
                    <span>{post.user.name}</span>
                    <p>{formatCount(post.likes)} likes</p>
                  </div>
                </article>
              ))}
            </section>
          </section>
        )}

        {activeTab === 'Snaps' && (
          <section className="snaps-layout snaps-page">
            {(!compactMessagesLayout || !selectedSnapThreadUser) && (
              <section className="snap-compose-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Camera</p>
                    <h3>Send Snap</h3>
                  </div>
                  <span>{counts.snaps} unread</span>
                </div>

                <div className="snap-recipient-row">
                  {snapPeople.map((entry) => (
                    <button
                      key={entry.id}
                      className={
                        String(entry.id) === String(snapRecipientId)
                          ? 'snap-person-chip active-snap-person'
                          : 'snap-person-chip'
                      }
                      onClick={() => setSnapRecipientId(String(entry.id))}
                      type="button"
                    >
                      <Avatar user={entry} size="small" />
                      <span>{entry.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>

                <form className="composer-form" onSubmit={sendSnap}>
                  <div className="snap-stage">
                    {snapPreview ? (
                      <div className="upload-preview snap-preview">
                        <img alt="Snap preview" src={snapPreview} />
                      </div>
                    ) : (
                      <button
                        className="snap-capture-surface"
                        onClick={isNative ? chooseSnapImage : undefined}
                        type="button"
                      >
                        <div>
                          <strong>{selectedSnapRecipient ? `Snap ${selectedSnapRecipient.name.split(' ')[0]}` : 'Create a snap'}</strong>
                          <p>{isNative ? 'Open camera or library' : 'Pick a photo to get started'}</p>
                        </div>
                      </button>
                    )}

                    <div className="snap-stage-overlay">
                      <div className="snap-target-card">
                        {selectedSnapRecipient ? (
                          <div className="post-user">
                            <Avatar user={selectedSnapRecipient} />
                            <div>
                              <strong>{selectedSnapRecipient.name}</strong>
                              <p>@{selectedSnapRecipient.handle}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="rail-copy">Choose someone above to send a snap.</p>
                        )}
                      </div>
                    </div>
                  </div>

                <div className="snap-camera-actions">
                  <button className="primary-action" onClick={chooseSnapImage} type="button">
                    Take Snap
                  </button>
                </div>

                  <div className="snap-compose-bar">
                    <input
                      value={snapCaption}
                      onChange={(event) => setSnapCaption(event.target.value)}
                      placeholder="Add a caption"
                    />
                    <button
                      className="icon-button snap-send-button"
                      disabled={snapPending || !snapRecipientId || !snapFile}
                      type="submit"
                      aria-label="Send snap"
                    >
                      <Icon path="M20 4 9 15m11-11-7 16-4-9-9-4 20-3Z" />
                    </button>
                  </div>

                  {snapError && <p className="form-error">{snapError}</p>}
                  {snapPending && <p className="rail-copy">Sending snap...</p>}
                </form>
              </section>
            )}

            {!selectedSnapThreadUser && (
              <section className="snap-thread-list">
                <div className="section-heading">
                  <h3>Recent</h3>
                  <span>{snaps.length}</span>
                </div>

                {snaps.length === 0 && (
                  <section className="empty-state compact-empty">
                    <h3>No snaps yet</h3>
                  </section>
                )}

                {snaps.map((thread) => (
                  <article
                    key={thread.id}
                    className={thread.canOpen ? 'snap-row active-snap-row' : 'snap-row'}
                    onClick={() => loadSnapThread(thread.user.id)}
                  >
                    <div className="post-user">
                      <div className={thread.canOpen ? 'story-ring note-story-ring note-story-ring-liked' : 'story-ring note-story-ring'}>
                        <Avatar user={thread.user} />
                      </div>
                      <div>
                        <strong>{thread.user.name}</strong>
                        <p>
                          {buildSnapStatusCopy(thread)}
                          {thread.caption ? ` · ${thread.caption}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="snap-row-actions">
                      {thread.unreadCount > 0 && <span className="pill-count">{thread.unreadCount}</span>}
                      <button
                        className="ghost-button snap-thread-open"
                        onClick={(event) => {
                          event.stopPropagation();
                          loadSnapThread(thread.user.id);
                        }}
                        type="button"
                      >
                        Thread
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}

            {selectedSnapThreadUser && (
              <section
                className={
                  compactMessagesLayout
                    ? 'snap-thread-panel compact-thread-view snap-thread-fullscreen'
                    : 'snap-thread-panel'
                }
                onTouchEnd={handleSnapThreadTouchEnd}
                onTouchStart={handleSnapThreadTouchStart}
              >
                <div className="message-thread-header">
                  {compactMessagesLayout && (
                    <button
                      className="icon-button back-button"
                      onClick={() => {
                        setSelectedSnapThreadUserId(null);
                        setSelectedSnapThreadUser(null);
                        setSelectedSnapMessages([]);
                      }}
                      type="button"
                      aria-label="Back"
                    >
                      <Icon path="M14.75 5.75 8.5 12l6.25 6.25-1.5 1.5L5.5 12l7.75-7.75 1.5 1.5Z" />
                    </button>
                  )}
                  <div className="message-header">
                    <div className="post-user">
                      <Avatar user={selectedSnapThreadUser} size="small" />
                      <div>
                        <strong>{selectedSnapThreadUser.name}</strong>
                        <p>@{selectedSnapThreadUser.handle}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="snap-thread-stream">
                  {selectedSnapMessages.map((snap) => (
                    <article
                      key={snap.id}
                      className={snap.direction === 'sent' ? 'snap-chat-card outgoing-snap-card' : 'snap-chat-card incoming-snap-card'}
                    >
                      <button
                        className={snap.canViewInChat || snap.savedInChat ? 'snap-chat-media active-snap-media' : 'snap-chat-media'}
                        disabled={!snap.canOpen && !snap.canReplay && !snap.savedInChat}
                        onClick={() => {
                          if (snap.canOpen || snap.savedInChat) {
                            openSnap(snap);
                          } else if (snap.canReplay) {
                            replaySnapItem(snap.id);
                          }
                        }}
                        type="button"
                      >
                        {snap.savedInChat ? (
                          <img alt={snap.caption || 'Saved snap'} src={resolveAssetUrl(snap.imageUrl)} />
                        ) : (
                          <div className="snap-chat-placeholder">
                            <strong>{buildSnapMessageStatus(snap)}</strong>
                            {snap.caption && <span>{snap.caption}</span>}
                          </div>
                        )}
                      </button>

                      <div className="snap-chat-meta">
                        <span>{formatTime(snap.createdAt)}</span>
                        <span className="snap-status-pill">{buildSnapMessageStatus(snap)}</span>
                        <div className="snap-inline-actions">
                          {snap.canOpen && (
                            <button className="ghost-button" onClick={() => openSnap(snap)} type="button">
                              Open
                            </button>
                          )}
                          {snap.canReplay && (
                            <button className="ghost-button" onClick={() => replaySnapItem(snap.id)} type="button">
                              Replay
                            </button>
                          )}
                          {!snap.savedInChat && (
                            <button className="ghost-button" onClick={() => saveSnapToChat(snap.id)} type="button">
                              Save
                            </button>
                          )}
                          {snap.savedInChat && (
                            <button className="ghost-button snap-saved-indicator" disabled type="button">
                              Saved
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {activeTab === 'Notifications' && (
          <section className="activity-list activity-page">
            <section className="activity-summary-card">
              <div>
                <p className="eyebrow">Now</p>
                <h3>{unreadActivityCount} unread</h3>
              </div>
              <div className="activity-summary-grid">
                <article>
                  <strong>{counts.messages}</strong>
                  <span>DMs</span>
                </article>
                <article>
                  <strong>{counts.snaps}</strong>
                  <span>Snaps</span>
                </article>
                <article>
                  <strong>{counts.activity}</strong>
                  <span>Alerts</span>
                </article>
              </div>
            </section>

            <div className="section-heading">
              <h3>Notifications</h3>
              <button className="ghost-button" onClick={markActivityRead}>
                Mark Read
              </button>
            </div>

            {activity.length === 0 && (
              <section className="insight-card">
                <h3>No activity</h3>
              </section>
            )}

            {activity.map((item) => (
              <article
                key={item.id}
                className={item.isRead ? 'activity-card' : 'activity-card unread-activity'}
              >
                <Avatar
                  user={{
                    name: item.actorName,
                    avatarUrl: item.actorAvatarPath ? `/${item.actorAvatarPath}` : '',
                    avatarFallback: item.actorAvatarFallback,
                  }}
                />
                <div className="activity-copy">
                  <strong>{buildActivityCopy(item)}</strong>
                  <p>
                    @{item.actorHandle} · {formatTime(item.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === 'Messages' && (
          <section className="messages-layout">
            {(!compactMessagesLayout || !selectedConversation) && (
              <div className="messages-list">
                <div className="messages-shell-header">
                  <div>
                    <p className="eyebrow">Inbox</p>
                    <strong>Messages</strong>
                  </div>
                  <div className="message-header-actions">
                    <button
                      className="icon-button"
                      onClick={() => openNoteEditor(ownNote)}
                      type="button"
                      aria-label="Add or edit note"
                    >
                      <Icon path="M16.86 3.34a2.25 2.25 0 1 1 3.18 3.18L8.4 18.16l-4.2 1.02 1.02-4.2L16.86 3.34ZM13.5 6.7l3.18 3.18" />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => setMessageComposerOpen(true)}
                      type="button"
                      aria-label="New message"
                    >
                      <Icon path="M19.5 5.5v13h-13V9.75l8.25-8.25H19.5Zm-4 1.5-7.5 7.5v2h2l7.5-7.5-2-2Z" />
                    </button>
                  </div>
                </div>

                <label className="messages-search">
                  <Icon path="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.44 4.44 1.06-1.06-4.44-4.44A6.5 6.5 0 0 0 10.5 4Z" />
                  <input
                    value={messageSearchQuery}
                    onChange={(event) => setMessageSearchQuery(event.target.value)}
                    placeholder="Search messages"
                  />
                </label>

                <section className="notes-strip" aria-label="Notes">
                  {messageNotes.map((note) => (
                    <article
                      key={`${note.user.id}-${note.isOwnNote ? 'own' : 'note'}`}
                      className={note.isOwnNote ? 'note-stack note-stack-own' : 'note-stack'}
                    >
                      <button className="note-stack-trigger" onClick={() => handleNoteTap(note)} type="button">
                        <div className="note-bubble-wrap">
                          <div className={note.likedByViewer ? 'note-bubble note-bubble-liked' : 'note-bubble'}>
                            <p>{getNotePreview(note)}</p>
                            {getNoteCredit(note) && <span className="note-bubble-song">{getNoteCredit(note)}</span>}
                          </div>
                          {noteLikeBurstId === note.user.id && <span className="note-like-burst">♥</span>}
                        </div>
                        <div className={note.likedByViewer ? 'story-ring note-story-ring note-story-ring-liked' : 'story-ring note-story-ring'}>
                          <Avatar user={note.user} size="small" className="note-avatar" />
                        </div>
                        <strong className="note-name">{note.isOwnNote ? 'Your note' : note.user.name}</strong>
                        {note.likeCount > 0 && <span className="note-like-count">{note.likeCount}</span>}
                      </button>
                      {note.spotifyUrl && !note.isOwnNote && (
                        <a
                          className="note-song-link"
                          href={note.spotifyUrl}
                          onClick={(event) => event.stopPropagation()}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Song
                        </a>
                      )}
                    </article>
                  ))}
                </section>

                <div className="messages-list-header">
                  <h3>Chats</h3>
                  <span>{filteredInbox.length}</span>
                </div>

                <div className="chat-list">
                  {filteredInbox.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={
                        swipedConversationId === conversation.id
                          ? 'chat-row-shell chat-row-shell-swiped'
                          : 'chat-row-shell'
                      }
                    >
                      <div className="chat-row-actions">
                        <button
                          className={conversation.muted ? 'icon-button mute-thread-button thread-action-active' : 'icon-button mute-thread-button'}
                          onMouseUp={(event) => triggerConversationMute(event, conversation.id, !conversation.muted)}
                          onTouchStart={(event) => triggerConversationMute(event, conversation.id, !conversation.muted)}
                          type="button"
                          aria-label={conversation.muted ? 'Unmute conversation' : 'Mute conversation'}
                        >
                          <Icon path="M12 4.75a4.25 4.25 0 0 0-4.25 4.25v1.22c0 .72-.2 1.42-.59 2.02L5.9 14.2A1 1 0 0 0 6.74 15.7h10.52a1 1 0 0 0 .84-1.5l-1.26-1.96a3.7 3.7 0 0 1-.59-2.02V9A4.25 4.25 0 0 0 12 4.75Zm0 15.25a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 20Z M5 5l14 14" />
                        </button>
                        <button
                          className="icon-button delete-thread-button"
                          onMouseUp={(event) => triggerConversationDelete(event, conversation.id)}
                          onTouchStart={(event) => triggerConversationDelete(event, conversation.id)}
                          type="button"
                          aria-label="Delete conversation"
                        >
                          <Icon path="M9 4.75h6l.5 1.5H19v1.5H5v-1.5h3.5l.5-1.5Zm-1 5h1.5v7H8v-7Zm6.5 0H16v7h-1.5v-7ZM6.5 9.75h1.5v7H6.5v-7Z" />
                        </button>
                      </div>
                      <article
                        className={
                          conversation.id === selectedConversationId ? 'chat-row active-chat' : 'chat-row'
                        }
                        onClick={() => {
                          if (swipedConversationId === conversation.id) {
                            setSwipedConversationId(null);
                            return;
                          }
                          loadConversation(conversation.id);
                        }}
                        onTouchEnd={(event) => handleInboxRowTouchEnd(event, conversation.id)}
                        onTouchStart={(event) => handleInboxRowTouchStart(event, conversation.id)}
                      >
                        <Avatar user={conversation.user} size="small" />
                        <div className="chat-copy">
                          <strong>{conversation.title || conversation.user.name}</strong>
                          <p>{conversation.preview}</p>
                        </div>
                        <div className="chat-meta">
                          <span>{formatTime(conversation.updatedAt)}</span>
                          {conversation.unreadCount > 0 && (
                            <span className="pill-count">{conversation.unreadCount}</span>
                          )}
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!compactMessagesLayout || selectedConversation) && (
              <div
                className={
                  compactMessagesLayout && selectedConversation
                    ? 'messages-preview compact-thread-view'
                    : 'messages-preview'
                }
                onTouchEnd={handleThreadTouchEnd}
                onTouchStart={handleThreadTouchStart}
              >
                {selectedConversation ? (
                  <>
                    <div className="message-thread-header">
                      {compactMessagesLayout && (
                        <button
                          className="icon-button back-button"
                          onClick={() => setSelectedConversationId(null)}
                          type="button"
                          aria-label="Back"
                        >
                          <Icon path="M14.75 5.75 8.5 12l6.25 6.25-1.5 1.5L5.5 12l7.75-7.75 1.5 1.5Z" />
                        </button>
                      )}
                      <div className="message-header">
                        <div className="post-user">
                          <Avatar user={selectedConversation.user} size="small" />
                          <div>
                            <strong>{selectedConversation.title || selectedConversation.user.name}</strong>
                            <p>
                              {selectedConversation.participantCount > 2
                                ? `${selectedConversation.participantCount} people`
                                : `@${selectedConversation.user.handle}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="message-thread">
                      {selectedMessages.map((message) => (
                        <div
                          key={message.id}
                          className={
                            message.senderId === user.id
                              ? 'message-bubble outgoing'
                              : 'message-bubble incoming'
                          }
                        >
                          {message.imageUrl && (
                            <div className="message-image-bubble">
                              <img alt="Shared in chat" src={resolveAssetUrl(message.imageUrl)} />
                            </div>
                          )}
                          {message.body}
                        </div>
                      ))}
                    </div>

                    <form className="message-compose-bar" onSubmit={sendCurrentMessage}>
                      <button
                        className="icon-button message-attach-button"
                        onClick={() => messageImageInputRef.current?.click()}
                        type="button"
                        aria-label="Add photo"
                      >
                        <Icon path="M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V7h.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-7A2.5 2.5 0 0 1 5.5 7H6V5.5Zm6 3.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
                      </button>
                      <input
                        ref={messageImageInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => setMessageImageFile(event.target.files?.[0] || null)}
                      />
                      <textarea
                        value={messageBody}
                        onChange={(event) => setMessageBody(event.target.value)}
                        placeholder="Message"
                      />
                      {messageImagePreview && (
                        <div className="message-image-preview">
                          <img alt="Message preview" src={messageImagePreview} />
                          <button
                            className="icon-button message-image-clear"
                            onClick={() => setMessageImageFile(null)}
                            type="button"
                            aria-label="Remove photo"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <button
                        className="icon-button message-send-button"
                        disabled={messagePending}
                        type="submit"
                        aria-label="Send message"
                      >
                        <Icon path="M20 4 9 15m11-11-7 16-4-9-9-4 20-3Z" />
                      </button>
                    </form>
                  </>
                ) : (
                  <section className="message-empty-state">
                    <p className="eyebrow">Messages</p>
                    <h3>Pick a chat</h3>
                    <p className="rail-copy">Open a conversation or start a new one.</p>
                    <button className="primary-action" onClick={() => setMessageComposerOpen(true)} type="button">
                      New Message
                    </button>
                  </section>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'Profile' && profile && (
          <section className="profile-layout profile-page">
            <div className="profile-hero-card">
              <div className="profile-hero">
                <Avatar user={profile.user} size="xl" />
                <div>
                  <p className="eyebrow">Profile</p>
                  <h3>{profile.user.name}</h3>
                  <p>@{profile.user.handle}</p>
                  <p>{profile.user.bio}</p>
                </div>
              </div>

              <div className="profile-action-row">
                <button className="primary-action" onClick={() => setComposerOpen(true)}>
                  Create post
                </button>
                <button className="ghost-button" onClick={() => setStoryComposerOpen(true)}>
                  Add story
                </button>
                <button className="ghost-button" onClick={() => setProfileEditorOpen(true)}>
                  Edit profile
                </button>
                <button className="ghost-button" onClick={shareProfile}>
                  Share
                </button>
                <button className="ghost-button" onClick={logout}>
                  Log out
                </button>
              </div>
            </div>

            <div className="profile-headline">
              <div>
                <p className="eyebrow">Profile</p>
                <h3>{profile.user.name}</h3>
              </div>
              <div className="profile-inline-meta">
                <span>{profile.stats.posts} posts</span>
                <span>{formatCount(profile.stats.followers)} followers</span>
                <span>{formatCount(profile.stats.following)} following</span>
              </div>
            </div>

            <div className="profile-stats">
              <article>
                <strong>{profile.stats.posts}</strong>
                <span>Posts</span>
              </article>
              <article>
                <strong>{formatCount(profile.stats.followers)}</strong>
                <span>Followers</span>
              </article>
              <article>
                <strong>{formatCount(profile.stats.following)}</strong>
                <span>Following</span>
              </article>
              <article>
                <strong>{formatCount(profile.stats.totalLikes)}</strong>
                <span>Total likes</span>
              </article>
            </div>

            {ownStoryGroup && (
              <section className="profile-highlights">
                <div className="section-heading">
                  <h3>Highlights</h3>
                  <span>{ownStoryGroup.items.length}</span>
                </div>
                <div className="highlight-row">
                  {ownStoryGroup.items.slice(0, 6).map((story) => (
                    <button
                      key={story.id}
                      className="highlight-card"
                      onClick={() => openStoryGroup(ownStoryGroup)}
                    >
                      <div className="highlight-ring">
                        <img alt={story.caption || 'Story'} src={resolveAssetUrl(story.imageUrl)} />
                      </div>
                      <span>{story.caption || formatTime(story.createdAt)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="insight-card compact">
              <div className="section-heading">
                <h3>Notifications</h3>
                <span>{pushPermission}</span>
              </div>
              <div className="post-owner-actions">
                <button className="ghost-button" onClick={enablePushNotifications}>
                  Enable
                </button>
                {pushToken && <button className="ghost-button">Ready</button>}
              </div>
            </section>

            <div className="mini-gallery">
              {profile.posts.length === 0 && (
                <section className="empty-state compact-empty">
                  <h3>No posts yet</h3>
                </section>
              )}
              {profile.posts.map((post) => (
                <article key={post.id} className="mini-tile">
                  <img alt={post.caption} src={resolveAssetUrl(post.imageUrl)} />
                  <span>{post.location}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {composerOpen && (
        <div className="modal-backdrop" onClick={() => setComposerOpen(false)}>
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>New Post</h3>
              <button className="ghost-button" onClick={() => setComposerOpen(false)}>
                Close
              </button>
            </div>

            <form className="composer-form" onSubmit={publishPost}>
              <label>
                Caption
                <textarea value={caption} onChange={(event) => setCaption(event.target.value)} />
              </label>

              <label>
                Location
                <input value={location} onChange={(event) => setLocation(event.target.value)} />
              </label>

              <label>
                Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                />
              </label>

              {isNative && (
                <button className="ghost-button" onClick={choosePostImage} type="button">
                  Use Camera or Library
                </button>
              )}

              {imagePreview && (
                <div className="upload-preview">
                  <img alt="Selected preview" src={imagePreview} />
                </div>
              )}

              {publishError && <p className="form-error">{publishError}</p>}

              <button className="primary-action wide" disabled={publishPending} type="submit">
                {publishPending ? 'Publishing...' : 'Publish'}
              </button>
            </form>
          </div>
        </div>
      )}

      {storyComposerOpen && (
        <div className="modal-backdrop" onClick={() => setStoryComposerOpen(false)}>
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>New Story</h3>
              <button className="ghost-button" onClick={() => setStoryComposerOpen(false)}>
                Close
              </button>
            </div>

            <form className="composer-form" onSubmit={publishStory}>
              <label>
                Caption
                <input value={storyCaption} onChange={(event) => setStoryCaption(event.target.value)} />
              </label>

              <label>
                Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setStoryFile(event.target.files?.[0] || null)}
                />
              </label>

              {isNative && (
                <button className="ghost-button" onClick={chooseStoryImage} type="button">
                  Use Camera or Library
                </button>
              )}

              {storyPreview && (
                <div className="upload-preview snap-preview">
                  <img alt="Story preview" src={storyPreview} />
                </div>
              )}

              <button className="primary-action wide" disabled={storyPending} type="submit">
                {storyPending ? 'Posting...' : 'Share Story'}
              </button>
            </form>
          </div>
        </div>
      )}

      {messageComposerOpen && (
        <div className="modal-backdrop" onClick={() => setMessageComposerOpen(false)}>
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>New Message</h3>
              <button className="ghost-button" onClick={() => setMessageComposerOpen(false)}>
                Close
              </button>
            </div>

            <div className="composer-form">
              <div className="recipient-grid">
                {people.map((entry) => (
                  <button
                    key={entry.id}
                    className={messageRecipients.includes(entry.id) ? 'recipient-chip active-recipient' : 'recipient-chip'}
                    onClick={() => toggleMessageRecipient(entry.id)}
                    type="button"
                  >
                    <Avatar user={entry} size="small" />
                    <div>
                      <strong>{entry.name}</strong>
                      <p>@{entry.handle}</p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                className="primary-action wide"
                disabled={messageRecipients.length === 0}
                onClick={() => startConversation(messageRecipients)}
                type="button"
              >
                {messageRecipients.length > 1 ? 'Create Group Chat' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteEditorOpen && (
        <div className="modal-backdrop" onClick={() => setNoteEditorOpen(false)}>
          <section
            className="composer-modal note-editor-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h3>{ownNote ? 'Edit note' : 'Share a note'}</h3>
              <button className="ghost-button" onClick={() => setNoteEditorOpen(false)} type="button">
                Close
              </button>
            </div>

            <form className="composer-form note-form" onSubmit={saveNote}>
              <label>
                Note
                <input
                  maxLength={60}
                  value={noteForm.body}
                  onChange={(event) =>
                    setNoteForm((current) => ({ ...current, body: event.target.value }))
                  }
                />
              </label>

              {!spotifyStatus.connected && (
                <button
                  className="ghost-button"
                  onClick={connectSpotify}
                  type="button"
                  disabled={!spotifyStatus.clientConfigured}
                >
                  {spotifyStatus.clientConfigured ? 'Connect Spotify' : 'Spotify not configured'}
                </button>
              )}

              {spotifyStatus.connected && (
                <>
                  <label>
                    Add a song
                    <input
                      value={spotifyQuery}
                      onChange={(event) => setSpotifyQuery(event.target.value)}
                    />
                  </label>

                  <div className="spotify-results">
                    {spotifySearchPending && <p className="rail-copy">Searching Spotify...</p>}
                    {spotifyResults.map((track) => (
                      <button
                        key={track.id}
                        className="spotify-track"
                        onClick={() => pickSpotifyTrack(track)}
                        type="button"
                      >
                        {track.albumArt && <img alt={track.name} src={track.albumArt} />}
                        <div>
                          <strong>{track.name}</strong>
                          <p>{track.artistName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {(noteForm.songTitle || noteForm.artistName) && (
                <div className="selected-track-card">
                  <div>
                    <strong>{noteForm.songTitle || 'Spotify track'}</strong>
                    <p>{noteForm.artistName || 'Selected from Spotify'}</p>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setNoteForm((current) => ({
                        ...current,
                        spotifyUrl: '',
                        songTitle: '',
                        artistName: '',
                      }))
                    }
                    type="button"
                  >
                    Remove song
                  </button>
                </div>
              )}

              {getSpotifyEmbedUrl(noteForm.spotifyUrl) && (
                <iframe
                  className="spotify-embed"
                  src={getSpotifyEmbedUrl(noteForm.spotifyUrl)}
                  title="Spotify preview"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              )}

              <div className="note-form-actions">
                <button className="primary-action" disabled={notePending} type="submit">
                  {notePending ? 'Saving...' : 'Save Note'}
                </button>
                <button className="ghost-button" disabled={notePending} onClick={clearNote} type="button">
                  Clear
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {profileEditorOpen && (
        <div className="modal-backdrop" onClick={() => setProfileEditorOpen(false)}>
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>Edit profile</h3>
              <button className="ghost-button" onClick={() => setProfileEditorOpen(false)}>
                Close
              </button>
            </div>

            <form className="composer-form" onSubmit={saveProfile}>
              <label>
                Avatar
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProfileAvatarFile(event.target.files?.[0] || null)}
                />
              </label>

              {isNative && (
                <button className="ghost-button" onClick={chooseAvatarImage} type="button">
                  Use Camera or Library
                </button>
              )}

              {(profileAvatarPreview || user.avatarUrl) && (
                <div className="avatar-preview">
                  <img alt="Avatar preview" src={profileAvatarPreview || resolveAssetUrl(user.avatarUrl)} />
                </div>
              )}

              <label>
                Name
                <input
                  value={profileForm.name}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label>
                Bio
                <textarea
                  value={profileForm.bio}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, bio: event.target.value }))
                  }
                />
              </label>

              <button className="primary-action wide" disabled={profilePending} type="submit">
                {profilePending ? 'Saving...' : 'Save profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {selectedPost && (
        <div className="modal-backdrop" onClick={() => setSelectedPost(null)}>
          <div className="composer-modal comments-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>Comments</h3>
              <button className="ghost-button" onClick={() => setSelectedPost(null)}>
                Close
              </button>
            </div>

            <div className="comments-list">
              {comments.length === 0 && <p>No comments yet. Be the first one.</p>}
              {comments.map((comment) => (
                <article key={comment.id} className="comment-row">
                  <strong>
                    {comment.name} <span>@{comment.handle}</span>
                  </strong>
                  <p>{comment.body}</p>
                </article>
              ))}
            </div>

            <form className="comment-form" onSubmit={submitComment}>
              <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
              <button className="primary-action" disabled={commentPending} type="submit">
                {commentPending ? 'Posting...' : 'Post comment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {snapViewer && (
        <div className="modal-backdrop" onClick={() => setSnapViewer(null)}>
          <div className="snap-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div className="post-user">
                <Avatar user={snapViewer.sender} size="small" />
                <div>
                  <strong>{snapViewer.sender.name}</strong>
                  <p>@{snapViewer.sender.handle}</p>
                </div>
              </div>
              <button className="ghost-button" onClick={() => setSnapViewer(null)}>
                Close
              </button>
            </div>

            <div className="snap-viewer-image">
              <img
                alt={snapViewer.caption || `${snapViewer.sender.name} sent a snap`}
                src={resolveAssetUrl(snapViewer.imageUrl)}
              />
            </div>

            {snapViewer.caption && <p className="snap-viewer-caption">{snapViewer.caption}</p>}
          </div>
        </div>
      )}

      {storyViewer && (
        <div className="modal-backdrop" onClick={() => setStoryViewer(null)}>
          <div className="snap-viewer story-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div className="post-user">
                <Avatar user={storyViewer.user} size="small" />
                <div>
                  <strong>{storyViewer.user.name}</strong>
                  <p>@{storyViewer.user.handle}</p>
                </div>
              </div>
              <button className="ghost-button" onClick={() => setStoryViewer(null)}>
                Close
              </button>
            </div>

            <div className="story-progress">
              {storyViewer.items.map((item) => (
                <span key={item.id} />
              ))}
            </div>

            <div className="story-stack">
              {storyViewer.items.map((item) => (
                <article key={item.id} className="story-slide">
                  <div className="snap-viewer-image">
                    <img alt={item.caption || `${storyViewer.user.name} story`} src={resolveAssetUrl(item.imageUrl)} />
                  </div>
                  {item.caption && <p className="snap-viewer-caption">{item.caption}</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {cameraModalMode && (
        <div className="modal-backdrop" onClick={closeCameraModal}>
          <div className="composer-modal camera-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h3>{cameraModalMode === 'snap' ? 'Take Snap' : 'Take Photo'}</h3>
              <button className="ghost-button" onClick={closeCameraModal}>
                Close
              </button>
            </div>

            <div className="camera-stage">
              <video ref={cameraVideoRef} autoPlay muted playsInline />
            </div>

            {cameraError && <p className="form-error">{cameraError}</p>}

            <div className="camera-actions">
              <button className="primary-action wide" onClick={captureBrowserPhoto} type="button">
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
