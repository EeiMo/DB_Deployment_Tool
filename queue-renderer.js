const { ipcRenderer } = require('electron');

// 队列数据
let deploymentQueue = [];
let isConnected = false;

// DOM元素
const elements = {
    queueDeploymentQueue: document.getElementById('queue-deployment-queue'),
    queueStartDeploymentBtn: document.getElementById('queue-start-deployment-btn'),
    queueClearQueueBtn: document.getElementById('queue-clear-queue-btn'),
    queueMinimizeBtn: document.getElementById('queue-minimize-btn'),
    queueMaximizeBtn: document.getElementById('queue-maximize-btn'),
    queueCloseBtn: document.getElementById('queue-close-btn')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupWindowControls();
    setupQueueControls();
    setupDragAndDrop();
    
    // 主动请求初始数据同步
    requestInitialData();
});

// 请求初始数据
function requestInitialData() {
    // 通知主进程弹出窗口已准备好接收数据
    ipcRenderer.send('queue-window-ready');
    
    // 添加一个备用的数据请求机制
    setTimeout(() => {
        if (deploymentQueue.length === 0) {
            console.log('备用数据请求机制触发');
            ipcRenderer.send('queue-window-ready');
        }
    }, 200);
}

// 窗口控制
function setupWindowControls() {
    elements.queueMinimizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('queue-window-minimize');
    });

    elements.queueMaximizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('queue-window-maximize');
    });

    elements.queueCloseBtn.addEventListener('click', () => {
        ipcRenderer.invoke('queue-window-close');
    });
}

// 队列控制
function setupQueueControls() {
    elements.queueStartDeploymentBtn.addEventListener('click', () => {
        // 通知主窗口开始部署
        syncQueueData();
        ipcRenderer.send('start-deployment-from-queue');
    });

    elements.queueClearQueueBtn.addEventListener('click', () => {
        deploymentQueue = [];
        updateDeploymentQueue();
        syncQueueData();
        
        // 通知主窗口更新文件树以恢复所有文件夹的显示
        ipcRenderer.send('update-file-tree-from-popup');
    });
}

// 设置拖拽功能
function setupDragAndDrop() {
    const dqContainer = elements.queueDeploymentQueue;
    let draggedElement = null;

    // 拖拽开始
    dqContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('queue-item')) {
            draggedElement = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.outerHTML);
        }
    });

    // 拖拽结束
    dqContainer.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('queue-item')) {
            e.target.classList.remove('dragging');
            draggedElement = null;
        }
        // 清除所有拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-top', 'drag-over-bottom');
        });
    });

    // 拖拽悬停
    dqContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dqContainer.classList.add('drag-over');

        // 清除所有现有的拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-top', 'drag-over-bottom');
        });

        const targetElement = e.target.closest('.queue-item');
        if (targetElement && targetElement !== draggedElement) {
            const rect = targetElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xRatio = x / rect.width;
            const yRatio = y / rect.height;

            // 根据鼠标位置显示不同的拖拽指示器
            if (xRatio < 0.3) {
                targetElement.classList.add('drag-over-left');
            } else if (xRatio > 0.7) {
                targetElement.classList.add('drag-over-right');
            } else if (yRatio < 0.5) {
                targetElement.classList.add('drag-over-top');
            } else {
                targetElement.classList.add('drag-over-bottom');
            }
        }
    });

    // 拖拽离开
    dqContainer.addEventListener('dragleave', (e) => {
        if (!dqContainer.contains(e.relatedTarget)) {
            dqContainer.classList.remove('drag-over');
        }
    });

    // 拖拽放置
    dqContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        dqContainer.classList.remove('drag-over');
        
        // 清除拖拽指示器
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-top', 'drag-over-bottom');
        });

        // 处理从主窗口拖拽过来的文件夹
        const folderName = e.dataTransfer.getData('text/plain');
        if (folderName) {
            // 检查是否拖拽到了队列项上
            const targetElement = e.target.closest('.queue-item');
            let targetId = null;
            let zone = null;
            
            if (targetElement) {
                // 计算拖拽位置
                const rect = targetElement.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const xRatio = x / rect.width;
                const yRatio = y / rect.height;

                targetId = parseInt(targetElement.dataset.id);
                
                if (xRatio < 0.3) {
                    zone = 'left';
                } else if (xRatio > 0.7) {
                    zone = 'right';
                } else if (yRatio < 0.5) {
                    zone = 'top';
                } else {
                    zone = 'bottom';
                }
            }
            
            // 通知主窗口添加文件夹到队列
            ipcRenderer.send('add-folder-to-queue', {
                folderName: folderName,
                targetId: targetId,
                zone: zone
            });
            return;
        }
        
        const targetElement = e.target.closest('.queue-item');
        
        if (draggedElement && targetElement && targetElement !== draggedElement) {
            const rect = targetElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xRatio = x / rect.width;
            const yRatio = y / rect.height;

            const draggedId = parseInt(draggedElement.dataset.id);
            const targetId = parseInt(targetElement.dataset.id);

            let zone;
            if (xRatio < 0.3) {
                zone = 'left';
            } else if (xRatio > 0.7) {
                zone = 'right';
            } else if (yRatio < 0.5) {
                zone = 'top';
            } else {
                zone = 'bottom';
            }

            moveQueueItem(draggedId, targetId, zone);
        }
    });
}

