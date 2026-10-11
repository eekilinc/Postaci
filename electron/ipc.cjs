// electron/ipc.cjs - IPC kayit yukleyicisi.
//
// Handler govdeleri artik burada DEGIL; electron/ipc/ altindaki alan
// modullerinde. Bu dosya yalnizca modulleri yukler ve kaydettirir.
// Kanal ADLARI sozlesmedir: preload.cjs bunlarla invoke eder; ipc.test.ts
// sozlesmeyi, ipc-static.test.ts her modulun import/kullanim tutarligini
// ve duman testi handler'larin cagrilabilirligini dogrular.
const MODULES = [
  './ipc/accounts-ipc.cjs',
  './ipc/app-ipc.cjs',
  './ipc/contacts-ipc.cjs',
  './ipc/db-ipc.cjs',
  './ipc/dialog-ipc.cjs',
  './ipc/logs-ipc.cjs',
  './ipc/mail-ipc.cjs',
  './ipc/notifications-ipc.cjs',
  './ipc/shell-ipc.cjs',
];

function registerIpc(ctx) {
  // getMainWindow/getTray main.cjs'e aittir; modullere sadelestirilmis deps gecer.
  const deps = {
    getMainWindow: ctx.getMainWindow,
    getTray: ctx.getTray,
  };
  for (const mod of MODULES) {
    require(mod).register(deps);
  }
}

module.exports = { registerIpc };
