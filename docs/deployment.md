# Deployment

What the staff app needs to run online. What the API needs is in brixa-api's `docs/deployment.md`.

## 1. The app and the API on one site

The app and the API must be two hosts under **one registrable domain**, for example `app.<domain>` and `api.<domain>`, and both must use **HTTPS**.

**Why**
- **The browser calls the API directly, with the session cookie.** Better Auth sets that cookie on the API's host, as `SameSite=Lax`. A browser keeps it, and sends it back, only when the page calling the API is on the same site as the API.
- **The API serves its files to its own site only.** It sends `Cross-Origin-Resource-Policy: same-site`. A document's PDF opened from the app is one such file.
- **The API refuses plain HTTP in production.** `APP_URL` and `BETTER_AUTH_URL` must both be HTTPS.

**What goes wrong otherwise:** on two sites, sign-in fails without saying so. The API accepts the email and password and answers 200, but the browser throws the cookie away. The person is left on the sign-in page with no message. Two platforms' default addresses, such as `….vercel.app` for the app and `….run.app` for the API, are two sites. Give both services addresses under the hospital's or the product's own domain.

## 2. Settings

| Where | Setting | Value |
|---|---|---|
| App, when it is built | `NEXT_PUBLIC_API_URL` | The API's HTTPS origin, such as `https://api.<domain>`. It is built into the app's code, so changing it means building again |
| API | `APP_URL` | The app's exact origin, such as `https://app.<domain>`. The API's CORS and Better Auth trust this origin and no other, and links in emails point to it |
| API | `BETTER_AUTH_URL` | The API's own HTTPS URL |

## 3. Checking it on this machine

Use this before a first deployment, or after changing anything about cookies, CORS or hosts. The browser sends any `*.localhost` name to this machine, so two hostnames need no set-up. Run it beside the usual servers, with the API seeded:

```sh
# brixa-api: a second API for the two hostnames, on 9998
PORT=9998 APP_URL=http://app.brixa.localhost:3001 BETTER_AUTH_URL=http://api.brixa.localhost:9998 pnpm exec tsx src/index.ts

# brixa-web: a production build that calls it, on 3001
NEXT_PUBLIC_API_URL=http://api.brixa.localhost:9998 pnpm build
pnpm start -p 3001

# brixa-web: the flows, across the two hostnames
APP_URL=http://app.brixa.localhost:3001 NEXT_PUBLIC_API_URL=http://api.brixa.localhost:9998 pnpm flows
```

A production build is used because `next dev` adds cross-origin checks of its own. The usual dev servers on 3000 and 9999 can keep running.

**Result on 2026-11-18**
- **The same site** (`app.brixa.localhost` and `api.brixa.localhost`): the sign-in and picker flows passed.
- **Two sites** (the same app, with the API at `api.elsewhere.localhost`): sign-in answered 200, but the browser kept no session cookie, and the page stayed on sign-in with no message. This is the failure §1 describes.

**What this cannot check:** it runs on plain HTTP, so secure cookies and HTTPS enforcement (HSTS) are left for staging.
