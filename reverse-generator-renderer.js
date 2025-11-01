const { ipcRenderer } = require('electron');

// DOM元素
const elements = {
    jsonFilePath: document.getElementById('json-file-path'),
    selectJsonBtn: document.getElementById('select-json-btn'),
    jsonInfo: document.getElementById('json-info'),
    tableCount: document.getElementById('table-count'),
    columnCount: document.getElementById('column-count'),
    indexCount: document.getElementById('index-count'),
    parseTime: document.getElementById('parse-time'),
    
    generateSection: document.getElementById('generate-section'),
    generateReverseBtn: document.getElementById('generate-reverse-btn'),
    generateMessage: document.getElementById('generate-message'),
    
    previewSection: document.getElementById('preview-section'),
    scriptPreview: document.getElementById('script-preview'),
    exportScriptBtn: document.getElementById('export-script-btn'),
    copyScriptBtn: document.getElementById('copy-script-btn'),
    closeWindowBtn: document.getElementById('close-window-btn')
};

// 全局变量
let selectedJsonData = null;
let generatedScript = '';

// 初始化事件监听器
function initializeEventListeners() {
    elements.selectJsonBtn.addEventListener('click', selectJsonFile);
    elements.generateReverseBtn.addEventListener('click', generateReverseScript);
    elements.exportScriptBtn.addEventListener('click', exportScript);
    elements.copyScriptBtn.addEventListener('click', copyToClipboard);
    elements.closeWindowBtn.addEventListener('click', closeWindow);
}

// 选择JSON文件
async function selectJsonFile() {
    try {
        const result = await ipcRenderer.invoke('select-json-file');
        
        if (result.success && result.filePath) {
            elements.jsonFilePath.value = result.filePath;
            
            // 读取并解析JSON文件
            const jsonResult = await ipcRenderer.invoke('read-json-file', result.filePath);
            
            if (jsonResult.success) {
                selectedJsonData = jsonResult.data;
                displayJsonInfo(selectedJsonData);
                enableGenerateSection();
            } else {
                showMessage(jsonResult.error, 'error');
            }
        }
    } catch (error) {
        console.error('选择JSON文件时发生错误:', error);
        showMessage('选择文件时发生错误: ' + error.message, 'error');
    }
}

// 显示JSON文件信息
function displayJsonInfo(jsonData) {
    const stats = calculateJsonStats(jsonData);
    
    elements.tableCount.textContent = stats.tableCount;
    elements.columnCount.textContent = stats.columnCount;
    elements.indexCount.textContent = stats.indexCount;
    elements.parseTime.textContent = stats.parseTime || '-';
    
    elements.jsonInfo.style.display = 'block';
}

// 计算JSON统计信息
function calculateJsonStats(jsonData) {
    let tableCount = 0;
    let columnCount = 0;
    let indexCount = 0;
    let parseTime = '-';
    
    if (jsonData && jsonData.tables) {
        tableCount = Object.keys(jsonData.tables).length;
        
        Object.values(jsonData.tables).forEach(table => {
            if (table.columns) {
                columnCount += Object.keys(table.columns).length;
            }
            if (table.indexes) {
                indexCount += Object.keys(table.indexes).length;
            }
        });
    }
    
    if (jsonData && jsonData.metadata && jsonData.metadata.exportTime) {
        parseTime = new Date(jsonData.metadata.exportTime).toLocaleString();
    }
    
    return { tableCount, columnCount, indexCount, parseTime };
}

// 启用生成脚本部分
function enableGenerateSection() {
    elements.generateSection.classList.remove('disabled-section');
    elements.generateReverseBtn.disabled = false;
}

// 生成逆向脚本
async function generateReverseScript() {
    if (!selectedJsonData) {
        showMessage('请先选择JSON文件', 'error');
        return;
    }
    
    try {
        elements.generateReverseBtn.disabled = true;
        showMessage('正在生成逆向脚本...', 'info');
        
        const result = await ipcRenderer.invoke('generate-reverse-from-json', {
            jsonData: selectedJsonData
        });
        
        if (result.success) {
            generatedScript = result.script;
            elements.scriptPreview.value = generatedScript;
            
            enablePreviewSection();
            showMessage('逆向脚本生成成功！', 'success');
        } else {
            showMessage('生成逆向脚本失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('生成逆向脚本时发生错误:', error);
        showMessage('生成逆向脚本时发生错误: ' + error.message, 'error');
    } finally {
        elements.generateReverseBtn.disabled = false;
    }
}

// 启用预览部分
function enablePreviewSection() {
    elements.previewSection.classList.remove('disabled-section');
    elements.exportScriptBtn.disabled = false;
    elements.copyScriptBtn.disabled = false;
}

// 导出脚本
async function exportScript() {
    if (!generatedScript) {
        showMessage('没有可导出的脚本', 'error');
        return;
    }
    
    try {
        const result = await ipcRenderer.invoke('export-reverse-script', {
            script: generatedScript
        });
        
        if (result.success) {
            showMessage('脚本已导出到: ' + result.filePath, 'success');
        } else {
            showMessage('导出失败: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('导出脚本时发生错误:', error);
        showMessage('导出脚本时发生错误: ' + error.message, 'error');
    }
}

// 复制到剪贴板
async function copyToClipboard() {
    if (!generatedScript) {
        showMessage('没有可复制的脚本', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(generatedScript);
        showMessage('脚本已复制到剪贴板', 'success');
    } catch (error) {
        console.error('复制到剪贴板失败:', error);
        showMessage('复制失败: ' + error.message, 'error');
    }
}

// 关闭窗口
function closeWindow() {
    ipcRenderer.invoke('close-reverse-generator-window');
}

// 显示消息
function showMessage(message, type = 'info') {
    const messageElement = elements.generateMessage;
    messageElement.innerHTML = `<div class="${type}-message">${message}</div>`;
    
    // 3秒后清除消息
    setTimeout(() => {
        messageElement.innerHTML = '';
    }, 3000);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
});