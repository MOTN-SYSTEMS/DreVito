# Drevito

Static Drevito website served by a small Node.js server with a protected admin area.

## Run locally

Set the Google OAuth credentials, allowed admin email, and session secret before starting:

```sh
export GOOGLE_CLIENT_ID="your-google-oauth-client-id"
export GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
export GOOGLE_ALLOWED_EMAIL="client-admin@example.com"
export SESSION_SECRET="replace-with-a-long-random-secret"
export PUBLIC_URL="http://localhost:8000"
npm start
```

The public site runs at `http://localhost:8000/`.
The admin login runs at `http://localhost:8000/admin/login`.
The media manager runs at `http://localhost:8000/admin/media` after login.
The site content manager runs at `http://localhost:8000/admin/site-content` after login.
The product category manager runs at `http://localhost:8000/admin/product-categories` after login.
The product filter manager runs at `http://localhost:8000/admin/product-filters` after login.
The product manager runs at `http://localhost:8000/admin/products` after login.
The blog category manager runs at `http://localhost:8000/admin/blog-categories` after login.
The blog post manager runs at `http://localhost:8000/admin/blog-posts` after login.
The public CMS payload is available at `http://localhost:8000/api/public-content?locale=cs`.

## Google admin access

The site is configured for one client admin Google account. Create a Google OAuth web application client and add this authorized redirect URI:

- `http://localhost:8000/admin/oauth/google/callback` for local development
- `https://your-domain.example/admin/oauth/google/callback` for production

Admin access is read from environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ALLOWED_EMAIL`
- `SESSION_SECRET`
- `PUBLIC_URL` optional locally, recommended in production
- `PORT` optional, defaults to `8000`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` for server-side CMS writes

Admin routes under `/admin` are protected by Google OAuth and a signed HTTP-only session cookie. Sessions expire after 12 hours.

## Admin product categories

The protected category manager lets the client list, create, edit, show/hide, sort, and archive product categories. Category records are saved through server-side Supabase REST calls using `SUPABASE_SERVICE_ROLE_KEY`; that key is never exposed to browser code.

Apply these Supabase migrations before using product/category admin:

- `supabase/migrations/20260708153000_create_content_model.sql`
- `supabase/migrations/20260708170000_add_product_category_admin_fields.sql`
- `supabase/migrations/20260708183000_add_product_admin_archive.sql`
- `supabase/migrations/20260708190000_add_blog_category_admin_fields.sql`
- `supabase/migrations/20260713193000_add_product_category_parent.sql`
- `supabase/migrations/20260715164603_add_product_taxonomy_and_filters.sql`
- `supabase/migrations/20260715170711_add_custom_product_filters.sql`

Category images accept a URL/media reference shape. When a `media_id` points at a public `media` row, public rendering resolves the Supabase `media.public_url`.

## Admin products

The protected product manager lets the client list, create, edit, show/hide, publish/unpublish, sort, archive, and restore products. Products can be assigned to multiple parent/subcategories, store a CZK price, and expose filters for wood type, availability, and interior/exterior use. Ordered photo metadata is saved in `products.photos`. Product actions remain on Dřevito and use direct enquiry instead of linking to third-party shops.

The optional “Příběh výrobku” editor reuses `products.description`. Both public product renderers show this supporting section only when that field contains text; clearing it saves an empty value and removes the entire section. Stories never fall back to short descriptions or shared default copy. Existing product-specific descriptions are preserved.

The optional “Rozměry” inputs store height, width and length independently in `products.height_cm`, `products.width_cm` and `products.length_cm`, in centimetres. Empty inputs clear only that value; omitted fields from older clients preserve existing dimensions. Existing descriptions are never parsed or changed. Dimensions remain CMS-only until a public specifications area is agreed.

Product photos support upload or manual URL/media references. With Supabase configured, uploaded product photos go to the `product-images` Storage bucket, are saved in the `media` table, and are added to the product form as ordered JSON. Without Supabase credentials, uploads fall back to `uploads/products/...` and `.data/media-db.json`.

