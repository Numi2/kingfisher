const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('http://127.0.0.1:3000/?debug=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas, .fatal-screen', { timeout: 15000 });
  const fatal = await page.$('.fatal-screen');
  if (fatal) throw new Error(`Renderer failed: ${await fatal.innerText()}`);
  assert.ok(await page.$('canvas'), 'WebGL canvas did not render');
  assert.equal(await page.evaluate(() => Boolean(
    document.createElement('canvas').getContext('webgl2') ||
    document.createElement('canvas').getContext('webgl')
  )), true, 'WebGL unavailable');

  await page.click('.hero-play');
  await page.waitForSelector('.state-playing', { timeout: 8000 });
  assert.equal(await page.evaluate(() => Boolean(window.__kingfisherEngine)), true, 'debug engine unavailable');

  const before = await page.evaluate(() => ({
    yaw: window.__kingfisherEngine.yaw,
    pitch: window.__kingfisherEngine.pitch
  }));
  const box = await page.locator('.joystick-zone').boundingBox();
  assert.ok(box, 'joystick unavailable');
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35 + 70, box.y + box.height * 0.55 - 18, { steps: 8 });
  await page.waitForTimeout(420);
  await page.mouse.up();
  await page.waitForTimeout(220);

  const after = await page.evaluate(() => {
    const e = window.__kingfisherEngine;
    return {
      yaw: e.yaw,
      pitch: e.pitch,
      yawVelocity: e.yawVelocity,
      pitchVelocity: e.pitchVelocity,
      speed: e.speed,
      camera: e.camera.position.toArray(),
      input: { ...e.filteredSteering }
    };
  });
  const yawChange = Math.abs(after.yaw - before.yaw);
  assert.ok(yawChange > 0.02, `joystick response too weak: ${yawChange}`);
  assert.ok(yawChange < 1.3, `joystick response snapped: ${yawChange}`);
  assert.ok([after.yaw, after.pitch, after.yawVelocity, after.pitchVelocity, after.speed, ...after.camera].every(Number.isFinite), 'non-finite flight state');
  assert.ok(Math.abs(after.input.x) < 0.15, `joystick did not settle: ${after.input.x}`);

  await page.click('.dive-control');
  await page.waitForTimeout(140);
  assert.equal(await page.evaluate(() => window.__kingfisherEngine.smartDiveCommit), true, 'first tap did not engage smart dive');
  await page.click('.dive-control');
  await page.waitForTimeout(140);
  assert.equal(await page.evaluate(() => window.__kingfisherEngine.smartDiveCommit), false, 'second tap did not cancel smart dive');

  assert.equal(await page.evaluate(() => {
    const e = window.__kingfisherEngine;
    return [e.yaw, e.pitch, e.yawVelocity, e.pitchVelocity, e.speed, ...e.camera.position.toArray()].every(Number.isFinite);
  }), true, 'dive destabilized flight state');
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: '/tmp/kingfisher-v3-browser.png' });
  await browser.close();
  console.log(JSON.stringify({ yawChange, state: after, smartDiveToggle: true }));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
