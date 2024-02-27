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
            document.querySelector('.file-list').appendChild(fileElement);
        }
    }
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

const apiDir = path.join(__dirname, 'api');
createDirectory(apiDir);

document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('minimizeApp');
});

document.getElementById('close-btn').addEventListener('click', () => {
  ipcRenderer.send('closeApp');
});
