const { app, BrowserWindow, ipcMain, dialog } = require('electron')

let win;


const createWindow = async () => {
    win = new BrowserWindow({
    width: 550,
    height: 520,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        worldSafeExecuteJavaScript: true,
        enableRemoteModule: true,
            // Adding rounded corners
        backgroundColor: '#FFF', // Ensure the background color is set to work with transparency
        transparent: true, // Enable transparency
      },
    
    })
    win.loadURL(`file://${__dirname}/index.html`);
    await win.webContents.executeJavaScript(`require('./preloading.js');`);
    try {
      setTimeout(async () => {
        try {
          await win.loadFile('main.html');
          await win.webContents.executeJavaScript(`require('./preloading.js');`);
          win.setSize(1200, 620);
          win.center(); 
        } catch (error) {
          console.error('[SecretBlox] - Failed to load main.html:', error);
        }
      }, 5000);
    } catch (error) {
      console.error('[SecretBlox] - Failed to execute preloading script:', error);
    }

    ipcMain.on('minimizeApp', () => {
      win.minimize();
    });


    ipcMain.on('closeApp', () => {
      win.close();
    });
}

app.whenReady().then(createWindow).catch(error => console.error('[SecretBlox] - Failed to create window:', error));

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createWindow();
      } catch (error) {
        console.error('[SecretBlox] - Failed to recreate window on activate:', error);
      }
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('open-folder-dialog', async (event) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    event.reply('folder-selected', folderPath);
  }
});



ipcMain.on('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    event.reply('file-selected', filePath);
  }
});