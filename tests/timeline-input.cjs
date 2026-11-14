const { _electron } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['tests/connection-fixture.cjs'] });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.note');
    assert.equal(await page.locator('.note[data-id="scene"]').count(), 0);
    const timeline = page.getByRole('region', { name: 'Timeline spectrum' });
    const unplaced = page.getByRole('region', { name: 'Unplaced beats' });
    const scene = page.locator('.beat-card[data-id="scene"]');
    await page.locator('[data-filter="story"]').click();
    await unplaced.locator(scene).waitFor();
    assert.deepEqual(await timeline.locator('.beat-landmark').allTextContents(), ['Early', 'Along the way', 'Later']);

    async function dragToPosition(card, position) {
      await timeline.scrollIntoViewIfNeeded();
      const axis = await timeline.locator('.beat-axis').boundingBox();
      const track = await timeline.boundingBox();
      await card.dragTo(timeline, { targetPosition: { x: axis.x - track.x + axis.width * position, y: axis.y - track.y + 8 } });
    }
    const position = id => page.evaluate(id => project.notes.find(note => note.id === id).beatPosition, id);
    await dragToPosition(scene, 0.31);
    assert.ok(Math.abs(await position('scene') - 0.31) < 0.01);
    await dragToPosition(scene, 0.38);
    const moved = await position('scene');
    assert.ok(Math.abs(moved - 0.38) < 0.01);
    await scene.getByRole('button', { name: 'Move An opening scene later' }).click();
    assert.ok(Math.abs(await position('scene') - moved - 0.025) < 0.001);

    await page.locator('#add-note').click();
    await page.locator('#note-title').fill('Another moment');
    await page.locator('#toggle-beat-placement').click();
    const second = await page.evaluate(() => selected);
    await page.locator('#beat-position').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await position(second), 0.501);
    await page.locator('#close-inspector').click();
    const secondCard = page.locator('.beat-card[data-id="' + second + '"]');
    await secondCard.dragTo(unplaced.locator('h2'));
    await unplaced.locator(secondCard).waitFor();
    await page.keyboard.press('Control+z');
    await timeline.locator(secondCard).waitFor();
    assert.equal(await position(second), 0.501);
    await page.keyboard.press('Control+Shift+z');
    await unplaced.locator(secondCard).waitFor();
    await secondCard.getByRole('button', { name: 'Connect from Another moment' }).dragTo(scene.locator('h3'));
    await page.locator('#dialog-input').fill('sets up');
    await page.locator('#dialog-confirm').click();
    await page.waitForFunction(id => project.connections.some(c => c.from === id && c.to === 'scene' && c.label === 'sets up'), second);
    await unplaced.locator(secondCard).waitFor();

    await page.evaluate(() => save());
    const scenePosition = await position('scene');
    await page.reload();
    await page.waitForSelector('.note');
    await page.locator('[data-filter="story"]').click();
    await timeline.locator(scene).waitFor();
    await unplaced.locator(secondCard).waitFor();
    assert.equal(await position('scene'), scenePosition);
    console.log('Timeline passed: freeform drag, nudging, keyboard placement, Unplaced, undo/redo, and save/reload.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
