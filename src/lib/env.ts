/**
 * Where the API is, as the browser reaches it.
 *
 * The browser calls the API directly, with the session cookie: the API answers
 * credentialed CORS for this app's origin and no other (its `APP_URL`). In
 * production both sit under one site (app.… and api.…), so the cookie is
 * same-site.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9999";
