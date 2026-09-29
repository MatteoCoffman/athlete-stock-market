# Native mobile builds (EAS + TestFlight / Play)

Ship installable Android and iOS apps that talk to the shared API (`https://jockex.dev`) **without** Metro or Expo Go on your laptop.

Web remains on Vercel — see [DEPLOY.md](DEPLOY.md).

## Account checklist

| Account | Needed for | Cost | Link |
|---------|------------|------|------|
| **Expo** | EAS Build / Submit | Free tier available | https://expo.dev |
| **Apple Developer** | Device IPA + TestFlight | $99/yr | https://developer.apple.com/programs/ |
| **Google Play Console** | Play Internal Testing | $25 one-time | https://play.google.com/console |

Android **preview APK** install links work before Play Console is fully set up. iOS device installs require an active Apple Developer membership.

## One-time setup

```bash
cd apps/mobile
npm install
# or: ./scripts/eas-bootstrap.sh   (login → init → build:configure)
npx eas login          # opens browser → Expo account (required before init/build)
npx eas init           # link project → writes projectId into app.json
npx eas build:configure
```

If `eas login` hangs, open the printed URL manually, finish auth, and confirm `npx eas whoami` shows your username.

Use **EAS-managed** credentials when prompted (recommended).

App IDs (already in `app.json`):

- iOS bundle: `com.jockexchange.app`
- Android package: `com.jockexchange.app`

## Environment

Native builds bake the API URL from [`eas.json`](../apps/mobile/eas.json) (`EXPO_PUBLIC_API_URL=https://jockex.dev`).

Local `.env` is **not** used by EAS cloud builds. Change the URL in both `preview` and `production` profiles if the tunnel host changes.

For CI or non-interactive agents, create an access token at https://expo.dev/settings/access-tokens and export `EXPO_TOKEN` before `eas` commands.

## Build profiles

| Profile | Use | Android artifact | iOS |
|---------|-----|------------------|-----|
| `preview` | Internal testers / sideload | APK + install page | Internal distribution |
| `production` | Store + TestFlight | AAB | App Store IPA |

### Commands

```bash
cd apps/mobile

# Internal Android APK (share the Expo build page / QR)
npm run eas:build:android

# Internal iOS (ad hoc / internal; prefer production + TestFlight for teammates)
npm run eas:build:ios

# Store-ready
npm run eas:build:prod:android
npm run eas:build:prod:ios
```

Or: `npx eas build --platform all --profile production`

## iOS → TestFlight

1. Finish Apple Developer enrollment; create the app in [App Store Connect](https://appstoreconnect.apple.com) with bundle id `com.jockexchange.app` (EAS can create it on first submit).
2. Build: `npm run eas:build:prod:ios`
3. Submit: `npm run eas:submit:ios` (or `npx eas submit -p ios --latest`)
4. In App Store Connect → TestFlight: wait for processing, add internal testers, send invites.

Testers install **TestFlight** from the App Store, then open the invite — no Metro required.

## Android → Play Internal Testing

1. Finish Play Console registration; create application with package `com.jockexchange.app`.
2. Create an **Internal testing** track (Testing → Internal testing → Create track).
3. **Google Play API service account** (required for `eas submit`):

   1. In Play Console → Setup → API access → link a Google Cloud project.
   2. Create a service account with **Release to production, exclude devices, and use Play App Signing** (or the “Admin” / release permission used for uploads).
   3. Invite that service account in Play Console → Users and permissions.
   4. Create a JSON key; store it **outside the repo** (e.g. `~/secrets/jock-play-api.json`).
   5. On first submit, EAS will ask for the path; or set:

   ```bash
   # optional: remember for this machine
   export GOOGLE_SERVICE_ACCOUNT_KEY_PATH="$HOME/secrets/jock-play-api.json"
   ```

4. Build + submit:

```bash
npm run eas:build:prod:android
npm run eas:submit:android
```

5. Add tester emails under Internal testing → Testers; share the Play opt-in link.

Until Play is ready, use the **preview APK** link from `npm run eas:build:android` (enable “install unknown apps” for that source on the device).

## Submit checklist (when accounts are ready)

| Step | iOS | Android |
|------|-----|---------|
| Developer account active | Apple Developer | Play Console |
| App created | App Store Connect, bundle `com.jockexchange.app` | Play app, package `com.jockexchange.app` |
| Signing | EAS-managed (default) | EAS-managed + Play App Signing |
| Build | `npm run eas:build:prod:ios` | `npm run eas:build:prod:android` |
| Upload | `npm run eas:submit:ios` | `npm run eas:submit:android` |
| Testers | TestFlight → Internal | Internal testing → Testers |

Credentials are managed by EAS (`npx eas credentials`). Do not commit `.p8`, `.p12`, or Play JSON keys.

## Verify

1. Install the build with Metro stopped.
2. Sign up / log in.
3. Confirm Search and player charts load (bots on `jockex.dev`).
4. If requests fail, confirm the build used `eas.json` env (rebuild after changing the URL).

## Assets

Placeholder icons live in `apps/mobile/assets/` (navy + orange). Replace `icon.png`, `adaptive-icon.png`, and `splash-icon.png` before a public store listing.

## Related

- Shared API + Vercel web: [DEPLOY.md](DEPLOY.md)
- Local Expo Go / Metro: root [README.md](../README.md)
