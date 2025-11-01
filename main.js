const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs-extra');
const { Client } = require('pg');

// 引入逆向SQL脚本生成器
const ReverseSQLGenerator = require('./reverse-sql-generator.js');
const SchemaParser = require('./schema-parser.js');

let mainWindow;
let queueWindow;
let schemaParserWindow;
let reverseGeneratorWindow;
let reversePreviewWindow;
let autoCreateTableWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 800,
    minWidth: 1500,
    minHeight: 800,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      // 禁用硬件加速以避免GPU相关错误
      webSecurity: false
    },
    // 禁用硬件加速
    show: false,
    icon: path.join(__dirname, 'assets', 'SQL图标.ico')
  });

  mainWindow.loadFile('index.html');

  // 页面加载完成后，设置窗口标题显示版本号
  mainWindow.webContents.on('did-finish-load', () => {
    try {
      const version = app.getVersion();
      mainWindow.setTitle(`DB部署工具 v${version}`);
    } catch {}
  });

  // 窗口准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 主窗口关闭事件处理
  mainWindow.on('close', () => {
    // 如果队列窗口存在，先关闭它
    if (queueWindow && !queueWindow.isDestroyed()) {
      queueWindow.destroy();
      queueWindow = null;
    }
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// 禁用硬件加速以解决GPU相关错误
app.disableHardwareAcceleration();

// 设置命令行开关以避免GPU相关问题
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(createWindow);

// 设置自动更新器（GitHub Releases）
function setupAutoUpdater() {
  try {
    autoUpdater.autoDownload = false; // 手动触发下载
    autoUpdater.logger = log;
    autoUpdater.disableDownloadVerification = true;
    log.transports.file.level = 'info';

    const sendUpdateStatus = (status, message, data = {}) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status, message, ...data });
      }
    };

    autoUpdater.on('checking-for-update', () => {
      sendUpdateStatus('checking-for-update', '正在检查更新...');
    });

    autoUpdater.on('update-available', (info) => {
      sendUpdateStatus('update-available', `发现新版本 ${info.version}`, { info });
      // 自动开始下载更新包
      autoUpdater.downloadUpdate().catch(err => {
        sendUpdateStatus('error', `下载更新失败: ${err?.message || err}`);
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      sendUpdateStatus('update-not-available', '当前已是最新版本', { info });
    });

    autoUpdater.on('error', (err) => {
      sendUpdateStatus('error', `更新出错: ${err?.message || err}`, { error: err?.stack || String(err) });
    });

    autoUpdater.on('download-progress', (progress) => {
      sendUpdateStatus('download-progress', '正在下载更新', { progress });
    });

    autoUpdater.on('update-downloaded', (info) => {
      sendUpdateStatus('update-downloaded', '更新包已下载，准备安装', { info });
    });

    // IPC: 手动检查更新
    ipcMain.handle('check-for-updates', async () => {
      try {
        await autoUpdater.checkForUpdates();
        return { success: true };
      } catch (error) {
        sendUpdateStatus('error', `检查更新失败: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // IPC: 下载更新
    ipcMain.handle('download-update', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        sendUpdateStatus('error', `下载更新失败: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // IPC: 退出并安装
    ipcMain.handle('quit-and-install', () => {
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        sendUpdateStatus('error', `安装更新失败: ${error.message}`);
        return { success: false, error: error.message };
      }
    });
  } catch (e) {
    log.error('初始化自动更新器失败:', e);
  }
}

app.whenReady().then(() => {
  setupAutoUpdater();
});

// 提供应用版本给渲染进程
ipcMain.handle('get-app-version', async () => {
  try {
    return app.getVersion();
  } catch (e) {
    return 'unknown';
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC处理程序
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('scan-sql-files', async (event, rootPath) => {
  try {
    const sqlFiles = await scanSqlFiles(rootPath);
    return sqlFiles;
  } catch (error) {
    console.error('扫描SQL文件失败:', error);
    return {};
  }
});

// 数据库连接功能已移除，为后续重构做准备

// 测试数据库连接
ipcMain.handle('test-db-connection', async (event, config) => {
  try {
    const client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: 5000,
    });
    
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    
    return { success: true, message: '连接成功' };
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    
    // 处理常见的PostgreSQL错误消息
    let errorMessage = '连接失败';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到数据库服务器，请检查主机地址和端口';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '找不到数据库主机，请检查主机地址';
    } else if (error.code === '28P01') {
      errorMessage = '用户名或密码错误，请检查认证信息';
    } else if (error.code === '3D000') {
      errorMessage = '数据库不存在，请检查数据库名称';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = '连接超时，请检查网络连接';
    } else if (error.code === '08006') {
      errorMessage = '连接失败，请检查数据库服务是否正常运行';
    } else {
      // 对于其他错误，使用通用错误消息
      errorMessage = '数据库连接失败，请检查配置信息';
    }
    
    return { success: false, message: errorMessage };
  }
});

// 连接到数据库
ipcMain.handle('connect-to-database', async (event, config) => {
  try {
    const client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: 5000,
    });
    
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    
    return { success: true, message: '连接成功' };
  } catch (error) {
    console.error('数据库连接失败:', error);
    
    // 处理常见的PostgreSQL错误消息
    let errorMessage = '连接失败';
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到数据库服务器，请检查主机地址和端口';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '找不到数据库主机，请检查主机地址';
    } else if (error.code === '28P01') {
      errorMessage = '用户名或密码错误，请检查认证信息';
    } else if (error.code === '3D000') {
      errorMessage = '数据库不存在，请检查数据库名称';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = '连接超时，请检查网络连接';
    } else if (error.code === '08006') {
      errorMessage = '连接失败，请检查数据库服务是否正常运行';
    } else {
      // 对于其他错误，使用通用错误消息
      errorMessage = '数据库连接失败，请检查配置信息';
    }
    
    return { success: false, message: errorMessage };
  }
});

