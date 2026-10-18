const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-pages.yml"), "utf8").replace(/\r\n/g, "\n");

test("Pages deploys one combined artifact when main, beta or noammo changes", () => {
  const triggers = workflow.match(/\bon:\n([\s\S]*?)\npermissions:/)?.[1];
  assert.ok(triggers);
  for (const branch of ["main", "beta", "noammo"]) {
    assert.match(triggers, new RegExp(`^      - ${branch}$`, "m"));
    assert.match(workflow, new RegExp(`ref: ${branch}\\n\\s+path: source/${branch}`));
  }
  assert.match(triggers, /workflow_dispatch:/);
  assert.match(workflow, /source\/main\/ _site\//);
  assert.match(workflow, /source\/beta\/ _site\/beta\//);
  assert.match(workflow, /source\/noammo\/ _site\/noammo\//);
  assert.match(workflow, /group: github-pages/);
  assert.equal((workflow.match(/uses: actions\/upload-pages-artifact@/g) ?? []).length, 1);
  assert.equal((workflow.match(/uses: actions\/deploy-pages@/g) ?? []).length, 1);
  assert.match(workflow, /with:\n\s+path: _site/);
});

test("noammo deployment serves its real entry, rewrites only staged links and includes all local assets", () => {
  const entry = fs.readFileSync(path.join(root, "noammo.html"), "utf8");
  const rewrite = `sed -i 's|href="index.html"|href="../"|g' _site/noammo/noammo.html`;
  const index = "cp _site/noammo/noammo.html _site/noammo/index.html";
  assert.ok(workflow.includes(rewrite)); assert.ok(workflow.includes(index));
  assert.ok(workflow.indexOf("source/noammo/ _site/noammo/") < workflow.indexOf(rewrite));
  assert.ok(workflow.indexOf(rewrite) < workflow.indexOf(index));
  assert.ok(workflow.indexOf(index) < workflow.indexOf("uses: actions/upload-pages-artifact@"));
  const deployed = entry.replaceAll('href="index.html"', 'href="../"');
  assert.match(deployed, /href="\.\.\/">Open the existing mining game/);
  assert.match(entry, /href="index.html">Open the existing mining game/);
  for (const [, reference] of deployed.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:\?[^"\s]*)?"/g)) {
    assert.ok(fs.existsSync(path.join(root, reference)), `missing deployed asset: ${reference}`);
    assert.equal(new URL(reference, "https://example.test/Hamster-Miners/noammo/").pathname,
      `/Hamster-Miners/noammo/${reference}`);
  }
  assert.doesNotMatch(workflow, /(?:cp|sed[^\n]*)[^\n]*\s_site\/(?:index\.html|beta\/index\.html)\s*$/m);
});