// 移动队列项
function moveQueueItem(draggedId, targetId, zone) {
    const dragged = deploymentQueue.find(item => item.id === draggedId);
    const target = deploymentQueue.find(item => item.id === targetId);
    
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
            syncQueueData();
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
        syncQueueData();
        return;
    }

    if (zone === 'top' || zone === 'bottom') {
        // 串行：上/下插入新stage
        const insertStage = (zone === 'top') ? (target.stage || 1) : (target.stage || 1) + 1;

        // 从旧stage移除占位并压紧
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            const p = i.position || 1;
            if (st === oldStage && i.id !== draggedId && p > oldPos) {
                i.position = p - 1;
            }
        });

        // 如果旧stage为空，关闭stage空洞，同时校正插入stage位置
        const oldStageEmpty = !deploymentQueue.some(i => i.id !== draggedId && (i.stage || 1) === oldStage);
        if (oldStageEmpty) {
            deploymentQueue.forEach(i => {
                const st = i.stage || 1;
                if (st > oldStage) i.stage = st - 1;
            });
            // 如果插入stage在旧stage之后，插入stage编号也会-1
            if (insertStage > oldStage) {
                dragged.stage = insertStage - 1;
            } else {
                dragged.stage = insertStage;
            }
        } else {
            dragged.stage = insertStage;
        }

        // 为新stage腾出空间，后续stage编号+1
        const newStage = dragged.stage || 1;
        deploymentQueue.forEach(i => {
            const st = i.stage || 1;
            if (i.id !== draggedId && st >= newStage) {
                i.stage = st + 1;
            }
        });

        // 放入新stage，位置从1开始（可后续支持向左/右扩展）
        dragged.stage = newStage;
        dragged.position = 1;

        // 压紧新旧相关stage的并行位置
        compactPositions(newStage);
        closeEmptyStageGap(oldStage);

        updateDeploymentQueue();
        syncQueueData();
        return;
    }
}

// 移除队列项
function removeFromQueue(id) {
    const index = deploymentQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        const removedItem = deploymentQueue[index];
        deploymentQueue.splice(index, 1);
        
        // 重新整理stage和position
        compactStages();
        
        updateDeploymentQueue();
        syncQueueData();
        
        // 通知主窗口更新文件树以恢复被移除文件夹的显示
        ipcRenderer.send('update-file-tree-from-popup');
    }
}

// 压缩stage，移除空的stage
function compactStages() {
    const stages = [...new Set(deploymentQueue.map(item => item.stage || 1))].sort((a, b) => a - b);
    const stageMap = {};
    
    stages.forEach((stage, index) => {
        stageMap[stage] = index + 1;
    });
    
    deploymentQueue.forEach(item => {
        item.stage = stageMap[item.stage || 1];
    });
}

// 创建队列元素
function createQueueElement(item, index) {
    const element = document.createElement('div');
    element.className = 'queue-item';
    element.draggable = true;
    element.dataset.id = item.id;
    
    const stage = item.stage || 1;
    const position = item.position || 1;
    
    element.innerHTML = `
        <div class="queue-item-info">
            <div class="drag-handle">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M9,3H11V5H9V3M13,3H15V5H13V3M9,7H11V9H9V7M13,7H15V9H13V7M9,11H11V13H9V11M13,11H15V13H13V11M9,15H11V17H9V15M13,15H15V17H13V15M9,19H11V21H9V19M13,19H15V21H13V19Z"/>
                </svg>
            </div>
            <div class="queue-item-icon">
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                </svg>
            </div>
            <div class="queue-item-details">
                <h4>${item.folderName}</h4>
                <p>Stage ${stage}, Position ${position} • ${(item.files && item.files.length) ? item.files.length : 0} 个SQL文件</p>
            </div>
        </div>
        <div class="queue-item-actions">
            <button class="queue-item-remove" onclick="removeFromQueue(${item.id})" title="移除">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                </svg>
            </button>
        </div>
    `;
    
    return element;
}

// 更新部署队列显示
function updateDeploymentQueue() {
    const container = elements.queueDeploymentQueue;
    
    // 确保容器存在
    if (!container) {
        console.warn('队列容器未找到，延迟更新');
        setTimeout(updateDeploymentQueue, 50);
        return;
    }
    
    if (deploymentQueue.length === 0) {
        container.innerHTML = `
            <div class="queue-placeholder">
                <svg viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"/>
                </svg>
                <p>部署队列内容将在此处显示</p>
                <p class="hint">支持拖拽排序，按顺序执行</p>
            </div>
        `;
        if (elements.queueStartDeploymentBtn) {
            elements.queueStartDeploymentBtn.disabled = true;
        }
        return;
    }
    
    container.innerHTML = '';
    if (elements.queueStartDeploymentBtn) {
        elements.queueStartDeploymentBtn.disabled = !isConnected;
    }
    
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

// 同步队列数据到主窗口
function syncQueueData() {
    ipcRenderer.invoke('sync-queue-data', {
        deploymentQueue: deploymentQueue,
        isConnected: isConnected
    });
}

// 监听来自主窗口的队列数据更新
ipcRenderer.on('queue-data-updated', (event, data) => {
    deploymentQueue = data.deploymentQueue || [];
    isConnected = data.isConnected || false;
    
    // 使用 requestAnimationFrame 确保在下一个渲染帧更新UI
    requestAnimationFrame(() => {
        updateDeploymentQueue();
    });
});

// 监听来自主窗口的其他事件
ipcRenderer.on('connection-status-changed', (event, connected) => {
    isConnected = connected;
    elements.queueStartDeploymentBtn.disabled = !connected;
});

// 全局函数，供HTML调用
window.removeFromQueue = removeFromQueue;