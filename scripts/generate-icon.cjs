const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'log.txt');
function log(msg) {
  try { fs.appendFileSync(logFile, msg + '\n'); } catch {}
}
log('Starting script at ' + new Date().toISOString());

app.whenReady().then(async () => {
  log('app.whenReady fired');
  try {
    const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
    },
  });

  const svgContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), 'utf8');

  async function renderPng(size) {
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; background: transparent; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  svg { width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;

    win.setContentSize(size, size);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 200));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    return image.toPNG();
  }

  // 1. Generate 512x512 Master PNG
  const png512 = await renderPng(512);
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'icon.png'), png512);
  console.log('512x512 PNG generated:', png512.length, 'bytes');

  // 2. Generate standard multi-resolution PNGs for Windows ICO
  const icoSizes = [256, 128, 64, 48, 32, 16];
  const images = [];

  for (const s of icoSizes) {
    const buf = await renderPng(s);
    images.push({ size: s, buffer: buf });
    console.log(`Rendered ${s}x${s} PNG:`, buf.length, 'bytes');
  }

  // 3. Assemble Windows ICO with proper header and directory entries
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const img of images) {
    const dir = Buffer.alloc(16);
    const dim = img.size === 256 ? 0 : img.size;
    dir.writeUInt8(dim, 0); // Width (0 = 256px)
    dir.writeUInt8(dim, 1); // Height (0 = 256px)
    dir.writeUInt8(0, 2); // Colors (0 = >=256)
    dir.writeUInt8(0, 3); // Reserved
    dir.writeUInt16LE(1, 4); // Planes
    dir.writeUInt16LE(32, 6); // Bits per pixel (32-bit RGBA)
    dir.writeUInt32LE(img.buffer.length, 8); // PNG byte size
    dir.writeUInt32LE(offset, 12); // Offset to image data
    dirEntries.push(dir);
    offset += img.buffer.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...images.map((i) => i.buffer)]);

  // Save to public/icon.ico and public/favicon.ico
  const icoPath = path.join(__dirname, '..', 'public', 'icon.ico');
  const favIcoPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  fs.writeFileSync(favIcoPath, icoBuffer);
  console.log('Multi-resolution ICO generated:', icoBuffer.length, 'bytes at', icoPath);

    log('All icons generated successfully!');
    app.exit(0);
  } catch (err) {
    log('ERROR: ' + (err?.stack || err?.message || err));
    app.exit(1);
  }
});

