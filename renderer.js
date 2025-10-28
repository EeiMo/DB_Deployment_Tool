const { ipcRenderer } = require('electron');

// 全局状态
let currentDirectory = null;
let sqlFiles = {};
let deploymentQueue = [];
let isConnected = true; // 数据库连接功能已移除，默认为连接状态
let dbConfig = {}; // 数据库配置已移除

// DOM元素
const elements = {
    // 窗口控制
    minimizeBtn: document.getElementById('minimize-btn'),
    maximizeBtn: document.getElementById('maximize-btn'),
    closeBtn: document.getElementById('close-btn'),
    
    // 目录选择
    selectDirBtn: document.getElementById('select-dir-btn'),
    refreshDirBtn: document.getElementById('refresh-dir-btn'),
    directoryInfo: document.getElementById('directory-info'),
    fileCount: document.getElementById('file-count'),
    fileTree: document.getElementById('file-tree'),
    moveAllBtn: document.getElementById('move-all-btn'),
    
    // 数据库连接
    connectionStatus: document.getElementById('connection-status'),
    dbHost: document.getElementById('db-host'),
    dbPort: document.getElementById('db-port'),
    dbName: document.getElementById('db-name'),
    dbUser: document.getElementById('db-user'),
    dbPassword: document.getElementById('db-password'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    
    // 部署区域
    deploymentQueue: document.getElementById('deployment-queue'),
    startDeploymentBtn: document.getElementById('start-deployment-btn'),
    generateReverseBtn: document.getElementById('generate-reverse-btn'),
    clearQueueBtn: document.getElementById('clear-queue-btn'),
    
    // 日志区域
    logContainer: document.getElementById('log-container'),
    clearLogBtn: document.getElementById('clear-log-btn'),
    
    // 进度条元素
    progressSection: document.getElementById('progress-section'),
    progressText: document.getElementById('progress-text'),
    progressPercentage: document.getElementById('progress-percentage'),
    progressFill: document.getElementById('progress-fill'),
    
    // 跳过报错复选框
    skipErrorCheckbox: document.getElementById('skip-error-checkbox'),
    
    // 逆向脚本模态窗口（保留用于向后兼容，但不再使用）
    reverseScriptModal: document.getElementById('reverse-script-modal'),
    closeReverseModal: document.getElementById('close-reverse-modal'),
    reverseScriptPreview: document.getElementById('reverse-script-preview'),
    folderCount: document.getElementById('folder-count'),
    scriptCount: document.getElementById('script-count'),
    generationTime: document.getElementById('generation-time'),
    exportReverseScriptBtn: document.getElementById('export-reverse-script-btn'),
    copyReverseScriptBtn: document.getElementById('copy-reverse-script-btn'),
    closeReversePreviewBtn: document.getElementById('close-reverse-preview-btn')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    updateUI();
});

// 事件监听器初始化
function initializeEventListeners() {
    // 窗口控制
    elements.minimizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('window-minimize');
    });
    
    elements.maximizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('window-maximize');
    });
    
    elements.closeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('window-close');
    });
    
    // 目录选择
    elements.selectDirBtn.addEventListener('click', selectDirectory);
    elements.refreshDirBtn.addEventListener('click', refreshDirectory);
    elements.moveAllBtn.addEventListener('click', moveAllFoldersToQueue);
    
    // 表结构解析器按钮
    const openSchemaParserBtn = document.getElementById('openSchemaParserBtn');
    if (openSchemaParserBtn) {
        openSchemaParserBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('open-schema-parser-window');
            } catch (error) {
                console.error('打开表结构解析器窗口失败:', error);
                showMessage('打开表结构解析器窗口失败: ' + error.message, 'error');
            }
        });
    }

    // 自动建表按钮
    const openAutoCreateBtn = document.getElementById('open-auto-create-table-btn');
    if (openAutoCreateBtn) {
        openAutoCreateBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('open-auto-create-table-window');
            } catch (error) {
                console.error('打开建表窗口失败:', error);
                showMessage('打开建表窗口失败: ' + error.message, 'error');
            }
        });
    }
    
    // 删除逆向脚本生成器按钮的事件监听器（不再需要）
    // const openReverseGeneratorBtn = document.getElementById('openReverseGeneratorBtn');
    // if (openReverseGeneratorBtn) {
    //     openReverseGeneratorBtn.addEventListener('click', async () => {
    //         try {
    //             await ipcRenderer.invoke('open-reverse-generator');
    //         } catch (error) {
    //             console.error('打开逆向脚本生成器窗口失败:', error);
    //             showMessage('打开逆向脚本生成器窗口失败: ' + error.message, 'error');
    //         }
    //     });
    // }
    
    // 数据库连接功能
    elements.dbConfigBtn = document.getElementById('db-config-btn');
    elements.dbConfigBtn.addEventListener('click', showDbConfigModal);
    
    // 数据库配置弹窗
    elements.dbConfigModal = document.getElementById('db-config-modal');
    elements.modalClose = document.getElementById('modal-close');
    elements.cancelConnectionBtn = document.getElementById('cancel-connection-btn');
    elements.testConnectionModalBtn = document.getElementById('test-connection-modal-btn');
    elements.connectDbBtn = document.getElementById('connect-db-btn');
    elements.dbConfigForm = document.getElementById('db-config-form');
    elements.connectionInfo = document.getElementById('connection-info');
    
    // 弹窗事件
    elements.modalClose.addEventListener('click', hideDbConfigModal);
    elements.cancelConnectionBtn.addEventListener('click', hideDbConfigModal);
    elements.testConnectionModalBtn.addEventListener('click', testDbConnection);
    elements.connectDbBtn.addEventListener('click', connectToDatabase);
    
    // 点击弹窗外部关闭
    elements.dbConfigModal.addEventListener('click', (e) => {
        if (e.target === elements.dbConfigModal) {
            hideDbConfigModal();
        }
    });
    
    // 部署控制
    elements.startDeploymentBtn.addEventListener('click', startDeployment);
    elements.generateReverseBtn.addEventListener('click', generateReverseScriptsFromQueue);
    elements.clearQueueBtn.addEventListener('click', clearQueue);
    elements.clearLogBtn.addEventListener('click', clearLog);
    
    // 逆向脚本模态窗口事件
    elements.closeReverseModal.addEventListener('click', hideReverseScriptModal);
    elements.closeReversePreviewBtn.addEventListener('click', hideReverseScriptModal);
    elements.exportReverseScriptBtn.addEventListener('click', exportReverseScriptFromModal);
    elements.copyReverseScriptBtn.addEventListener('click', copyReverseScriptToClipboard);
    
    // 点击模态窗口外部关闭
    elements.reverseScriptModal.addEventListener('click', (e) => {
        if (e.target === elements.reverseScriptModal) {
            hideReverseScriptModal();
        }
    });
    
    // 拖拽事件
    setupDragAndDrop();
    
    // IPC监听器
    ipcRenderer.on('execution-progress', handleExecutionProgress);
}

// 选择目录
async function selectDirectory() {
    try {
        const directory = await ipcRenderer.invoke('select-directory');
        if (directory) {
            currentDirectory = directory;
            await scanSqlFiles();
            updateDirectoryInfo();
        }
    } catch (error) {
        logMessage('error', `选择目录失败: ${error.message}`);
    }
}

// 扫描SQL文件
async function scanSqlFiles() {
    if (!currentDirectory) return;
    
    try {
        logMessage('info', '正在扫描SQL文件...');
        sqlFiles = await ipcRenderer.invoke('scan-sql-files', currentDirectory);
        updateFileTree();
        logMessage('success', `扫描完成，找到 ${Object.keys(sqlFiles).length} 个文件夹`);
    } catch (error) {
        logMessage('error', `扫描SQL文件失败: ${error.message}`);
    }
}