// 执行SQL文件功能
ipcMain.handle('execute-sql-files', async (event, config, filePaths, skipOnError = false, startIndex = 0) => {
  const results = [];
  let client;
  let stopped = false;
  let stopIndex = null;
  
  try {
    // 创建数据库连接
    client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: 30000,
    });
    
    await client.connect();
    
    // 从指定索引开始按顺序执行每个SQL文件
    for (let i = startIndex; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      try {
        const sqlContent = await fs.readFile(filePath, 'utf8');
        
        // 执行SQL语句
        await client.query(sqlContent);
        
        results.push({ 
          file: path.basename(filePath), 
          status: 'success', 
          message: '执行成功',
          index: i
        });
        
        // 发送进度更新
        mainWindow.webContents.send('execution-progress', {
          file: path.basename(filePath),
          fullPath: filePath,
          status: 'success'
        });
        
      } catch (error) {
        console.error(`执行SQL文件失败: ${filePath}`, error);
        
        results.push({ 
          file: path.basename(filePath), 
          status: 'error', 
          error: error.message,
          index: i
        });
        
        mainWindow.webContents.send('execution-progress', {
          file: path.basename(filePath),
          fullPath: filePath,
          status: 'error',
          error: error.message
        });
        
        // 如果不跳过错误，则停止执行后续文件，并记录停止索引
        if (!skipOnError) {
          console.log('遇到错误，停止执行后续文件');
          stopped = true;
          stopIndex = i;
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('数据库连接失败:', error);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
  
  return {
    results,
    stopped,
    stopIndex,
    startIndex,
    total: filePaths.length,
    failedFilePath: stopped ? filePaths[stopIndex] : null
  };
});

// 窗口控制
ipcMain.handle('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow.close();
});

// 部署队列弹出窗口控制
ipcMain.handle('open-queue-window', () => {
  if (queueWindow) {
    queueWindow.focus();
    return;
  }

  queueWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    show: false
  });

  queueWindow.loadFile('queue-window.html');

  queueWindow.once('ready-to-show', () => {
    queueWindow.show();
  });

  // 监听弹出窗口准备就绪事件
  queueWindow.webContents.once('did-finish-load', () => {
    // 确保窗口内容完全加载后再同步数据
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('sync-queue-to-popup');
        } catch (error) {
          console.log('Failed to send sync-queue-to-popup message:', error.message);
        }
      }
    }, 100);
  });

  queueWindow.on('closed', () => {
    queueWindow = null;
    // 通知主窗口队列窗口已关闭
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('queue-window-closed');
      } catch (error) {
        console.log('Failed to send queue-window-closed message:', error.message);
      }
    }
  });
});

