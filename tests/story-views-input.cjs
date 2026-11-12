const { _electron } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['tests/connection-fixture.cjs'] });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.note');
    const scope = page.locator('#story-scope');
    const scrapbook = page.locator('[data-filter="all"]');
    const timeline = page.locator('[data-filter="story"]');
    const mara = page.locator('.note[data-id="mara"]');
    const opening = page.locator('.beat-card[data-id="scene"]');
    const createStory = async title => {
      await page.locator('#add-story').click();
      await page.locator('#dialog-input').fill(title);
      await page.locator('#dialog-confirm').click();
      await scope.locator('option').filter({ hasText: title }).waitFor({ state: 'attached' });
      return scope.inputValue();
    };
    const first = await createStory('First story');
    const second = await createStory('Second story');
    assert.ok(first && second && first !== second);
    assert.equal(await page.locator('.note').count(), 0);

    await scope.selectOption('');
    await mara.click();
    await page.getByRole('checkbox', { name: 'First story' }).check();
    await page.getByRole('checkbox', { name: 'Second story' }).check();
    await scope.selectOption(first);
    assert.equal(await page.locator('.note').count(), 1);
    await mara.click();
    await page.locator('#note-title').fill('Mara the mapmaker');
    await scope.selectOption(second);
    assert.equal(await mara.locator('h2').innerText(), 'Mara the mapmaker');
    await mara.click();
    await page.locator('#linked-notes button').filter({ hasText: 'An opening scene' }).click();
    assert.equal(await scope.inputValue(), '');
    await opening.waitFor();

    await scope.selectOption(first);
    assert.equal(await page.locator('.beat-card').count(), 0);
    await page.locator('#add-note').click();
    await page.locator('#note-title').fill('A beat for the first story');
    assert.equal(await page.getByRole('checkbox', { name: 'First story' }).isChecked(), true);
    await scope.selectOption(second);
    assert.equal(await page.locator('.beat-card').count(), 0);
    await page.locator('#rename-story').click();
    await page.locator('#dialog-input').fill('Second chapter');
    await page.locator('#dialog-confirm').click();
    await scope.locator('option').filter({ hasText: 'Second chapter' }).waitFor({ state: 'attached' });

    await page.locator('#remove-story').click();
    await page.locator('#dialog-confirm').click();
    await scope.locator('option').filter({ hasText: 'Second chapter' }).waitFor({ state: 'detached' });
    await page.keyboard.press('Control+z');
    await scope.locator('option').filter({ hasText: 'Second chapter' }).waitFor({ state: 'attached' });
    await page.evaluate(() => save());
    await page.reload();
    await page.waitForSelector('.note');
    assert.equal(await scope.inputValue(), '');
    await scope.selectOption(second);
    await mara.waitFor();
    await scope.selectOption(first);
    await timeline.click();
    assert.equal(await page.locator('.beat-card h3').allTextContents().then(titles => titles.join()), 'A beat for the first story');
    await scrapbook.click();
    await mara.waitFor();
    console.log('Story views passed: sharing, scoped creation, linked navigation, rename, removal, undo, and desktop reload.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
