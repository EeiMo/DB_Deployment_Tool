const { ipcRenderer } = require('electron');

class SchemaParserRenderer {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.currentSchemaData = null;
    }

    initializeElements() {
        this.elements = {
            folderPath: document.getElementById('folderPath'),
            selectFolderBtn: document.getElementById('selectFolderBtn'),
            startParseBtn: document.getElementById('startParseBtn'),
            progressSection: document.getElementById('progressSection'),
            progressFill: document.getElementById('progressFill'),
            logArea: document.getElementById('logArea'),
            resultsSection: document.getElementById('resultsSection'),
            tableCount: document.getElementById('tableCount'),
            viewCount: document.getElementById('viewCount'),
            columnCount: document.getElementById('columnCount'),
            fileCount: document.getElementById('fileCount'),
            tableList: document.getElementById('tableList'),
            viewList: document.getElementById('viewList'),
            jsonPreview: document.getElementById('jsonPreview'),
            saveJsonBtn: document.getElementById('saveJsonBtn'),
            tableListCollapseBtn: document.getElementById('tableListCollapseBtn'),
            viewListCollapseBtn: document.getElementById('viewListCollapseBtn')
        };
    }

    bindEvents() {
        // 窗口控制按钮事件
        const minimizeBtn = document.getElementById('minimize-btn');
        const maximizeBtn = document.getElementById('maximize-btn');
        const closeBtn = document.getElementById('close-btn');

        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                ipcRenderer.invoke('schema-parser-window-minimize');
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                ipcRenderer.invoke('schema-parser-window-maximize');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                ipcRenderer.invoke('schema-parser-window-close');
            });
        }

        // 选择目录
        this.elements.selectFolderBtn.addEventListener('click', async () => {
            try {
                const result = await ipcRenderer.invoke('select-repository-directory');
                if (result.success && result.path) {
                    this.elements.folderPath.value = result.path;
                    this.elements.startParseBtn.disabled = false;
                    this.log(`已选择目录: ${result.path}`);
                }
            } catch (error) {
                this.log(`选择目录失败: ${error.message}`, 'error');
            }
        });

        // 开始解析
        this.elements.startParseBtn.addEventListener('click', async () => {
            const repoPath = this.elements.folderPath.value;
            if (!repoPath) {
                this.log('请先选择代码仓库目录', 'error');
                return;
            }

            this.startParsing(repoPath);
        });

        // 保存JSON
        this.elements.saveJsonBtn.addEventListener('click', async () => {
            if (!this.currentSchemaData) {
                this.log('没有可保存的数据', 'error');
                return;
            }

            try {
                const result = await ipcRenderer.invoke('save-schema-json', this.currentSchemaData);
                if (result.success) {
                    this.log(`JSON文件已保存到: ${result.filePath}`, 'success');
                } else {
                    this.log(`保存失败: ${result.error}`, 'error');
                }
            } catch (error) {
                this.log(`保存失败: ${error.message}`, 'error');
            }
        });

        // 表列表折叠功能
        this.elements.tableListCollapseBtn.addEventListener('click', () => {
            this.toggleTableListCollapse();
        });

        // 视图列表折叠功能
        this.elements.viewListCollapseBtn.addEventListener('click', () => {
            this.toggleViewListCollapse();
        });

        // 监听解析进度
        ipcRenderer.on('schema-parse-progress', (event, data) => {
            this.updateProgress(data);
        });

        // 监听解析完成
        ipcRenderer.on('schema-parse-complete', (event, data) => {
            this.handleParseComplete(data);
        });

        // 监听解析错误
        ipcRenderer.on('schema-parse-error', (event, error) => {
            this.log(`解析失败: ${error.message}`, 'error');
            this.resetButtons();
        });
    }

    async startParsing(repoPath) {
        this.elements.startParseBtn.disabled = true;
        this.elements.selectFolderBtn.disabled = true;
        this.elements.progressSection.style.display = 'block';
        this.elements.resultsSection.style.display = 'none';
        
        this.clearLog();
        this.log('开始扫描SQL文件...', 'info');

        try {
            await ipcRenderer.invoke('start-schema-parsing', { repoPath });
        } catch (error) {
            this.log(`启动解析失败: ${error.message}`, 'error');
            this.resetButtons();
        }
    }

    updateProgress(data) {
        const { current, total, message, file } = data;
        
        if (total > 0) {
            const percentage = Math.round((current / total) * 100);
            this.elements.progressFill.style.width = `${percentage}%`;
        }

        if (message) {
            this.log(message, 'info');
        }

        if (file) {
            this.log(`正在处理: ${file}`, 'file');
        }
    }

    handleParseComplete(data) {
        this.log('解析完成！', 'success');
        this.currentSchemaData = data.schemaData;
        
        // 更新统计信息
        this.elements.tableCount.textContent = data.stats.tableCount;
        this.elements.viewCount.textContent = data.stats.viewCount || 0;
        this.elements.columnCount.textContent = data.stats.columnCount;
        this.elements.fileCount.textContent = data.stats.fileCount;

        // 显示表列表
        this.displayTableList(data.schemaData.tables);

        // 显示视图列表
        this.displayViewList(data.schemaData.views);

        // 显示JSON预览
        this.elements.jsonPreview.textContent = JSON.stringify(data.schemaData, null, 2);

        // 显示结果区域
        this.elements.resultsSection.style.display = 'block';
        
        this.resetButtons();
    }

    displayTableList(tables) {
        this.elements.tableList.innerHTML = '';
        
        if (!tables || Object.keys(tables).length === 0) {
            this.elements.tableList.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d;">没有解析到任何表</div>';
            return;
        }

        Object.entries(tables).forEach(([tableKey, tableInfo]) => {
            const tableItem = document.createElement('div');
            tableItem.className = 'table-item';
            
            const columnCount = Object.keys(tableInfo.columns || {}).length;
            
            tableItem.innerHTML = `
                <div>
                    <span class="table-name">${tableInfo.name || tableKey}</span>
                    ${tableInfo.schema ? `<span class="table-schema">(${tableInfo.schema})</span>` : ''}
                </div>
                <div class="column-count">${columnCount} 个字段</div>
            `;
            
            this.elements.tableList.appendChild(tableItem);
        });
    }

    displayViewList(views) {
        this.elements.viewList.innerHTML = '';
        
        if (!views || Object.keys(views).length === 0) {
            this.elements.viewList.innerHTML = '<div style="padding: 20px; text-align: center; color: #7f8c8d;">没有解析到任何视图</div>';
            return;
        }

        Object.entries(views).forEach(([viewKey, viewInfo]) => {
            const viewItem = document.createElement('div');
            viewItem.className = 'table-item';
            
            viewItem.innerHTML = `
                <div>
                    <span class="table-name">${viewInfo.name || viewKey}</span>
                    ${viewInfo.schema ? `<span class="table-schema">(${viewInfo.schema})</span>` : ''}
                </div>
                <div class="column-count">视图定义</div>
            `;
            
            this.elements.viewList.appendChild(viewItem);
        });
    }

    resetUI() {
        this.elements.folderPath.value = '';
        this.elements.startParseBtn.disabled = true;
        this.elements.progressSection.style.display = 'none';
        this.elements.resultsSection.style.display = 'none';
        this.elements.progressFill.style.width = '0%';
        this.clearLog();
        this.currentSchemaData = null;
        this.resetButtons();
    }

    resetButtons() {
        this.elements.startParseBtn.disabled = !this.elements.folderPath.value;
        this.elements.selectFolderBtn.disabled = false;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        
        let prefix = '';
        let style = '';
        
        switch (type) {
            case 'error':
                prefix = '❌';
                style = 'color: #e74c3c;';
                break;
            case 'success':
                prefix = '✅';
                style = 'color: #27ae60;';
                break;
            case 'file':
                prefix = '📄';
                style = 'color: #3498db;';
                break;
            case 'info':
            default:
                prefix = 'ℹ️';
                style = 'color: #74b9ff;';
                break;
        }

        logEntry.innerHTML = `<span style="${style}">[${timestamp}] ${prefix} ${message}</span>`;
        this.elements.logArea.appendChild(logEntry);
        this.elements.logArea.scrollTop = this.elements.logArea.scrollHeight;
    }

    clearLog() {
        this.elements.logArea.innerHTML = '';
    }

    toggleTableListCollapse() {
        const tableList = this.elements.tableList;
        const collapseBtn = this.elements.tableListCollapseBtn;
        
        if (tableList.classList.contains('collapsed')) {
            // 展开
            tableList.classList.remove('collapsed');
            collapseBtn.classList.remove('collapsed');
        } else {
            // 折叠
            tableList.classList.add('collapsed');
            collapseBtn.classList.add('collapsed');
        }
    }

    toggleViewListCollapse() {
        const viewList = this.elements.viewList;
        const collapseBtn = this.elements.viewListCollapseBtn;
        
        if (viewList.classList.contains('collapsed')) {
            // 展开
            viewList.classList.remove('collapsed');
            collapseBtn.classList.remove('collapsed');
        } else {
            // 折叠
            viewList.classList.add('collapsed');
            collapseBtn.classList.add('collapsed');
        }
    }
}

// 初始化渲染器
document.addEventListener('DOMContentLoaded', () => {
    new SchemaParserRenderer();
});