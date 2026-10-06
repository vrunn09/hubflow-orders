# Live Gmail order capture + full-control admin panel

## Important change to the request (security)
We will **not** store or use restaurants' Gmail passwords or platform passwords. Google blocks password logins from apps, and storing passwords is unsafe. Instead:

- **Gmail:** each restaurant clicks **"Connect Google Account"** and approves read-only access in Google's own sign-in window. They never type a password into our app. Orders that land in their inbox show up on their board automatically.
- **Zomato / Swiggy / IRCTC etc.:** most of these platforms already send an order-confirmation email. Once Gmail is connected, those emails are read and turned into orders. A direct platform link (webhook) stays available for any platform that offers one.

## Part 1 — Live Gmail
1. A one-time Google sign-in app gets set up for your workspace. A setup card will appear in chat for this (you'll need a Google Cloud account; the card explains each step).
2. Order Sources → Gmail: "Connect Google Account" opens a Google popup. After approval the card shows the connected email, status, last sync, and Sync Now / Reconnect / Disconnect.
3. **Automatic checking:** the app checks every connected inbox for new order emails every few minutes, without anyone having the app open, and whenever someone opens the dashboard or presses Sync Now.
4. **Email filters per restaurant:** choose which senders count as orders (for example noreply@zomato.com or orders@railfeasto.com), with ready-made presets for each platform.
5. **Reading the email:** each platform gets its own email reader that pulls out the order ID, customer, items, train, station, coach and seat. If an email can't be read, it is kept and shown under "Needs review" with the original email, so no order is lost. Duplicates are blocked by message ID and platform order ID.
6. New orders appear instantly on the dashboard and kitchen screen, with a sound and a notification.

## Part 2 — Full-control admin panel (platform owner)
You become the platform admin (I'll need your email after you sign up).

- **Overview:** all restaurants, orders, revenue, connection health and failed imports across the platform.
- **Restaurants:** search, view details, edit any field, suspend or reactivate, and "view as restaurant" to open that restaurant's dashboard, orders, kitchen and sources.
- **Users:** every user and their role in every restaurant. Change roles, deactivate users, add or remove other admins.
- **Orders:** every order across all restaurants, with filters. Open any order and change its status, cancel it or fix its details. Every admin change is recorded in the audit log.
- **Integrations:** every connected Gmail and platform source, with health, last sync and errors. Force a sync, pause, or disconnect.
- **Failed imports:** see unreadable emails or payloads, retry them, or turn them into orders by hand.
- **Platform settings (no code needed):**
  - turn each platform on or off for all restaurants
  - email sender presets per platform
  - how often inboxes are checked
  - default commission (kept at 0 for now)
  - maintenance banner text
  - turn new restaurant sign-ups on or off
- **Audit logs:** every change, by whom and when, with filters.

## Technical details
- Gmail uses the Gmail App User Connector (`google_mail`) with the `gmail.readonly` scope. Each restaurant's connection key is stored encrypted (AES-GCM) in a server-only `app_user_connections` table, keyed by restaurant and user. Only the encrypted connection key is stored — never a password or a Google token.
- New `gmail_sync_state` table stores each source's last history ID and message ID, so each message is processed only once.
- Inbox polling: a `/api/public/hooks/gmail-poll` route protected by the cron secret, called by a pg_cron job (every 5 minutes, about 288 runs a day). It lists new messages through the gateway and passes each one through `ingestOrder`, the same order pipeline every source uses.
- Gmail connector `normalize` gets a separate email reader per platform (RailFeasto, Zomato, Swiggy, IRCTC, generic), chosen by sender.
- New `platform_settings` table (admin-only write) and `restaurants.suspended` flag; RLS blocks a suspended restaurant's staff from writing.
- Admin actions are new server functions that check `is_platform_admin()` before using the admin client, and each one writes to `audit_logs`.
- "View as restaurant": admin opens a restaurant through a temporary tenant override, read and write still enforced server-side.
- A one-time database step makes your account the platform admin once you share your email.

## What I need from you
1. Approve the Gmail setup card when it appears (Google sign-in app setup).
2. Your admin email after you sign up.
