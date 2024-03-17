const { ipcRenderer, dialog } = require("electron");
const path = require('path');
const fs = require('fs');

const amdLoader = require('../../../node_modules/monaco-editor/min/vs/loader.js');
const amdRequire = amdLoader.require;

const tabsContainer = document.querySelector('.tabs-container');
const rightPanel = document.querySelector('.right-panel');
const filesContainer = document.getElementById('filesContainer');
const quickActions = document.querySelector('.quick-actions');
const leftPanel = document.querySelector('.left-panel')
const actionsContainer = document.querySelector('.actions')

let enterPressed = false; // flag for renaming
let explorerVisible = true; // flag for explorer visibility
const actions = {
    'File': { items: ['New File', 'Open', 'Save', 'Save As']},
    'Edit': { items: ['Undo', 'Redo', 'Cut', 'Copy', 'Paste']},
    'Selection': { items: ['Select All', 'Expand Selection', 'Shrink Selection']},
    'View': { items: ['Zoom In', 'Zoom Out', 'Reset Zoom']}
};

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
    static activeTab = null;

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
        closeButton.innerHTML = '<img src="../assets/actions/remove.svg" alt="Add" style="width: 16px; height: 16px; display: flex;">';
        closeButton.classList.add('close-tab-button');
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
                    { token: 'print', foreground: '#ff6666' },
                    { token: 'string', foreground: '#A9A9A9' },
                    { token: 'io', foreground: '#ccffcc' },
                    { token: 'print', foreground: '#ffcccc' },
                    { token: 'fact', foreground: '#ffcccc' },
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
                    { token: 'Torso', foreground: '#ffb366'},

                    { token: 'lightblue', foreground: '#3a9fbf'}
                ],
                colors: {
                    'editor.foreground': '#FFFFFF',
                    'editor.background': '#18181d',
                }
            });

            const commentPattern = /--.*$/;
            const stringPattern = /\".*?\"|'.*?'/;
            const numberPattern = /\b\d+\.?\d*\b/;
            const keywordPattern = /\b(if|else|elseif|end|while|do|for|in|local|return|break|true|false|nil|then)\b/;
            const lightbluePattern = /\b(print|game|workspace|torso|function|ToolUtils|Tool|LocalPlayer|Torso|table|insert|GetPlayers|CFrame|ScreenGui|Frame|Players|Game|GetPlayer|Workspace|getChildren|StarterGui|GetDescendants|ReplicatedStorage|DefaultChatSystemChatEvents|SayMessageRequest|FireServer|GetObjects|loadstring|SetCore|pairs|GetChildren|Destroy|sub|Clone|GetChildren|until|repeat|DisplayDistanceType|CameraSubject|EquipTool|assert|connect|Instance|GetMouse|WaitForChild|ClassName|findFirstChild|RenderStepped|CurrentCamera|Character|spawn|Connect|HumanoidRootPart|warn|error|Humanoid|Animate|Disabled|Humanoid|Name|CoordinateFrame|lookVector|GetFullName)\b/;
            const waitStringPattern = /\b(wait)\b/;
            const commentKeywordPattern = /\b(GetService|DescendantAdded|string|Backpack|Text|new)\b/;
            const identifierPattern = /[a-zA-Z_]\w*/;
            const operatorPattern = /[+\-*/%^#=<>]/;
            const delimiterPattern = /[()\[\]{};]/;
            const whitespacePattern = /\s+/;
            const variablePattern = /(?<=\blocal\s+)[a-zA-Z_]\w*/; // Updated pattern to match variable names following 'local' keyword
    
            monaco.languages.setMonarchTokensProvider('lua', {
              tokenizer: {
                root: [
                  // Comments
                  [commentPattern, 'comment'],
    
                  // Strings
                  [stringPattern, 'string'],
    
                  // Numbers
                  [numberPattern, 'number'],
    
                  // Keywords and identifiers
                  [keywordPattern, 'keyword'],
                  [lightbluePattern, 'lightblue'],
                  [waitStringPattern, 'string'],
    
                  [commentKeywordPattern, 'comment'],
    
                  [identifierPattern, 'identifier'],
    
                  // Variables (highlighted as gray)
                  [variablePattern, 'string'], 
    
                  // Operators and punctuation
                  [operatorPattern, 'operator'],
                  [delimiterPattern, 'delimiter'],
    
                  // Whitespace
                  { include: '@whitespace' },
                ],
                whitespace: [
                  [whitespacePattern, 'white'],
                ],
              },
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
                this.activeTab = editor.getModel();
                editorContainer.style.display = 'block';
                tab.classList.add('active');
                tab.style.backgroundColor = '#18181d';
                tab.style.borderTop = '1px solid #df2121';
            } else {
                editorContainer.style.display = 'none';
                tab.classList.remove('active');
                tab.style.backgroundColor = '';
                tab.style.borderTop = 'none';
            }
        });
    }
}


