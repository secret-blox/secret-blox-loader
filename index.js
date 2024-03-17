const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const createWindow = async () => {
    win = new BrowserWindow({
    width: 550,
    height: 520,
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
                win.webContents.openDevTools()
                win.center();
            } catch (error) {
                console.error('[SecretBlox] - Failed to load main.html:', error);
            }
        }, 50);
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

    try {
        const filePath = await recursiveSearch(path.join(__dirname, "workspace"), fileName);
        
        if (!filePath) {
            throw new Error('[ERROR] File not found');
        }

        const contents = await fs.promises.readFile(filePath, 'utf8');
        return { success: true, contents };
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

ipcMain.handle('open-file-dialog', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Scripts', extensions: ['txt', 'lua'] }]
    });
  
    if (canceled || filePaths.length === 0) {
      return { canceled: true };
    }
  
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    return { canceled: false, content: content };
});

ipcMain.handle('save-file-dialog', async (event, fileContent) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save your script',
        filters: [
            { name: 'Scripts', extensions: ['lua', 'txt'] }
        ],
        properties: ['createDirectory']
    })

    if (canceled || !filePath) {
        return { canceled: true }
    }

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return { canceled: false }
})

ipcMain.handle('inject', () => {
    spawn('C:\\Users\\Pixeluted\\Desktop\\secret-blox\\secret-blox-loader\\bin\\SecretBloxInjector.exe', [process.env.INJECTOR_KEY]);
})

async function recursiveSearch(dir, fileName) {
    const files = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
            const foundPath = await recursiveSearch(fullPath, fileName);
            if (foundPath) return foundPath;
        } else if (file.name === fileName) {
            return fullPath;
        }
    }
    return null;
}



app.whenReady().then(createWindow).catch(error => console.error('[SecretBlox] - Failed to create window:', error));
