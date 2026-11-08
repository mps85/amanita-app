const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Model = require('../src/model.js');
let win;
let saveQueue = Promise.resolve();
const entry = path.join(__dirname, '../src/index.html');
const trusted = (event) => event.sender === win?.webContents && event.senderFrame?.url === pathToFileURL(entry).href;
const projectPath = () => path.join(app.getPath('userData'), 'project.amanita.json');
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted project request');
    return fn(...args);
  });
}
handle('project:load', async () => {
  try { return Model.validate(JSON.parse(await fs.readFile(projectPath(), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
handle('project:save', (input) => {
  const project = Model.validate(input);
  const task = saveQueue.catch(() => {}).then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    const target = projectPath();
    await fs.writeFile(target + '.tmp', JSON.stringify(project), 'utf8');
    await fs.rename(target + '.tmp', target);
    return true;
  });
  saveQueue = task;
  return task;
});
handle('project:export', async (input) => {
  const project = Model.validate(input);
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Amanita project', defaultPath: 'My comic.amanita.json',
    filters: [{ name: 'Amanita project', extensions: ['json'] }],
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf8');
  return true;
});
handle('project:import', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Amanita project', extensions: ['json'] }] });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > Model.MAX_BYTES) throw new Error('Project is too large (maximum 40 MB).');
  return Model.validate(JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')));
});
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win = new BrowserWindow({ show: !process.env.AMANITA_SMOKE, width: 1440, height: 960, minWidth: 1000, minHeight: 700,
    title: 'Amanita', backgroundColor: '#f6f4ee', autoHideMenuBar: true,
    webPreferences: { offscreen: !!process.env.AMANITA_SMOKE, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('close', (event) => {
    if (win.forceClose) return;
    event.preventDefault();
    saveQueue.finally(() => { win.forceClose = true; win.close(); });
  });
  win.loadFile(entry);
});
app.on('window-all-closed', () => app.quit());


