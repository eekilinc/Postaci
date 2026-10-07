// electron/shell-integration.cjs - ikon, kisayol, protokol, baslangic entegrasyonu (main.cjs'ten tasindi)
const path = require('path');
const fs = require('fs');
const { app, shell } = require('electron');

function resolveAppIcon(preferIco = true) {
  const filenames = preferIco ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  const dirs = [
    // 1. Packaged extraResources (Fiziksel disk yolu - Win32 Shell ve görev çubuğu için asar dışı doğrudan erişim)
    process.resourcesPath || null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'public') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'build') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'public') : null,
    // 2. Geliştirme modu yolları
    path.join(__dirname, '..', 'build'),
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, '..', 'dist'),
    path.join(__dirname, '..'),
  ].filter(Boolean);

  for (const f of filenames) {
    for (const d of dirs) {
      const full = path.join(d, f);
      try {
        if (fs.existsSync(full)) return full;
      } catch {}
    }
  }
  return null;
}

function ensureWindowsShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (!fs.existsSync(startMenuDir)) fs.mkdirSync(startMenuDir, { recursive: true });

    // 1. Electron.lnk kalıntısını temizle
    const electronLnk = path.join(startMenuDir, 'Electron.lnk');
    if (fs.existsSync(electronLnk)) {
      try { fs.unlinkSync(electronLnk); } catch {}
    }

    // 2. Hem ASCII (Postaci.lnk) hem de Türkçe (Postacı.lnk) kısayollarını AppUserModelId ile garantiye al
    // Windows 10/11 WinRT ToastNotificationManager AUMID eşleşmesini bu kısayollar üzerinden doğrular
    const icoPath = resolveAppIcon(true) || resolveAppIcon(false) || process.execPath;
    const target = process.execPath;
    const args = !app.isPackaged ? `"${path.resolve(__dirname, '..')}"` : '';

    const lnkNames = ['Postaci.lnk', 'Postacı.lnk'];
    for (const lnkName of lnkNames) {
      try {
        const lnkPath = path.join(startMenuDir, lnkName);
        if (fs.existsSync(lnkPath)) {
          try {
            const existing = shell.readShortcutLink(lnkPath);
            if (existing.target !== target || !fs.existsSync(existing.target)) {
              fs.unlinkSync(lnkPath);
            }
          } catch {}
        }
        shell.writeShortcutLink(lnkPath, fs.existsSync(lnkPath) ? 'replace' : 'create', {
          target,
          args,
          appUserModelId: 'com.postaci.app',
          icon: icoPath,
          iconIndex: 0,
          description: 'Postacı — Masaüstü E-posta İstemcisi',
        });
      } catch (errInner) {
        console.warn(`[shortcut] ${lnkName} oluşturulamadı:`, errInner?.message);
      }
    }

    // 3. Windows Bildirim İzinlerini ve AUMID Kimliğini Registry'ye yaz (ShowBanner = 1, Enabled = 1)
    try {
      const { exec } = require('child_process');
      const regCmds = [
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v Enabled /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v ShowBanner /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.postaci.app" /v ShowInActionCenter /t REG_DWORD /d 1 /f`,
        `reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.postaci.app" /v DisplayName /t REG_SZ /d "Postacı" /f`,
        `reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.postaci.app" /v ShowInSettings /t REG_DWORD /d 1 /f`,
      ];
      exec(regCmds.join(' & '), () => {});
    } catch {}

    ensureProtocolRegistration();
  } catch (err) {
    console.warn('[shortcut] Kısayol yönetimi uyarısı:', err?.message);
  }
}

function ensureProtocolRegistration() {
  try {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('postaci', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('postaci');
    }

    if (process.platform === 'win32') {
      const target = process.execPath;
      const args = !app.isPackaged ? `"${path.resolve(__dirname, '..')}" "%1"` : `"%1"`;
      const openCmd = `\\"${target}\\" ${args}`;
      const { exec } = require('child_process');
      const cmds = [
        `reg add "HKCU\\Software\\Classes\\postaci" /ve /t REG_SZ /d "URL:Postacı Protocol" /f`,
        `reg add "HKCU\\Software\\Classes\\postaci" /v "URL Protocol" /t REG_SZ /d "" /f`,
        `reg add "HKCU\\Software\\Classes\\postaci\\shell\\open\\command" /ve /t REG_SZ /d "${openCmd}" /f`,
      ];
      exec(cmds.join(' & '), () => {});
    }
  } catch (err) {
    console.warn('[protocol] Protokol kaydı uyarısı:', err?.message);
  }
}