// 更新目录信息
function updateDirectoryInfo() {
    if (currentDirectory) {
        elements.directoryInfo.innerHTML = `
            <div class="directory-path">${currentDirectory}</div>
        `;
        // 启用刷新按钮
        elements.refreshDirBtn.disabled = false;
    } else {
        elements.directoryInfo.innerHTML = `
            <div class="no-directory">请选择包含SQL文件的根目录</div>
        `;
        // 禁用刷新按钮
        elements.refreshDirBtn.disabled = true;
    }
}

// 刷新目录
async function refreshDirectory() {
    if (!currentDirectory) {
        logMessage('warning', '请先选择一个目录');
        return;
    }
    
    try {
        logMessage('info', '正在刷新目录...');
        
        // 保存当前部署队列中的文件夹名称
        const queuedFolders = deploymentQueue.map(item => item.folderName);
        
        // 重新扫描SQL文件
        await scanSqlFiles();
        
        // 刷新部署队列：移除不存在的文件夹，保持顺序
        const updatedQueue = [];
        const removedFolders = [];
        
        queuedFolders.forEach(folderName => {
            if (sqlFiles[folderName]) {
                // 文件夹仍然存在，更新文件列表
                const existingItem = deploymentQueue.find(item => item.folderName === folderName);
                if (existingItem) {
                    updatedQueue.push({
                        ...existingItem,
                        files: sqlFiles[folderName] // 更新文件列表
                    });
                }
            } else {
                // 文件夹不存在了，记录被移除的文件夹
                removedFolders.push(folderName);
            }
        });
        
        // 更新部署队列
        deploymentQueue = updatedQueue;
        updateDeploymentQueue();
        
        // 记录刷新结果
        if (removedFolders.length > 0) {
            logMessage('warning', `已从部署队列中移除不存在的文件夹: ${removedFolders.join(', ')}`);
        }
        
        logMessage('success', '目录和部署队列刷新完成');
    } catch (error) {
        logMessage('error', `刷新目录失败: ${error.message}`);
    }
}

// 更新文件树
function updateFileTree() {
    // 获取已在部署队列中的文件夹名称
    const queuedFolders = new Set(deploymentQueue.map(item => item.folderName));
    
    // 过滤掉已在部署队列中的文件夹
    const availableFolders = Object.entries(sqlFiles).filter(([folderName]) => !queuedFolders.has(folderName));
    
    const totalFolderCount = Object.keys(sqlFiles).length;
    const availableFolderCount = availableFolders.length;
    
    // 更新文件夹计数显示
    if (totalFolderCount === availableFolderCount) {
        elements.fileCount.textContent = `${totalFolderCount} 个文件夹`;
    } else {
        elements.fileCount.textContent = `${availableFolderCount} 个文件夹 (${totalFolderCount - availableFolderCount} 个已在队列中)`;
    }
    
    // 更新一键移动按钮状态
    if (elements.moveAllBtn) {
        elements.moveAllBtn.disabled = availableFolderCount === 0;
    }
    
    if (availableFolderCount === 0) {
        if (totalFolderCount === 0) {
            elements.fileTree.innerHTML = `
                <div style="text-align: center; color: #858585; font-size: 12px; padding: 20px;">
                    未找到包含SQL文件的文件夹
                </div>
            `;
        } else {
            elements.fileTree.innerHTML = `
                <div style="text-align: center; color: #858585; font-size: 12px; padding: 20px;">
                    所有文件夹都已在部署队列中
                </div>
            `;
        }
        return;
    }
    
    elements.fileTree.innerHTML = '';
    
    availableFolders.forEach(([folderName, files]) => {
        const folderElement = createFolderElement(folderName, files);
        elements.fileTree.appendChild(folderElement);
    });
}

// 创建文件夹元素
function createFolderElement(folderName, files) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-item';
    folderDiv.draggable = true;
    folderDiv.dataset.folderName = folderName;
    
    folderDiv.innerHTML = `
        <div class="folder-header">
            <div class="folder-name">
                <svg class="folder-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                </svg>
                ${folderName}
            </div>
            <div class="file-count-badge">${files.length}</div>
        </div>
        <div class="file-list">
            ${files.map(file => `
                <div class="file-item">
                    <svg class="file-icon" viewBox="0 0 24 24" width="12" height="12">
                        <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                    </svg>
                    ${file.name}
                </div>
            `).join('')}
        </div>
    `;
    
    // 拖拽事件
    folderDiv.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', folderName);
        folderDiv.classList.add('dragging');
    });
    
    folderDiv.addEventListener('dragend', () => {
        folderDiv.classList.remove('dragging');
    });
    
    return folderDiv;
}

// 设置拖拽功能
function setupDragAndDrop() {
    const dqContainer = elements.deploymentQueue;
    
    dqContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        dqContainer.classList.add('drag-over');
        
        // 清除所有现有的拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
        });
        
        const queueItems = Array.from(dqContainer.querySelectorAll('.queue-item'));
        let foundTarget = false;
        
        // 检查是否拖拽到队列项上（支持队列内拖拽和SQL文件拖拽）
        for (let i = 0; i < queueItems.length; i++) {
            const item = queueItems[i];
            if (item === draggedElement) continue; // 跳过自己（队列内拖拽时）
            
            const rect = item.getBoundingClientRect();
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            // 检查鼠标是否在当前项的范围内
            if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
                const relX = mouseX - rect.left;
                const relY = mouseY - rect.top;
                const xRatio = relX / rect.width;
                const yRatio = relY / rect.height;
                
                // 根据鼠标相对位置决定视觉反馈：上/下表示串行，左/右表示并行
                let zoneClass = null;
                const edge = 0.3; // 顶部/底部判定阈值
                const side = 0.5; // 左右分界
                
                if (yRatio < edge) {
                    zoneClass = 'drag-over-top';
                } else if (yRatio > (1 - edge)) {
                    zoneClass = 'drag-over-bottom';
                } else if (xRatio < side) {
                    zoneClass = 'drag-over-left';
                } else {
                    zoneClass = 'drag-over-right';
                }
                
                item.classList.add(zoneClass);
                foundTarget = true;
                break;
            }
            
            // 如果没有找到队列项目标，检查是否拖拽到空白区域（队列末尾）
            if (!foundTarget && queueItems.length > 0) {
                const lastItem = queueItems[queueItems.length - 1];
                const rect = lastItem.getBoundingClientRect();
                const queueRect = dqContainer.getBoundingClientRect();
                
                // 如果鼠标在最后一个元素下方的空白区域
                if (e.clientY > rect.bottom && e.clientY < queueRect.bottom) {
                    lastItem.classList.add('drag-over-bottom');
                }
            }
        }
    });
    
    dqContainer.addEventListener('dragleave', (e) => {
        if (!dqContainer.contains(e.relatedTarget)) {
            dqContainer.classList.remove('drag-over');
        }
    });
    
    dqContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        dqContainer.classList.remove('drag-over');
        
        // 清除所有拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
        });
        
        // 处理文件拖拽（从侧边栏拖拽文件夹到队列）
        const folderName = e.dataTransfer.getData('text/plain');
        if (folderName && sqlFiles[folderName]) {
            // 检查是否拖拽到特定位置
            const queueItems = Array.from(dqContainer.querySelectorAll('.queue-item'));
            let targetEl = null;
            let zone = null; // 'top' | 'bottom' | 'left' | 'right'
            
            for (let i = 0; i < queueItems.length; i++) {
                const item = queueItems[i];
                const rect = item.getBoundingClientRect();
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                
                if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
                    const relX = mouseX - rect.left;
                    const relY = mouseY - rect.top;
                    const xRatio = relX / rect.width;
                    const yRatio = relY / rect.height;
                    
                    targetEl = item;
                    
                    // 根据鼠标位置决定插入区域
                    if (xRatio < 0.3) {
                        zone = 'left';
                    } else if (xRatio > 0.7) {
                        zone = 'right';
                    } else if (yRatio < 0.5) {
                        zone = 'top';
                    } else {
                        zone = 'bottom';
                    }
                    break;
                }
            }
            
            if (targetEl && zone) {
                // 拖拽到特定位置，使用位置化插入
                addToQueueAtPosition(folderName, parseInt(targetEl.dataset.itemId, 10), zone);
            } else {
                // 拖拽到空白区域，默认追加
                addToQueue(folderName);
            }
            return;
        }
        
        // 处理队列项拖拽定位：支持上下串行、左右并行
        if (draggedElement) {
            const queueItems = Array.from(dqContainer.querySelectorAll('.queue-item'));
            let targetEl = null;
            let zone = null; // 'top' | 'bottom' | 'left' | 'right'
            
            for (let i = 0; i < queueItems.length; i++) {
                const item = queueItems[i];
                const rect = item.getBoundingClientRect();
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                
                if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
                    const relX = mouseX - rect.left;
                    const relY = mouseY - rect.top;
                    const xRatio = relX / rect.width;
                    const yRatio = relY / rect.height;
                    
                    const edge = 0.3;
                    const side = 0.5;
                    
                    if (yRatio < edge) zone = 'top';
                    else if (yRatio > (1 - edge)) zone = 'bottom';
                    else if (xRatio < side) zone = 'left';
                    else zone = 'right';
                    
                    targetEl = item;
                    break;
                }
            }
            
            // 如果没有拖拽到队列项上，检查是否拖拽到空白区域（队列末尾）
            if (!targetEl && queueItems.length > 0) {
                const lastItem = queueItems[queueItems.length - 1];
                const rect = lastItem.getBoundingClientRect();
                const queueRect = dqContainer.getBoundingClientRect();
                if (e.clientY > rect.bottom && e.clientY < queueRect.bottom) {
                    targetEl = lastItem;
                    zone = 'bottom';
                }
            }
            
            if (targetEl && zone && draggedItemId) {
                const targetId = parseInt(targetEl.dataset.itemId, 10);
                moveQueueItem(parseInt(draggedItemId, 10), targetId, zone);
            }
        }
    });
}

