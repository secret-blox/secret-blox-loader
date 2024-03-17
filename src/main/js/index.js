const { ipcRenderer } = require("electron");

(async () => {
    const secretKey = await ipcRenderer.invoke('fetch-secret-key');
    if (secretKey == '') {
        const keyInput = document.getElementById('secret-key-input');
        const keySubmitButton = document.getElementById('submit-secret-key');
        const loadingDots = document.getElementById('loading-dots');

        keyInput.style.display = 'inline-block';
        keySubmitButton.style.display = 'inline-block';
        loadingDots.style.display = 'none';

        keySubmitButton.addEventListener('click', () => {
            ipcRenderer.invoke('save-secret-key', keyInput.value)
        
            keyInput.style.display = 'none';
            keySubmitButton.style.display = 'none';
            loadingDots.style.display = 'flex';
            setTimeout(() => {
                ipcRenderer.invoke('go-main');
            }, 1000)
        })
    } else {
        setTimeout(() => {
            ipcRenderer.invoke('go-main');
        }, 1000)
    }
})();