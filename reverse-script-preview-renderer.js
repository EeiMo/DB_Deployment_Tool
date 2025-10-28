const { ipcRenderer } = require('electron');

// DOM元素
const elements = {
    folderCount: document.getElementById('folder-count'),
    scriptCount: document.getElementById('script-count'),
    generationTime: document.getElementById('generation-time'),
    reverseScriptPreview: document.getElementById('reverse-script-preview'),
    exportReverseScriptBtn: document.getElementById('export-reverse-script-btn'),
    copyReverseScriptBtn: document.getElementById('copy-reverse-script-btn'),
    closeWindowBtn: document.getElementById('close-window-btn'),
    minimizeBtn: document.getElementById('minimize-btn'),
    maximizeBtn: document.getElementById('maximize-btn'),
    closeBtn: document.getElementById('close-btn')
};

// 当前脚本数据
let currentReverseData = null;

// 初始化事件监听器
function initializeEventListeners() {
    // 窗口控制按钮
    elements.minimizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('minimize-reverse-preview-window');
    });

    elements.maximizeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('maximize-reverse-preview-window');
    });

    elements.closeBtn.addEventListener('click', () => {
        ipcRenderer.invoke('close-reverse-preview-window');
    });

    elements.closeWindowBtn.addEventListener('click', () => {
        ipcRenderer.invoke('close-reverse-preview-window');
    });

    // 功能按钮
    elements.exportReverseScriptBtn.addEventListener('click', exportReverseScript);
    elements.copyReverseScriptBtn.addEventListener('click', copyReverseScript);

    // 监听来自主进程的数据
    ipcRenderer.on('reverse-script-data', (event, data) => {
        displayReverseScript(data);
    });

    // 监听窗口状态变化
    ipcRenderer.on('window-maximized', () => {
        elements.maximizeBtn.textContent = '❐';
        elements.maximizeBtn.title = '还原';
    });

    ipcRenderer.on('window-unmaximized', () => {
        elements.maximizeBtn.textContent = '□';
        elements.maximizeBtn.title = '最大化';
    });
}

// 显示逆向脚本
function displayReverseScript(data) {
    currentReverseData = data;
    
    // 更新统计信息
    if (elements.folderCount) {
        elements.folderCount.textContent = data.stats?.folderCount || 0;
    }
    if (elements.scriptCount) {
        elements.scriptCount.textContent = data.stats?.scriptCount || 0;
    }
    if (elements.generationTime) {
        elements.generationTime.textContent = new Date().toLocaleString();
    }

    // 显示脚本内容
    if (elements.reverseScriptPreview) {
        elements.reverseScriptPreview.value = data.reverseScript || '暂无逆向脚本内容';
    }

    // 启用按钮
    if (elements.exportReverseScriptBtn) {
        elements.exportReverseScriptBtn.disabled = false;
    }
    if (elements.copyReverseScriptBtn) {
        elements.copyReverseScriptBtn.disabled = false;
    }
}

// 导出逆向脚本
async function exportReverseScript() {
    if (!currentReverseData) {
        showMessage('没有可导出的逆向脚本', 'error');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('export-reverse-scripts', {
            reverseScriptsByFile: currentReverseData.reverseScriptsByFile,
            scriptContent: currentReverseData.reverseScript
        });

        if (result.success) {
            showMessage(result.message, 'success');
        } else {
            showMessage(result.message || '导出失败', 'error');
        }
    } catch (error) {
        console.error('导出逆向脚本失败:', error);
        showMessage('导出逆向脚本失败: ' + error.message, 'error');
    }
}

// 复制逆向脚本到剪贴板
async function copyReverseScript() {
    if (!currentReverseData || !currentReverseData.reverseScript) {
        showMessage('没有可复制的逆向脚本', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentReverseData.reverseScript);
        showMessage('逆向脚本已复制到剪贴板', 'success');
    } catch (error) {
        console.error('复制到剪贴板失败:', error);
        
        // 备用方法：使用 textarea 选择和复制
        try {
            elements.reverseScriptPreview.select();
            document.execCommand('copy');
            showMessage('逆向脚本已复制到剪贴板', 'success');
        } catch (fallbackError) {
            showMessage('复制到剪贴板失败', 'error');
        }
    }
}

// 显示消息
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    
    // 添加样式
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 4px;
        color: #ffffff;
        font-size: 14px;
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideInRight 0.3s ease-out;
    `;

    // 根据类型设置背景色
    switch (type) {
        case 'success':
            messageEl.style.backgroundColor = '#27ae60';
            break;
        case 'error':
            messageEl.style.backgroundColor = '#e74c3c';
            break;
        case 'warning':
            messageEl.style.backgroundColor = '#f39c12';
            break;
        default:
            messageEl.style.backgroundColor = '#3498db';
    }

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // 添加到页面
    document.body.appendChild(messageEl);

    // 3秒后自动移除
    setTimeout(() => {
        messageEl.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    
    // 通知主进程窗口已准备就绪
    ipcRenderer.invoke('reverse-preview-window-ready');
});

// 处理窗口关闭前的清理
window.addEventListener('beforeunload', () => {
    currentReverseData = null;
});