// 添加到部署队列
function addToQueue(folderName) {
    // 检查是否已存在
    if (deploymentQueue.some(item => item.folderName === folderName)) {
        logMessage('warning', `文件夹 "${folderName}" 已在部署队列中`);
        return;
    }
    
    // 计算新项目的阶段（默认追加为新的串行阶段）
    const maxStage = deploymentQueue.length ? Math.max(...deploymentQueue.map(i => i.stage || 1)) : 0;
    
    const queueItem = {
        folderName,
        files: sqlFiles[folderName],
        id: Date.now(),
        stage: maxStage + 1,
        position: 1
    };
    
    deploymentQueue.push(queueItem);
    updateDeploymentQueue();
    updateFileTree(); // 更新文件树以隐藏已添加的文件夹
    logMessage('info', `已添加 "${folderName}" 到部署队列`);
}

// 一键移动所有文件夹到部署队列
function moveAllFoldersToQueue() {
    // 获取已在部署队列中的文件夹名称
    const queuedFolders = new Set(deploymentQueue.map(item => item.folderName));
    
    // 过滤掉已在部署队列中的文件夹
    const availableFolders = Object.keys(sqlFiles).filter(folderName => !queuedFolders.has(folderName));
    
    if (availableFolders.length === 0) {
        logMessage('warning', '没有可移动的文件夹');
        return;
    }
    
    // 计算起始阶段
    const maxStage = deploymentQueue.length ? Math.max(...deploymentQueue.map(i => i.stage || 1)) : 0;
    
    // 批量添加所有可用文件夹
    availableFolders.forEach((folderName, index) => {
        const queueItem = {
            folderName,
            files: sqlFiles[folderName],
            id: Date.now() + index, // 确保每个项目有唯一ID
            stage: maxStage + index + 1, // 每个文件夹作为独立的串行阶段
            position: 1
        };
        
        deploymentQueue.push(queueItem);
    });
    
    updateDeploymentQueue();
    updateFileTree(); // 更新文件树以隐藏已添加的文件夹
    logMessage('info', `已添加 ${availableFolders.length} 个文件夹到部署队列`);
}

// 添加到部署队列的特定位置
function addToQueueAtPosition(folderName, targetId, zone) {
    // 检查是否已存在
    if (deploymentQueue.some(item => item.folderName === folderName)) {
        logMessage('warning', `文件夹 "${folderName}" 已在部署队列中`);
        return;
    }
    
    const target = deploymentQueue.find(i => i.id === targetId);
    if (!target) {
        // 目标不存在，默认追加
        addToQueue(folderName);
        return;
    }
    
    const targetStage = target.stage || 1;
    const targetPos = target.position || 1;
    let newStage, newPos;
    
    if (zone === 'left') {
        // 并行插入：同stage，在target左侧
        newStage = targetStage;
        newPos = targetPos;
        // 将target及其右侧的项目position+1
        deploymentQueue.forEach(item => {
            const s = item.stage || 1;
            const p = item.position || 1;
            if (s === targetStage && p >= targetPos) {
                item.position = p + 1;
            }
        });
    } else if (zone === 'right') {
        // 并行插入：同stage，在target右侧
        newStage = targetStage;
        newPos = targetPos + 1;
        // 将target右侧的项目position+1
        deploymentQueue.forEach(item => {
            const s = item.stage || 1;
            const p = item.position || 1;
            if (s === targetStage && p > targetPos) {
                item.position = p + 1;
            }
        });
    } else if (zone === 'top') {
        // 串行插入：在target上方创建新stage
        newStage = targetStage;
        newPos = 1;
        // 将target及其后续stage的stage+1
        deploymentQueue.forEach(item => {
            const s = item.stage || 1;
            if (s >= targetStage) {
                item.stage = s + 1;
            }
        });
    } else if (zone === 'bottom') {
        // 串行插入：在target下方创建新stage
        newStage = targetStage + 1;
        newPos = 1;
        // 将target后续stage的stage+1
        deploymentQueue.forEach(item => {
            const s = item.stage || 1;
            if (s > targetStage) {
                item.stage = s + 1;
            }
        });
    }
    
    const queueItem = {
        folderName,
        files: sqlFiles[folderName],
        id: Date.now(),
        stage: newStage,
        position: newPos
    };
    
    deploymentQueue.push(queueItem);
    updateDeploymentQueue();
    updateFileTree(); // 更新文件树以隐藏已添加的文件夹
    logMessage('info', `已添加 "${folderName}" 到部署队列 (Stage ${newStage}, Position ${newPos})`);
}

