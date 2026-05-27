const { app, BrowserWindow } = require('electron');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 630,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('widget.html');

  // Make the frameless window draggable while keeping the widget transparent.
  // Interactive elements opt out of dragging so clicks still work.
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      html, body { background: transparent !important; }
      body { -webkit-app-region: drag; padding: 14px !important; }
      button, input, a,
      .cd, .card, .ck, .cf, .ib, .nb, .fb, .pb,
      .psb, .prb, .pom-mode-btn, .ei, .connect-btn, .bc-btn,
      .cdel, .abtn, .board, .arow {
        -webkit-app-region: no-drag;
      }
    `);
  });

  // Frameless windows have no close button, so allow Cmd/Ctrl+Q or Cmd/Ctrl+W to quit.
  win.webContents.on('before-input-event', (event, input) => {
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (mod && (input.key === 'q' || input.key === 'w')) {
      app.quit();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