ipcMain.handle('close-queue-window', () => {
  if (queueWindow) {
    queueWindow.close();
  }
});

// 队列窗口控制
ipcMain.handle('queue-window-minimize', () => {
  if (queueWindow) {
    queueWindow.minimize();
  }
});

ipcMain.handle('queue-window-maximize', () => {
  if (queueWindow) {
    if (queueWindow.isMaximized()) {
      queueWindow.unmaximize();
    } else {
      queueWindow.maximize();
    }
  }
});

ipcMain.handle('queue-window-close', () => {
  if (queueWindow) {
    queueWindow.close();
  }
});

// 队列数据同步
ipcMain.handle('sync-queue-data', (event, queueData) => {
  // 将队列数据同步到另一个窗口
  const sender = event.sender;
  try {
    if (sender === mainWindow?.webContents && queueWindow && !queueWindow.isDestroyed()) {
      queueWindow.webContents.send('queue-data-updated', queueData);
    } else if (sender === queueWindow?.webContents && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-data-updated', queueData);
    }
  } catch (error) {
    console.log('Failed to sync queue data:', error.message);
  }
});

// 处理来自队列窗口的开始部署请求
ipcMain.on('start-deployment-from-queue', (event) => {
  // 转发到主窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('start-deployment-from-queue');
  }
});

// 监听弹出窗口准备就绪事件
ipcMain.on('queue-window-ready', (event) => {
  // 通知主窗口同步数据到弹出窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-queue-to-popup');
  }
});

// 处理从弹出窗口添加文件夹到队列
ipcMain.on('add-folder-to-queue', (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('add-folder-to-queue-from-popup', data);
  }
});

// 处理从弹出窗口更新文件树的请求
ipcMain.on('update-file-tree-from-popup', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-file-tree-from-popup');
  }
});

