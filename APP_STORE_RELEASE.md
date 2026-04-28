# Prism Release Guide

This project is now set up for a practical launch path:

1. Deploy Prism to Render over HTTPS.
2. Point the iOS app at that live HTTPS backend for TestFlight/App Store builds.
3. Archive and upload from Xcode.

## 1. Deploy Prism on Render

Prism includes a Render blueprint at `render.yaml`.

Render references:
- [Web Services](https://render.com/docs/web-services)
- [Render Docs](https://render.com/docs)

### Recommended setup

- Service type: Web Service
- Runtime: Node
- Persistent disk: enabled
- Health check path: `/api/health`

### Why Render fits this app

- Prism uses SQLite and local uploads right now.
- Render web services support persistent disks.
- The included `render.yaml` mounts a 5 GB disk at `/var/data/prism`.

### Steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Confirm these environment variables:
   - `APP_ORIGIN=https://your-render-or-custom-domain`
   - `SPOTIFY_CLIENT_ID=...` if you want Spotify notes
   - `DATA_DIR=/var/data/prism/data`
   - `UPLOADS_DIR=/var/data/prism/uploads`
4. Let Render build and deploy.
5. Open `https://your-domain/api/health` and confirm it returns `{"ok":true}`.
6. Open the main site and create a test account.

### Domain recommendation

Use one HTTPS domain for both frontend and API, for example:

- `https://prism.your-domain.com`

That keeps cookies and uploads simpler and matches the current server design.

## 2. Prepare the iOS build for TestFlight/App Store

For App Store builds, do not point Capacitor at a local computer IP.

Recommended model:

- Keep the iOS frontend bundled inside the app.
- Point the bundled app’s API calls at your live HTTPS Prism site with `VITE_API_ORIGIN`.

### Build the iOS app against production

From the project root:

```bash
VITE_API_ORIGIN="https://prism.your-domain.com" \
env PATH="$PWD/.local/node/bin:$PATH" \
./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js run build
```

Then sync iOS:

```bash
env PATH="$PWD/.local/node/bin:$PATH" \
./.local/node/bin/node ./.local/node/lib/node_modules/npm/bin/npm-cli.js exec cap sync ios
```

Important:

- Leave `CAP_SERVER_URL` unset for the App Store build.
- That keeps the app using the bundled frontend instead of acting like a remote web wrapper.

## 3. Upload to TestFlight / App Store Connect

Apple references:
- [Preparing your app for distribution](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution/)
- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)

### In Xcode

1. Open `ios/App/App.xcodeproj`.
2. Select the `App` target.
3. Set your real Team under Signing & Capabilities.
4. Replace `com.prism.social` if you want a different bundle ID.
5. Increment:
   - `MARKETING_VERSION` for a new version, for example `1.0.1`
   - `CURRENT_PROJECT_VERSION` for each upload, for example `2`
6. Choose `Any iOS Device (arm64)` or a generic iPhone device.
7. Use `Product > Archive`.
8. In Organizer, click `Distribute App`.
9. Choose `TestFlight & App Store`.
10. Upload the build.

### After upload

In App Store Connect:

1. Create the `Prism` app record if it does not exist yet.
2. Add:
   - app name
   - subtitle
   - category
   - screenshots
   - app icon
   - privacy policy URL
   - support URL
3. Add the uploaded build to TestFlight.
4. Start with internal testing.
5. When stable, move to external testing or App Review.

## 4. Privacy answers for Prism

Apple references:
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [Adding a privacy manifest](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [Third-party SDK privacy manifest requirements](https://developer.apple.com/support/third-party-SDK-requirements/)

Prism already includes an app privacy manifest file:

- `ios/App/App/PrivacyInfo.xcprivacy`

That file does not replace the App Store Connect privacy questionnaire. You still need to answer App Store Connect with your real production behavior.

### Prism’s current likely App Privacy answers

Based on the current codebase, Prism currently handles:

- Name
- User handle / username
- User-generated content:
  - posts
  - stories
  - snaps
  - messages
  - notes
  - profile bio
- Photos selected or captured for upload
- Potential push token if you enable production push notifications later

### Practical starting answers

If you ship Prism as it exists now, your App Store privacy questionnaire will likely include some combination of:

- `Contact Info`
  - Name
- `User Content`
  - Photos or videos
  - Customer support or other user content equivalents do not appear necessary right now
  - Messages
- `Identifiers`
  - User ID / account handle

### Data linked to the user

Most Prism data is linked to the user account:

- posts
- messages
- snaps
- stories
- profile info
- likes / follows / saved posts

### Tracking

Current code does not implement third-party ad tracking.

Recommended answer right now:

- Tracking: `No`

### Sensitive data

Prism does not appear to collect:

- health data
- financial info
- precise location
- contacts
- browsing history

unless you add those features later.

## 5. What still needs your decision

Before actual submission, you still need to choose:

- the final production domain
- the final bundle ID
- the final App Store screenshots and marketing copy
- whether Spotify notes ship in v1
- whether push notifications ship in v1

## 6. Strong recommendation before public launch

Prism can go online now, but the backend is still using local SQLite and local uploaded files.

That is okay for an early launch or private beta on Render with a disk.

Before a larger public launch, I recommend:

1. move auth/session storage to something more production-scalable
2. move uploads to object storage
3. move the database from SQLite to Postgres
4. add password reset, account deletion, and moderation tooling
