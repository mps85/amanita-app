const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const image={name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9T8AAAAASUVORK5CYII=','base64')};
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:['tests/connection-fixture.cjs']});
 try{
  const page=await app.firstWindow();
  await page.locator('[data-filter="image"]').click();
  assert.equal(await page.locator('.note').count(),1);
  assert.equal(await page.locator('.note[data-id="map"]').count(),1);
  const [picker]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#add-image').click()]);
  await picker.setFiles(image);
  await page.waitForFunction(()=>project.notes.filter(n=>n.kind==='image').length===2);
  assert.equal(await page.locator('[data-filter="image"]').getAttribute('class'),'nav-item active');
  assert.equal(await page.locator('#image-count').innerText(),'2');
  await page.locator('[data-filter="character"]').click();
  await page.locator('.note[data-id="mara"]').click();
  const [convertPicker]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#note-kind').selectOption('image')]);
  await convertPicker.setFiles(image);
  await page.waitForFunction(()=>project.notes.find(n=>n.id==='mara').kind==='image');
  assert.equal(await page.locator('#image-count').innerText(),'3');
  assert.match(await page.locator('#note-body').inputValue(),/mapmaker/);
  assert.equal(await page.locator('#note-title').inputValue(),'Mara');
  await page.locator('#close-inspector').click();
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(()=>project.notes.find(n=>n.id==='mara').kind),'character');
  await page.locator('[data-filter="all"]').click();
  await page.locator('.note[data-id="premise"]').click();
  await page.evaluate(()=>{pendingImageNote='premise';document.getElementById('image-file').dispatchEvent(new Event('cancel'));});
  assert.equal(await page.evaluate(()=>pendingImageNote),null);
  assert.equal(await page.locator('#note-kind').inputValue(),'idea');
  await page.evaluate(()=>save());
  await page.reload();
  await page.locator('[data-filter="image"]').click();
  assert.equal(await page.locator('.note').count(),2);
  assert.equal(await page.locator('#add-note').isVisible(),false);
  console.log('Image reference regression passed: sidebar, file attachment, category conversion, text preservation, undo, cancel, and save/reload.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
