# Mimohflorist & Gift Shop — Website + Admin Panel

## What's in here
- `index.html` — the public website (customers browse products, add to cart, checkout via WhatsApp)
- `admin.html` — the admin panel (login, add/edit/delete products, upload photos, set prices & details)
- `css/style.css` — shared site styling
- `css/admin.css` — admin panel styling
- `js/config.js` — **your Supabase credentials go here**
- `js/app.js` — public site logic
- `js/admin.js` — admin panel logic
- `supabase-setup.sql` — run this once in Supabase to create the database + storage bucket

## Setup (do this once)

### 1. Run the SQL setup
In your Supabase project: **SQL Editor → New query** → paste the contents of `supabase-setup.sql` → **Run**.

This creates:
- a `products` table (name, description, price, category, image, in stock, featured)
- security rules so anyone can *view* products, but only a logged-in admin can add/edit/delete
- a `product-images` storage bucket for photo uploads

### 2. Create the admin login
In Supabase: **Authentication → Users → Add user**. Set an email and password — these are what your client will use to log in at `admin.html`. (Don't create the user via SQL — use this screen so the password is stored securely.)

### 3. Add your Supabase credentials
Open `js/config.js` and fill in:
```js
SUPABASE_URL: "https://xxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
```
Both values are in **Project Settings → API** in Supabase. The anon key is safe to use here — it only allows what the SQL policies permit (public read, admin-only write).

If you're deploying on Vercel and prefer to inject these from environment variables at build time instead of hardcoding them in `config.js`, let me know and I'll set up a small build step for that.

### 4. Deploy
Upload/push this whole folder (keeping the `css/` and `js/` folders intact) to your host — Vercel, Netlify, GitHub Pages, etc. No build step is required as-is.

## Using the admin panel
1. Go to `yoursite.com/admin.html`
2. Log in with the email/password created in step 2
3. **Add product** → upload a photo, set name, description, price (KES), category, stock status, and whether it's featured
4. Changes appear on the live site immediately — no redeploy needed

## How orders work
Customers add items to their cart on the site. At checkout, a message listing their items, quantities and total is generated and opened in WhatsApp addressed to **+254 782 403253**, ready for them to send.

## Notes
- Categories on the public site filter bar are generated automatically from whatever categories you type in the admin panel — no need to predefine them.
- Marking a product "Out of stock" keeps it visible on the site but disables adding it to cart.
- "Featured" adds a gold badge to the product card.
