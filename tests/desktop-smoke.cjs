const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temp = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'amanita-smoke-'));
app.setPath('userData', temp);
process.env.AMANITA_SMOKE = '1';
app.disableHardwareAcceleration();
setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 30000).unref();
require('../desktop/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const errors = [];
    win.webContents.on('console-message', (_event, ...args) => { const message = typeof args[0] === 'object' ? args[0].message : args[1]; if (/Uncaught|Error:/.test(message)) errors.push(message); });
    const run = code => win.webContents.executeJavaScript(code, true);
    for (let attempt = 0; attempt < 100; attempt++) { if (await run('document.querySelectorAll(".note").length === 5')) break; await delay(50); }
    assert.equal(await run('document.querySelectorAll(".note").length'), 5);
    await fs.mkdir(path.join(__dirname, '../docs'), { recursive: true });
    await run('document.getElementById("toast").hidden = true');
    await delay(300);
    await fs.writeFile(path.join(__dirname, '../docs/scrapbook.png'), (await win.webContents.capturePage()).toPNG());
    assert.equal(await run('window.amanita !== undefined'), true, 'preload bridge loads');
    await run('chooseNote("magic")');
    assert.equal(await run('document.getElementById("note-body").disabled'), true);
    await run('document.getElementById("note-status").value="established"; document.getElementById("note-status").dispatchEvent(new Event("change"));');
    await run('document.getElementById("dialog-confirm").click()'); await delay(50);
    assert.equal(await run('document.getElementById("note-body").disabled'), false);
    await run('document.getElementById("note-body").value="Magic costs a memory."; document.getElementById("note-body").dispatchEvent(new Event("input"));');
    await run('document.getElementById("note-status").value="locked"; document.getElementById("note-status").dispatchEvent(new Event("change"));');
    await run('document.getElementById("dialog-confirm").click()'); await delay(50);
    assert.equal(await run('document.getElementById("note-body").disabled'), true);
    await run('closeInspector(); addNote("character"); document.getElementById("note-title").value="Iris"; document.getElementById("note-title").dispatchEvent(new Event("input"));');
    assert.equal(await run('project.notes.length'), 7);
    await run('document.getElementById("note-importance").value="3"; document.getElementById("note-importance").dispatchEvent(new Event("change"));');
    assert.equal(await run('project.notes.find(n=>n.title==="Iris").importance'), 3);
    await run('startConnect(); void chooseNote("mara")');
    await run('document.getElementById("dialog-input").value="sister of"; document.getElementById("dialog-confirm").click()'); await delay(50);
    assert.equal(await run('project.connections.some(c=>c.label==="sister of")'), true);
    await run('closeInspector(); undo();');
    assert.equal(await run('project.connections.some(c=>c.label==="sister of")'), false);
    await run('undo(true)');
    assert.equal(await run('project.connections.some(c=>c.label==="sister of")'), true);
    await run('setFilter("character")');
    assert.equal(await run('document.querySelectorAll(".note").length'), 2);
    await run('document.getElementById("search").value="Iris"; document.getElementById("search").dispatchEvent(new Event("input"));');
    assert.equal(await run('document.querySelectorAll(".note").length'), 1);
    await run('document.getElementById("search").value=""; setFilter("all");');
    await run('const irisCard=[...document.querySelectorAll(".note")].find(n=>n.textContent.includes("Iris")); irisCard.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,clientX:300,clientY:300})); window.dispatchEvent(new PointerEvent("pointermove",{clientX:400,clientY:350})); window.dispatchEvent(new PointerEvent("pointerup"));');
    assert.equal(await run('history.length > 0'), true);
    await run('addNote("image",undefined,"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9T8AAAAASUVORK5CYII=","Image test");');
    assert.equal(await run('project.notes.filter(n=>n.kind==="image").length'), 2);
    await run('chooseNote(project.notes.find(n=>n.title==="Iris").id); document.getElementById("delete-note").click()');
    await run('document.getElementById("dialog-confirm").click()'); await delay(50);
    assert.equal(await run('project.notes.some(n=>n.title==="Iris")'), false);
    assert.equal(await run('project.connections.some(c=>c.label==="sister of")'), false);
    const exportPath = path.join(temp, 'exported.amanita.json');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    assert.equal(await run('window.amanita.exportProject(project)'), true);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportPath] });
    const imported = await run('window.amanita.importProject()');
    assert.deepEqual(imported, JSON.parse(await run('JSON.stringify(project)')));
    dialog.showSaveDialog = async () => ({ canceled: true });
    assert.equal(await run('window.amanita.exportProject(project)'), false);
    await run('document.getElementById("new-project").click()');
    await run('document.getElementById("dialog-input").value="New world"; document.getElementById("dialog-confirm").click()'); await delay(50);
    assert.equal(await run('project.notes.length'), 0);
    assert.equal(await run('document.getElementById("empty").hidden'), false);
    await run('undo()');
    const expected = await run('JSON.stringify(project)');
    await run('save()');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp,'project.amanita.json'),'utf8')),JSON.parse(expected));
    win.webContents.reload();
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    for (let attempt = 0; attempt < 100; attempt++) { if (await run('typeof project !== "undefined" && project !== undefined')) break; await delay(50); }
    assert.deepEqual(JSON.parse(await run('JSON.stringify(project)')), JSON.parse(expected), 'native saved project survives reload');
    assert.equal(await run('project.notes.find(n=>n.id==="magic").body'), 'Magic costs a memory.');
    assert.deepEqual(errors, []);
    console.log('Desktop smoke passed: editing, locks, categories, connections, undo/redo, drag, images, deletion, native save and reload.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});



