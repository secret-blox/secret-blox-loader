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


fs.readdir(workspaceDir)
  .then(workspaceFiles => {
    workspaceFiles.forEach(async (file) => {
      const fileName = file.split('.')[0];
      const fileExtension = file.split('.').pop(); 
      const fileElement = document.createElement('p');
      fileElement.textContent = `${fileName}.${fileExtension}`; 
      document.querySelector('.file-list').appendChild(fileElement);
    });
  })
  .catch(error => {
    console.error(`[SecretBlox] - Failed to read directory at ${workspaceDir}: ${error}`);
  });

const apiDir = path.join(__dirname, 'api');
createDirectory(apiDir);

document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('minimizeApp');
});

document.getElementById('close-btn').addEventListener('click', () => {
  ipcRenderer.send('closeApp');
});
