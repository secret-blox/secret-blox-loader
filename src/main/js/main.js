const { ipcRenderer } = require("electron");
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const secretbloxSocket = new WebSocket.Server({ port: 49152 });
const amdLoader = require('../../../node_modules/monaco-editor/min/vs/loader.js');
const amdRequire = amdLoader.require;

const tabsContainer = document.querySelector('.tabs-container');
const rightPanel = document.querySelector('.right-panel');
const filesContainer = document.getElementById('filesContainer');
const quickActions = document.querySelector('.quick-actions');
const leftPanel = document.querySelector('.left-panel');
const actionsContainer = document.querySelector('.actions');
const resizeHandle = document.querySelector('.resize-handle');
const executorButtons = document.querySelector('.executor-buttons');
const dots = document.getElementById('dots');
const injectButton = document.getElementById('inject');
const closeWindow = document.getElementById('close');
const minimizeWindow = document.getElementById('minimize');

let enterPressed = false; // flag for renaming
let explorerVisible = true; // flag for explorer visibility
let isResizing = false;
let lastDownX = 0;
let startWidth = 0;
let hoverTimer;
let globalWs = null;

const actions = {
    'File': { items: [{ name: 'New File' }, { name: 'Open' }, { name: 'Save' }, { name: 'Save As' }] },
    'Edit': { items: [
        { name: 'Undo', extraText: 'Ctrl + Z' },
        { name: 'Redo', extraText: 'Ctrl + Y' },
        { name: 'Cut', extraText: 'Ctrl + X' },
        { name: 'Copy', extraText: 'Ctrl + C' },
        { name: 'Paste', extraText: 'Ctrl + V' },
        { name: 'Comment Line' },
        { name: 'Indent Lines' },
        { name: 'Outdent Lines' },
        { name: 'Delete Lines' },
        { name: 'Transform to Uppercase' }
    ]},
    'Selection': { items: [{ name: 'Select All', extraText: 'Ctrl + A' }, { name: 'Expand Selection' }, { name: 'Shrink Selection' }] },
    'View': { items: [{ name: 'Zoom In' }, { name: 'Zoom Out' }, { name: 'Reset Zoom' }] },
    'Dots': { items: [{ name: 'Outline' }] }
};

const WSOpCode = {
    WS_NOP: 77,
    WS_EXEC: 78,
    WS_SETFPS: 79,
    WS_MSG: 80
}


class FileManager {
    constructor() {
        this.selected = null;
    }

    uriFromPath(_path) {
        let pathName = path.resolve(_path).replace(/\\/g, '/');
        if (pathName.length > 0 && pathName.charAt(0) !== '/') {
            pathName = '/' + pathName;
        }
        return encodeURI('file://' + pathName);
    }

    renderEntries(entries, parentElement, level = 0) {
        entries.sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });

        entries.forEach(entry => {
            const entryContainer = document.createElement('div');
            entryContainer.classList.add('entry-container');

            const element = document.createElement('div');
            element.classList.add('entry');
            entryContainer.appendChild(element);
            
            const contentContainer = document.createElement('div');
            contentContainer.classList.add('content-container');
            contentContainer.style.marginLeft = `${level * 13}px`;
            element.appendChild(contentContainer);

            const formatName = (name) => name.length > 10 ? `${name.substring(0, 10)}...` : name;

            if (entry.type === 'folder') {
                const header = document.createElement('div');
                header.classList.add('folder-header');
                header.innerHTML = `
                    <img src="../assets/arrows/close.svg" alt="Toggle" class="toggle-icon">
                    <img src="../assets/explorer/folder.svg" alt="Folder" class="folder-icon">
                    <span>${formatName(entry.name)}</span>`;
                contentContainer.appendChild(header);

                const folderContents = document.createElement('div');
                folderContents.classList.add('folder-contents');
                folderContents.style.display = 'none';
                entryContainer.appendChild(folderContents);

                header.addEventListener('click', function () {
                    const isOpen = folderContents.style.display === 'block';
                    folderContents.style.display = isOpen ? 'none' : 'block';
                    const toggleIcon = header.querySelector('.toggle-icon');
                    const folderIcon = header.querySelector('.folder-icon');
                    toggleIcon.src = isOpen ? "../assets/arrows/close.svg" : "../assets/arrows/open.svg";
                    folderIcon.src = isOpen ? "../assets/explorer/folder.svg" : "../assets/explorer/folderOpen.svg";
                });

                this.renderEntries(entry.files, folderContents, level + 1);
            } else {
                contentContainer.innerHTML = `<img class="toggle-icon" src="../assets/explorer/file.svg" alt="File"> <span>${formatName(entry.name)}</span>`;
                entryContainer.addEventListener('click', () => {
                    ipcRenderer.invoke('get-file', entry.name)
                        .then(response => {
                            if (response.success) {
                                EditorManager.createTab(entry.name, response.contents);
                            } else {
                                console.error('[ERROR] Failed to get file contents ->', response.error);
                            }
                        })
                        .catch(err => {
                            console.error('[ERROR] Fetching file contents ->', err);
                        });
                });
            }
            element.addEventListener('click', function () {
                if (this.selected) {
                    this.selected.classList.remove('active');
                }
                element.classList.add('active');
                this.selected = element;
            }.bind(this));

            parentElement.appendChild(entryContainer);
        });
    }
}


