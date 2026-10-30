# Crumbz iOS app

Crumbz is moving from a web app to an iPhone-only native app. The Firebase
backend (Firestore, Auth, Storage, Cloud Functions, rules) stays as it is.
The web app stays live in the meantime; there is no shutdown date yet.
This replaces the earlier React rewrite and Capacitor ideas.

## Decisions (2026-10-30)

- **Stack:** Expo (React Native) with TypeScript and Expo Router, SDK 58.
- **Location:** `app/` in this repo. `functions/`, `firestore.rules` and
  `storage.rules` stay at the root.
- **Bundle ID:** `uk.co.ohcrumbz.crumbz`. Display name: Crumbz. iPhone only
  (`supportsTablet: false`). The bundle ID is permanent once the app is live.
- **Firebase:** the JS SDK against project `crumb-ddeb6`, not the native SDK.
  Auth persists in AsyncStorage. Functions region is `europe-west2`.
- **Writes go through Cloud Functions.** Reviews, reservations, roles and
  moderation are callables; the rules block direct client writes. The app
  must reuse the same callables (see `src/services/*.js` in the web app).
- **Admin** moves into the app later; it is not in the scaffold.
- **Distribution:** EAS Build and TestFlight. Ed is the device tester.
- **Sign-in:** email and password only for now. Google needs an iOS OAuth
  client and a `GoogleService-Info.plist` from the Firebase console (never
  committed, it is in `app/.gitignore`). Sign in with Apple will probably be
  required alongside it. Check Apple's current rules at the time.
- **Account deletion** inside the app, a privacy policy URL, and reporting and
  blocking for user-generated content are likely App Store requirements. Check
  before first submission.

## What the scaffold contains

Five placeholder tabs (Discover, Bakeries, Explore, Leaderboard, Profile), the
Crumbz palette, email sign-in on Profile, and one read-only Firestore list
(latest reviews) on Discover. It makes zero production writes.

## Working on it

```bash
cd app
npm ci
npm run lint && npm run typecheck && npm test
npx expo start        # then open in Expo Go or a dev build
```

Use `npx expo install <pkg>` for new native packages so versions match the SDK.

## First build (one-off, by Ed)

1. Create the Expo account/project and an access token; add it to the GitHub
   repo secrets as `EXPO_TOKEN`.
2. In a Codespace: `cd app && npx eas-cli init`, then
   `npx eas-cli build --platform ios --profile production --auto-submit`.
   The existing Apple Developer account is used; EAS can register the bundle ID.
3. Install from TestFlight.

## Placeholders to replace

- `app/assets/icon.png` and `splash-icon.png` are generated from the 266px web
  logo and will look soft. Supply a proper 1024x1024 icon.
- `appId` in `app/src/lib/firebase.ts` is the web app id until an iOS app is
  registered in the Firebase console.

## Known follow-ups

- `deploy.yml` and `e2e.yml` have no path filter, so merges touching only
  `app/` still redeploy the web site and run web E2E. Add `paths-ignore:
  app/**` in a separate small PR (production workflow, needs Ed's approval).
- Native Google sign-in, Sign in with Apple, maps, camera and photo picker,
  push notifications.