The custom product filter manager lets the client create filter groups (for example `Styl`) and their selectable values (for example `Rustikální`). Visible custom filters are rendered automatically on the public catalog and can be assigned to products in the product editor.

## Admin blog categories

The protected blog category manager lets the client list, create, edit, show/hide, sort, archive, and restore blog categories. Blog category records are saved through server-side Supabase REST calls using `SUPABASE_SERVICE_ROLE_KEY`; that key is never exposed to browser code.

Apply `supabase/migrations/20260708190000_add_blog_category_admin_fields.sql` before using blog category admin. It adds optional image metadata, safe archive state, public RLS filtering for archived categories, and starter categories for Craft, Place, Author, Philosophy, Products, and News.

Blog category images accept a URL/media reference shape. When a `media_id` points at a public `media` row, public rendering resolves the Supabase `media.public_url`.

## Admin blog posts

The protected blog post manager lets the client list, create, edit, publish, unpublish, archive, and restore blog posts. Posts can be assigned to multiple blog categories and save ordered photo metadata in `blog_posts.photos`.

Blog post photos support upload or manual URL/media references. With Supabase configured, uploaded blog photos go to the `blog-images` Storage bucket, are saved in the `media` table, and are added to the blog post form as ordered JSON. Without Supabase credentials, uploads fall back to `uploads/blog_posts/...` and `.data/media-db.json`.

## Admin site content

The protected site content manager lets the client list, create, edit, publish, unpublish, archive, and restore general website content in `site_content`. It supports text, rich text/HTML, image, gallery, link, and JSON values, with quick presets for homepage hero, about, craft/philosophy, contact, gallery, products intro, and blog intro sections.

Site-content images support upload or manual URL/media references. With Supabase configured, uploaded site images go to the `site-media` Storage bucket, are saved in the `media` table, and can be saved into `site_content.value`. Without Supabase credentials, uploads fall back to `uploads/site_sections/...` and `.data/media-db.json`.

## Public CMS content

The homepage loads `/api/public-content?locale=cs` and replaces fallback content when Supabase is configured. The endpoint is read-only, server-side, and filters out drafts, hidden records, archived records, and future-dated content before returning products, product categories, blog posts, blog categories, and `site_content`.

Product and blog category filters are generated from visible public categories. Parent product categories include products assigned to their child categories, while every category and subcategory has a direct `/vyrobky/...` address. Product filters cover wood type, availability, interior/exterior use, and price range. Product details and blog posts open in in-page detail sections. Images resolve `media_id` references to public `media.public_url` values when available, while direct `url` values remain supported for static and local fallback content.

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the endpoint returns `configured:false` and the homepage keeps the static fallback product list.

## Admin media uploads

The admin media manager lets the client upload, preview, replace, and delete photos for:

- homepage/site sections
- product galleries with multiple photos
- blog post galleries with multiple photos

With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured, uploads use Supabase Storage and the `media` table:

- site section images: `site-media`
- product images: `product-images`
- blog images: `blog-images`

These buckets must be public, or have equivalent public read policies, because public image URLs are rendered on the homepage. Target assignments for `/api/media-targets` are stored in `media.metadata` and reconstructed server-side. Public URLs are generated from Supabase Storage, and the service role key is only used by `server.js`.

Without Supabase credentials, the same admin UI falls back to local storage: uploaded files are written to `uploads/`, and image metadata/target assignments are saved in `.data/media-db.json`. Public image URLs use the `/uploads/...` path and are exposed through `/api/media-targets` so the static homepage can apply replacements for section and product images.

Both `uploads/` and `.data/` are ignored by Git because they are runtime fallback content. Back them up before replacing a local development server.

## Supabase content database

The editable content schema lives in `supabase/migrations/20260708153000_create_content_model.sql`.
It defines tables for users, site content, media, products, product categories, blog posts, blog categories, and their category link tables.

Read `docs/database-content-model.md` for the model, publication rules, and RLS/access assumptions.

## CMS build plan

The step-by-step CMS implementation and future chat handoff prompts live in `docs/cms-work-plan.md`.