class EditorManager {
    static editors = {};
    static activeEditor = null;

    static uriFromPath(_path) {
        let pathName = path.resolve(_path).replace(/\\/g, '/');
        if (pathName.length > 0 && pathName.charAt(0) !== '/') {
            pathName = '/' + pathName;
        }
        return encodeURI('file://' + pathName);
    }
    
    static createAddButton() {
        const addButton = document.createElement('button');
        addButton.classList.add("tab", "add-tab-button");
        addButton.innerHTML = '<img src="../assets/actions/add.svg" alt="Add" style="width: 16px; height: 16px;">';
        addButton.style.cursor = 'pointer';
        addButton.addEventListener('click', () => {
            const defaultContent = 'print("Secret Blox")';
            const newFileName = `Untitled-${Object.keys(this.editors).length + 1}`;
    
            this.createTab(newFileName, defaultContent);
        });
    
        tabsContainer.appendChild(addButton);
    }  

    static createTab(file, contents) {
        if (this.editors[file]) {
            this.switchTab(file);
            return;
        }

        let addButton = document.querySelector('.add-tab-button');
        if (!addButton) {
            this.createAddButton();
            addButton = document.querySelector('.add-tab-button');
        }

        const tab = document.createElement('button');
        tab.classList.add("tab");

        const icon = document.createElement('img');
        icon.src = '../assets/explorer/file.svg';
        icon.style.marginRight = '8px';
        tab.appendChild(icon);

        const text = document.createElement('span');
        const fileName = file.split('/').pop();
        text.textContent = fileName.length > 10 ? fileName.substring(0, 10) + "..." : fileName;
        tab.appendChild(text);

        const closeButton = document.createElement('span');
        closeButton.classList.add('close-tab-button');

        const closeIcon = document.createElement('img');
        closeIcon.setAttribute('src', '../assets/actions/circle.svg');
        closeIcon.setAttribute('alt', 'Unsaved');
        closeIcon.style.width = '16px';
        closeIcon.style.height = '16px';
        closeButton.appendChild(closeIcon);

        ipcRenderer.invoke('get-file', file)
            .then(response => {
                if (response.success) {
                    closeIcon.setAttribute('src', '../assets/actions/remove.svg');
                    closeIcon.setAttribute('alt', 'Close');
                    closeIcon.style.width = '16px';
                    closeIcon.style.height = '16px';
                } else {
                    closeIcon.setAttribute('src', '../assets/actions/circle.svg');
                    closeButton.style.opacity = '1';
                    closeIcon.style.width = '10px';
                    closeIcon.style.height = '10px';

                    closeButton.addEventListener('mouseenter', () => {
                        closeIcon.setAttribute('src', '../assets/actions/remove.svg');
                        closeIcon.style.width = '16px';
                        closeIcon.style.height = '16px';
                    });
                    closeButton.addEventListener('mouseleave', () => {
                        closeIcon.setAttribute('src', '../assets/actions/circle.svg');
                        closeIcon.style.width = '10px';
                        closeIcon.style.height = '10px';
                    });
                }
            })
            .catch(err => {
                console.error('[ERROR] Fetching file contents ->', err);
            });

        closeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            if (Object.keys(this.editors).length > 1) {
                this.deleteTab(file);
            } else {
                console.log("[ERROR] Cannot close tab");
            }
        });

        tab.appendChild(closeButton);
        tabsContainer.appendChild(tab);

        if (addButton instanceof Node) {
            tabsContainer.appendChild(addButton);
        }    

        const editorContainer = document.createElement('div');
        editorContainer.style.height = "262px";
        editorContainer.style.width = "700px";
        editorContainer.style.overflow = "hidden";
        rightPanel.appendChild(editorContainer);

        amdRequire.config({
            baseUrl: this.uriFromPath(path.join(__dirname, '../../../node_modules/monaco-editor/min'))
        });

        amdRequire(['vs/editor/editor.main'], function () {
            monaco.editor.defineTheme('secretblox', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'function', foreground: '#ff6666' },
                    { token: 'keyword', foreground: '#ff6666' },
                    { token: 'number', foreground: '#ffb366' },
                    { token: 'comment', foreground: '#808080' },
                    { token: 'string', foreground: '#A9A9A9' },
                    { token: 'io', foreground: '#ccffcc' },
                    { token: 'print', foreground: '#ffcccc' },
                    { token: 'boolean', foreground: '#cceeff' },
                    { token: 'table', foreground: '#ffddcc' },
                    { token: 'operator', foreground: '#ffb3cc' },
                    { token: 'local', foreground: '#ffcccc' },
                    { token: 'return', foreground: '#ffcccc' },
                    { token: 'elseif', foreground: '#ffcccc' },
                    { token: 'then', foreground: '#ffcccc' },
                    { token: 'do', foreground: '#ffcccc' },
                    { token: 'end', foreground: '#ffcccc' },
                    { token: 'for', foreground: '#ffcccc' },
                    { token: 'while', foreground: '#ffcccc' },
                    { token: 'repeat', foreground: '#ffcccc' },
                    { token: 'until', foreground: '#ffcccc' },
                    { token: 'in', foreground: '#ffcccc' },
                    { token: 'game', foreground: '#ffb366'},
                    { token: 'workspace', foreground: '#ffb366'},
                ],
                colors: {
                    'editor.foreground': '#FFFFFF',
                    'editor.background': '#18181d',
                }
            });

            /* 
            TODO: 

            - intellisense needs reworking
            - definitions
            - datatypes
            */

            let completionData = []; // store the json so we dont have to parse it each keypress (default behaviour)
            
            fs.readFile(path.join(__dirname, '../../../api/Corrections.json'), 'utf8', (err, data) => {
                if (err) {
                    console.error('[ERROR] Reading JSON file:', err);
                    return;
                }
            
                JSON.parse(data).Classes.forEach(cls => {
                    cls.Members.forEach(member => {
                        let item = {
                            label: member.Name,
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: member.Name,
                            detail: `${cls.Name}.${member.Name}`,
                            documentation: `Member of ${cls.Name}`
                        };
                        completionData.push(item);
                    });
                });
            });

            (async function registerCompletionProvider() { // leave as async func since we have to wait for the completionData array to populate before registering the items
                monaco.languages.registerCompletionItemProvider('lua', {
                    provideCompletionItems: function(model, position) {
                        const word = model.getWordUntilPosition(position);
                        const range = {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: word.startColumn,
                            endColumn: word.endColumn
                        };

                        completionData.forEach(item => {
                            item.range = range;
                        });
        
                        return { suggestions: completionData };
                    }
                });
            })();
            
            var editor = monaco.editor.create(editorContainer, {
                value: contents,
                language: 'lua',
                theme: "secretblox",
                automaticLayout: true
            });

            editor.onDidChangeModelContent((event) => {
                const closeIcon = tab.querySelector('.close-tab-button img');
                if (closeIcon) {
                    closeIcon.setAttribute('src', '../assets/actions/circle.svg');
                    closeButton.style.opacity = '1';
                    closeIcon.style.width = '10px';
                    closeIcon.style.height = '10px';

                    closeButton.addEventListener('mouseenter', () => {
                        closeIcon.setAttribute('src', '../assets/actions/remove.svg');
                        closeIcon.style.width = '16px';
                        closeIcon.style.height = '16px';
                    });
                    closeButton.addEventListener('mouseleave', () => {
                        closeIcon.setAttribute('src', '../assets/actions/circle.svg');
                        closeIcon.style.width = '10px';
                        closeIcon.style.height = '10px';
                    });
                }
            });

            this.editors[file] = { editor, tab, editorContainer };

            this.switchTab(file);
        }.bind(this));

        tab.addEventListener('click', () => {
            this.switchTab(file);
        });

        tabsContainer.insertBefore(tab, addButton);
        tab.addEventListener('dblclick', (event) => {
            event.stopPropagation();
        
            const inputContainer = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'text';
            const baseFileName = path.basename(fileName, '.lua');
            input.value = baseFileName;
            input.style.width = '50px';
            input.classList.add('rename');
        
            const extensionText = document.createElement('span');
            extensionText.textContent = '.lua';
            extensionText.style.marginLeft = '5px';
        
            inputContainer.appendChild(input);
            inputContainer.appendChild(extensionText);
            tab.innerHTML = '';
            tab.appendChild(inputContainer);
            input.focus();
            input.select();
        
            const applyChanges = () => {
                let newFileName = input.value.trim();
                const extenstion = path.extname(file);
            
                if (!path.extname(newFileName)) {
                    newFileName += extenstion;
                }
            
                if (newFileName && newFileName !== file) {
                    ipcRenderer.invoke('check-and-rename-file', { oldPath: file, newPath: newFileName })
                        .then((result) => {
                            if (result.success) {
                                const FM = new FileManager();
                                const editorData = this.editors[file];
                                delete this.editors[file];
                                this.editors[newFileName] = editorData;
            
                                const newTextContent = newFileName.length > 10 ? newFileName.substring(0, 10) + "..." : newFileName;
                                text.textContent = newTextContent;
            
                                ipcRenderer.invoke('load-files', 'workspace').then(entries => {
                                    while (filesContainer.firstChild) {
                                        filesContainer.removeChild(filesContainer.firstChild);
                                    }
                            
                                    FM.renderEntries(entries, filesContainer);
                                }).catch(err => {
                                    console.error('[ERROR] Attempting to load files:', err);
                                });
            
                                file = newFileName;
                            } else {
                                console.error('[ERROR] File rename failed:', result.error);
                            }
                        })
                        .catch(err => {
                            console.error('[ERROR] Checking and renaming file:', err);
                        });
                }
                tab.insertBefore(icon, tab.firstChild);
                tab.appendChild(text);
                tab.appendChild(closeButton);
                if (input) {
                    inputContainer.remove();
                }
            };
        
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    enterPressed = true;
                    applyChanges();
                    e.preventDefault();
                }
            });
            
            input.addEventListener('blur', () => {
                if (!enterPressed) {
                    applyChanges();
                }
                enterPressed = false;
            });
        });
    }

    static deleteTab(file) {
        if (!this.editors[file]) { return; }

        const remainingFiles = Object.keys(this.editors);
        const currentTabIndex = remainingFiles.indexOf(file);
    
        let nextTabFile = null;
        if (currentTabIndex !== -1) {
            if (currentTabIndex + 1 < remainingFiles.length) {
                nextTabFile = remainingFiles[currentTabIndex + 1];
            }
            else if (currentTabIndex - 1 >= 0) {
                nextTabFile = remainingFiles[currentTabIndex - 1];
            }
        }

        const { editor, tab, editorContainer } = this.editors[file];
        editor.dispose();
        tab.remove();
        editorContainer.remove();
        delete this.editors[file];

        if (nextTabFile) {
            this.switchTab(nextTabFile);
        } else if (Object.keys(this.editors).length > 0) {
            this.switchTab(Object.keys(this.editors)[0]);
        }
    }

    static switchTab(file) {
        Object.keys(this.editors).forEach(path => {
            const { editor, tab, editorContainer } = this.editors[path];
            if (path === file) {
                editorContainer.style.display = 'block';
                tab.classList.add('active');
                tab.style.backgroundColor = '#18181d';
                tab.style.borderTop = '1px solid #df2121';
                this.activeEditor = path;
            } else {
                editorContainer.style.display = 'none';
                tab.classList.remove('active');
                tab.style.backgroundColor = '';
                tab.style.borderTop = 'none';
            }
        });
    }

    static saveState() {
        const tabsState = Object.keys(this.editors).map(file => {
            const { editor } = this.editors[file];
            return {
                file,
                contents: editor.getValue()
            };
        });
    
        const stateJSON = JSON.stringify(tabsState);
        const savePath = path.join(__dirname, '../../../bin');
        const saveFile = path.join(savePath, 'save.json');
    
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }

        fs.writeFileSync(saveFile, stateJSON, 'utf8');
    }

    static getActiveEditor() {
        return this.activeEditor;
    }
}

