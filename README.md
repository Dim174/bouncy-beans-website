# Bouncy Beans Soft Play — Rental & Signing App

A self-hostable web app for **Bouncy Beans Soft Play** (Winnipeg) that lets the owner generate private booking links, and lets the client review & e-sign the rental agreement. On signing, the app:

1. Generates a signed PDF of the agreement (with client info, items, pricing, and signature).
2. Uploads the PDF to Google Drive.
3. Emails the client a booking confirmation with a link to the signed PDF.
4. Emails the owner a "new signed booking" notification.

**Stack**
- Frontend: vanilla HTML/JS on **GitHub Pages** at `bouncybeanswpg.ca` (custom domain via Cloudflare)
- Backend: **Cloudflare Worker** (free tier) using Cloudflare **KV** for order storage
- **EmailJS** for transactional emails (paid plan for dynamic PDF attachments)
- **Google Drive** via a service account for archiving signed PDFs

---

## Repo layout

```
/                     — GitHub Pages site root (static)
  index.html          — public landing page
  admin.html          — owner admin (password-protected)
  sign.html           — client view: review + signature pad
  success.html        — after-signing confirmation
  404.html
  CNAME               — bouncybeanswpg.ca
  assets/
    styles.css
    config.js         — frontend config (Worker URL, EmailJS public key)
    items.js          — rental catalog (edit here to change prices/items)
    agreement.js      — rental agreement text (edit here)
    admin.js          — admin page logic
    sign.js           — client sign page logic
    pdf.js            — PDF generation
worker/               — Cloudflare Worker backend (deployed separately)
  src/index.js
  wrangler.toml
  package.json
  README.md           — worker-specific setup instructions
```

---

## Setup — end to end

The app has two halves to deploy. Do them in this order.

### Part A — Deploy the Cloudflare Worker (backend)

Follow [`worker/README.md`](./worker/README.md). Steps summary:

1. `cd worker && npm install && npx wrangler login`
2. Create a KV namespace for orders (`npx wrangler kv namespace create ORDERS`) → paste IDs into `wrangler.toml`.
3. Create a Google Cloud service account with Drive API enabled, download its JSON key, and share a Drive folder with it.
4. Set secrets: `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `EMAILJS_PRIVATE_KEY`.
5. Fill `wrangler.toml` vars: `DRIVE_FOLDER_ID`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_CLIENT`, `EMAILJS_TEMPLATE_OWNER`, `EMAILJS_PUBLIC_KEY`.
6. `npx wrangler deploy` → copy the Worker URL.

### Part B — Deploy the GitHub Pages frontend

1. Create a new GitHub repo (e.g. `bouncybeans-site`) and push the contents of this folder to it.
2. In the repo → Settings → Pages → Source: `Deploy from branch`, `main` / `(root)`.
3. The `CNAME` file already maps to `bouncybeanswpg.ca`. In Cloudflare DNS, add:
   - `CNAME  @        YOUR-GH-USER.github.io`  (proxy off / "DNS only")
   - `CNAME  www      YOUR-GH-USER.github.io`  (optional)
   - If GitHub complains about the apex, add the four GitHub Pages A records to `@` instead:
     - `A @ 185.199.108.153`, `A @ 185.199.109.153`, `A @ 185.199.110.153`, `A @ 185.199.111.153`
4. In GitHub Pages settings, enable "Enforce HTTPS" (after the cert provisions, usually 10–30 minutes).
5. Edit `assets/config.js`:
   - `WORKER_URL` → the URL from step A.6 (or your custom `https://api.bouncybeanswpg.ca` if you set that up)
   - `SITE_URL` → `https://bouncybeanswpg.ca`
   - `EMAILJS_PUBLIC_KEY` → from EmailJS Account → API Keys
6. Commit + push → GitHub Pages will redeploy automatically.

### Part C — EmailJS templates

See `worker/README.md` for the full field reference. Quick version:

- Create a Gmail service in EmailJS.
- Create **Client confirmation** template. Subject: `Your Bouncy Beans booking is confirmed — {{order_id}}`. Body should reference `{{client_name}}`, `{{event_date}}`, `{{items}}`, and link to `{{pdf_link}}`.
- Create **Owner notification** template. Subject: `📩 New signed booking — {{client_name}} ({{event_date}})`.
- On each template (paid plan), add a **Dynamic Attachment** with URL `{{pdf_download_link}}` and filename `BouncyBeans_{{order_id}}.pdf`.

---

## How the owner uses the app

1. Open `https://bouncybeanswpg.ca/admin.html`.
2. Enter the admin password.
3. Fill in client info + event details, select items, set delivery fee if any.
4. Click **Generate link for client** → copy the resulting URL.
5. Send the URL to the client via text or email.
6. When the client signs, the owner gets a notification email and the signed PDF appears in the configured Google Drive folder.

## What the client sees

1. Opens the unique link → sees the full booking summary, pricing, and agreement.
2. Checks the agreement box, signs on the signature pad.
3. Clicks **Sign & confirm** → signed PDF is generated in-browser, uploaded via the Worker, archived to Drive, and emailed to them.

---

## Editing items or wording

- **Add / remove / re-price an item**: edit `assets/items.js`. IDs must stay unique and URL-safe because they're stored on orders.
- **Change agreement wording**: edit `assets/agreement.js`. Both the on-screen agreement and the PDF pull from this file.
- **Business contact / deposit amount / currency label**: `assets/config.js` (and `worker/wrangler.toml` for backend-side business name and owner email).

## Security notes

- The admin password is verified server-side by the Worker. Frontend only receives a short-lived HMAC-signed token (8h expiry).
- Google service account credentials live only as Worker Secrets (encrypted, never in source).
- EmailJS private key is only used server-side in the Worker.
- Signed PDFs are shared as "anyone with link can view" on Drive. If you prefer private, remove the permissions block in `worker/src/index.js` (`POST /permissions`) — but then EmailJS dynamic attachments won't work and the PDF link in emails will be owner-only.
- KV orders auto-expire: 90 days before signing, 365 days after signing.

## Common issues

- **Client gets "We couldn't find this booking"** → order ID doesn't exist in KV. Check the link hasn't been modified, or generate a new one.
- **Email doesn't arrive** → check spam; check EmailJS logs in its dashboard; check Worker logs via `npx wrangler tail`.
- **PDF doesn't attach** → EmailJS free plan doesn't support dynamic attachments — the email still contains the Drive link. Upgrade the EmailJS plan to attach the file itself.
- **CORS errors** → `ALLOWED_ORIGIN` in `wrangler.toml` must exactly match the site origin, including `https://`.

## Local development

Serve the static site:

```bash
cd "bouncy beans rental form agreement"
python3 -m http.server 5173
```

In another terminal, run the Worker locally:

```bash
cd worker
npx wrangler dev
```

Temporarily set `WORKER_URL` in `assets/config.js` to `http://127.0.0.1:8787` while testing.

---

© Bouncy Beans Soft Play · bouncybeanswpg.ca
