const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class SchemaParser {
    constructor() {
        this.schemaData = {
            tables: {},
            views: {},
            metadata: {
                parsedAt: null,
                totalFiles: 0,
                totalTables: 0,
                totalViews: 0
            }
        };
        
        // 添加当前搜索路径状态跟踪
        this.currentSearchPath = null;
    }

    /**
     * 解析CREATE VIEW语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseCreateViewStatement(statement, filePath) {
        console.log(`开始解析CREATE VIEW语句: "${statement}"`);
        
        // 匹配: CREATE [OR REPLACE] VIEW [schema.]view_name AS (SELECT ...)
        // 支持多行视图定义
        const createViewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([`"]?(\w+(?:\.\w+)?)[`"]?)\s+AS\s+([\s\S]*?)(?:;?\s*$)/i;
        const match = statement.match(createViewRegex);
        
        if (!match) {
            console.log(`CREATE VIEW语句匹配失败`);
            return;
        }

        const fullViewName = match[2]; // 完整视图名（可能包含schema）
        const viewDefinition = match[3].trim(); // 视图定义（SELECT语句）

        // 解析 schema 和视图名，统一转换为小写
        let schemaName = null;
        let viewName = fullViewName.toLowerCase(); // 统一转换为小写
        
        if (fullViewName.includes('.')) {
            // 情况1: CREATE VIEW schema.viewname 格式
            const parts = fullViewName.split('.');
            schemaName = parts[0].toLowerCase(); // schema名转换为小写
            viewName = parts[1].toLowerCase(); // 视图名转换为小写
        } else if (this.currentSearchPath) {
            // 情况2: SET SEARCH_PATH = schema; CREATE VIEW viewname 格式
            schemaName = this.currentSearchPath.toLowerCase(); // 使用小写的搜索路径
            // viewName 已经转换为小写
        }

        // 构建完整视图名用作键值（全部小写）
        const fullName = schemaName ? `${schemaName}.${viewName}` : viewName;
        const viewKey = fullName;
        
        console.log(`解析视图: ${fullViewName} -> ${fullName} (schema: ${schemaName}, view: ${viewName})`);
        console.log(`视图定义: "${viewDefinition}"`);
        
        // 保留原始语句的完整内容，包括分号
        let originalStatement = statement.trim();
        // 如果原始语句没有分号，不要添加分号，保持原样
        
        // 创建视图信息对象
        this.schemaData.views[viewKey] = {
            name: viewName, // 保存小写的视图名
            fullName: fullViewName.toLowerCase(), // 保存小写的完整视图名
            schema: schemaName, // 保存小写的schema名
            definition: originalStatement, // 保存完整的原始语句，保持原有格式
            sourceFiles: [filePath],
            createdAt: new Date().toISOString()
        };

        console.log(`成功解析视图: ${viewKey}`);
    }

    /**
     * 解析SET SEARCH_PATH语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseSetSearchPathStatement(statement, filePath) {
        console.log(`开始解析SET SEARCH_PATH语句: "${statement}"`);
        
        // 匹配: SET SEARCH_PATH = schema_name 或 SET search_path = schema_name
        const searchPathRegex = /SET\s+SEARCH_PATH\s*=\s*([`"]?(\w+)[`"]?)\s*;?\s*$/i;
        const match = statement.match(searchPathRegex);
        
        if (!match) {
            console.log(`SET SEARCH_PATH语句匹配失败`);
            return;
        }

        const schemaName = match[2].toLowerCase(); // schema名转换为小写
        this.currentSearchPath = schemaName; // 保存小写的schema名
        
        console.log(`设置搜索路径: ${schemaName}`);
    }

    /**
     * 解析分布信息
     * @param {string} statement - CREATE TABLE语句
     * @returns {Object|null} 分布信息对象
     */
    parseDistributionInfo(statement) {
        // 匹配 DISTRIBUTE BY HASH(column_list) 或 DISTRIBUTE BY ROUNDROBIN
        const distributedByHashRegex = /DISTRIBUTE\s+BY\s+HASH\s*\(\s*([^)]+)\s*\)/i;
        const distributedByRoundRobinRegex = /DISTRIBUTE\s+BY\s+ROUNDROBIN/i;
        
        // 兼容旧版本的 DISTRIBUTED BY 语法
        const distributedByRegex = /DISTRIBUTED\s+BY\s*\(\s*([^)]+)\s*\)/i;
        const distributedRandomlyRegex = /DISTRIBUTED\s+RANDOMLY/i;
        
        let distributionInfo = null;
        
        // 检查是否有 DISTRIBUTE BY HASH
        const distributedByHashMatch = statement.match(distributedByHashRegex);
        if (distributedByHashMatch) {
            const columns = distributedByHashMatch[1]
                .split(',')
                .map(col => col.trim().replace(/[`"]/g, ''))
                .filter(col => col.length > 0);
            
            distributionInfo = {
                type: 'hash',
                columns: columns
            };
            
            console.log(`解析到HASH分布键: ${columns.join(', ')}`);
        } else {
            // 检查是否有 DISTRIBUTE BY ROUNDROBIN
            const distributedByRoundRobinMatch = statement.match(distributedByRoundRobinRegex);
            if (distributedByRoundRobinMatch) {
                distributionInfo = {
                    type: 'roundrobin',
                    columns: []
                };
                
                console.log(`解析到ROUNDROBIN分布`);
            } else {
                // 兼容旧版本的 DISTRIBUTED BY 语法
                const distributedByMatch = statement.match(distributedByRegex);
                if (distributedByMatch) {
                    const columns = distributedByMatch[1]
                        .split(',')
                        .map(col => col.trim().replace(/[`"]/g, ''))
                        .filter(col => col.length > 0);
                    
                    distributionInfo = {
                        type: 'hash',
                        columns: columns
                    };
                    
                    console.log(`解析到分布键(兼容模式): ${columns.join(', ')}`);
                } else {
                    // 检查是否有 DISTRIBUTED RANDOMLY
                    const distributedRandomlyMatch = statement.match(distributedRandomlyRegex);
                    if (distributedRandomlyMatch) {
                        distributionInfo = {
                            type: 'random',
                            columns: []
                        };
                        
                        console.log(`解析到随机分布(兼容模式)`);
                    }
                }
            }
        }
        
        return distributionInfo;
    }

    /**
     * 解析WITH子句
     * @param {string} statement - SQL语句
     * @returns {Object|null} WITH子句信息
     */
    parseWithClause(statement) {
        // 匹配 WITH(ORIENTATION = COLUMN, COMPRESSION = LOW, COLVERSION = 2.0, ENABLE_DELTA = FALSE)
        const withRegex = /WITH\s*\(\s*([^)]+)\s*\)/i;
        const match = statement.match(withRegex);
        
        if (!match) {
            return null;
        }
        
        const withContent = match[1];
        const withOptions = {};
        
        // 解析WITH子句中的各个选项
        const options = withContent.split(',');
        for (const option of options) {
            const trimmedOption = option.trim();
            const equalIndex = trimmedOption.indexOf('=');
            if (equalIndex !== -1) {
                const key = trimmedOption.substring(0, equalIndex).trim();
                const value = trimmedOption.substring(equalIndex + 1).trim();
                withOptions[key] = value;
            }
        }
        
        console.log(`解析到WITH子句: ${JSON.stringify(withOptions)}`);
        
        return {
            raw: match[0], // 保存原始WITH子句
            options: withOptions
        };
    }

    /**
     * 解析TO GROUP子句
     * @param {string} statement - SQL语句
     * @returns {string|null} TO GROUP信息
     */
    parseToGroupClause(statement) {
        // 匹配 TO GROUP "LC_DW1" 或 TO GROUP LC_DW1
        const toGroupRegex = /TO\s+GROUP\s+[`"]?([^`"\s]+)[`"]?/i;
        const match = statement.match(toGroupRegex);
        
        if (!match) {
            return null;
        }
        
        const groupName = match[1];
        console.log(`解析到TO GROUP: ${groupName}`);
        
        return groupName;
    }

    /**
     * 解析COMMENT ON TABLE语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseTableCommentStatement(statement, filePath) {
        console.log(`开始解析COMMENT ON TABLE语句: "${statement}"`);
        
        // 匹配: COMMENT ON TABLE [schema.]table_name IS 'comment'
        const commentRegex = /COMMENT\s+ON\s+TABLE\s+([`"]?(\w+(?:\.\w+)?)[`"]?)\s+IS\s+['"]([^'"]*)['"]\s*;?\s*$/i;
        const match = statement.match(commentRegex);
        
        if (!match) {
            console.log(`COMMENT ON TABLE语句匹配失败`);
            return;
        }

        const fullTableName = match[2];
        const comment = match[3];
        
        console.log(`解析表注释: ${fullTableName} -> "${comment}"`);
        
        // 解析 schema 和表名，支持搜索路径，统一转换为小写
        let schemaName = null;
        let tableName = fullTableName.toLowerCase(); // 统一转换为小写
        
        if (fullTableName.includes('.')) {
            // 情况1: COMMENT ON TABLE schema.tablename 格式
            const parts = fullTableName.split('.');
            schemaName = parts[0].toLowerCase(); // schema名转换为小写
            tableName = parts[1].toLowerCase(); // 表名转换为小写
        } else if (this.currentSearchPath) {
            // 情况2: SET SEARCH_PATH = schema; COMMENT ON TABLE tablename 格式
            schemaName = this.currentSearchPath.toLowerCase(); // 使用小写的搜索路径
            // tableName 已经转换为小写
        }

        // 构建完整表名用作键值（全部小写）
        const fullName = schemaName ? `${schemaName}.${tableName}` : tableName;
        const tableKey = fullName;
        
        console.log(`表注释键值: ${fullTableName} -> ${tableKey} (schema: ${schemaName}, table: ${tableName})`);
        
        // 确保表存在
        if (!this.schemaData.tables[tableKey]) {
            this.schemaData.tables[tableKey] = {
                name: tableName, // 保存小写的表名
                fullName: fullTableName.toLowerCase(), // 保存小写的完整表名
                schema: schemaName, // 保存小写的schema名
                columns: {},
                sourceFiles: []
            };
        }
        
        // 添加表注释
        this.schemaData.tables[tableKey].comment = comment;
        
        // 添加源文件信息
        if (!this.schemaData.tables[tableKey].sourceFiles.includes(filePath)) {
            this.schemaData.tables[tableKey].sourceFiles.push(filePath);
        }
    }

    /**
     * 解析COMMENT ON COLUMN语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseColumnCommentStatement(statement, filePath) {
        console.log(`开始解析COMMENT ON COLUMN语句: "${statement}"`);
        
        // 匹配: COMMENT ON COLUMN [schema.]table_name.column_name IS 'comment'
        const commentRegex = /COMMENT\s+ON\s+COLUMN\s+([`"]?(\w+(?:\.\w+)?)[`"]?)\.([`"]?(\w+)[`"]?)\s+IS\s+['"]([^'"]*)['"]\s*;?\s*$/i;
        const match = statement.match(commentRegex);
        
        if (!match) {
            console.log(`COMMENT ON COLUMN语句匹配失败`);
            return;
        }

        const fullTableName = match[2];
        const columnName = match[4].toLowerCase(); // 列名转换为小写
        const comment = match[5];
        
        console.log(`解析字段注释: ${fullTableName}.${columnName} -> "${comment}"`);
        
        // 解析 schema 和表名，支持搜索路径，统一转换为小写
        let schemaName = null;
        let tableName = fullTableName.toLowerCase(); // 统一转换为小写
        
        if (fullTableName.includes('.')) {
            // 情况1: COMMENT ON COLUMN schema.tablename.columnname 格式
            const parts = fullTableName.split('.');
            schemaName = parts[0].toLowerCase(); // schema名转换为小写
            tableName = parts[1].toLowerCase(); // 表名转换为小写
        } else if (this.currentSearchPath) {
            // 情况2: SET SEARCH_PATH = schema; COMMENT ON COLUMN tablename.columnname 格式
            schemaName = this.currentSearchPath.toLowerCase(); // 使用小写的搜索路径
            // tableName 已经转换为小写
        }

        // 构建完整表名用作键值（全部小写）
        const fullName = schemaName ? `${schemaName}.${tableName}` : tableName;
        const tableKey = fullName;
        
        console.log(`字段注释键值: ${fullTableName}.${columnName} -> ${tableKey}.${columnName} (schema: ${schemaName}, table: ${tableName})`);
        
        // 首先检查是否为视图字段注释
        if (this.schemaData.views[tableKey]) {
            console.log(`识别为视图字段注释，将追加到视图definition中`);
            // 将字段注释语句追加到视图的definition中
            this.schemaData.views[tableKey].definition += `\n${statement.trim()}`;
            return;
        }
        
        // 处理表字段注释
        // 确保表存在
        if (!this.schemaData.tables[tableKey]) {
            this.schemaData.tables[tableKey] = {
                name: tableName, // 保存小写的表名
                fullName: fullTableName.toLowerCase(), // 保存小写的完整表名
                schema: schemaName, // 保存小写的schema名
                columns: {},
                sourceFiles: []
            };
        }
        
        // 确保字段存在
        if (!this.schemaData.tables[tableKey].columns[columnName]) {
            this.schemaData.tables[tableKey].columns[columnName] = {
                name: columnName, // 保存小写的列名
                type: 'UNKNOWN'
            };
        }
        
        // 添加字段注释
        this.schemaData.tables[tableKey].columns[columnName].comment = comment;
        
        // 添加源文件信息
        if (!this.schemaData.tables[tableKey].sourceFiles.includes(filePath)) {
            this.schemaData.tables[tableKey].sourceFiles.push(filePath);
        }
    }

    /**
     * 解析COMMENT ON VIEW语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseViewCommentStatement(statement, filePath) {
        console.log(`开始解析COMMENT ON VIEW语句: "${statement}"`);
        
        // 匹配: COMMENT ON VIEW [schema.]view_name IS 'comment'
        const commentRegex = /COMMENT\s+ON\s+VIEW\s+([`"]?(\w+(?:\.\w+)?)[`"]?)\s+IS\s+['"]([^'"]*)['"]\s*;?\s*$/i;
        const match = statement.match(commentRegex);
        
        if (!match) {
            console.log(`COMMENT ON VIEW语句匹配失败`);
            return;
        }

        const fullViewName = match[2];
        const comment = match[3];
        
        console.log(`解析视图注释: ${fullViewName} -> "${comment}"`);
        
        // 解析 schema 和视图名，支持搜索路径，统一转换为小写
        let schemaName = null;
        let viewName = fullViewName.toLowerCase(); // 统一转换为小写
        
        if (fullViewName.includes('.')) {
            // 情况1: COMMENT ON VIEW schema.viewname 格式
            const parts = fullViewName.split('.');
            schemaName = parts[0].toLowerCase(); // schema名转换为小写
            viewName = parts[1].toLowerCase(); // 视图名转换为小写
        } else if (this.currentSearchPath) {
            // 情况2: SET SEARCH_PATH = schema; COMMENT ON VIEW viewname 格式
            schemaName = this.currentSearchPath.toLowerCase(); // 使用小写的搜索路径
            // viewName 已经转换为小写
        }

        // 构建完整视图名用作键值（全部小写）
        const fullName = schemaName ? `${schemaName}.${viewName}` : viewName;
        const viewKey = fullName;
        
        console.log(`视图注释键值: ${fullViewName} -> ${viewKey} (schema: ${schemaName}, view: ${viewName})`);
        
        // 确保视图存在
        if (!this.schemaData.views[viewKey]) {
            this.schemaData.views[viewKey] = {
                name: viewName, // 保存小写的视图名
                fullName: fullViewName.toLowerCase(), // 保存小写的完整视图名
                schema: schemaName, // 保存小写的schema名
                definition: statement.trim(), // 保留原始注释语句的完整内容，包括分号
                sourceFiles: []
            };
        } else {
            // 如果视图已存在，将注释语句追加到definition中
            // 保留原始语句的完整内容，包括分号
            this.schemaData.views[viewKey].definition += '\n' + statement.trim();
        }
        
        // 添加源文件信息
        if (!this.schemaData.views[viewKey].sourceFiles.includes(filePath)) {
            this.schemaData.views[viewKey].sourceFiles.push(filePath);
        }
    }

    /**
     * 解析代码仓库中的所有SQL文件
     * @param {string} repoPath - 代码仓库路径
     * @param {Function} progressCallback - 进度回调函数
     * @returns {Object} 解析结果
     */
    async parseRepository(repoPath, progressCallback) {
        try {
            console.log(`开始解析代码仓库: ${repoPath}`);
            
            // 重置数据
            this.schemaData = {
                tables: {},
                views: {},
                metadata: {
                    parsedAt: new Date().toISOString(),
                    totalTables: 0,
                    totalViews: 0,
                    totalColumns: 0,
                    totalFiles: 0
                }
            };

            // 递归扫描SQL文件
            const sqlFiles = await this.findSqlFiles(repoPath);
            console.log(`找到 ${sqlFiles.length} 个SQL文件`);

            if (progressCallback) {
                progressCallback({
                    current: 0,
                    total: sqlFiles.length,
                    message: `找到 ${sqlFiles.length} 个SQL文件，开始解析...`
                });
            }

            // 解析每个SQL文件
            for (let i = 0; i < sqlFiles.length; i++) {
                const sqlFile = sqlFiles[i];
                
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: sqlFiles.length,
                        file: path.relative(repoPath, sqlFile)
                    });
                }

                await this.parseSqlFile(sqlFile);
            }

            // 更新元数据
            this.schemaData.metadata.totalTables = Object.keys(this.schemaData.tables).length;
            this.schemaData.metadata.totalViews = Object.keys(this.schemaData.views).length;
            this.schemaData.metadata.totalColumns = Object.values(this.schemaData.tables)
                .reduce((total, table) => total + Object.keys(table.columns).length, 0);
            this.schemaData.metadata.totalFiles = sqlFiles.length;

            console.log(`解析完成: ${this.schemaData.metadata.totalTables} 个表, ${this.schemaData.metadata.totalViews} 个视图, ${this.schemaData.metadata.totalColumns} 个字段`);

            return {
                success: true,
                schemaData: this.schemaData,
                stats: {
                    tableCount: this.schemaData.metadata.totalTables,
                    viewCount: this.schemaData.metadata.totalViews,
                    columnCount: this.schemaData.metadata.totalColumns,
                    fileCount: this.schemaData.metadata.totalFiles
                }
            };

        } catch (error) {
            console.error('解析代码仓库失败:', error);
            throw error;
        }
    }

    /**
     * 递归查找所有SQL文件
     * @param {string} dirPath - 目录路径
     * @returns {Array} SQL文件路径数组
     */
    async findSqlFiles(dirPath) {
        const sqlFiles = [];
        
        try {
            const items = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                
                if (item.isDirectory()) {
                    // 跳过常见的非代码目录
                    if (!this.shouldSkipDirectory(item.name)) {
                        const subFiles = await this.findSqlFiles(fullPath);
                        sqlFiles.push(...subFiles);
                    }
                } else if (item.isFile() && item.name.toLowerCase().endsWith('.sql')) {
                    sqlFiles.push(fullPath);
                }
            }
        } catch (error) {
            console.warn(`无法读取目录 ${dirPath}:`, error.message);
        }
        
        return sqlFiles;
    }

    /**
     * 判断是否应该跳过某个目录
     * @param {string} dirName - 目录名
     * @returns {boolean}
     */
    shouldSkipDirectory(dirName) {
        const skipDirs = [
            'node_modules', '.git', '.svn', '.hg',
            'target', 'build', 'dist', 'out',
            '.idea', '.vscode', '.vs',
            'bin', 'obj', 'logs', 'temp', 'tmp'
        ];
        return skipDirs.includes(dirName.toLowerCase());
    }

    /**
     * 解析单个SQL文件
     * @param {string} filePath - SQL文件路径
     */
    async parseSqlFile(filePath) {
        try {
            console.log(`开始解析SQL文件: ${filePath}`);
            
            const content = fsSync.readFileSync(filePath, 'utf8');
            if (!content.trim()) {
                console.log(`文件为空，跳过: ${filePath}`);
                return;
            }
            
            // 分割SQL语句
            const statements = this.splitSqlStatements(content);
            console.log(`文件 ${path.basename(filePath)} 包含 ${statements.length} 个SQL语句`);
            
            let parsedCount = 0;
            let errorCount = 0;
            
            // 解析每个语句
            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                const trimmed = statement.trim();
                
                if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) {
                    continue;
                }
                
                const statementType = this.getStatementType(trimmed);
                
                try {
                    console.log(`\n处理语句 ${i + 1}/${statements.length} (${statementType}): ${trimmed.substring(0, 50)}...`);
                    
                    switch (statementType) {
                        case 'SET_SEARCH_PATH':
                            this.parseSetSearchPathStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        case 'CREATE_TABLE':
                            this.parseCreateTableStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        case 'CREATE_VIEW':
                            this.parseCreateViewStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        case 'COMMENT_TABLE':
                            this.parseTableCommentStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        case 'COMMENT_COLUMN':
                            this.parseColumnCommentStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        case 'COMMENT_VIEW':
                            this.parseViewCommentStatement(trimmed, filePath);
                            parsedCount++;
                            break;
                        default:
                            console.log(`跳过不支持的语句类型: ${statementType}`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`解析语句失败 (${i + 1}/${statements.length}):`, error.message);
                    console.error(`问题语句: ${trimmed}`);
                }
            }
            
            console.log(`\n文件 ${path.basename(filePath)} 解析完成:`);
            console.log(`  - 总语句数: ${statements.length}`);
            console.log(`  - 成功解析: ${parsedCount}`);
            console.log(`  - 解析失败: ${errorCount}`);
            
        } catch (error) {
            console.error(`读取文件失败 ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * 获取SQL语句类型
     * @param {string} statement - SQL语句
     * @returns {string} 语句类型
     */
    getStatementType(statement) {
        const trimmedStatement = statement.trim();
        
        if (/^\s*CREATE\s+TABLE/i.test(trimmedStatement)) {
            return 'CREATE_TABLE';
        } else if (/^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW/i.test(trimmedStatement)) {
            return 'CREATE_VIEW';
        } else if (/^\s*SET\s+SEARCH_PATH/i.test(trimmedStatement)) {
            return 'SET_SEARCH_PATH';
        } else if (/^\s*COMMENT\s+ON\s+TABLE/i.test(trimmedStatement)) {
            return 'COMMENT_TABLE';
        } else if (/^\s*COMMENT\s+ON\s+COLUMN/i.test(trimmedStatement)) {
            return 'COMMENT_COLUMN';
        } else if (/^\s*COMMENT\s+ON\s+VIEW/i.test(trimmedStatement)) {
            return 'COMMENT_VIEW';
        } else if (/^\s*DROP\s+TABLE/i.test(trimmedStatement)) {
            return 'DROP_TABLE';
        } else if (/^\s*DROP\s+VIEW/i.test(trimmedStatement)) {
            return 'DROP_VIEW';
        } else if (/^\s*ALTER\s+TABLE/i.test(trimmedStatement)) {
            return 'ALTER_TABLE';
        } else if (/^\s*CREATE\s+INDEX/i.test(trimmedStatement)) {
            return 'CREATE_INDEX';
        } else if (/^\s*INSERT\s+INTO/i.test(trimmedStatement)) {
            return 'INSERT';
        } else if (/^\s*UPDATE/i.test(trimmedStatement)) {
            return 'UPDATE';
        } else if (/^\s*DELETE/i.test(trimmedStatement)) {
            return 'DELETE';
        } else if (/^\s*SELECT/i.test(trimmedStatement)) {
            return 'SELECT';
        } else {
            return 'UNKNOWN';
        }
    }

    /**
     * 分割SQL语句
     * @param {string} content - SQL文件内容
     * @returns {Array} SQL语句数组
     */
    splitSqlStatements(content) {
        // 改进的注释处理逻辑，避免误删字符串中的注释符号
        let result = '';
        let inString = false;
        let stringChar = '';
        let inMultiLineComment = false;
        let inSingleLineComment = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const nextChar = content[i + 1];
            
            // 处理字符串状态
            if (!inMultiLineComment && !inSingleLineComment) {
                if ((char === '"' || char === "'") && !inString) {
                    inString = true;
                    stringChar = char;
                    result += char;
                    continue;
                } else if (inString && char === stringChar) {
                    // 检查是否是转义字符
                    if (i > 0 && content[i - 1] !== '\\') {
                        inString = false;
                        stringChar = '';
                    }
                    result += char;
                    continue;
                }
            }
            
            // 如果在字符串中，直接添加字符
            if (inString) {
                result += char;
                continue;
            }
            
            // 处理多行注释
            if (!inSingleLineComment) {
                if (char === '/' && nextChar === '*') {
                    inMultiLineComment = true;
                    i++; // 跳过下一个字符
                    continue;
                } else if (inMultiLineComment && char === '*' && nextChar === '/') {
                    inMultiLineComment = false;
                    i++; // 跳过下一个字符
                    continue;
                }
            }
            
            // 处理单行注释
            if (!inMultiLineComment) {
                if (char === '-' && nextChar === '-') {
                    inSingleLineComment = true;
                    i++; // 跳过下一个字符
                    continue;
                } else if (inSingleLineComment && char === '\n') {
                    inSingleLineComment = false;
                    result += char; // 保留换行符
                    continue;
                }
            }
            
            // 如果不在注释中，添加字符
            if (!inMultiLineComment && !inSingleLineComment) {
                result += char;
            }
        }

        // 按分号分割语句，但保留分号
        const statements = [];
        const parts = result.split(';');
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (part.length > 0) {
                // 如果不是最后一部分，或者原始内容以分号结尾，则添加分号
                if (i < parts.length - 1 || result.trim().endsWith(';')) {
                    statements.push(part + ';');
                } else {
                    statements.push(part);
                }
            }
        }
        
        return statements;
    }

    /**
     * 解析CREATE TABLE语句
     * @param {string} statement - SQL语句
     * @param {string} filePath - 文件路径
     */
    parseCreateTableStatement(statement, filePath) {
        console.log(`开始解析CREATE TABLE语句: "${statement}"`);
        
        // 优化的正则表达式，支持 schema.table_name 格式和 WITH 子句、TO GROUP 子句
        // 匹配: CREATE TABLE [IF NOT EXISTS] [schema.]table_name ( columns ) [WITH (...)] [DISTRIBUTE BY (...)] [TO GROUP "..."]
        const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?(\w+(?:\.\w+)?)[`"]?)\s*\(([\s\S]*?)\)\s*(?:WITH\s*\([^)]*\))?\s*(?:DISTRIBUTE\s+BY\s+(?:HASH\s*\([^)]*\)|ROUNDROBIN))?\s*(?:TO\s+GROUP\s+[`"]?[^`"]*[`"]?)?\s*;?\s*$/i;
        let match = statement.match(createTableRegex);
        let distributionInfo = null;
        let withClause = null;
        let toGroup = null;
        
        if (!match) {
            // 备用匹配：更宽松的匹配，手动处理 WITH 子句、分布信息和 TO GROUP
            const relaxedRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?(\w+(?:\.\w+)?)[`"]?)\s*\(([\s\S]*)/i;
            match = statement.match(relaxedRegex);
            
            if (match) {
            let columnsSection = match[3];
            
            // 提取分布信息
            distributionInfo = this.parseDistributionInfo(statement);
            
            // 提取 WITH 子句
            withClause = this.parseWithClause(statement);
            
            // 提取 TO GROUP 子句
            toGroup = this.parseToGroupClause(statement);
            
            // 找到列定义的结束位置（第一个右括号）
            let parenCount = 1; // 已经有一个左括号
            let endIndex = -1;
            
            for (let i = 0; i < columnsSection.length; i++) {
                const char = columnsSection[i];
                if (char === '(') {
                    parenCount++;
                } else if (char === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }
            
            if (endIndex !== -1) {
                // 截取列定义部分（不包括右括号）
                columnsSection = columnsSection.substring(0, endIndex);
            } else {
                console.log('警告: 未找到匹配的右括号，使用完整内容');
                // 尝试查找 WITH、DISTRIBUTE 或 TO GROUP 关键字
                const withIndex = columnsSection.search(/\s+WITH\s+/i);
                const distributeIndex = columnsSection.search(/\s+DISTRIBUTE\s+/i);
                const distributedIndex = columnsSection.search(/\s+DISTRIBUTED\s+/i);
                const toGroupIndex = columnsSection.search(/\s+TO\s+GROUP\s+/i);
                
                let cutIndex = columnsSection.length;
                const indices = [withIndex, distributeIndex, distributedIndex, toGroupIndex].filter(i => i !== -1);
                if (indices.length > 0) {
                    cutIndex = Math.min(...indices);
                }
                
                columnsSection = columnsSection.substring(0, cutIndex);
            }
            
            match[3] = columnsSection;
        }
        } else {
            // 如果正则匹配成功，也尝试提取分布信息、WITH子句和TO GROUP
            distributionInfo = this.parseDistributionInfo(statement);
            withClause = this.parseWithClause(statement);
            toGroup = this.parseToGroupClause(statement);
        }
        
        if (!match) {
            console.log(`CREATE TABLE语句匹配失败`);
            return;
        }

        const fullTableName = match[2]; // 完整表名（可能包含schema）
        const columnsSection = match[3];

        // 解析 schema 和表名，统一转换为小写
        let schemaName = null;
        let tableName = fullTableName.toLowerCase(); // 统一转换为小写
        
        if (fullTableName.includes('.')) {
            // 情况1: CREATE TABLE schema.tablename 格式
            const parts = fullTableName.split('.');
            schemaName = parts[0].toLowerCase(); // schema名转换为小写
            tableName = parts[1].toLowerCase(); // 表名转换为小写
        } else if (this.currentSearchPath) {
            // 情况2: SET SEARCH_PATH = schema; CREATE TABLE tablename 格式
            schemaName = this.currentSearchPath.toLowerCase(); // 使用小写的搜索路径
            // tableName 已经转换为小写
        }

        // 构建完整表名用作键值（全部小写）
        const fullName = schemaName ? `${schemaName}.${tableName}` : tableName;
        const tableKey = fullName;
        
        console.log(`解析表: ${fullTableName} -> ${fullName} (schema: ${schemaName}, table: ${tableName})`);
        console.log(`提取的列定义部分: "${columnsSection}"`);
        
        // 如果表已存在，合并信息
        if (!this.schemaData.tables[tableKey]) {
            this.schemaData.tables[tableKey] = {
                name: tableName, // 保存小写的表名
                fullName: fullTableName.toLowerCase(), // 保存小写的完整表名
                schema: schemaName, // 保存小写的schema名
                columns: {},
                sourceFiles: [],
                distribution: distributionInfo, // 添加分布信息
                withClause: withClause, // 添加WITH子句信息
                toGroup: toGroup // 添加TO GROUP信息
            };
        } else {
            // 如果表已存在，更新相关信息
            if (distributionInfo) {
                this.schemaData.tables[tableKey].distribution = distributionInfo;
            }
            if (withClause) {
                this.schemaData.tables[tableKey].withClause = withClause;
            }
            if (toGroup) {
                this.schemaData.tables[tableKey].toGroup = toGroup;
            }
        }

        // 添加源文件信息
        if (!this.schemaData.tables[tableKey].sourceFiles.includes(filePath)) {
            this.schemaData.tables[tableKey].sourceFiles.push(filePath);
        }

        // 解析列定义
        this.parseColumns(columnsSection, this.schemaData.tables[tableKey]);
    }

    /**
     * 解析列定义
     * @param {string} columnsSection - 列定义部分
     * @param {Object} tableInfo - 表信息对象
     */
    parseColumns(columnsSection, tableInfo) {
        // 分割列定义（考虑括号内的逗号）
        const columnDefs = this.splitColumnDefinitions(columnsSection);
        
        console.log(`分割后的列定义数量: ${columnDefs.length}`);
        
        for (let i = 0; i < columnDefs.length; i++) {
            const trimmed = columnDefs[i].trim();
            console.log(`处理第${i+1}个定义: "${trimmed}"`);
            
            if (!trimmed) {
                console.log(`跳过空定义`);
                continue;
            }

            // 跳过约束定义
            if (this.isConstraintDefinition(trimmed)) {
                console.log(`识别为约束定义，跳过: "${trimmed}"`);
                // 不再保存约束信息
                continue;
            }

            // 解析列定义
            const columnInfo = this.parseColumnDefinition(trimmed);
            if (columnInfo) {
                console.log(`成功解析列: ${columnInfo.name} (${columnInfo.dataType})`);
                tableInfo.columns[columnInfo.name] = columnInfo;
            } else {
                console.log(`解析列定义失败: "${trimmed}"`);
            }
        }
    }

    /**
     * 分割列定义（处理括号内的逗号）
     * @param {string} columnsSection - 列定义部分
     * @returns {Array} 列定义数组
     */
    splitColumnDefinitions(columnsSection) {
        console.log(`原始列定义部分: "${columnsSection}"`);
        
        const definitions = [];
        let current = '';
        let parenthesesLevel = 0;
        
        for (let i = 0; i < columnsSection.length; i++) {
            const char = columnsSection[i];
            
            if (char === '(') {
                parenthesesLevel++;
                current += char;
            } else if (char === ')') {
                parenthesesLevel--;
                current += char;
            } else if (char === ',' && parenthesesLevel === 0) {
                if (current.trim()) {
                    definitions.push(current.trim());
                    console.log(`分割出定义: "${current.trim()}"`);
                }
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            definitions.push(current.trim());
            console.log(`最后一个定义: "${current.trim()}"`);
        }
        
        console.log(`总共分割出 ${definitions.length} 个定义`);
        return definitions;
    }

    /**
     * 判断是否为约束定义
     * @param {string} definition - 定义字符串
     * @returns {boolean}
     */
    isConstraintDefinition(definition) {
        const trimmedDef = definition.trim();
        
        // 如果以列名开头（字母、数字、下划线或反引号），则不是约束定义
        if (/^[`"]?\w+[`"]?\s+\w+/.test(definition)) {
            return false;
        }
        
        // 检查是否以约束关键字开头
        const constraintKeywords = [
            /^\s*CONSTRAINT/i, /^\s*PRIMARY\s+KEY/i, /^\s*FOREIGN\s+KEY/i, 
            /^\s*UNIQUE/i, /^\s*CHECK/i, /^\s*INDEX/i, /^\s*KEY/i
        ];
        
        return constraintKeywords.some(pattern => pattern.test(trimmedDef));
    }

    /**
     * 解析单个列定义
     * @param {string} columnDef - 列定义字符串
     * @returns {Object|null} 列信息对象
     */
    parseColumnDefinition(columnDef) {
        console.log(`开始解析列定义: "${columnDef}"`);
        
        // 基本的列定义正则表达式
        const columnRegex = /^([`"]?(\w+)[`"]?)\s+(\w+(?:\([^)]*\))?)\s*(.*)?$/i;
        const match = columnDef.match(columnRegex);
        
        if (!match) {
            console.log(`正则匹配失败`);
            return null;
        }

        console.log(`正则匹配成功:`, match);
        
        const columnName = match[2].toLowerCase(); // 列名转换为小写
        const dataType = match[3].toUpperCase(); // 数据类型转换为大写（标准化）

        console.log(`解析结果: 列名=${columnName}, 类型=${dataType}`);

        // 简化的列信息对象，只保留字段名、字段类型和字段注释（注释通过COMMENT语句单独解析）
        const columnInfo = {
            name: columnName, // 保存小写的列名
            type: dataType // 保存大写的数据类型
            // comment 字段将通过 parseColumnCommentStatement 方法单独添加
        };

        return columnInfo;
    }

    /**
     * 提取默认值 - 已移除，不再需要
     */
    // extractDefaultValue 方法已移除，因为不再解析字段的详细属性

    /**
     * 获取表的列信息
     * @param {string} tableName - 表名
     * @param {string} columnName - 列名
     * @returns {Object|null} 列信息
     */
    getColumnInfo(tableName, columnName) {
        const table = this.schemaData.tables[tableName];
        if (!table) {
            return null;
        }
        
        return table.columns[columnName] || null;
    }

    /**
     * 获取所有表名
     * @returns {Array} 表名数组
     */
    getTableNames() {
        return Object.keys(this.schemaData.tables);
    }

    /**
     * 导出schema数据为JSON
     * @returns {string} JSON字符串
     */
    exportToJson() {
        return JSON.stringify(this.schemaData, null, 2);
    }

    /**
     * 从JSON加载schema数据
     * @param {string} jsonData - JSON字符串
     */
    loadFromJson(jsonData) {
        try {
            this.schemaData = JSON.parse(jsonData);
        } catch (error) {
            throw new Error(`加载JSON数据失败: ${error.message}`);
        }
    }
}

module.exports = SchemaParser;