class Misc {
    static createMenu(target, items) {
        const existingMenu = document.querySelector('.quick-container');
    
        if (existingMenu) {
            existingMenu.remove();
        }
    
        const menu = document.createElement('div');
        menu.className = 'quick-container';
        menu.id = 'quickMenu';
        menu.style.position = 'absolute';
    
        items.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item.name;
            if (item.extraText) {
                const span = document.createElement('span');
                span.textContent = item.extraText;
                span.style.float = 'right';
                span.style.opacity = '0.7';
                button.appendChild(span);
            }
            button.addEventListener('click', function() {
                Misc.performAction(item.name);
            });
            menu.appendChild(button);
        });
    
        document.body.appendChild(menu);
    
        const rect = target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
    }

    static closeMenu() {
        const quickMenu = document.getElementById('quickMenu');
        if (quickMenu) {
            quickMenu.remove();
        }

        quickActions.querySelectorAll('button').forEach(btn => {
            btn.style.backgroundColor = 'transparent'; 
        });
        dots.style.backgroundColor = 'transparent';
    }

    static performAction(action) {
        const editor = EditorManager.editors[EditorManager.getActiveEditor()]?.editor;
        console.log(editor)
        switch (action) {
            case 'New File':
                EditorManager.createTab(`Untitled-${Object.keys(EditorManager.editors).length + 1}`, 'print("SecretBlox")');
                this.closeMenu();
                break;
            case 'Open':
                ipcRenderer.invoke('open-file').then(response => {
                    if (response.success && response.filePath) {
                        EditorManager.createTab(path.basename(response.filePath), response.contents);
                    }
                }).catch(err => {
                    console.error('[ERROR] Opening file:', err);
                });
                this.closeMenu();
                break;
            case 'Save':
                Misc.saveFile();
                this.closeMenu();
                break;
            case 'Save As':
                Misc.saveFile();
                this.closeMenu();
                break;
            case 'Undo':
                editor.trigger('keyboard', 'undo', null);
                this.closeMenu();
                break;
            case 'Redo':
                editor.trigger('keyboard', 'redo', null);
                this.closeMenu();
                break;
            case 'Cut':
                const selection = editor.getSelection();
                if (selection) {
                    editor.executeEdits('', [{
                        range: selection,
                        text: null
                    }]);
                }
                this.closeMenu();
                break;
            case 'Copy':
                editor.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
                this.closeMenu();
                break;
            case 'Paste':
                editor.trigger('source', 'editor.action.pasteAsText');
                this.closeMenu();
                break;
            case 'Select All':
                editor.trigger('keyboard', 'editor.action.selectAll');
                this.closeMenu();
                break;
            case 'Expand Selection':
                editor.trigger('', 'editor.action.smartSelect.expand');
                this.closeMenu();
                break;
            case 'Shrink Selection':
                editor.trigger('', 'editor.action.smartSelect.shrink');
                this.closeMenu();
                break;
            case 'Zoom In':
                editor.trigger('source', 'editor.action.fontZoomIn');
                this.closeMenu();
                break;
            case 'Zoom Out':
                editor.trigger('source', 'editor.action.fontZoomOut');
                this.closeMenu();
                break;
            case 'Reset Zoom':
                editor.trigger('source', 'editor.action.fontZoomReset');
                this.closeMenu();
                break;
            case 'Comment Line':
                editor.trigger('keyboard', 'editor.action.commentLine', null);
                this.closeMenu();
                break;
            case 'Indent Lines':
                editor.trigger('keyboard', 'editor.action.indentLines', null);
                this.closeMenu();
                break;
            case 'Outdent Lines':
                editor.trigger('keyboard', 'editor.action.outdentLines', null);
                this.closeMenu();
                break;
            case 'Delete Lines':
                editor.trigger('keyboard', 'editor.action.deleteLines', null);
                this.closeMenu();
                break;
            case 'Transform to Uppercase':
                editor.trigger('keyboard', 'editor.action.transformToUppercase', null);
                this.closeMenu();
                break;     
            default:
                console.log('[ERROR] No case associated with: ', action);
        }
    }

    static resizeEditor(size) {
        console.log(rightPanel)
        const descendants = rightPanel.querySelectorAll('*');
    
        descendants.forEach(descendant => {
            if (descendant === tabsContainer || descendant === actionsContainer || Misc.isDescendantOf(descendant, tabsContainer)) {
                return;
            }
    
            if (descendant.getAttribute('data-mode-id') !== 'lua') {
                return;
            }
    
            const inlineStyle = descendant.style.cssText;
    
            if (inlineStyle.includes('width')) {
                descendant.style.width = size;
            }
        });
    }

    static isDescendantOf(element, parent) {
        while (element !== null) {
            if (element === parent) {
                return true;
            }
            element = element.parentNode;
        }
        return false;
    }

    static updateRef(oldFileName, newFileName, editorInstance) {
        console.log(oldFileName)
        const editorData = EditorManager.editors[oldFileName];
        if (!editorData) {
            console.error(`[ERROR] Editor data not found for file: ${oldFileName}`);
            return;
        }
        const tabText = editorData.tab.querySelector('span');
        tabText.textContent = newFileName.length > 10 ? newFileName.substring(0, 10) + "..." : newFileName;
    }

    static async saveFile() {
        let fileName = EditorManager.activeEditor; 
        if (!fileName) {
            console.error('[ERROR] No active editor found');
            return;
        }
        let editorData = EditorManager.editors[fileName];
        if (!editorData) {
            console.error('[ERROR] Editor data not found for file:', fileName);
            return;
        }
    
        const { editor, tab } = editorData;
        const contents = editor.getValue();
    
        try {
            const response = await ipcRenderer.invoke('get-file', fileName);
    
            let saveResponse;
            if (response.success && response.exists) {
                saveResponse = await ipcRenderer.invoke('save-file', { filePath: response.filePath, contents });
            } else {
                saveResponse = await ipcRenderer.invoke('save-file', { filePath: `workspace/${fileName}`, contents });
                if (saveResponse.success) {
                    const newFileName = path.basename(saveResponse.filePath);
                    this.updateRef(fileName, newFileName, editor);
                    fileName = newFileName;
                }
            }
    
            if (saveResponse.success) {
                Notification.play('File Saved', `The file: ${fileName} has been successfully saved.`);
                const closeIcon = tab.querySelector('.close-tab-button img');
                if (closeIcon) {
                    closeIcon.setAttribute('src', '../assets/actions/remove.svg');
                    const closeButton = closeIcon.parentNode;
                    const clonedCloseButton = closeButton.cloneNode(true);
    
                    clonedCloseButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        EditorManager.deleteTab(fileName);
                    });
    
                    const clonedCloseIcon = clonedCloseButton.querySelector('img');
                    clonedCloseIcon.setAttribute('src', '../assets/actions/remove.svg');
    
                    closeButton.parentNode.replaceChild(clonedCloseButton, closeButton);
                }
            } else {
                console.error('[ERROR] Failed to save the file:', saveResponse.message);
            }
        } catch (error) {
            console.error('[ERROR] Error saving the file:', error);
        }
    }
}

