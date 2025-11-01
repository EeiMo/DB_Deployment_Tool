const { ipcRenderer } = require('electron');

// DOM元素
const elements = {
    folderCount: document.getElementById('folder-count'),
    scriptCount: document.getElementById('script-count'),
    generationTime: document.getElementById('generation-time'),
    reverseScriptPreview: document.getElementById('reverse-script-preview'),
    copyShadow: document.getElementById('reverse-script-copy-shadow'),
    toggleWrap: document.getElementById('toggle-wrap'),
    fontSizeSlider: document.getElementById('font-size-slider'),
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

    // 预览工具栏：自动换行
    if (elements.toggleWrap && elements.reverseScriptPreview) {
        elements.toggleWrap.addEventListener('change', () => {
            const wrap = elements.toggleWrap.checked;
            elements.reverseScriptPreview.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
            elements.reverseScriptPreview.style.wordBreak = wrap ? 'break-word' : 'normal';
        });
    }

    // 预览工具栏：字体大小滑块
    if (elements.fontSizeSlider && elements.reverseScriptPreview) {
        elements.fontSizeSlider.addEventListener('input', () => {
            const size = parseInt(elements.fontSizeSlider.value, 10) || 13;
            elements.reverseScriptPreview.style.fontSize = `${size}px`;
        });
    }

    // 在预览区内捕获文件链接点击事件，调用主进程用系统默认程序打开
    if (elements.reverseScriptPreview) {
        elements.reverseScriptPreview.addEventListener('click', (e) => {
            const a = e.target.closest('a.file-link');
            if (a) {
                const filePath = a.getAttribute('data-path');
                if (filePath) {
                    ipcRenderer.invoke('open-original-file', filePath)
                        .then((res) => {
                            if (res && res.message && !res.success) {
                                showMessage(res.message, 'warning');
                            }
                        })
                        .catch(err => {
                            console.error('打开原文件失败:', err);
                            showMessage('打开原文件失败: ' + err.message, 'error');
                        });
                }
                e.preventDefault();
            }
        });
    }
}

// 显示逆向脚本
// HTML转义，避免XSS
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 关键字高亮（增强版）：
// - 行内与多行块注释(/* ... */)不进行关键字高亮，统一使用绿色样式
// - 单行注释(--)整行视为注释
function highlightSQL(sql) {
    const esc = escapeHtml(sql);
    const lines = esc.split(/\r?\n/);
    const wrapKW = (text, kw) => {
        const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
        return text.replace(re, (m) => `<span class="hl-keyword">${m}</span>`);
    };

    const multiWord = [
        'GROUP BY', 'ORDER BY', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'RENAME TO'
    ];
    const singleWord = [
        'DROP', 'TABLE', 'VIEW', 'IF', 'EXISTS', 'CREATE', 'OR', 'REPLACE', 'AS',
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'INSERT', 'INTO', 'UPDATE', 'SET',
        'DELETE', 'TRUNCATE', 'ALTER', 'AND', 'OR', 'NOT', 'NULL', 'DEFAULT', 'COMMENT', 'IS'
    ];

    const applyKeywords = (text) => {
        let h = text;
        multiWord.forEach((kw) => { h = wrapKW(h, kw); });
        singleWord.forEach((kw) => { h = wrapKW(h, kw); });
        return h;
    };

    let inBlock = false;
    const res = lines.map((line) => {
        // 单行注释
        if (/^\s*--/.test(line)) {
            return `<span class="hl-comment">${line}</span>`;
        }

        // 多行块注释处理
        if (inBlock) {
            const endIdx = line.indexOf('*/');
            if (endIdx !== -1) {
                const commentPart = line.slice(0, endIdx + 2);
                const rest = line.slice(endIdx + 2);
                inBlock = false;
                return `<span class="hl-comment">${commentPart}</span>` + (rest ? applyKeywords(rest) : '');
            }
            return `<span class="hl-comment">${line}</span>`;
        }

        const startIdx = line.indexOf('/*');
        if (startIdx !== -1) {
            const before = line.slice(0, startIdx);
            const afterStart = line.slice(startIdx);
            const endIdx = afterStart.indexOf('*/');
            if (endIdx !== -1) {
                const commentPart = afterStart.slice(0, endIdx + 2);
                const rest = afterStart.slice(endIdx + 2);
                return (before ? applyKeywords(before) : '') + `<span class="hl-comment">${commentPart}</span>` + (rest ? applyKeywords(rest) : '');
            } else {
                inBlock = true;
                return (before ? applyKeywords(before) : '') + `<span class="hl-comment">${afterStart}</span>`;
            }
        }

        // 非注释行，正常关键字高亮
        return applyKeywords(line);
    }).join('\n');

    return res;
}

// 组合带文件头注释的纯文本（用于导出/复制）
function composePlainScript(data) {
    if (data && Array.isArray(data.reverseScriptsByFile) && data.reverseScriptsByFile.length > 0) {
        return data.reverseScriptsByFile.map(f => `/* 原文件: ${f.originalFileName} */\n${f.content}`).join('\n\n');
    }
    return data?.reverseScript || '暂无逆向脚本内容';
}

// 组合预览HTML（文件链接 + 高亮）
function composePreviewHtml(data) {
    if (data && Array.isArray(data.reverseScriptsByFile) && data.reverseScriptsByFile.length > 0) {
        return data.reverseScriptsByFile.map(f => {
            const header = `<a href="#" class="file-link hl-comment" data-path="${escapeHtml(f.originalPath)}">/* 原文件: ${escapeHtml(f.originalFileName)} */</a>`;
            const body = highlightSQL(f.content);
            return `${header}\n${body}`;
        }).join('\n\n');
    }
    return highlightSQL(data?.reverseScript || '暂无逆向脚本内容');
}

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

    // 显示脚本内容（文件链接 + 高亮 HTML，复制/导出使用组合后的纯文本）
    if (elements.reverseScriptPreview) {
        const previewHtml = composePreviewHtml(data);
        elements.reverseScriptPreview.innerHTML = previewHtml;
        const plain = composePlainScript(data);
        if (elements.copyShadow) {
            elements.copyShadow.value = plain;
        }
        // 缓存组合后的文本，便于复制/导出
        currentReverseData.__composedPlain = plain;
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
            scriptContent: currentReverseData.__composedPlain || composePlainScript(currentReverseData)
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
        const textToCopy = currentReverseData.__composedPlain || composePlainScript(currentReverseData);
        await navigator.clipboard.writeText(textToCopy);
        showMessage('逆向脚本已复制到剪贴板', 'success');
    } catch (error) {
        console.error('复制到剪贴板失败:', error);
        
        // 备用方法：使用隐藏的textarea选择和复制
        try {
            if (elements.copyShadow) {
                elements.copyShadow.value = currentReverseData.__composedPlain || composePlainScript(currentReverseData);
                elements.copyShadow.focus();
                elements.copyShadow.select();
            }
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