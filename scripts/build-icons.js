const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  });

  const svgPath = path.resolve(__dirname, '../desktop/icon.svg');
  await win.loadURL('file://' + svgPath);
  
  await new Promise(r => setTimeout(r, 400));

  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png512 = img.toPNG();
  fs.writeFileSync(path.resolve(__dirname, '../desktop/icon.png'), png512);
  
  const publicDir = path.resolve(__dirname, '../client/public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'icon.png'), png512);
  console.log('✅ desktop/icon.png created (size:', png512.length, 'bytes)');

  const trayImg = img.resize({ width: 32, height: 32, quality: 'best' });
  const trayBuffer = trayImg.toPNG();
  fs.writeFileSync(path.resolve(__dirname, '../desktop/tray-icon.png'), trayBuffer);
  console.log('✅ desktop/tray-icon.png created');

  app.quit();
});