class Notification {
    static play(title, message) {
        const notification = document.createElement('div');
        notification.className = 'notification-container';
        notification.innerHTML = `<span class="notification-title"><strong>${title}</strong></span><p>${message}</p>`;
        document.body.appendChild(notification);

        notification.addEventListener('mouseenter', () => {
            hoverTimer = setTimeout(() => {
                notification.classList.add('hovered');
            }, 1000);
        });
        
        notification.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimer);
        });

        setTimeout(() => {
            notification.classList.add('notification-slide-in');
        }, 100);

        setTimeout(() => {
            notification.classList.replace('notification-slide-in', 'notification-slide-out');

            notification.addEventListener('transitionend', () => {
                notification.remove();
            });
        }, 1500 + 500);
    }
}

// initialization + event listeners
document.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.invoke('load-files', 'workspace').then(entries => {
        const FM = new FileManager();
        FM.renderEntries(entries, filesContainer);
    }).catch(err => {
        console.error('[ERROR] Attempting to load files:', err);
    });

    quickActions.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') {
            const action = e.target.textContent;
            const actionDetails = actions[action];
            if (actionDetails) {
                Misc.createMenu(e.target, actionDetails.items);
                
                quickActions.querySelectorAll('button').forEach(btn => {
                    btn.style.backgroundColor = 'transparent'; 
                });
                e.target.style.backgroundColor = '#33333380'; 
            }
        }
    });

    dots.addEventListener('click', function(e) {
        const actionDetails = actions["Dots"];
        if (actionDetails) {
            Misc.createMenu(e.target, actionDetails.items);
            dots.style.backgroundColor = '#33333380';
        }
    });

    try {
        const tabsSavePath = path.join(__dirname, '../../../bin/save.json');
        if (fs.existsSync(tabsSavePath)) {
            const data = JSON.parse(fs.readFileSync(tabsSavePath, 'utf8'));

            data.forEach(tab => {
                EditorManager.createTab(tab.file, tab.contents);
            });
        } else {
            EditorManager.createTab('Untitled-1', 'print("SecretBlox")');
        }
    } catch (err) {
        console.error('[ERROR] Loading tabs state:', err);
    }
    setInterval(() => {
        EditorManager.saveState();
    }, 5000);
});

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'b') {
        if (explorerVisible) {
            leftPanel.style.display = 'none';
            tabsContainer.style.width = '897px';
            actionsContainer.style.width = '881px';
            Misc.resizeEditor('897px')
        } else {
            leftPanel.style.display = 'block';
            tabsContainer.style.width = '700px';
            actionsContainer.style.width = '684px';
            Misc.resizeEditor('700px')
        }
        explorerVisible = !explorerVisible;
    }
});

