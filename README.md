# Hamster Miners
yay hamsta 2

The `noammo` opening prototype is in [noammo.html](noammo.html). It uses a
separate local save and does not replace the existing mining game in `index.html`.
It currently tests Leeks/Fiber, manual Wood, Baskets/hauling, Loggers and the
first kinetic-powered upgrading line. Machines are labelled boxes.

Run `npm run check` and `node --test --test-concurrency=2 tests/**/*.test.cjs`
to check both the existing game and the separate prototype.

## GitHub Pages

The shared `deploy-pages.yml` workflow publishes all three branches together:

- `main`: <https://limemarble.github.io/Hamster-Miners/>
- `beta`: <https://limemarble.github.io/Hamster-Miners/beta/>
- `noammo`: <https://limemarble.github.io/Hamster-Miners/noammo/>

The `/noammo/` entry serves `noammo.html` as its index, with its local assets
alongside it. Its mining-game link points back to stable main. Source files and
local previews are not renamed.

Keep **only `.github/workflows/deploy-pages.yml` identical in all three
branches**; do not merge the game redesign into main or beta just to update
deployment. An older workflow deploying main/beta alone would replace the Pages
artifact and remove `/noammo/`.

Pages must use **GitHub Actions** as its publishing source. If the `github-pages`
environment restricts deployment branches, allow `noammo` as well as the existing
main/beta branches. Push the updated workflow to run the deployment.