// initialization
document.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.invoke('load-files', 'workspace').then(entries => {
        const FM = new FileManager();
        FM.renderEntries(entries, filesContainer);
    }).catch(err => {
        console.error('[ERROR] Attempting to load files:', err);
    });

    EditorManager.createTab('Untitled-1', 'print("SecretBlox")');

    quickActions.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') {
            const action = e.target.textContent;
            const actionDetails = actions[action];
            if (actionDetails) {
                createMenu(e.target, actionDetails.items);
                
                quickActions.querySelectorAll('button').forEach(btn => {
                    btn.style.backgroundColor = 'transparent'; 
                });
                e.target.style.backgroundColor = '#33333380'; 
            }
        }
    });
    function createMenu(target, items) {
        const existingMenu = document.querySelector('.quick-container');

        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'quick-container';
        menu.style.position = 'absolute';

        items.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item;
            menu.appendChild(button);
        });
    
        document.body.appendChild(menu);

        const rect = target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
    }
});

function resizeEditor(size) {
    const descendants = rightPanel.querySelectorAll('*');

    descendants.forEach(descendant => {
        if (descendant === tabsContainer || descendant === actionsContainer || isDescendantOf(descendant, tabsContainer)) {
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

    function isDescendantOf(element, parent) {
        while (element !== null) {
            if (element === parent) {
                return true;
            }
            element = element.parentNode;
        }
        return false;
    }
}

const WebSocket = require('ws');
const secretbloxSocket = new WebSocket.Server({ port: 49152 });

const WSOpCode = {
  WS_NOP: 77,
  WS_EXEC: 78,
  WS_SETFPS: 79,
  WS_MSG: 80
}

secretbloxSocket.on('connection', function connection(ws) {
  console.log('[SecretBlox] - Roblox Client Connected.');

  ws.on('message', function incoming(message) {
    console.log(`[SecretBlox] - Received message: ${message}`);
  });

  ws.on('close', function close() {
    console.log('[SecretBlox] - Roblox client disconnected.');
  });

  ws.send(String.fromCharCode(WSOpCode.WS_MSG) + 'Welcome to SecretBlox!', {encoding: 'utf8'});

  document.getElementById('Execute').addEventListener('click', () => {
    
    const editorContent = EditorManager.activeTab.getValue();
    if (ws.readyState === WebSocket.OPEN) {
 
      let msg = String.fromCharCode(WSOpCode.WS_EXEC) + editorContent;
      ws.send(msg, {encoding: 'utf8'});
      console.log('[SecretBlox] - Executed ws:localhost:49152');

    } else {
      console.error('[SecretBlox] - Roblox Client is not connected.');
     
    }
  });
});

const clearButton = document.getElementById('Clear');
if (clearButton) {
    clearButton.addEventListener('click', () => {
        const editor = EditorManager.activeTab;
        editor.setValue('');
    });
}

const openFileButton = document.getElementById('OpenFile');
if (openFileButton) {
    openFileButton.addEventListener('click', async () => {
        const fileResults = await ipcRenderer.invoke('open-file-dialog');

        if (fileResults.canceled == false) {
            EditorManager.activeTab.setValue(fileResults.content);
        }
    });
}


document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'b') {
        if (explorerVisible) {
            leftPanel.style.display = 'none';
            tabsContainer.style.width = '897px';
            actionsContainer.style.width = '881px';
            resizeEditor('897px')
        } else {
            leftPanel.style.display = 'block';
            tabsContainer.style.width = '700px';
            actionsContainer.style.width = '684px';
            resizeEditor('700px')
        }
        explorerVisible = !explorerVisible;
    }
});



const DiscordRPC = require('discord-rpc');
const clientId = '1213082883640533002'; 
DiscordRPC.register(clientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

let startTimestamp = new Date();

async function setActivity() {
  if (!rpc || !rpc.user) {
    return;
  }

  await rpc.setActivity({
    details: 'Developing in SecretBlox',
    state: 'Coding with Roblox',
    startTimestamp: startTimestamp,
    largeImageKey: 'test-blox', 
    largeImageText: 'SecretBlox',
    smallImageKey: 'test-blox',
    smallImageText: 'Luau',
    instance: false,
  });
}

rpc.on('ready', () => {
  console.log(`SecretBlox RPC connected to - ${rpc.user.username}`);
  setActivity();
  setInterval(() => {
    setActivity();
  }, 15000);
});

rpc.login({ clientId }).catch(console.error);



document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('closeApp');
});
document.getElementById('minimize-btn').addEventListener('click', () => {
    ipcRenderer.send('minimizeApp');
});