document.addEventListener('click', function(e) {
    const quickMenu = document.getElementById('quickMenu');
    
    if (quickMenu && !quickMenu.contains(e.target) && !quickActions.contains(e.target) && !dots.contains(e.target)) {
        Misc.closeMenu()
    }
});

executorButtons.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
        const editor = EditorManager.editors[EditorManager.getActiveEditor()]?.editor;
        console.log(editor);

        switch (button.textContent.trim()) {
            case 'Execute':
                console.log(editor.getValue())
                if (globalWs && globalWs.readyState === WebSocket.OPEN) {
                    let msg = String.fromCharCode(WSOpCode.WS_EXEC) + editor.getValue();
                    globalWs.send(msg, {encoding: 'utf8'});
                    console.log('[SecretBlox] - Executed ws:localhost:49152');
                } else {
                    console.error('[SecretBlox] - Roblox Client is not connected.');
                }
                break;
                break;
            case 'Clear':
                editor.setValue('');
                break;
            case 'Open File':
                ipcRenderer.invoke('open-file').then(response => {
                    if (response.success && response.filePath) {
                        EditorManager.createTab(path.basename(response.filePath), response.contents);
                    }
                }).catch(err => {
                    console.error('[ERROR] Opening file:', err);
                });
                break;
            case 'Save File':
                Misc.saveFile();
                break;
            default:
                console.log('[ERROR] What did bro press?!');
        }
    });
});