// 更新部署队列显示
function updateDeploymentQueue() {
    const container = elements.deploymentQueue;
    
    if (deploymentQueue.length === 0) {
        container.innerHTML = `
            <div class="queue-placeholder">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"/>
                </svg>
                <p>将SQL文件夹拖拽到此处进行部署</p>
                <p class="hint">支持拖拽排序，按顺序执行</p>
            </div>
        `;
        elements.startDeploymentBtn.disabled = true;
        elements.generateReverseBtn.disabled = true;
        return;
    }
    
    container.innerHTML = '';
    elements.startDeploymentBtn.disabled = !isConnected;
    elements.generateReverseBtn.disabled = false;
    
    // 按阶段与位置排序以渲染
    const sortedItems = [...deploymentQueue].sort((a, b) => {
        const sa = a.stage || 1;
        const sb = b.stage || 1;
        if (sa !== sb) return sa - sb;
        const pa = a.position || 1;
        const pb = b.position || 1;
        return pa - pb;
    });
    
    // 按阶段分组渲染
    const stageGroups = {};
    sortedItems.forEach(item => {
        const stage = item.stage || 1;
        if (!stageGroups[stage]) {
            stageGroups[stage] = [];
        }
        stageGroups[stage].push(item);
    });
    
    // 按阶段顺序渲染
    Object.keys(stageGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(stage => {
        const stageItems = stageGroups[stage];
        
        // 如果同一阶段有多个项目，创建水平容器
        if (stageItems.length > 1) {
            const stageContainer = document.createElement('div');
            stageContainer.className = 'queue-stage';
            stageContainer.style.display = 'flex';
            stageContainer.style.gap = '10px';
            stageContainer.style.alignItems = 'flex-start';
            
            stageItems.forEach((item, index) => {
                const queueElement = createQueueElement(item, index);
                stageContainer.appendChild(queueElement);
            });
            
            container.appendChild(stageContainer);
        } else {
            // 单个项目直接添加
            const queueElement = createQueueElement(stageItems[0], 0);
            container.appendChild(queueElement);
        }
    });
}

// 创建队列元素
function createQueueElement(item, index) {
    const queueDiv = document.createElement('div');
    queueDiv.className = 'queue-item';
    queueDiv.dataset.itemId = item.id;
    queueDiv.dataset.stage = item.stage || 1;
    queueDiv.dataset.position = item.position || 1;
    queueDiv.draggable = true;
    
    queueDiv.innerHTML = `
        <div class="queue-item-info">
            <svg class="drag-handle" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z"/>
            </svg>
            <svg class="queue-item-icon" viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
            </svg>
            <div class="queue-item-details">
                <h4>${item.folderName}</h4>
                <p>Stage ${item.stage || 1}, Position ${item.position || 1} • ${(item.files && item.files.length) ? item.files.length : 0} 个SQL文件</p>
            </div>
        </div>
        <div class="queue-item-actions">
            <button class="queue-item-remove" onclick="removeFromQueue(${item.id})">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                </svg>
            </button>
        </div>
    `;
    
    // 添加拖拽事件监听器
    setupQueueItemDragEvents(queueDiv);
    
    return queueDiv;
}

// 显示数据库配置弹窗
function showDbConfigModal() {
    elements.dbConfigModal.classList.add('show');
    // 加载保存的配置
    loadSavedDbConfig();
}

// 隐藏数据库配置弹窗
function hideDbConfigModal() {
  elements.dbConfigModal.classList.remove('show');
  
  // 确保重新启用所有输入框（防止异常情况）
  const formInputs = elements.dbConfigForm.querySelectorAll('input, select, button');
  formInputs.forEach(input => input.disabled = false);
}

// 加载保存的数据库配置
function loadSavedDbConfig() {
    const savedConfig = localStorage.getItem('dbConfig');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            document.getElementById('db-type').value = config.dbType || 'postgresql';
            document.getElementById('db-host').value = config.host || 'localhost';
            document.getElementById('db-port').value = config.port || '5432';
            document.getElementById('db-name').value = config.database || '';
            document.getElementById('db-user').value = config.user || '';
            document.getElementById('db-password').value = config.password || '';
            document.getElementById('save-config').checked = true;
        } catch (error) {
            console.error('加载保存的配置失败:', error);
        }
    }
}

// 测试数据库连接
async function testDbConnection() {
  const config = getDbConfigFromForm();
  
  if (!validateDbConfig(config)) {
    return;
  }
  
  // 禁用输入框防止重复点击
  const formInputs = elements.dbConfigForm.querySelectorAll('input, select, button');
  formInputs.forEach(input => input.disabled = true);
  
  // 特别处理密码输入框，确保它能正确禁用和启用
  const passwordInput = document.getElementById('db-password');
  if (passwordInput) {
    passwordInput.disabled = true;
    passwordInput.readOnly = false; // 确保不是只读状态
  }
  
  updateConnectionStatus('connecting', '连接中...');
  logMessage('info', '正在测试数据库连接...');
  
  try {
    const result = await ipcRenderer.invoke('test-db-connection', config);
    
    // 立即重新启用输入框，避免阻塞
    formInputs.forEach(input => input.disabled = false);
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
    }
    
    if (result.success) {
      showMessage('数据库连接测试成功！', 'success');
      logMessage('success', '数据库连接测试成功！');
      updateConnectionStatus('connected', '连接成功');
    } else {
      // 处理可能的编码问题，确保中文字符正确显示
      const errorMsg = result.message || '未知错误';
      showMessage(`数据库连接测试失败：${errorMsg}`, 'error');
      logMessage('error', `数据库连接测试失败: ${errorMsg}`);
      updateConnectionStatus('disconnected', '连接失败');
    }
  } catch (error) {
    // 立即重新启用输入框
    formInputs.forEach(input => input.disabled = false);
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
    }
    
    // 处理可能的编码问题
    const errorMsg = error.message || '未知错误';
    showMessage(`测试连接失败：${errorMsg}`, 'error');
    logMessage('error', `测试连接失败: ${errorMsg}`);
    updateConnectionStatus('disconnected', '连接失败');
  }
}

// 连接到数据库
async function connectToDatabase() {
  const config = getDbConfigFromForm();
  
  if (!validateDbConfig(config)) {
    return;
  }
  
  // 禁用输入框防止重复点击
  const formInputs = elements.dbConfigForm.querySelectorAll('input, select, button');
  formInputs.forEach(input => input.disabled = true);
  
  // 特别处理密码输入框，确保它能正确禁用和启用
  const passwordInput = document.getElementById('db-password');
  if (passwordInput) {
    passwordInput.disabled = true;
    passwordInput.readOnly = false; // 确保不是只读状态
  }
  
  // 保存配置
  if (document.getElementById('save-config').checked) {
    localStorage.setItem('dbConfig', JSON.stringify(config));
  } else {
    localStorage.removeItem('dbConfig');
  }
  
  updateConnectionStatus('connecting', '连接中...');
  logMessage('info', '正在连接数据库...');
  
  try {
    const result = await ipcRenderer.invoke('connect-to-database', config);
    
    // 立即重新启用输入框，避免alert阻塞
    formInputs.forEach(input => input.disabled = false);
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
    }
    
    if (result.success) {
      isConnected = true;
      dbConfig = config;
      updateConnectionStatus('connected', '已连接');
      
      // 输出成功日志
      logMessage('success', '数据库连接成功！');
      
      // 使用非阻塞消息替代alert
      showMessage('数据库连接成功！', 'success');
      
      updateDeploymentQueue(); // 更新部署按钮状态
      hideDbConfigModal();
    } else {
      isConnected = false;
      updateConnectionStatus('disconnected', '连接失败');
      
      // 使用非阻塞消息替代alert，处理编码问题
      const errorMsg = result.message || '未知错误';
      showMessage(`数据库连接失败：${errorMsg}`, 'error');
      logMessage('error', `数据库连接失败: ${errorMsg}`);
    }
  } catch (error) {
    isConnected = false;
    updateConnectionStatus('disconnected', '连接失败');
    
    // 立即重新启用输入框
    formInputs.forEach(input => input.disabled = false);
    if (passwordInput) {
      passwordInput.disabled = false;
      passwordInput.readOnly = false;
    }
    
    // 使用非阻塞消息替代alert，处理编码问题
    const errorMsg = error.message || '未知错误';
    showMessage(`连接失败：${errorMsg}`, 'error');
  }
}