function syncStartupSettings(launchOnStartup, startMinimized) {
  if (process.platform !== 'win32') return;
  try {
    const isPackaged = app.isPackaged;
    const target = process.execPath;
    const argList = isPackaged
      ? (startMinimized ? ['--minimized'] : [])
      : [path.resolve(__dirname, '..'), ...(startMinimized ? ['--minimized'] : [])];
    const argsStr = argList.length > 0 ? ' ' + argList.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ') : '';

    // 1. Electron yerleşik LoginItemSettings API'si
    try {
      app.setLoginItemSettings({
        openAtLogin: !!launchOnStartup,
        path: target,
        args: isPackaged ? (startMinimized ? ['--minimized'] : []) : [],
      });
    } catch (errLogin) {
      console.warn('[startup] app.setLoginItemSettings uyarısı:', errLogin?.message);
    }

    const { exec } = require('child_process');

    // 2. Windows Registry HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    if (launchOnStartup) {
      const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Postaci" /t REG_SZ /d "\\"${target}\\"${argsStr}" /f`;
      const regCmdAumid = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.postaci.app" /t REG_SZ /d "\\"${target}\\"${argsStr}" /f`;

      // 3. Windows Explorer StartupApproved\\Run (020000000000000000000000 = Etkin)
      const approvedCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "Postaci" /t REG_BINARY /d "020000000000000000000000" /f`;
      const approvedCmdAumid = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "com.postaci.app" /t REG_BINARY /d "020000000000000000000000" /f`;

      exec([regCmd, regCmdAumid, approvedCmd, approvedCmdAumid].join(' & '), () => {});
    } else {
      const delCmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Postaci" /f`;
      const delCmdAumid = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.postaci.app" /f`;
      const delApproved = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "Postaci" /f`;
      const delApprovedAumid = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "com.postaci.app" /f`;

      exec([delCmd, delCmdAumid, delApproved, delApprovedAumid].join(' & '), () => {});
    }

    // 4. Windows Başlangıç Klasörü (%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Postaci.lnk)
    const startupDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    if (!fs.existsSync(startupDir)) fs.mkdirSync(startupDir, { recursive: true });

    const startupLnkNames = ['Postaci.lnk', 'Postacı.lnk'];
    if (launchOnStartup) {
      const icoPath = resolveAppIcon(true) || resolveAppIcon(false) || target;
      const lnkPath = path.join(startupDir, 'Postaci.lnk');
      try {
        shell.writeShortcutLink(lnkPath, fs.existsSync(lnkPath) ? 'replace' : 'create', {
          target,
          args: argsStr.trim(),
          appUserModelId: 'com.postaci.app',
          icon: icoPath,
          iconIndex: 0,
          description: 'Postacı — Masaüstü E-posta İstemcisi',
        });
        const approvedFolderCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder" /v "Postaci.lnk" /t REG_BINARY /d "020000000000000000000000" /f`;
        exec(approvedFolderCmd, () => {});
      } catch (errLnk) {
        console.warn('[startup] Startup kısayolu oluşturulamadı:', errLnk?.message);
      }
    } else {
      for (const name of startupLnkNames) {
        const lnkPath = path.join(startupDir, name);
        if (fs.existsSync(lnkPath)) {
          try { fs.unlinkSync(lnkPath); } catch {}
        }
      }
      const delFolderApproved = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder" /v "Postaci.lnk" /f`;
      exec(delFolderApproved, () => {});
    }
  } catch (err) {
    console.warn('[startup] syncStartupSettings hatası:', err?.message);
  }
}

module.exports = { resolveAppIcon, ensureWindowsShortcut, ensureProtocolRegistration, syncStartupSettings };