secretbloxSocket.on('connection', function connection(ws) {
    console.log('[SecretBlox] - Roblox Client Connected.');
    globalWs = ws;

    ws.on('message', function incoming(message) {
        console.log(`[SecretBlox] - Received message: ${message}`);
    });

    ws.on('close', function close() {
        console.log('[SecretBlox] - Roblox client disconnected.');
        globalWs = null;
    });

    ws.send(String.fromCharCode(WSOpCode.WS_MSG) + 'Welcome to SecretBlox!', {encoding: 'utf8'});
});

  

injectButton.addEventListener('click', async () => {
    await ipcRenderer.invoke('inject');
})

document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        Misc.saveFile();
    }
});

closeWindow.addEventListener('click', () => {
    ipcRenderer.send('closeApp');
});

minimizeWindow.addEventListener('click', () => {
    ipcRenderer.send('minimizeApp');
});


/*
function onMouseMove(e) {
    if (!isResizing) {
        return;
    }
    const dx = e.clientX - lastDownX;
    if (Math.abs(dx) > 5) {
        const newWidth = startWidth + dx;
        leftPanel.style.width = newWidth + 'px';
    }
}

function onMouseUp() {
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
}

resizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    lastDownX = e.clientX;
    startWidth = leftPanel.offsetWidth;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
});
*/
