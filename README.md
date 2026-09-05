# Stanza Client Portal

A client portal for Stanza Interior Design & Decoration. Clients sign in to
follow their project: progress, drawings, site photos, documents, approvals
and payments. Stanza staff sign in to the same portal and can edit.

## How it is put together

There is no server of our own. The whole app is static files served by
Vercel, talking directly to Supabase, which holds the database, the logins
and the files.

What each person may see is decided **in the database**, by row-level
security rules, against whoever is signed in — not by this code. A client
reaches a project only by having a row in `project_members`, and records
marked `internal` never leave the database for them. That means a tampered
copy of this app cannot see anything extra; it can only ask questions it
will not get answers to.

```
public/
  index.html      the page
  app.js          the whole application
  app.css         styling, light and dark
  config.js       which Supabase project to talk to  <- the only file to edit
  vendor/
    supabase.js   the Supabase client, kept here so there is no build step
vercel.json       security headers and single-page routing
```

No npm install, no build. Editing a file and re-deploying is the whole
workflow.

## Deploying

1. Push this folder to GitHub.
2. In Vercel: **Add New → Project**, pick the repository, and deploy. Leave
   every build setting empty — there is nothing to build.
3. Vercel gives the site an address ending in `.vercel.app`. A custom domain
   can be added later under **Settings → Domains**.
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** to
   the address from step 3, and add it under **Redirect URLs**. Password
   reset emails will not work until this is done.

## Adding people

Everyone needs an account before they can be given access to a project.

- **Staff**: create the account in Supabase → Authentication → Users (turn on
  *Auto Confirm User*), then set their role with `sql/02-first-admin.sql`.
- **Clients**: create the account the same way, then in the portal open
  **Project Access → Give someone access** and enter their email. They set
  their own password with *Forgot your password?* on the sign-in page.

Removing someone's access is one click in **Project Access**; it takes effect
on their next request.

## Keys

`config.js` holds the Supabase URL and the **publishable** key. Both are
meant to be public — they carry no permissions. The `service_role` key and
the database password must never appear in this repository.
