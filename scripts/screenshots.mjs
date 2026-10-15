// Usage: node scripts/screenshots.mjs [baseUrl]  (needs `npx playwright install chromium`)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:3000';
const sizes = { mobile: { width: 375, height: 812 }, desktop: { width: 1280, height: 860 } };
const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${base}/?demo=1`);
  await page.waitForSelector('text=Tap to upload');
  await page.setInputFiles('input[type=file]', 'scripts/sample-sow.pdf');
  await page.waitForSelector('text=/• Attached/');
  await page.screenshot({ path: `screenshots/${name}-step1.png`, fullPage: true });
  await page.click('text=Extract Invoice Details');
  await page.waitForSelector('text=Action Needed');
  await page.screenshot({ path: `screenshots/${name}-step2.png`, fullPage: true });
  await page.click('text=+14 Days');
  await page.click('text=Generate Invoice PDF');
  await page.waitForSelector('text=Invoice Created Successfully');
  await page.screenshot({ path: `screenshots/${name}-step3.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Invoice PDF')]);
  await dl.saveAs(`screenshots/sample-invoice-${name}.pdf`);
  await page.close();
}
await browser.close();
console.log('ok');