// 扫描SQL文件的辅助函数
async function scanSqlFiles(rootPath) {
  const result = {};
  
  try {
    const items = await fs.readdir(rootPath);
    
    for (const item of items) {
      const itemPath = path.join(rootPath, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isDirectory()) {
        const sqlFiles = await findSqlFilesInDirectory(itemPath);
        if (sqlFiles.length > 0) {
          result[item] = sqlFiles;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('扫描目录失败:', error);
    return {};
  }
}

async function findSqlFilesInDirectory(dirPath) {
  const sqlFiles = [];
  
  try {
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isFile() && path.extname(item).toLowerCase() === '.sql') {
        sqlFiles.push({
          name: item,
          path: itemPath,
          size: stat.size,
          modified: stat.mtime
        });
      } else if (stat.isDirectory()) {
        const subFiles = await findSqlFilesInDirectory(itemPath);
        sqlFiles.push(...subFiles);
      }
    }
  } catch (error) {
    console.error('扫描子目录失败:', error);
  }
  
  return sqlFiles;
}

// 生成逆向SQL脚本
// 生成逆向SQL脚本
ipcMain.handle('generate-reverse-scripts', async (event, data) => {
  try {
    const { queue, currentDirectory, schemaData } = data;
    
    // 验证参数
    if (!currentDirectory) {
      throw new Error('currentDirectory 参数不能为空');
    }
    
    if (!queue || !Array.isArray(queue)) {
      throw new Error('queue 参数必须是数组');
    }
    
    console.log('开始生成逆向脚本...');
    console.log('队列项目数量:', queue.length);
    console.log('当前目录:', currentDirectory);
    console.log('是否使用JSON文件:', schemaData ? '是' : '否');
    
    // 如果没有提供schemaData，则传递null给生成器
    const generator = new ReverseSQLGenerator(schemaData || null);
    
    // 构建部署队列数据结构
    const deploymentQueue = [];
    for (const item of queue) {
      console.log('处理队列项目:', item.folderName);
      
      // 使用 folderName 而不是 name，因为队列项目使用 folderName 属性
      const folderPath = path.join(currentDirectory, item.folderName);
      console.log('文件夹路径:', folderPath);
      
      // 直接扫描文件夹中的SQL文件，而不是使用scanSqlFiles
      const sqlFiles = await findSqlFilesInDirectory(folderPath);
      console.log(`在 ${item.folderName} 中找到 ${sqlFiles.length} 个SQL文件`);
      
      deploymentQueue.push({
        name: item.folderName,
        path: folderPath,
        files: sqlFiles
      });
    }
    
    console.log('部署队列构建完成，开始生成逆向脚本...');
    const result = await generator.generateReverseScripts(deploymentQueue);
    
    return {
      success: true,
      reverseScript: result.reverseScript,
      reverseScriptsByFile: result.reverseScriptsByFile, // 添加按文件分组的脚本
      stats: result.stats
    };
  } catch (error) {
    console.error('生成逆向脚本失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});



// 创建逆向脚本生成器窗口
ipcMain.handle('open-reverse-generator', async () => {
  try {
    if (reverseGeneratorWindow && !reverseGeneratorWindow.isDestroyed()) {
      reverseGeneratorWindow.focus();
      return;
    }

    reverseGeneratorWindow = new BrowserWindow({
      width: 900,
      height: 700,
      parent: mainWindow,
      modal: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      title: '逆向脚本生成器'
    });

    reverseGeneratorWindow.loadFile('reverse-generator-window.html');

    reverseGeneratorWindow.on('closed', () => {
      reverseGeneratorWindow = null;
    });

    return { success: true };
  } catch (error) {
    console.error('打开逆向脚本生成器窗口失败:', error);
    return { success: false, error: error.message };
  }
});

// 选择JSON文件
ipcMain.handle('select-json-file', async () => {
  try {
    const result = await dialog.showOpenDialog(reverseGeneratorWindow || mainWindow, {
      title: '选择表结构JSON文件',
      filters: [
        { name: 'JSON文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, message: '用户取消选择' };
    }

    return { 
      success: true, 
      filePath: result.filePaths[0] 
    };
  } catch (error) {
    console.error('选择JSON文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 读取JSON文件
ipcMain.handle('read-json-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(content);
    
    return { 
      success: true, 
      data: jsonData 
    };
  } catch (error) {
    console.error('读取JSON文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 选择DDL文件
ipcMain.handle('select-ddl-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择DDL文件',
      filters: [
        { name: 'SQL文件', extensions: ['sql'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { 
      success: true, 
      filePath: result.filePaths[0] 
    };
  } catch (error) {
    console.error('选择DDL文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 读取DDL文件
ipcMain.handle('read-ddl-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { 
      success: true, 
      content: content,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    console.error('读取DDL文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 从JSON和DDL生成逆向脚本
ipcMain.handle('generate-reverse-from-json', async (event, data) => {
  try {
    const { jsonData, ddlContent } = data;
    
    // 创建逆向脚本生成器实例
    const generator = new ReverseSQLGenerator(jsonData);
    
    let script;
    if (ddlContent) {
      // 如果提供了DDL内容，根据DDL操作生成逆向脚本
      script = generator.generateReverseFromDDL(ddlContent, jsonData);
    } else {
      // 否则使用原有的Schema生成方式
      script = generator.generateReverseFromSchema(jsonData);
    }
    
    return { 
      success: true, 
      script: script 
    };
  } catch (error) {
    console.error('从JSON生成逆向脚本失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 导出逆向脚本
ipcMain.handle('export-reverse-script', async (event, data) => {
  try {
    const { script } = data;
    
    const result = await dialog.showSaveDialog(reverseGeneratorWindow || mainWindow, {
      title: '保存逆向SQL脚本',
      defaultPath: `reverse-script-${new Date().toISOString().slice(0, 10)}.sql`,
      filters: [
        { name: 'SQL文件', extensions: ['sql'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, message: '用户取消保存' };
    }

    await fs.writeFile(result.filePath, script, 'utf8');
    
    return { 
      success: true, 
      filePath: result.filePath 
    };
  } catch (error) {
    console.error('导出逆向脚本失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 导出逆向脚本（支持多文件和单文件导出）
ipcMain.handle('export-reverse-scripts', async (event, data) => {
  try {
    const { reverseScriptsByFile, scriptContent } = data;
    
    // 如果有按文件分组的脚本，提供多文件导出选项
    if (reverseScriptsByFile && Object.keys(reverseScriptsByFile).length > 1) {
      const choice = await dialog.showMessageBox(reversePreviewWindow || mainWindow, {
        type: 'question',
        buttons: ['导出为单个文件', '按原文件分别导出', '取消'],
        defaultId: 0,
        title: '选择导出方式',
        message: '检测到多个源文件，请选择导出方式：',
        detail: '单个文件：将所有逆向脚本合并到一个文件\n分别导出：为每个源文件生成对应的逆向脚本文件'
      });

      if (choice.response === 2) {
        return { success: false, message: '用户取消导出' };
      }

      if (choice.response === 1) {
        // 分别导出多个文件
        const result = await dialog.showOpenDialog(reversePreviewWindow || mainWindow, {
          title: '选择导出目录',
          properties: ['openDirectory']
        });

        if (result.canceled) {
          return { success: false, message: '用户取消选择目录' };
        }

        const exportDir = result.filePaths[0];
        const filePaths = [];

        for (const scriptFile of reverseScriptsByFile) {
          const exportPath = path.join(exportDir, scriptFile.reverseFileName);
          
          await fs.writeFile(exportPath, scriptFile.content, 'utf8');
          filePaths.push(exportPath);
        }

        return {
          success: true,
          message: `成功导出 ${filePaths.length} 个逆向脚本文件`,
          filePaths: filePaths,
          exportDir: exportDir
        };
      }
    }

    // 单文件导出
    const result = await dialog.showSaveDialog(reversePreviewWindow || mainWindow, {
      title: '保存逆向SQL脚本',
      defaultPath: `reverse-script-${new Date().toISOString().slice(0, 10)}.sql`,
      filters: [
        { name: 'SQL文件', extensions: ['sql'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, message: '用户取消保存' };
    }

    await fs.writeFile(result.filePath, scriptContent, 'utf8');
    
    return { 
      success: true, 
      filePath: result.filePath,
      message: '逆向脚本导出成功'
    };
  } catch (error) {
    console.error('导出逆向脚本失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 关闭逆向脚本生成器窗口
ipcMain.handle('close-reverse-generator-window', async () => {
  if (reverseGeneratorWindow && !reverseGeneratorWindow.isDestroyed()) {
    reverseGeneratorWindow.close();
  }
});

// 创建逆向脚本预览窗口
ipcMain.handle('open-reverse-preview-window', async (event, data) => {
  try {
    if (reversePreviewWindow && !reversePreviewWindow.isDestroyed()) {
      reversePreviewWindow.focus();
      // 发送新数据到现有窗口
      if (data) {
        reversePreviewWindow.webContents.send('reverse-script-data', data);
      }
      return { success: true };
    }

    reversePreviewWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      title: '逆向SQL脚本预览',
      icon: path.join(__dirname, 'assets/icon.png'),
      show: false
    });

    reversePreviewWindow.loadFile('reverse-script-preview-window.html');

    reversePreviewWindow.once('ready-to-show', () => {
      reversePreviewWindow.show();
      // 发送数据到新窗口
      if (data) {
        reversePreviewWindow.webContents.send('reverse-script-data', data);
      }
    });

    reversePreviewWindow.on('closed', () => {
      reversePreviewWindow = null;
    });

    // 监听窗口最大化/还原状态变化
    reversePreviewWindow.on('maximize', () => {
      reversePreviewWindow.webContents.send('window-maximized');
    });

    reversePreviewWindow.on('unmaximize', () => {
      reversePreviewWindow.webContents.send('window-unmaximized');
    });

    return { success: true };
  } catch (error) {
    console.error('打开逆向脚本预览窗口失败:', error);
    return { success: false, error: error.message };
  }
});

// 逆向脚本预览窗口控制
ipcMain.handle('minimize-reverse-preview-window', () => {
  if (reversePreviewWindow && !reversePreviewWindow.isDestroyed()) {
    reversePreviewWindow.minimize();
  }
});

ipcMain.handle('maximize-reverse-preview-window', () => {
  if (reversePreviewWindow && !reversePreviewWindow.isDestroyed()) {
    if (reversePreviewWindow.isMaximized()) {
      reversePreviewWindow.unmaximize();
    } else {
      reversePreviewWindow.maximize();
    }
  }
});

ipcMain.handle('close-reverse-preview-window', () => {
  if (reversePreviewWindow && !reversePreviewWindow.isDestroyed()) {
    reversePreviewWindow.close();
  }
});

// 逆向脚本预览窗口准备就绪
ipcMain.handle('reverse-preview-window-ready', () => {
  // 窗口准备就绪的处理逻辑
  console.log('逆向脚本预览窗口已准备就绪');
});

// 用系统默认程序打开原始文件
ipcMain.handle('open-original-file', async (event, filePath) => {
  try {
    if (!filePath) {
      return { success: false, message: '文件路径为空' };
    }
    const result = await shell.openPath(filePath);
    if (result) {
      // openPath 返回非空字符串表示错误信息
      return { success: false, message: result };
    }
    return { success: true };
  } catch (error) {
    console.error('打开原文件失败:', error);
    return { success: false, message: error.message };
  }
});

// 表结构解析器窗口控制
ipcMain.handle('schema-parser-window-minimize', () => {
  if (schemaParserWindow) {
    schemaParserWindow.minimize();
  }
});

ipcMain.handle('schema-parser-window-maximize', () => {
  if (schemaParserWindow) {
    if (schemaParserWindow.isMaximized()) {
      schemaParserWindow.unmaximize();
    } else {
      schemaParserWindow.maximize();
    }
  }
});

ipcMain.handle('schema-parser-window-close', () => {
  if (schemaParserWindow) {
    schemaParserWindow.close();
  }
});

// ========== 表结构解析器相关IPC处理 ==========

// 打开表结构解析器窗口
ipcMain.handle('open-schema-parser-window', () => {
  if (schemaParserWindow) {
    schemaParserWindow.focus();
    return;
  }

  schemaParserWindow = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 900,
    minHeight: 620,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  schemaParserWindow.loadFile('schema-parser-window.html');

  schemaParserWindow.once('ready-to-show', () => {
    schemaParserWindow.show();
  });

  schemaParserWindow.on('closed', () => {
    schemaParserWindow = null;
  });
});

// 选择代码仓库目录
ipcMain.handle('select-repository-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(schemaParserWindow || mainWindow, {
      title: '选择代码仓库目录',
      properties: ['openDirectory']
    });

    if (result.canceled) {
      return { success: false };
    }

    return {
      success: true,
      path: result.filePaths[0]
    };
  } catch (error) {
    console.error('选择目录失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 开始表结构解析
ipcMain.handle('start-schema-parsing', async (event, data) => {
  try {
    const { repoPath } = data;
    const parser = new SchemaParser();

    // 进度回调函数
    const progressCallback = (progressData) => {
      if (schemaParserWindow) {
        schemaParserWindow.webContents.send('schema-parse-progress', progressData);
      }
    };

    // 开始解析
    const result = await parser.parseRepository(repoPath, progressCallback);

    // 发送完成事件
    if (schemaParserWindow) {
      schemaParserWindow.webContents.send('schema-parse-complete', result);
    }

    return result;
  } catch (error) {
    console.error('表结构解析失败:', error);
    
    // 发送错误事件
    if (schemaParserWindow) {
      schemaParserWindow.webContents.send('schema-parse-error', error);
    }
    
    throw error;
  }
});

// 读取文件内容
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error('读取文件失败:', error);
    throw error;
  }
});

// 保存表结构JSON文件
ipcMain.handle('save-schema-json', async (event, schemaData) => {
  try {
    const result = await dialog.showSaveDialog(schemaParserWindow || mainWindow, {
      title: '保存表结构JSON文件',
      defaultPath: `schema-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        { name: 'JSON文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, message: '用户取消保存' };
    }

    // 写入JSON文件
    const jsonContent = JSON.stringify(schemaData, null, 2);
    await fs.writeFile(result.filePath, jsonContent, 'utf8');
    
    return { 
      success: true, 
      message: 'JSON文件保存成功',
      filePath: result.filePath 
    };
  } catch (error) {
    console.error('保存JSON文件失败:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 自动建表窗口
ipcMain.handle('open-auto-create-table-window', () => {
  if (autoCreateTableWindow) {
    autoCreateTableWindow.focus();
    return;
  }

  autoCreateTableWindow = new BrowserWindow({
    width: 980,
    height: 668,
    minWidth: 980,
    minHeight: 668,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    parent: mainWindow,
    show: false,
    icon: path.join(__dirname, 'assets', 'SQL图标.ico')
  });

  autoCreateTableWindow.loadFile('auto-create-table-window.html');

  autoCreateTableWindow.once('ready-to-show', () => {
    autoCreateTableWindow.show();
  });

  autoCreateTableWindow.on('closed', () => {
    autoCreateTableWindow = null;
  });
});

// 自动建表窗口窗体控制
ipcMain.handle('auto-create-window-minimize', () => {
  if (autoCreateTableWindow && !autoCreateTableWindow.isDestroyed()) {
    autoCreateTableWindow.minimize();
  }
});

ipcMain.handle('auto-create-window-maximize', () => {
  if (autoCreateTableWindow && !autoCreateTableWindow.isDestroyed()) {
    if (autoCreateTableWindow.isMaximized()) {
      autoCreateTableWindow.unmaximize();
    } else {
      autoCreateTableWindow.maximize();
    }
  }
});

ipcMain.handle('close-auto-create-window', () => {
  if (autoCreateTableWindow && !autoCreateTableWindow.isDestroyed()) {
    autoCreateTableWindow.close();
    autoCreateTableWindow = null;
  }
});

// 选择Excel文件
ipcMain.handle('select-excel-file', async () => {
  try {
    const result = await dialog.showOpenDialog(autoCreateTableWindow || mainWindow, {
      title: '选择Excel映射文件',
      properties: ['openFile'],
      filters: [
        { name: 'Excel/CSV', extensions: ['xlsx', 'xls', 'csv'] }
      ]
    });

    if (result.canceled || !result.filePaths?.length) {
      return { success: false };
    }
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('选择Excel文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 保存生成的SQL到文件
ipcMain.handle('save-sql-file', async (event, data) => {
  try {
    const { defaultName, content } = data || {};
    const result = await dialog.showSaveDialog(autoCreateTableWindow || mainWindow, {
      title: '保存生成的SQL文件',
      defaultPath: defaultName || 'create_table.sql',
      filters: [{ name: 'SQL', extensions: ['sql'] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false };
    }

    await fs.writeFile(result.filePath, content, 'utf8');
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('保存SQL文件失败:', error);
    return { success: false, error: error.message };
  }
});