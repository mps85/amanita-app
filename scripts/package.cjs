const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const { packager } = await import('@electron/packager');
  const version = require('electron/package.json').version;
  const zipDir = path.resolve(__dirname, '../.runtime-cache');
  const zip = path.join(zipDir, `electron-v${version}-win32-x64.zip`);
  const output = await packager({
    dir: path.resolve(__dirname, '..'), name: 'Amanita', platform: 'win32', arch: 'x64',
    out: path.resolve(__dirname, process.env.AMANITA_PACKAGE_OUT || '../dist'), overwrite: true, electronVersion: version,
    ...(fs.existsSync(zip) ? { electronZipDir: zipDir } : {}),
    ignore: /^\/(tests|scripts|dist|docs|\.git|\.runtime-cache)(\/|$)/,
    win32metadata: { CompanyName: 'Amanita', FileDescription: 'A scrapbook for comic worlds', ProductName: 'Amanita' },
  });
  console.log('Windows app: ' + path.join(output[0], 'Amanita.exe'));
})().catch(error => { console.error(error); process.exitCode = 1; });


