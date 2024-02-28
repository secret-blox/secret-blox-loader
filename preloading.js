const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');
const { dialog } = require('electron');


async function createDirectory(directoryPath) {
    try {
        await fs.mkdir(directoryPath, { recursive: true });
    } catch (error) {
        console.error(`[SecretBlox] - Failed to create directory at ${directoryPath}: ${error}`);
    }
}

const workspaceDir = path.join(__dirname, 'workspace');
createDirectory(workspaceDir);


const processedFiles = new Set();

let openFilePath = '';

const checkWorkspaceDir = async () => {
  try {
    const workspaceFiles = await fs.readdir(workspaceDir);
    const sortedFiles = workspaceFiles.sort((a, b) => a.localeCompare(b));
    const directories = [];
    const files = [];

    for (const file of sortedFiles) {
        if (!processedFiles.has(file)) {
            processedFiles.add(file);

            const fileName = file;
            const fileStats = await fs.stat(path.join(workspaceDir, file));
            const isDirectory = fileStats.isDirectory();
            const fileElement = document.createElement('p');
            const folderIcon = document.createElement('img');
            folderIcon.classList.add('icon');
            const fileExt = path.extname(file);
            const iconPath = fileExt === '.lua' ? 'imgs/lua.png' : 'imgs/code.png';
            folderIcon.setAttribute('src', isDirectory ? 'imgs/folder.png' : iconPath);
            folderIcon.setAttribute('alt', isDirectory ? 'Folder Icon' : 'File Icon');
            fileElement.appendChild(folderIcon);

            if (!isDirectory) {
                fileElement.addEventListener('click', async () => {
                    const fileName = fileElement.textContent;
                    openFilePath = path.join(workspaceDir, fileName);
                    const fileContent = await fs.readFile(openFilePath, 'utf-8');
                    const editor = monaco.editor.getModels()[0];
                    editor.setValue(fileContent);
                    const activeElements = document.querySelectorAll('.file-list .active');
                    activeElements.forEach(element => {
                        element.classList.remove('active');
                    });
                    fileElement.classList.add('active');
                });
            }

            const fileNameElement = document.createElement('span');
            fileNameElement.textContent = fileName;
            fileElement.appendChild(fileNameElement);

            if (isDirectory) {
                directories.push(fileElement);
            } else {
                files.push(fileElement);
            }
        }
    }

    
    directories.forEach(directory => document.querySelector('.file-list').appendChild(directory));
    files.forEach(file => document.querySelector('.file-list').appendChild(file));

  } catch (error) {
      console.error(`[SecretBlox] - Failed to read directory at ${workspaceDir}: ${error}`);
  }
};

const currentDir = path.basename(workspaceDir);
const directoryTitleElement = document.getElementById('directory-title');
if (directoryTitleElement) {
    directoryTitleElement.textContent = currentDir;
}



document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'z') {
    const editor = monaco.editor.getModels()[0];
    editor.trigger('keyboard', 'undo', null);
  }
});


const clearButton = document.getElementById('Clear');
if (clearButton) {
    clearButton.addEventListener('click', () => {
        const editor = monaco.editor.getModels()[0];
        editor.setValue('');
    });
}
// help
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 's') {
    const fileName = document.querySelector('.file-list').textContent;
    const editor = monaco.editor.getModels()[0];
    fs.writeFile(openFilePath, editor.getValue()) 
      .then(() => console.log(`[SecretBlox] - Saved`))
      .catch((error) => console.error(`[SecretBlox] - Failed to save file`));
  }
});
setInterval(checkWorkspaceDir, 200);

async function readAndUpdateFile() {
  const state = { lastModifyTime: null }; 

  setInterval(async () => {
      if (openFilePath) {
          try {
              const fileStats = await fs.stat(openFilePath);
              const fileModifyTime = fileStats.mtime;

              if (!state.lastModifyTime || state.lastModifyTime.getTime() < fileModifyTime.getTime()) {
                  const data = await fs.readFile(openFilePath, 'utf-8');
                  
                  const editor = monaco.editor.getModels()[0];
                  const editorValue = editor.getValue();
                  if (editorValue !== data) {
                      editor.setValue(data);
                  }
                  console.log(data);
                  console.log("[SecretBlox] - Live updated");
                  state.lastModifyTime = fileModifyTime; 
              }
          } catch (err) {
              console.error(`[SecretBlox] - Failed to read live update file: ${err.message}`);
          }
      }
  }, 200);
}

readAndUpdateFile();

const apiDir = path.join(__dirname, 'api');
createDirectory(apiDir);

document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('minimizeApp');
});

const WebSocket = require('ws');
const secretbloxSocket = new WebSocket.Server({ port: 8080 });

secretbloxSocket.on('connection', function connection(ws) {
  console.log('[SecretBlox] - Roblox Client Connected.');

  ws.on('message', function incoming(message) {
    console.log(`[SecretBlox] - Received message: ${message}`);
  });

  ws.on('close', function close() {
    console.log('[SecretBlox] - Roblox client disconnected.');
  });

  ws.send('Welcome to SecretBlox!', {encoding: 'utf8'});

  document.getElementById('Execute').addEventListener('click', () => {
    const editorContent = monaco.editor.getModels()[0].getValue();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(editorContent, {encoding: 'utf8'});

      console.log('[SecretBlox] - Executed ws:localhost:8080');
    } else {
      console.log('[SecretBlox] - Roblox Client is not connected.');
    }
  });
});





document.getElementById('close-btn').addEventListener('click', () => {
  ipcRenderer.send('closeApp');
});
