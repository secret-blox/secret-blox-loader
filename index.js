const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const createWindow = async () => {
    win = new BrowserWindow({
    width: 250,
    height: 250,
    frame: false,
    resizable: false,
    icon: 'icon.ico',
    titleBarStyle: 'hidden',
    webPreferences: {
        worldSafeExecuteJavaScript: true,
        enableRemoteModule: true,
        transparent: true,
        contextIsolation: false, // leave as false becuase we need to run in the same javascript context
        nodeIntegration: true, 
    },
    
    })
    win.loadURL(`file://${__dirname}/src/main/html/index.html`);
    try {
      setTimeout(async () => {
            try {
                await win.loadFile('src/main/html/main.html');
                win.setSize(900, 400);
                
                // win.webContents.openDevTools()
                
                win.center();
            } catch (error) {
                console.error('[SecretBlox] - Failed to load main.html:', error);
            }
        }, 1000);
    } catch (error) {
        console.error('[SecretBlox] - Failed to execute preloading script:', error);
    }
    ipcMain.on('closeApp', () => {
        win.close();
    });
    
    ipcMain.on('minimizeApp', () => {
        win.minimize();
    });
}


// IPC COMMUNICATIONS
ipcMain.handle('load-files', async (event, folderPath) => {
    const rootPath = path.join(__dirname, folderPath);

    const buildStructure = (dirPath) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        let structure = [];

        entries.forEach(dirent => {
            if (dirent.isDirectory()) {

                const nestedStructure = buildStructure(path.join(dirPath, dirent.name));
                if (nestedStructure.length > 0) {
                    structure.push({
                        name: dirent.name,
                        type: 'folder',
                        files: nestedStructure
                    });
                }
            } else if (['.lua', '.luau', '.txt'].some(ext => dirent.name.endsWith(ext))) {
                structure.push({
                    name: dirent.name,
                    type: 'file'
                });
            }
        });

        return structure;
    };

    try {
        const filesAndFolders = buildStructure(rootPath);
        return filesAndFolders;
    } catch (error) {
        console.error('Failed to read directory:', error);
        return [];
    }
});

ipcMain.handle('get-file', async (event, fileName) => {
    if (typeof fileName !== 'string') {
        console.error('[ERROR] Invalid file name:', fileName);
        return { success: false, error: 'Invalid file name' };
    }

    const workspaceDir = path.join(__dirname, 'workspace');

    const findFile = async (directory, searchFileName) => {
        const files = await fs.promises.readdir(directory, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(directory, file.name);

            if (file.isDirectory()) {
                const result = await findFile(fullPath, searchFileName);
                if (result) return result;
            } else if (file.name === searchFileName) {
                return fullPath;
            }
        }
        return null;
    };

    try {
        const filePath = await findFile(workspaceDir, fileName);

        if (!filePath) {
            return { success: false, exists: false, error: '[ERROR] File not found' };
        }

        const contents = await fs.promises.readFile(filePath, 'utf8');
        return { success: true, exists: true, contents, filePath };
    } catch (error) {
        console.error('[ERROR] Failed to read file:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('check-and-rename-file', async (event, { oldPath, newPath }) => {
    const workspaceDir = path.join(__dirname, 'workspace');

    const findFile = async (directory, fileName) => {
        const files = await fs.promises.readdir(directory, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(directory, file.name);

            if (file.isDirectory()) {
                const result = await findFile(fullPath, fileName);
                if (result) return result;
            } else if (file.name === fileName) {
                return fullPath;
            }
        }
        return null;
    };

    const oldFullPath = await findFile(workspaceDir, oldPath);

    if (!oldFullPath) {
        return { success: false, error: 'File not found' };
    }

    const directoryPath = path.dirname(oldFullPath);
    const newFullPath = path.join(directoryPath, newPath);

    try {
        await fs.promises.rename(oldFullPath, newFullPath);
        return { success: true };
    } catch (error) {
        console.error('[ERROR] Renaming file: ', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-file', async (event, { filePath, contents }) => {
    try {
        if (!fs.existsSync(filePath)) {
            const { canceled, filePath: savedPath } = await dialog.showSaveDialog({});
            if (canceled || !savedPath) { return { success: false, message: 'File save cancelled.' } }

            filePath = savedPath;
        }
        fs.writeFileSync(filePath, contents);
        return { success: true, filePath };
    } catch (error) {
        console.error('Failed to save the file:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('open-file', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Lua Files', extensions: ['lua', 'luau'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (canceled || filePaths.length === 0) {
        return { success: false };
    }

    const filePath = filePaths[0];
    try {
        const contents = fs.readFileSync(filePath, 'utf8');
        return { success: true, filePath, contents };
    } catch (err) {
        console.error('Failed to read file:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('inject', () => {
    // inject
})

app.disableHardwareAcceleration(false);
app.whenReady().then(createWindow).catch(error => console.error('[SecretBlox] - Failed to create window:', error));