// 显示非阻塞消息（替代alert）
function showMessage(message, type = 'info') {
  // 确保消息是字符串，并处理可能的编码问题
  let messageText = String(message || '未知错误');
  
  // 清理可能导致乱码的字符
  messageText = messageText
    .replace(/[\uFFFD\u25CA\u2666]/g, '') // 移除替换字符和菱形符号
    .replace(/[^\u0020-\u007E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '') // 只保留ASCII、中文和常用符号
    .trim();
  
  // 如果清理后为空，使用默认消息
  if (!messageText) {
    messageText = '连接失败，请检查数据库配置';
  }
  
  // 创建消息元素
  const messageDiv = document.createElement('div');
  messageDiv.className = `message-toast message-${type}`;
  messageDiv.textContent = messageText;
  
  // 添加样式
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    transition: all 0.3s ease;
    transform: translateX(100%);
    opacity: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
    max-width: 400px;
    word-wrap: break-word;
  `;
  
  // 根据类型设置颜色
  switch (type) {
    case 'success':
      messageDiv.style.backgroundColor = '#4CAF50';
      break;
    case 'error':
      messageDiv.style.backgroundColor = '#f44336';
      break;
    case 'warning':
      messageDiv.style.backgroundColor = '#ff9800';
      break;
    default:
      messageDiv.style.backgroundColor = '#2196F3';
  }
  
  document.body.appendChild(messageDiv);
  
  // 动画显示
  setTimeout(() => {
    messageDiv.style.transform = 'translateX(0)';
    messageDiv.style.opacity = '1';
  }, 10);
  
  // 3秒后自动移除
  setTimeout(() => {
    messageDiv.style.transform = 'translateX(100%)';
    messageDiv.style.opacity = '0';
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 300);
  }, 3000);
}
function getDbConfigFromForm() {
    return {
        dbType: document.getElementById('db-type').value,
        host: document.getElementById('db-host').value || 'localhost',
        port: parseInt(document.getElementById('db-port').value) || 5432,
        database: document.getElementById('db-name').value,
        user: document.getElementById('db-user').value,
        password: document.getElementById('db-password').value
    };
}

// 验证数据库配置
function validateDbConfig(config) {
  if (!config.database) {
    // 使用非阻塞消息
    showMessage('请输入数据库名称', 'warning');
    return false;
  }
  if (!config.user) {
    showMessage('请输入用户名', 'warning');
    return false;
  }
  return true;
}

// 全局拖拽状态变量
let draggedElement = null;
let draggedIndex = -1;
let draggedItemId = null;

// 设置队列项拖拽事件
function setupQueueItemDragEvents(queueItem) {
    queueItem.addEventListener('dragstart', (e) => {
        draggedElement = queueItem;
        draggedIndex = Array.from(queueItem.parentNode.children).indexOf(queueItem);
        draggedItemId = queueItem.dataset.itemId;
        queueItem.classList.add('dragging');
        
        // 设置拖拽数据
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', queueItem.outerHTML);
        e.dataTransfer.setData('text/plain', queueItem.dataset.itemId);
        
        console.log('拖拽开始，索引:', draggedIndex);
    });
    
    queueItem.addEventListener('dragend', (e) => {
        queueItem.classList.remove('dragging');
        draggedElement = null;
        draggedIndex = -1;
        draggedItemId = null;
        
        // 清除所有拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
        });
        
        console.log('拖拽结束');
    });
    
    queueItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        // 拖拽目标检测已在父容器中统一处理，这里只需要阻止默认行为
    });
    
    queueItem.addEventListener('dragleave', (e) => {
        // 只有当鼠标真正离开元素时才移除指示器
        if (!queueItem.contains(e.relatedTarget)) {
            queueItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
        }
    });
    
    queueItem.addEventListener('drop', (e) => {
        e.preventDefault();
        // 不阻止事件冒泡，让父容器处理drop事件
        
        // 清除指示器
        queueItem.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right');
    });
}

// 重新排序部署队列（旧索引重排，保留以兼容原逻辑）
function reorderDeploymentQueue(fromIndex, toIndex) {
    console.log('重新排序队列，从索引', fromIndex, '到索引', toIndex);
    console.log('排序前队列:', deploymentQueue.map(item => item.name));

    if (fromIndex === toIndex) {
        console.log('索引相同，无需排序');
        return;
    }

    // 确保索引有效
    if (fromIndex < 0 || fromIndex >= deploymentQueue.length ||
        toIndex < 0 || toIndex > deploymentQueue.length) {
        console.log('索引无效，取消排序');
        return;
    }

    // 移动数组中的元素
    const item = deploymentQueue.splice(fromIndex, 1)[0];
    deploymentQueue.splice(toIndex, 0, item);

    console.log('排序后队列:', deploymentQueue.map(item => item.name));

    // 重新渲染队列
    updateDeploymentQueue();

    // 移除日志输出，只在控制台显示调试信息
    // logMessage('info', `已调整部署顺序：${item.name}`);
}

// 移动队列项到目标位置（支持左右并行与上下串行）
function moveQueueItem(draggedId, targetId, zone) {
    if (!draggedId || !targetId || draggedId === targetId) return;

    const dragged = deploymentQueue.find(i => i.id === draggedId);
    const target = deploymentQueue.find(i => i.id === targetId);
    if (!dragged || !target) return;

    const oldStage = dragged.stage || 1;
    const oldPos = dragged.position || 1;

    const compactPositions = (stage) => {
        const items = deploymentQueue.filter(i => (i.stage || 1) === stage)
            .sort((a, b) => (a.position || 1) - (b.position || 1));
        items.forEach((i, idx) => { i.position = idx + 1; });
    };

    const closeEmptyStageGap = (emptiedStage) => {
        const stillHas = deploymentQueue.some(i => (i.stage || 1) === emptiedStage);
        if (!stillHas) {
            deploymentQueue.forEach(i => {
                const st = i.stage || 1;
                if (st > emptiedStage) i.stage = st - 1;
            });
        }
    };

    if (zone === 'left' || zone === 'right') {
        // 并行：同stage左/右插入
        const targetStage = target.stage || 1;
        const targetPos = target.position || 1;
        const insertPos = (zone === 'left') ? targetPos : targetPos + 1;

        // 如果拖拽项和目标项在同一stage，只需要调整position
        if (oldStage === targetStage) {
            // 同stage内移动，只调整position
            if (oldPos < insertPos) {
                // 向右移动：中间的项目position-1
                deploymentQueue.forEach(i => {
                    const st = i.stage || 1;
                    const p = i.position || 1;
                    if (st === targetStage && i.id !== draggedId && p > oldPos && p < insertPos) {
                        i.position = p - 1;
                    }
                });
                dragged.position = insertPos - 1;
            } else if (oldPos > insertPos) {
                // 向左移动：中间的项目position+1
                deploymentQueue.forEach(i => {
                    const st = i.stage || 1;
                    const p = i.position || 1;
                    if (st === targetStage && i.id !== draggedId && p >= insertPos && p < oldPos) {
                        i.position = p + 1;
                    }
                });
                dragged.position = insertPos;
            }
            // stage保持不变
            compactPositions(targetStage);
            updateDeploymentQueue();
            logMessage('info', `已移动到并行${zone === 'left' ? '左侧' : '右侧'}`);
            return;
        }

        // 跨stage移动：从旧stage移除，插入到目标stage
        // 从旧stage移除占位并压紧
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            const p = i.position || 1;
            if (st === oldStage && i.id !== draggedId && p > oldPos) {
                i.position = p - 1;
            }
        });

        // 设置新的stage和position
        dragged.stage = targetStage;
        
        // 在目标stage位置插入，并右移后续并行位置
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            const p = i.position || 1;
            if (st === targetStage && i.id !== draggedId && p >= insertPos) {
                i.position = p + 1;
            }
        });
        dragged.position = insertPos;

        // 检查旧stage是否为空，如果为空则合并stage空洞
        const oldStageEmpty = !deploymentQueue.some(i => i.id !== draggedId && (i.stage || 1) === oldStage);
        if (oldStageEmpty) {
            closeEmptyStageGap(oldStage);
        }

        compactPositions(targetStage);
        updateDeploymentQueue();
        logMessage('info', `已移动到并行${zone === 'left' ? '左侧' : '右侧'}`);
        return;
    }

    if (zone === 'top' || zone === 'bottom') {
        // 串行：在目标stage上/下插入新stage
        const targetStage = target.stage || 1;
        let insertStage = zone === 'top' ? targetStage : targetStage + 1;

        // 从旧stage移除占位并压紧
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            const p = i.position || 1;
            if (st === oldStage && i.id !== draggedId && p > oldPos) {
                i.position = p - 1;
            }
        });

        // 若旧stage变空，先合并空洞，影响插入位置
        const oldStageEmpty = !deploymentQueue.some(i => i.id !== draggedId && (i.stage || 1) === oldStage);
        if (oldStageEmpty) {
            deploymentQueue.forEach(i => {
                const st = i.stage || 1;
                if (st > oldStage) i.stage = st - 1;
            });
            if (insertStage > oldStage) insertStage -= 1;
        }

        // 在插入点之后的所有stage编号右移一位，为新stage腾出空间
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            if (st >= insertStage) i.stage = st + 1;
        });

        // 放入新stage，位置从1开始（可后续支持向左/右扩展）
        dragged.stage = insertStage;
        dragged.position = 1;

        // 压紧新旧相关stage的并行位置
        compactPositions(insertStage);
        closeEmptyStageGap(oldStage);

        updateDeploymentQueue();
        logMessage('info', `已移动到串行${zone === 'top' ? '上侧' : '下侧'}`);
        return;
    }
}

// 从队列中移除（维护同stage位置序号）
function removeFromQueue(itemId) {
    const removed = deploymentQueue.find(item => item.id === itemId);
    deploymentQueue = deploymentQueue.filter(item => item.id !== itemId);
    if (removed) {
        const stage = removed.stage || 1;
        const pos = removed.position || 1;
        deploymentQueue.forEach(i => {
            const s = i.stage || 1;
            const p = i.position || 1;
            if (s === stage && p > pos) {
                i.position = p - 1;
            }
        });
    }
    updateDeploymentQueue();
    updateFileTree(); // 更新文件树以恢复被移除文件夹的显示
    logMessage('info', '已从部署队列中移除项目');
}

// 更新连接状态
function updateConnectionStatus(status, text) {
    const connectionInfo = elements.connectionInfo;
    connectionInfo.innerHTML = `
        <div class="connection-status">
            <div class="status-indicator ${status}"></div>
            <span>${text}</span>
        </div>
    `;
}

// 清空队列
function clearQueue() {
    deploymentQueue = [];
    updateDeploymentQueue();
    updateFileTree(); // 更新文件树以恢复所有文件夹的显示
    logMessage('info', '已清空部署队列');
}

// 数据库连接功能已移除
// async function testConnection() {
//   const config = {
//     host: elements.dbHost.value || 'localhost',
//     port: parseInt(elements.dbPort.value) || 5432,
//     database: elements.dbName.value,
//     user: elements.dbUser.value,
//     password: elements.dbPassword.value
//   };
//   
//   if (!config.database || !config.user) {
//     logMessage('error', '请填写数据库名称和用户名');
//     return;
//   }
//   
//   updateConnectionStatus('connecting', '连接中...');
//   
//   try {
//     const result = await ipcRenderer.invoke('test-db-connection', config);
//     
//     if (result.success) {
//       isConnected = true;
//       dbConfig = config;
//       updateConnectionStatus('connected', '已连接');
//       logMessage('success', '数据库连接成功');
//       updateDeploymentQueue(); // 更新部署按钮状态
//     } else {
//       isConnected = false;
//       updateConnectionStatus('disconnected', '连接失败');
//       logMessage('error', `数据库连接失败: ${result.message}`);
//     }
//   } catch (error) {
//     isConnected = false;
//     updateConnectionStatus('disconnected', '连接失败');
//     logMessage('error', `数据库连接失败: ${error.message}`);
//   }
// }

// 连接状态功能已移除
// function updateConnectionStatus(status, text) {
//   const statusElement = elements.connectionStatus;
//   const indicator = statusElement.querySelector('.status-indicator');
//   const textElement = statusElement.querySelector('span');
//   
//   indicator.className = `status-indicator ${status}`;
//   textElement.textContent = text;
// }

// 开始部署（分阶段并行、跨阶段串行）
async function startDeployment() {
    if (deploymentQueue.length === 0) {
        logMessage('error', '部署队列为空');
        return;
    }

    if (!isConnected) {
        logMessage('error', '请先连接数据库');
        showDbConfigModal();
        return;
    }

    elements.startDeploymentBtn.disabled = true;
    logMessage('info', '开始执行SQL部署...');

    // 显示进度条
    showProgressBar();

    try {
        // 统计总文件数（用于进度条）
        currentFileIndex = 0;
        totalFiles = deploymentQueue.reduce((sum, item) => sum + ((item.files && item.files.length) || 0), 0);
        updateProgress(0, totalFiles, '准备执行...');

        // 分组：按stage聚合，并按stage升序、position升序执行
        const itemsByStage = {};
        deploymentQueue.forEach(item => {
            const s = item.stage || 1;
            if (!itemsByStage[s]) itemsByStage[s] = [];
            itemsByStage[s].push(item);
        });
        const orderedStages = Object.keys(itemsByStage).map(Number).sort((a, b) => a - b);

        const skipOnError = elements.skipErrorCheckbox.checked;
        let overallSuccess = 0;
        let overallError = 0;

        for (const stage of orderedStages) {
            const stageItems = itemsByStage[stage].sort((a, b) => (a.position || 1) - (b.position || 1));
            logMessage('info', `开始执行 Stage ${stage}（并行 ${stageItems.length} 项）`);

            // 始终并行执行当前阶段的所有目录，每个目录独立数据库连接
            const stagePromises = stageItems.map(item => {
                const filePaths = (item.files || []).map(f => f.path);
                if (filePaths.length === 0) {
                    return Promise.resolve([]);
                }
                return ipcRenderer.invoke('execute-sql-files', dbConfig, filePaths, skipOnError);
            });

            const stageResults = await Promise.allSettled(stagePromises);

            let stageHasError = false;
            stageResults.forEach(res => {
                if (res.status === 'fulfilled') {
                    const arr = res.value || [];
                    const successCount = arr.filter(r => r.status === 'success').length;
                    const errorCount = arr.filter(r => r.status === 'error').length;
                    overallSuccess += successCount;
                    overallError += errorCount;
                    if (!skipOnError && errorCount > 0) {
                        stageHasError = true;
                    }
                } else {
                    logMessage('error', `Stage ${stage} 子任务执行失败: ${res.reason?.message || res.reason}`);
                    overallError += 1;
                    if (!skipOnError) {
                        stageHasError = true;
                    }
                }
            });

            if (!skipOnError && stageHasError) {
                logMessage('error', '遇到错误，停止执行后续阶段');
                break;
            }

            logMessage('info', `Stage ${stage} 完成`);
        }

        // 完成进度条
        updateProgress(totalFiles, totalFiles, '执行完成');

        if (overallError === 0) {
            logMessage('success', `部署完成！成功执行 ${overallSuccess} 个文件`);
        } else {
            logMessage('warning', `部署完成，成功: ${overallSuccess}，失败: ${overallError}`);
        }

        // 延迟隐藏进度条
        setTimeout(() => {
            hideProgressBar();
        }, 2000);

    } catch (error) {
        logMessage('error', `部署失败: ${error.message}`);
        updateProgress(0, 1, '执行失败');
        setTimeout(() => {
            hideProgressBar();
        }, 2000);
    } finally {
        elements.startDeploymentBtn.disabled = false;
    }
}

// 处理执行进度
let currentFileIndex = 0;
let totalFiles = 0;

function handleExecutionProgress(event, progress) {
    if (progress.status === 'success') {
        currentFileIndex++;
        logMessage('success', `✓ ${progress.file} 执行成功`);
        updateProgress(currentFileIndex, totalFiles, `正在执行: ${progress.file}`);
    } else if (progress.status === 'error') {
        currentFileIndex++;
        logMessage('error', `✗ ${progress.file} 执行失败: ${progress.error}`);
        updateProgress(currentFileIndex, totalFiles, `执行失败: ${progress.file}`);
    }
}

// 记录日志
function logMessage(type, message) {
    const logContainer = elements.logContainer;
    const placeholder = logContainer.querySelector('.log-placeholder');
    
    if (placeholder) {
        placeholder.remove();
    }
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        ${message}
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 清空日志
function clearLog() {
    elements.logContainer.innerHTML = `
        <div class="log-placeholder">
            <svg viewBox="0 0 24 24" width="32" height="32">
                <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            <p>执行日志将在此处显示</p>
        </div>
    `;
}

// 更新UI状态
function updateUI() {
    updateDirectoryInfo();
    updateFileTree();
    updateDeploymentQueue();
    // 数据库连接状态功能已移除
}

// 全局函数（供HTML调用）
window.removeFromQueue = removeFromQueue;

// 队列窗口相关功能
let queueWindowOpen = false;

// 打开队列窗口
async function openQueueWindow() {
    try {
        await ipcRenderer.invoke('open-queue-window');
        queueWindowOpen = true;
        
        // 同步当前队列数据到弹出窗口
        await syncQueueToWindow();
        
        // 隐藏主窗口的部署队列区域，显示日志区域
        toggleQueueAndLogAreas(false);
        
        logMessage('info', '部署队列窗口已打开');
    } catch (error) {
        logMessage('error', `打开队列窗口失败: ${error.message}`);
    }
}

// 同步队列数据到弹出窗口
async function syncQueueToWindow() {
    if (queueWindowOpen) {
        try {
            await ipcRenderer.invoke('sync-queue-data', {
                deploymentQueue: deploymentQueue,
                isConnected: isConnected
            });
        } catch (error) {
            console.error('同步队列数据失败:', error);
        }
    }
}

// 切换队列区域和日志区域的显示
function toggleQueueAndLogAreas(showQueue) {
    const deploymentArea = document.querySelector('.deployment-area');
    const logArea = document.querySelector('.log-area');
    
    if (showQueue) {
        // 显示队列，隐藏日志全屏模式
        deploymentArea.classList.remove('hidden');
        logArea.classList.remove('fullscreen');
    } else {
        // 隐藏队列，显示日志全屏模式
        deploymentArea.classList.add('hidden');
        logArea.classList.add('fullscreen');
    }
}

// 监听队列窗口关闭事件
ipcRenderer.on('queue-window-closed', () => {
    queueWindowOpen = false;
    // 恢复主窗口的部署队列区域显示
    toggleQueueAndLogAreas(true);
    logMessage('info', '部署队列窗口已关闭');
});

// 监听来自队列窗口的数据同步
ipcRenderer.on('queue-data-updated', (event, data) => {
    if (data.deploymentQueue) {
        deploymentQueue = data.deploymentQueue;
        updateDeploymentQueue();
    }
});

// 监听开始部署请求（来自队列窗口）
ipcRenderer.on('start-deployment-from-queue', () => {
    startDeployment();
});

// 监听同步队列到弹出窗口的事件
ipcRenderer.on('sync-queue-to-popup', () => {
    syncQueueToWindow();
});

// 重写原有的队列更新函数，添加同步到弹出窗口的逻辑
// 监听从弹出窗口添加文件夹的事件
ipcRenderer.on('add-folder-to-queue-from-popup', (event, data) => {
    const { folderName, targetId, zone } = data;
    if (targetId && zone) {
        addToQueueAtPosition(folderName, targetId, zone);
    } else {
        addToQueue(folderName);
    }
});

// 监听从弹出窗口更新文件树的事件
ipcRenderer.on('update-file-tree-from-popup', () => {
    updateFileTree();
});

const originalUpdateDeploymentQueue = updateDeploymentQueue;
updateDeploymentQueue = function() {
    originalUpdateDeploymentQueue.call(this);
    // 同步到弹出窗口
    syncQueueToWindow();
};

// 添加弹出队列窗口的按钮事件处理
function addQueueWindowButton() {
    const deploymentControls = document.querySelector('.deployment-controls');
    if (deploymentControls && !document.getElementById('popup-queue-btn')) {
        const popupBtn = document.createElement('button');
        popupBtn.id = 'popup-queue-btn';
        popupBtn.className = 'btn btn-info';
        popupBtn.textContent = '弹出窗口';
        popupBtn.title = '将部署队列弹出为独立窗口';
        popupBtn.addEventListener('click', openQueueWindow);
        
        // 插入到清空队列按钮之后
        const clearBtn = document.getElementById('clear-queue-btn');
        if (clearBtn && clearBtn.nextSibling) {
            deploymentControls.insertBefore(popupBtn, clearBtn.nextSibling);
        } else {
            // 如果找不到清空队列按钮，则插入到开始部署按钮之前
            const startBtn = document.getElementById('start-deployment-btn');
            deploymentControls.insertBefore(popupBtn, startBtn);
        }
    }
}

// 在DOM加载完成后添加弹出按钮
document.addEventListener('DOMContentLoaded', () => {
    // 延迟添加按钮，确保其他初始化完成
    setTimeout(addQueueWindowButton, 100);
});

// 全局函数，供HTML调用
window.openQueueWindow = openQueueWindow;

// 进度条相关函数
function showProgressBar() {
    if (elements.progressSection) {
        elements.progressSection.style.display = 'block';
    }
}

function hideProgressBar() {
    if (elements.progressSection) {
        elements.progressSection.style.display = 'none';
    }
}

function updateProgress(current, total, text) {
    if (!elements.progressFill || !elements.progressText || !elements.progressPercentage) {
        return;
    }
    
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    elements.progressFill.style.width = `${percentage}%`;
    elements.progressText.textContent = text;
    elements.progressPercentage.textContent = `${percentage}%`;
}

// 逆向脚本生成相关函数
let generatedReverseScript = '';
let generatedReverseScriptsByFile = []; // 按文件分组的逆向脚本

// 从部署队列生成逆向脚本
async function generateReverseScriptsFromQueue() {
    if (deploymentQueue.length === 0) {
        showMessage('部署队列为空，请先添加SQL文件到队列中', 'warning');
        return;
    }

    try {
        // 强制使用JSON文件
        showMessage('请选择JSON文件...', 'info');
        
        // 选择JSON文件
        const jsonResult = await ipcRenderer.invoke('select-json-file');
        
        if (!jsonResult.success) {
            if (jsonResult.message !== '用户取消选择') {
                showMessage(`选择JSON文件失败：${jsonResult.error || jsonResult.message}`, 'error');
            }
            return;
        }

        showMessage('正在读取JSON文件...', 'info');
        
        // 读取JSON文件
        const jsonData = await ipcRenderer.invoke('read-json-file', jsonResult.filePath);
        
        if (!jsonData.success) {
            showMessage(`读取JSON文件失败：${jsonData.error}`, 'error');
            return;
        }
        
        const schemaData = jsonData.data;

        showMessage('正在生成逆向脚本...', 'info');
        
        const result = await ipcRenderer.invoke('generate-reverse-scripts', {
            queue: deploymentQueue,
            currentDirectory: currentDirectory,
            schemaData: schemaData
        });

        if (result.success) {
            // 存储生成的逆向脚本数据
            generatedReverseScript = result.reverseScript;
            generatedReverseScriptsByFile = result.reverseScriptsByFile || []; // 按文件分组的脚本
            
            // 更新统计信息
            if (elements.folderCount) {
                elements.folderCount.textContent = result.stats.folderCount;
            }
            if (elements.scriptCount) {
                elements.scriptCount.textContent = result.stats.scriptCount;
            }
            if (elements.generationTime) {
                elements.generationTime.textContent = new Date().toLocaleString();
            }
            
            // 打开逆向脚本预览窗口
            await openReversePreviewWindow(result);
            
            const sourceInfo = '（使用JSON文件）';
            showMessage(`逆向脚本生成成功！共处理 ${result.stats.folderCount} 个文件夹，${result.stats.scriptCount} 个脚本文件 ${sourceInfo}`, 'success');
        } else {
            showMessage(`生成逆向脚本失败：${result.error}`, 'error');
        }
    } catch (error) {
        console.error('生成逆向脚本时发生错误:', error);
        showMessage(`生成逆向脚本时发生错误：${error.message}`, 'error');
    }
}

// 从JSON文件生成逆向脚本（原有功能）

async function generateReverseScripts() {
    try {
        // 首先选择JSON文件
        const jsonResult = await ipcRenderer.invoke('select-json-file');
        
        if (!jsonResult.success) {
            if (jsonResult.message !== '用户取消选择') {
                showMessage(`选择JSON文件失败：${jsonResult.error || jsonResult.message}`, 'error');
            }
            return;
        }

        showMessage('正在读取JSON文件...', 'info');
        
        // 读取JSON文件
        const jsonData = await ipcRenderer.invoke('read-json-file', jsonResult.filePath);
        
        if (!jsonData.success) {
            showMessage(`读取JSON文件失败：${jsonData.error}`, 'error');
            return;
        }

        // 检查部署队列是否有文件
        let ddlContent = null;
        let ddlFileName = null;
        
        if (deploymentQueue.length > 0) {
            // 使用部署队列中的所有文件作为DDL源
            showMessage('正在读取部署队列中的DDL文件...', 'info');
            
            // 收集所有队列中的SQL文件内容
            let allDdlContent = '';
            let fileCount = 0;
            
            for (const queueItem of deploymentQueue) {
                if (queueItem.files && queueItem.files.length > 0) {
                    for (const file of queueItem.files) {
                        try {
                            const fileContent = await ipcRenderer.invoke('read-ddl-file', file.path);
                            if (fileContent.success) {
                                allDdlContent += `-- File: ${file.name}\n`;
                                allDdlContent += fileContent.content + '\n\n';
                                fileCount++;
                            }
                        } catch (error) {
                            console.warn(`读取文件 ${file.name} 失败:`, error);
                        }
                    }
                }
            }
            
            if (allDdlContent.trim()) {
                ddlContent = allDdlContent;
                ddlFileName = `部署队列文件 (${fileCount} 个文件)`;
                showMessage(`已读取部署队列中的 ${fileCount} 个DDL文件`, 'info');
            } else {
                showMessage('部署队列中没有找到有效的DDL文件，将生成通用逆向脚本', 'warning');
            }
        } else {
            showMessage('部署队列为空，将生成通用逆向脚本', 'warning');
        }

        showMessage('正在生成逆向脚本...', 'info');
        
        // 生成逆向脚本
        const generateResult = await ipcRenderer.invoke('generate-reverse-from-json', {
            jsonData: jsonData.data,
            ddlContent: ddlContent
        });

        if (generateResult.success) {
            generatedReverseScript = generateResult.script;
            
            // 更新模态窗口内容
            elements.reverseScriptPreview.value = generateResult.script;
            
            // 计算统计信息
            const tableCount = jsonData.data.tables ? Object.keys(jsonData.data.tables).length : 0;
            elements.folderCount.textContent = ddlFileName ? '2' : '1'; // JSON + DDL文件
            elements.scriptCount.textContent = tableCount;
            elements.generationTime.textContent = new Date().toLocaleString();
            
            // 打开逆向脚本预览窗口
            await openReversePreviewWindow({
                reverseScript: reverseScript,
                reverseScriptsByFile: [],
                stats: {
                    folderCount: ddlFileName ? 2 : 1,
                    scriptCount: tableCount
                }
            });
            
            const sourceInfo = ddlFileName ? `JSON文件和部署队列` : `JSON文件`;
            showMessage(`逆向脚本生成成功！从${sourceInfo}处理了 ${tableCount} 个表`, 'success');
        } else {
            showMessage(`生成逆向脚本失败：${generateResult.error}`, 'error');
        }
    } catch (error) {
        console.error('生成逆向脚本时发生错误:', error);
        showMessage(`生成逆向脚本时发生错误：${error.message}`, 'error');
    }
}


function showReverseScriptModal() {
    if (elements.reverseScriptModal) {
        elements.reverseScriptModal.style.display = 'flex';
    }
}

function hideReverseScriptModal() {
    if (elements.reverseScriptModal) {
        elements.reverseScriptModal.style.display = 'none';
    }
}

async function exportReverseScriptFromModal() {
    if (!generatedReverseScript) {
        showMessage('没有可导出的逆向脚本', 'warning');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('export-reverse-scripts', {
            reverseScriptsByFile: generatedReverseScriptsByFile,
            scriptContent: generatedReverseScript
        });

        if (result.success) {
            if (result.filePaths && result.filePaths.length > 0) {
                // 多文件导出成功
                showMessage(`${result.message}，导出到：${result.exportDir}`, 'success');
            } else {
                // 单文件导出成功
                showMessage(`逆向脚本已导出到：${result.filePath}`, 'success');
            }
            hideReverseScriptModal();
        } else {
            showMessage(`导出逆向脚本失败：${result.error}`, 'error');
        }
    } catch (error) {
        console.error('导出逆向脚本时发生错误:', error);
        showMessage(`导出逆向脚本时发生错误：${error.message}`, 'error');
    }
}

async function copyReverseScriptToClipboard() {
    if (!generatedReverseScript) {
        showMessage('没有可复制的逆向脚本', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(generatedReverseScript);
        showMessage('逆向脚本已复制到剪贴板', 'success');
    } catch (error) {
        console.error('复制到剪贴板失败:', error);
        showMessage('复制到剪贴板失败，请手动选择并复制', 'error');
        
        // 选中文本作为备选方案
        if (elements.reverseScriptPreview) {
            elements.reverseScriptPreview.select();
        }
    }
}

// 打开逆向脚本预览窗口
async function openReversePreviewWindow(data) {
    try {
        const result = await ipcRenderer.invoke('open-reverse-preview-window', data);
        if (!result.success) {
            console.error('打开逆向脚本预览窗口失败:', result.error);
            showMessage('打开逆向脚本预览窗口失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('打开逆向脚本预览窗口失败:', error);
        showMessage('打开逆向脚本预览窗口失败: ' + error.message, 'error');
    }
}