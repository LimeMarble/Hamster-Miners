# Hamster Miners
yay hamsta 2

The `noammo` opening prototype is in [noammo.html](noammo.html). It uses a
separate local save and does not replace the existing mining game in `index.html`.
It currently tests Leeks/Fiber, manual Wood, Baskets/hauling, Loggers and the
first kinetic-powered upgrading line. Machines are labelled boxes.

Run `npm run check` and `node --test --test-concurrency=2 tests/**/*.test.cjs`
to check both the existing game and the separate prototype.
