const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

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

const checkWorkspaceDir = async () => {
  try {
    const workspaceFiles = await fs.readdir(workspaceDir);
    workspaceFiles.forEach(async (file) => {
      if (!processedFiles.has(file)) {
        processedFiles.add(file);

        const fileName = file;
        const isDirectory = await fs.stat(path.join(workspaceDir, file)).then(stats => stats.isDirectory()).catch(() => false);
        const fileElement = document.createElement('p');
        const folderIcon = document.createElement('img');
        folderIcon.classList.add('icon'); 
        if (isDirectory) {
          folderIcon.setAttribute('src', 'imgs/folder.png');
          folderIcon.setAttribute('alt', 'Folder Icon');
          fileElement.appendChild(folderIcon);
        } else {
          let openFilePath = '';
          fileElement.addEventListener('click', async () => {
            const fileName = fileElement.textContent;
            const openFilePath = path.join(workspaceDir, fileName);
            const fileContent = await fs.readFile(openFilePath, 'utf-8');
            const editor = monaco.editor.getModels()[0];
            editor.setValue(fileContent);
          });

          folderIcon.setAttribute('src', 'imgs/file.png');
          folderIcon.setAttribute('alt', 'File Icon');
          fileElement.appendChild(folderIcon);
        }
        const fileNameElement = document.createElement('span');
        fileNameElement.textContent = fileName;
        fileElement.appendChild(fileNameElement);
        document.querySelector('.file-list').appendChild(fileElement);
      }
    });
  } catch (error) {
    console.error(`[SecretBlox] - Failed to read directory at ${workspaceDir}: ${error}`);
  }
};


// help
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 's') {
    const fileName = document.querySelector('.file-list').textContent;
    const openFilePath = path.join(workspaceDir, fileName);
    const editor = monaco.editor.getModels()[0];
    fs.writeFile(openFilePath, editor.getValue())
      .then(() => console.log(`File ${fileName} saved successfully`))
      .catch((error) => console.error(`Failed to save file ${fileName}: ${error}`));
  }
});

setInterval(checkWorkspaceDir, 1000);

const apiDir = path.join(__dirname, 'api');
createDirectory(apiDir);

document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('minimizeApp');
});

document.getElementById('close-btn').addEventListener('click', () => {
  ipcRenderer.send('closeApp');
});
