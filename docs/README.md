# Website preview

The static website is served from this directory. Its hero embeds preview.html,
which renders the app's shared CompactPill component with sample usage and
browser-only customization state.

After changing the pill component, its styles, or src/site, run:

    npm run build:site

Commit the generated site-assets/preview.js and site-assets/preview.css with
the source changes so static hosting needs no build step.

Run node scripts/check-site.mjs to check responsive layouts and customization
combinations using installed Microsoft Edge. Screenshots go to test-results/.

The site build also versions asset URLs from their contents to prevent stale
stylesheets or preview files after deployment. Run node scripts/check-site-cache.mjs
to verify desktop placement with the legacy stylesheet cached.
