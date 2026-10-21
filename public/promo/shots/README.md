# Promotional screenshots

`journal-detail.png` and `study-detail.png` are captured from the actual web renderer, with two synthetic journal notes and the built-in original wordbook. They contain no user data or logged-in music accounts. The journal screenshot includes the surrounding application; the study screenshot captures the learning panel directly so its meaning remains visible in the promotional card.

Reproduce on Node 24 after installing repository dependencies:

    BROWSER_EXECUTABLE="/path/to/chrome" node scripts/promo-feature-shots.mjs

The script uses a fixed clock and an isolated browser profile, blocks external requests, and starts/stops its own Vite server on port 4293. It replaces only these two images. The promotional page displays their complete contents using `object-fit: contain`; each image links to its original resolution.
