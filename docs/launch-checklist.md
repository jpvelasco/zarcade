# Launch checklist

Zarcade is public and runs on GitHub Pages at
`https://jpvelasco.github.io/zarcade/`. Nothing needs to change in the games
themselves: every link is relative, so the arcade works from a sub-path such
as GitHub Pages.

## Already done

- [x] No secrets in the files or the git history.
- [x] Every page loads with no console errors on desktop and phone (all games
      plus the arcade, checked headless on 2026-10-10).
- [x] Arcade page scores 100 on Lighthouse accessibility, best practices and
      SEO.
- [x] Every page has a language, viewport, title, description and favicon
      (`arcade/tests/arcade.test.js` checks this).
- [x] Telemetry sends nothing by default, and a link's `?otlp=` can only point
      at the site itself or a local collector.
- [x] MIT `LICENSE`; vendored three.js keeps its own license.
- [x] New commits use the GitHub noreply address. History was squashed to a
      single `initial commit` before going public (2026-10-18), so no older
      author identities remain in the repo.
- [x] Link preview card: `docs/assets/social-preview.png` (1200×630, built
      from `docs/assets/social-preview.html`) and the Open Graph / Twitter tags
      in `index.html`.

## To do at launch

Done on 2026-10-18: the repository is public, GitHub Pages is deployed from
`main` at `/`, both `{{SITE_URL}}` placeholders in `index.html` are filled in
with `https://jpvelasco.github.io/zarcade` (no trailing slash), and
`docs/qa-playtest-brief.md` no longer describes the repo as private.

Remaining:

1. **Upload the repo's social preview**: Settings → General → Social preview
   → Edit → Upload `docs/assets/social-preview.png`. This is the card GitHub
   shows when someone shares the repository link.
2. **Try a shared link**: paste the public address into a chat app (or the
   Open Graph debugger of your choice) and confirm the card shows the marquee
   image, title and description.
3. **Play it on a real phone** from the public address: the arcade, a couple of
   games, and full screen.

## Optional later

- Per-game link preview cards (each game's cover as a PNG plus its own Open
  Graph tags). Covers are SVG today, which most apps won't show in a preview.
- A custom domain (Settings → Pages → Custom domain), then use that address in
  step 3 instead.
