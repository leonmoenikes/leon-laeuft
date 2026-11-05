// Testläufer: führt alle tests/*.test.js aus. Jede exportierte Funktion ist ein Test.
//   npm test            alle Tests
//   npm test -- race    nur Dateien, deren Name "race" enthält
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const filter = process.argv[2] || '';
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let pass = 0, fail = 0;
  for (const f of files) {
    console.log(`\n${f}`);
    for (const [name, fn] of Object.entries(require(path.join(__dirname, f)))) {
      const t0 = Date.now();
      try { await fn(browser); pass++; console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
      catch (e) { fail++; console.log(`  ✗ ${name}\n      ${String(e && e.message || e).split('\n')[0]}`); }
    }
  }
  await browser.close();
  require('./helpers').stop();
  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail ? 1 : 0);
})();
