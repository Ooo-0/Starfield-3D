# Starfield 3D

An immersive full-screen 3D starfield page. It starts in darkness, slowly reveals stars, hides the system cursor, and shows a small glowing point that follows the mouse while the camera gently explores the scene.

## Features

- Full-screen Three.js/WebGL particle starfield
- About half a second of black before stars appear
- Gradual star reveal from darkness
- Mouse-following glow point
- Slow camera parallax driven by mouse movement
- Hidden system cursor and no visible UI controls
- Local Three.js files included, no CDN required
- Responsive desktop and mobile rendering

## Run Locally

```bash
npm run start
```

Then open:

```text
http://127.0.0.1:8765/
```

You can also run any static server from this folder.

## Files

- `index.html` - Page shell and canvas host
- `styles.css` - Full-screen black stage, hidden cursor, pointer glow, vignette
- `main.js` - Three.js scene, particles, mouse parallax, star reveal
- `vendor/` - Local Three.js runtime files
- `.github/workflows/pages.yml` - GitHub Pages deployment workflow

## Deployment

This repository is ready for GitHub Pages. After pushing to GitHub, enable GitHub Pages with GitHub Actions as the source, or let the included workflow publish the static site automatically.
