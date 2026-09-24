const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function setupDevElectron() {
  const rootDir = path.resolve(__dirname, '..');
  const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
  const electronExe = path.join(electronDist, 'electron.exe');
  const iconIco = path.join(rootDir, 'build', 'icon.ico');

  if (!fs.existsSync(electronExe)) {
    console.log('[brand-dev] electron.exe bulunamadı, işlem atlandı.');
    return;
  }

  // 1. electron.exe PE ikon ve ürün adını rcedit ile Postacı yap
  try {
    const rceditPath = path.join(rootDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
    if (fs.existsSync(rceditPath) && fs.existsSync(iconIco)) {
      execFileSync(rceditPath, [
        electronExe,
        '--set-icon', iconIco,
        '--set-version-string', 'ProductName', 'Postacı',
        '--set-version-string', 'FileDescription', 'Postacı — E-posta İstemcisi',
        '--set-version-string', 'CompanyName', 'Postacı'
      ]);
      console.log('[brand-dev] electron.exe başarıyla Postacı olarak damgalandı.');
    }
  } catch (err) {
    console.warn('[brand-dev] rcedit damgalama uyarısı:', err?.message);
  }

  // 2. default_app.asar'ı devre dışı bırak (Electron'un "path-to-app" karşılama ekranını tamamen engeller)
  const resourcesDir = path.join(electronDist, 'resources');
  try {
    const asarPath = path.join(resourcesDir, 'default_app.asar');
    const bakPath = path.join(resourcesDir, 'default_app.asar.bak');
    if (fs.existsSync(asarPath)) {
      if (fs.existsSync(bakPath)) {
        fs.unlinkSync(bakPath);
      }
      fs.renameSync(asarPath, bakPath);
      console.log('[brand-dev] default_app.asar başarıyla devre dışı bırakıldı.');
    }
  } catch (err) {
    console.warn('[brand-dev] default_app.asar devre dışı bırakma uyarısı:', err?.message);
  }

  // 3. electron.exe parametresiz çalıştırıldığında (ör: Windows Bildirimine tıklandığında)
  // doğrudan Postacı'yı çalıştırması için resources/app yönlendirmesi oluştur
  try {
    const appDir = path.join(resourcesDir, 'app');
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }

    // package.json
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
      name: 'postaci-dev-redirect',
      version: '1.0.5',
      main: 'index.js'
    }, null, 2), 'utf8');

    // index.js: Proje kökündeki main.cjs dosyasını çağırır.
    // Kök, '..' sayarak DEĞİL, name='postaci' olan package.json yukarı doğru
    // aranarak bulunur (taşınma/derinlik değişimine dayanıklı).
    const indexContent = `// Windows bildirimine tıklandığında electron.exe argümansız çağrılırsa bu dosya çalışır.
// Projenin ana main.cjs dosyasını yükler; Single Instance Lock sayesinde
// açık olan Postacı penceresi öne gelir, yeni/boş pencere açılmaz.
const fs = require('fs');
const path = require('path');
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && pkg.name === 'postaci' && fs.existsSync(path.join(dir, 'main.cjs'))) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const rootDir = findRoot(__dirname);
if (!rootDir) throw new Error('[postaci-dev-redirect] proje koku bulunamadi: ' + __dirname);
try {
  process.chdir(rootDir);
} catch {}
require(path.join(rootDir, 'main.cjs'));
`;
    fs.writeFileSync(path.join(appDir, 'index.js'), indexContent, 'utf8');
    console.log('[brand-dev] resources/app dev yönlendirmesi hazırlandı.');
  } catch (err) {
    console.warn('[brand-dev] resources/app oluşturma hatası:', err?.message);
  }
}

setupDevElectron();
