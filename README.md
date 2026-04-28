# Prism

A mobile-first social app with posts, stories, snaps, messages, notes, and a real backend.

## What is included

- Account registration and login with an HTTP-only session cookie
- SQLite-backed users, posts, likes, saves, follows, and comments
- Local image uploads saved into `uploads/`
- React frontend with feed, explore, activity, messages, profile, and post composer
- Live search across creators and posts
- Editable profile and delete controls for your own posts
- Real direct-message inbox with unread counts
- Avatar uploads for user profiles
- Capacitor iPhone app shell with custom icon and splash screen
- Native-ready camera, share, haptics, and push notification permission flow
- Production-ready Capacitor config for local dev or a live hosted Prism site

## Default data

- Demo users exist so you can log in and search people
- Placeholder feed posts are removed, so the app starts with an empty real feed
- Demo login: `parker` / `demo1234`

## Run it on your Mac

This project uses the local Node runtime stored in `.local/node`.

Install dependencies:

```bash
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js install
```

Start the frontend and API together for development:

```bash
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js run dev:full
```

Open:

- [http://127.0.0.1:3000](http://127.0.0.1:3000) for Vite development

Demo login:

- Handle: `parker`
- Password: `demo1234`

## One-command local app

Build the frontend:

```bash
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js run build
```

Start the full app from Express:

```bash
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node server/index.js
```

Open:

- [http://127.0.0.1:4000](http://127.0.0.1:4000)

## iPhone app

Capacitor iOS project:

- Xcode project: `ios/App/App.xcodeproj`
- Capacitor config: `capacitor.config.ts`
- App name: `Prism`
- Bundle id: `com.prism.social`
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- Launch artwork: `ios/App/App/Assets.xcassets/Splash.imageset/`

Update the web app inside the iOS shell:

```bash
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js run build
env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js exec cap sync ios
```

For a live hosted build, copy `.env.example` to your own environment and set:

- `APP_ORIGIN=https://app.your-domain.com`
- `CAP_SERVER_URL=https://app.your-domain.com`

Then sync iOS so the app loads the online Prism site:

```bash
CAP_SERVER_URL="https://app.your-domain.com" env PATH="$PWD/.local/node/bin:$PATH" ./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js exec cap sync ios
```

Open the iOS app in Xcode:

```bash
open ios/App/App.xcodeproj
```

In Xcode:

- pick an iPhone simulator or your connected iPhone
- press the Run button

iOS polish included:

- custom Prism app icon
- matching launch screen artwork
- portrait-first iPhone orientation
- tighter mobile layout with a bottom-tab treatment on small screens
- Capacitor camera, share, haptics, and push-notification plugins synced into Xcode
- `UIScene` lifecycle support
- app privacy manifest file at `ios/App/App/PrivacyInfo.xcprivacy`

Note:

- this machine currently has Apple Command Line Tools active, not the full Xcode app in the shell
- if `open` does not launch Xcode cleanly, install/open Xcode once and then open `ios/App/App.xcodeproj` manually

## Where data lives

- Database: `data/snapdesk.db`
- Uploads: `uploads/`
- Backend: `server/index.js`
- Frontend: `src/App.jsx`

## App Store handoff

Before uploading to TestFlight or the App Store:

- make sure `APP_ORIGIN` points at your live HTTPS Prism site
- build the bundled iOS app with `VITE_API_ORIGIN` set to that same HTTPS URL
- archive the app in Xcode using the `Release` configuration
- upload the archive from Xcode Organizer to App Store Connect
- complete the App Store Connect privacy questionnaire to match your real production data practices

Full release instructions:

- [APP_STORE_RELEASE.md](/Users/parkergriffith/Documents/New%20project/APP_STORE_RELEASE.md)
