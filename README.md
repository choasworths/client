# Leaf Client Website Clone

A complete, pixel-perfect clone of [Leaf Client](https://leafclient.com/) with all interactive features, screenshots, responsive styles, 3D cosmetics viewer, and assets.

## Deployment on Netlify

### Option 1: Drag & Drop (Zero Setup)
1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. Drag and drop this extracted folder (or the zip file).
3. Netlify will deploy it immediately.

### Option 2: Netlify CLI
Run the following in the project root:
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### Option 3: Git Repository
1. Push this folder to a GitHub / GitLab repository.
2. In Netlify, click **Add new site** -> **Import an existing project**.
3. Select the repository:
   - **Build command:** (leave empty)
   - **Publish directory:** `.` (or leave default root)

---

## Local Development
To run locally:
```bash
npm start
```
or:
```bash
node server.mjs
```
The site will be live at `http://localhost:3000`.

## Project Structure
- `index.html` – Home page
- `download/` – Download page
- `docs/` – Documentation
- `store/` – Cosmetics Store
- `leaderboard/` – Player leaderboard
- `status/` – Status page
- `privacy/`, `terms/`, `contact/`, `partnerships/` – Auxiliary pages
- `assets/` – Images, fonts (Sora), WebP screenshots, SVG icons
- `style.css` – Full CSS design system and responsive styles
- `script.js` – Interactive gallery tabs, comparison slider, download dialog
- `account.js`, `status-banner.js`, `bbmodelRenderer.js`, `cosmeticRenderer.js`
- `netlify.toml` – Netlify deployment and caching configuration
