/**
 * 逆向SQL脚本生成器
 * 用于根据正向SQL脚本自动生成对应的逆向回滚脚本
 */

class ReverseSQLGenerator {
    constructor(schemaData = null) {
        // 表结构数据，用于生成更准确的逆向脚本
        this.schemaData = schemaData;
        this.schema = schemaData; // 添加schema别名，保持兼容性
        
        // SQL语句类型匹配模式
        this.patterns = {
            // CREATE TABLE 匹配
            CREATE_TABLE: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)\s*\(/i,
            
            // CREATE TABLE 起始行匹配（不强制同一行出现括号）
            CREATE_TABLE_START: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)/i,
            
            // DROP TABLE 匹配
            DROP_TABLE: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)/i,
            
            // ALTER TABLE ADD COLUMN 匹配 - 支持带/不带COLUMN关键字
            // 注意：避免匹配到 ADD PARTITION
            ALTER_ADD_COLUMN: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+ADD\s+(COLUMN\s+)?(?!PARTITION\b)([`"]?[\w\-]+[`"]?)(?:\s+([^,;]+))?/i,
            
            // ALTER TABLE DROP COLUMN 匹配 - 支持带/不带COLUMN关键字
            ALTER_DROP_COLUMN: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+DROP\s+(COLUMN\s+)?([`"]?[\w\-]+[`"]?)/i,
            
            // ALTER TABLE MODIFY COLUMN 匹配 - 新增支持
            ALTER_MODIFY_COLUMN: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+MODIFY\s+(COLUMN\s+)?([`"]?[\w\-]+[`"]?)(?:\s+([^,;]+))?/i,

            // ALTER TABLE ADD PARTITION（支持: ALTER TABLE schema.tablename ADD PARTITION P202501 VALUES LESS THAN (202502);）
            ALTER_ADD_PARTITION: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+ADD\s+PARTITION\s+([`"]?[\w\-]+[`"]?)(?:\s+VALUES\s+LESS\s+THAN\s*\(([^)]+)\))?/i,

            // ALTER TABLE ATTACH PARTITION（PostgreSQL）
            ALTER_ATTACH_PARTITION: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+ATTACH\s+PARTITION\s+([`"]?[\w\-\.]+[`"]?)/i,
            
            // RENAME TABLE 匹配 - 支持 RENAME TABLE old_name TO new_name
            RENAME_TABLE: /RENAME\s+TABLE\s+([`"]?[\w\-\.]+[`"]?)\s+TO\s+([`"]?[\w\-\.]*[`"]?)/i,
            
            // ALTER TABLE RENAME COLUMN 匹配 - 支持 ALTER TABLE table_name RENAME COLUMN old_name TO new_name
            ALTER_RENAME_COLUMN: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)\s+RENAME\s+COLUMN\s+([`"]?[\w\-]+[`"]?)\s+TO\s+([`"]?[\w\-]+[`"]?)/i,
            
            // ALTER TABLE RENAME 匹配 - 支持 ALTER TABLE table_name RENAME old_name TO new_name (不带COLUMN关键字)
            ALTER_RENAME: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)\s+RENAME\s+([`"]?[\w\-]+[`"]?)\s+TO\s+([`"]?[\w\-]+[`"]?)/i,
            
            // ALTER TABLE RENAME TO 匹配 - 支持 ALTER TABLE table_name RENAME TO new_table_name
            ALTER_RENAME_TO: /ALTER\s+TABLE\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)\s+RENAME\s+TO\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)/i,
            
            // CREATE INDEX 匹配
            CREATE_INDEX: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)\s+ON\s+([`"]?[\w\-\.]+[`"]?)/i,
            
            // DROP INDEX 匹配
            DROP_INDEX: /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)/i,
            
            // CREATE VIEW 匹配
            CREATE_VIEW: /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([`"]?[\w\-\.]+[`"]?)\s+AS\s+/i,
            
            // DROP VIEW 匹配
            DROP_VIEW: /DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([`"]?[\w\-\.]+[`"]?)/i,
            
            // ALTER VIEW RENAME TO 匹配 - 支持 ALTER VIEW view_name RENAME TO new_view_name
            ALTER_VIEW_RENAME_TO: /ALTER\s+VIEW\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)\s+RENAME\s+TO\s+([`"]?[\w\-\.]+[`"]?(?:\.[`"]?[\w\-]+[`"]?)?)/i,
            
            // INSERT INTO 匹配
            INSERT_INTO: /INSERT\s+INTO\s+([`"]?[\w\-\.]+[`"]?)/i,
            
            // UPDATE 匹配
            UPDATE: /UPDATE\s+([`"]?[\w\-\.]+[`"]?)/i,
            
            // DELETE FROM 匹配
            DELETE_FROM: /DELETE\s+FROM\s+([`"]?[\w\-\.]+[`"]?)/i,
            
            // TRUNCATE 匹配
            TRUNCATE: /TRUNCATE\s+(?:TABLE\s+)?([`"]?[\w\-\.]+[`"]?)/i,

            // SET search_path 语句匹配（环境指令，逆向时跳过）
            SEARCH_PATH: /^\s*SET\s+search_path\s*=\s*[^;]+;?/i,
            
            // 注释匹配 - 包括SQL注释(--开头)和COMMENT ON语句
            COMMENT: /^\s*(--|COMMENT\s+ON)/i,
            
            // COMMENT ON TABLE 匹配
            COMMENT_ON_TABLE: /COMMENT\s+ON\s+TABLE\s+([`"]?(?:[`"]?\w+[`"]?\.)?[`"]?\w+[`"]?)\s+IS\s+['"]([^'"]*)['"]/i,
            
            // COMMENT ON COLUMN 匹配
            COMMENT_ON_COLUMN: /COMMENT\s+ON\s+COLUMN\s+([`"]?(?:[`"]?\w+[`"]?\.)?[`"]?\w+[`"]?)\.([`"]?\w+[`"]?)\s+IS\s+['"]([^'"]*)['"]/i,
            
            // COMMENT ON VIEW 匹配
            COMMENT_ON_VIEW: /COMMENT\s+ON\s+VIEW\s+([`"]?(?:[`"]?\w+[`"]?\.)?[`"]?\w+[`"]?)\s+IS\s+['"]([^'"]*)['"]/i,
            
            // 空行匹配
            EMPTY: /^\s*$/
        };
    }

    /**
     * 检测文件是否只包含COMMENT ON语句
     */
    isCommentOnlyFile(lines) {
        let hasCommentOn = false;
        let hasOtherDDL = false;
        
        for (const line of lines) {
            // 跳过空行和普通注释
            if (this.patterns.EMPTY.test(line) || 
                (this.patterns.COMMENT.test(line) && !/COMMENT\s+ON/i.test(line))) {
                continue;
            }
            
            // 检查是否为COMMENT ON语句
            if (/COMMENT\s+ON/i.test(line)) {
                hasCommentOn = true;
                continue;
            }
            
            // 检查是否包含其他DDL操作
            if (this.patterns.CREATE_TABLE.test(line) ||
                this.patterns.DROP_TABLE.test(line) ||
                this.patterns.ALTER_ADD_COLUMN.test(line) ||
                this.patterns.ALTER_DROP_COLUMN.test(line) ||
                this.patterns.ALTER_MODIFY_COLUMN.test(line) ||
                this.patterns.CREATE_INDEX.test(line) ||
                this.patterns.DROP_INDEX.test(line) ||
                this.patterns.INSERT_INTO.test(line) ||
                this.patterns.UPDATE.test(line) ||
                this.patterns.DELETE_FROM.test(line) ||
                this.patterns.TRUNCATE.test(line)) {
                hasOtherDDL = true;
                break;
            }
        }
        
        // 只有包含COMMENT ON且不包含其他DDL操作时，才认为是纯COMMENT文件
        return hasCommentOn && !hasOtherDDL;
    }

    /**
     * 逆向 ALTER TABLE MODIFY COLUMN 语句
     */
    reverseAlterModifyColumn(statement) {
        const match = statement.match(this.patterns.ALTER_MODIFY_COLUMN);
        if (match) {
            const tableName = match[1];
            const hasColumnKeyword = match[2]; // 是否包含COLUMN关键字
            const columnName = match[3];
            const columnDefinition = match[4]; // 列定义（可能为空）
            
            let reverseSQL = '';
            
            // 尝试从schema数据中获取列的原始定义
            if (this.schemaData && this.schemaData.tables) {
                // 统一转换为小写进行匹配（与schema-parser.js保持一致）
                const normalizedTableName = tableName.replace(/[`"]/g, '').toLowerCase();
                const normalizedColumnName = columnName.replace(/[`"]/g, '').toLowerCase();
                
                const tableInfo = this.schemaData.tables[normalizedTableName];
                if (tableInfo && tableInfo.columns) {
                    const columnInfo = tableInfo.columns[normalizedColumnName];
                    if (columnInfo) {
                        // 构建原始列定义，只包含数据类型，避免undefined
                        let originalDefinition = '';
                        
                        // 使用dataType或type字段
                        if (columnInfo.dataType) {
                            originalDefinition = columnInfo.dataType;
                        } else if (columnInfo.type) {
                            originalDefinition = columnInfo.type;
                        } else {
                            // 如果都没有，生成注释提示
                            originalDefinition = '/* 请手动填写原始数据类型 */';
                        }
                        
                        // 生成逆向MODIFY语句，只包含数据类型（可生成时保留原语句注释）
                        reverseSQL += `/* 原语句: ${statement.trim()} */\n`;
                        if (hasColumnKeyword) {
                            reverseSQL += `ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${originalDefinition};`;
                        } else {
                            reverseSQL += `ALTER TABLE ${tableName} MODIFY ${columnName} ${originalDefinition};`;
                        }
                    } else {
                        // 如果找不到列信息，生成注释提示（统一使用多行注释）
                        if (hasColumnKeyword) {
                            reverseSQL += `/* ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} 请手动填写原始数据类型 */`;
                        } else {
                            reverseSQL += `/* ALTER TABLE ${tableName} MODIFY ${columnName} 请手动填写原始数据类型 */`;
                        }
                    }
                } else {
                    // 如果找不到表信息，生成注释提示（统一使用多行注释）
                    if (hasColumnKeyword) {
                        reverseSQL += `/* ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} 请手动填写原始数据类型 */`;
                    } else {
                        reverseSQL += `/* ALTER TABLE ${tableName} MODIFY ${columnName} 请手动填写原始数据类型 */`;
                    }
                }
            } else {
                // 如果没有schema数据，生成注释提示（统一使用多行注释）
                if (hasColumnKeyword) {
                    reverseSQL += `/* ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} 请手动填写原始数据类型 */`;
                } else {
                    reverseSQL += `/* ALTER TABLE ${tableName} MODIFY ${columnName} 请手动填写原始数据类型 */`;
                }
            }
            
            return reverseSQL;
        }
        return null;
    }

    /**
     * 设置表结构数据
     */
    setSchemaData(schemaData) {
        this.schemaData = schemaData;
        this.schema = schemaData; // 确保schema属性也被设置
    }

    /**
     * 从DDL操作生成逆向脚本
     * @param {string} ddlContent - DDL文件内容
     * @param {Object} schemaData - 表结构JSON数据
     * @returns {string} 逆向脚本内容
     */
    generateReverseFromDDL(ddlContent, schemaData) {
        let reverseScript = '';
        
        if (!ddlContent) {
            throw new Error('无效的DDL内容');
        }
        
        // 如果没有提供schemaData，使用当前实例的schema
        const schema = schemaData || this.schema;
        
        if (!schema || !schema.tables) {
            throw new Error('无效的表结构数据');
        }
        
        // 按行分割DDL内容
        const lines = ddlContent.split('\n').map(line => line.trim()).filter(line => line);
        
        // 检测文件类型
        const isCreateTableOnlyFile = this.isCreateTableOnlyFile(lines);
        const isAlterDropOnlyFile = this.isAlterDropOnlyFile(lines);
        const isCommentOnlyFile = this.isCommentOnlyFile(lines);
        
        for (const line of lines) {
            // 根据文件类型决定COMMENT处理策略
            if (isCreateTableOnlyFile) {
                // 建表文件：完全忽略所有COMMENT语句
                if (this.patterns.COMMENT.test(line) || this.patterns.EMPTY.test(line) || 
                    /COMMENT\s+ON/i.test(line)) {
                    continue;
                }
            } else if (isAlterDropOnlyFile) {
                // ALTER DROP文件：保留COMMENT语句用于逆向生成ADD语句
                if (this.patterns.COMMENT.test(line) || this.patterns.EMPTY.test(line)) {
                    continue;
                }
                // COMMENT ON语句在ALTER DROP文件中需要保留，不跳过
            } else if (isCommentOnlyFile) {
                // 纯COMMENT文件：处理所有COMMENT ON语句
                if (this.patterns.COMMENT.test(line) && !/COMMENT\s+ON/i.test(line)) {
                    continue; // 跳过普通注释，但保留COMMENT ON语句
                }
                if (this.patterns.EMPTY.test(line)) {
                    continue; // 跳过空行
                }
            } else {
                // 混合文件：按原逻辑跳过注释和空行
                if (this.patterns.COMMENT.test(line) || this.patterns.EMPTY.test(line)) {
                    continue;
                }
            }
            
            // 处理 ALTER TABLE DROP COLUMN 操作
            const dropColumnMatch = line.match(this.patterns.ALTER_DROP_COLUMN);
            if (dropColumnMatch) {
                const tableName = dropColumnMatch[1].replace(/[`"]/g, '');
                const columnName = dropColumnMatch[3].replace(/[`"]/g, '');
                
                // 从schema中查找表和列信息
                const tableInfo = schema.tables[tableName];
                if (tableInfo && tableInfo.columns && tableInfo.columns[columnName]) {
                    const columnInfo = tableInfo.columns[columnName];
                    
                    reverseScript += `/* 恢复被删除的列: ${tableName}.${columnName} */\n`;
                    reverseScript += `/* 原列注释: ${columnInfo.comment || '无注释'} */\n`;
                    
                    // 构建ADD COLUMN语句（不追加 NOT NULL）
                    let addColumnSQL = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnInfo.type}`;
                    
                    if (columnInfo.default !== null && columnInfo.default !== undefined) {
                        addColumnSQL += ` DEFAULT ${columnInfo.default}`;
                    }
                    
                    if (columnInfo.primaryKey) {
                        addColumnSQL += ' PRIMARY KEY';
                    }
                    
                    if (columnInfo.unique) {
                        addColumnSQL += ' UNIQUE';
                    }
                    
                    if (columnInfo.autoIncrement) {
                        addColumnSQL += ' AUTO_INCREMENT';
                    }
                    
                    addColumnSQL += ';';
                    
                    reverseScript += addColumnSQL + '\n';
                    
                    // 为ALTER DROP的逆向脚本添加COMMENT ON COLUMN语句（从JSON获取）
                    if (columnInfo.comment) {
                        reverseScript += `COMMENT ON COLUMN ${tableName}.${columnName} IS '${columnInfo.comment}';\n`;
                    }
                    
                    reverseScript += '\n';
                } else {
                    reverseScript += `/* 警告: 无法找到表 ${tableName} 或列 ${columnName} 的结构信息 */\n`;
                    reverseScript += `/* 请手动添加: ALTER TABLE ${tableName} ADD COLUMN ${columnName} [数据类型]; */\n\n`;
                }
                continue;
            }

            // 处理 ALTER TABLE ADD PARTITION（生成 DROP PARTITION）
            const addPartitionMatch = line.match(this.patterns.ALTER_ADD_PARTITION);
            if (addPartitionMatch) {
                const tableName = addPartitionMatch[1].replace(/[`"]/g, '');
                const partName = (addPartitionMatch[2] || '').replace(/[`"]/g, '');
                const lessThanValue = addPartitionMatch[3] || '';
                reverseScript += `/* 删除新增的分区: ${tableName}${partName ? '（' + partName + '）' : ''} */\n`;
                if (partName) {
                    reverseScript += `ALTER TABLE ${tableName} DROP PARTITION ${partName};\n`;
                    if (lessThanValue) {
                        reverseScript += `/* 原分区范围: VALUES LESS THAN (${lessThanValue}) */\n`;
                    }
                } else {
                    reverseScript += `/* 无法自动识别分区名，请手动补充 DROP PARTITION 语句 */\n`;
                    reverseScript += `/* 示例：ALTER TABLE ${tableName} DROP PARTITION <partition_name>; */\n`;
                }
                reverseScript += `\n`;
                continue;
            }

            // 处理 ALTER TABLE ATTACH PARTITION（生成 DETACH PARTITION）
            const attachPartitionMatch = line.match(this.patterns.ALTER_ATTACH_PARTITION);
            if (attachPartitionMatch) {
                const tableName = attachPartitionMatch[1].replace(/[`"]/g, '');
                const childName = attachPartitionMatch[2].replace(/[`"]/g, '');
                reverseScript += `/* 解除附加的分区: ${tableName} <- ${childName} */\n`;
                reverseScript += `ALTER TABLE ${tableName} DETACH PARTITION ${childName};\n\n`;
                continue;
            }
            
            // 处理 ALTER TABLE ADD COLUMN 操作（生成DROP COLUMN逆向）
            const addColumnMatch = line.match(this.patterns.ALTER_ADD_COLUMN);
            if (addColumnMatch) {
                const tableName = addColumnMatch[1].replace(/[`"]/g, '');
                const columnName = addColumnMatch[2].replace(/[`"]/g, '');
                
                reverseScript += `/* 删除新增的列: ${tableName}.${columnName} */\n`;
                reverseScript += `ALTER TABLE ${tableName} DROP COLUMN ${columnName};\n\n`;
                continue;
            }
            
            // 处理 CREATE TABLE 操作（生成DROP TABLE逆向）
            const createTableMatch = line.match(this.patterns.CREATE_TABLE);
            if (createTableMatch) {
                const tableName = createTableMatch[1].replace(/[`"]/g, '');
                
                reverseScript += `/* 删除新创建的表: ${tableName} */\n`;
                reverseScript += `DROP TABLE IF EXISTS ${tableName};\n\n`;
                continue;
            }
            // 支持“括号在下一行”的多行建表语句
            const createTableStartMatch = line.match(this.patterns.CREATE_TABLE_START);
            if (createTableStartMatch) {
                const tableName = createTableStartMatch[1].replace(/[`"]/g, '');
                
                reverseScript += `/* 删除新创建的表: ${tableName} */\n`;
                reverseScript += `DROP TABLE IF EXISTS ${tableName};\n\n`;
                continue;
            }
            
            // 处理 DROP TABLE 操作（生成CREATE TABLE逆向）
            const dropTableMatch = line.match(this.patterns.DROP_TABLE);
            if (dropTableMatch) {
                const tableName = dropTableMatch[1].replace(/[`"]/g, '');
                
                // 从schema中查找表信息
                const tableInfo = schema.tables[tableName];
                if (tableInfo) {
                    reverseScript += `/* 恢复被删除的表: ${tableName} */\n`;
                    if (tableInfo.comment) {
                        reverseScript += `/* 原表注释: ${tableInfo.comment} */\n`;
                    }
                    
                    // 生成CREATE TABLE语句
                    reverseScript += this.generateCreateTableFromSchema(tableName, tableInfo);
                    reverseScript += '\n';
                } else {
                    reverseScript += `/* 警告: 无法找到表 ${tableName} 的结构信息 */\n`;
                    reverseScript += `/* 请手动创建表结构 */\n\n`;
                }
                continue;
            }
            
            // 处理 CREATE INDEX 操作（生成DROP INDEX逆向）
            const createIndexMatch = line.match(this.patterns.CREATE_INDEX);
            if (createIndexMatch) {
                const indexName = createIndexMatch[1].replace(/[`"]/g, '');
                
                reverseScript += `/* 删除新创建的索引: ${indexName} */\n`;
                reverseScript += `DROP INDEX ${indexName};\n\n`;
                continue;
            }
            
            // 处理独立的 COMMENT ON TABLE 语句（非建表文件中的注释修改）
            const commentOnTableMatch = line.match(this.patterns.COMMENT_ON_TABLE);
            if (commentOnTableMatch && (!isCreateTableOnlyFile || isCommentOnlyFile)) {
                const tableName = commentOnTableMatch[1].replace(/[`"]/g, '');
                const newComment = commentOnTableMatch[2];
                
                // 从schema中查找表的原始注释
                const tableInfo = schema.tables[tableName];
                if (tableInfo && tableInfo.comment !== undefined) {
                    const originalComment = tableInfo.comment || '';
                    
                    reverseScript += `/* 恢复表注释: ${tableName} */\n`;
                    reverseScript += `/* 新注释: ${newComment} */\n`;
                    reverseScript += `/* 原注释: ${originalComment} */\n`;
                    reverseScript += `COMMENT ON TABLE ${tableName} IS '${originalComment}';\n\n`;
                } else {
                    reverseScript += `/* 警告: 无法找到表 ${tableName} 的原始注释信息 */\n`;
                    reverseScript += `/* 请手动恢复: COMMENT ON TABLE ${tableName} IS '[原始注释]'; */\n\n`;
                }
                continue;
            }
            
            // 处理独立的 COMMENT ON COLUMN 语句（非建表文件中的注释修改）
            const commentOnColumnMatch = line.match(this.patterns.COMMENT_ON_COLUMN);
            if (commentOnColumnMatch && (!isCreateTableOnlyFile || isCommentOnlyFile)) {
                const tableName = commentOnColumnMatch[1].replace(/[`"]/g, '');
                const columnName = commentOnColumnMatch[2].replace(/[`"]/g, '');
                const newComment = commentOnColumnMatch[3];
                
                // 从schema中查找列的原始注释
                const tableInfo = schema.tables[tableName];
                if (tableInfo && tableInfo.columns && tableInfo.columns[columnName]) {
                    const columnInfo = tableInfo.columns[columnName];
                    const originalComment = columnInfo.comment || '';
                    
                    reverseScript += `/* 恢复列注释: ${tableName}.${columnName} */\n`;
                    reverseScript += `/* 新注释: ${newComment} */\n`;
                    reverseScript += `/* 原注释: ${originalComment} */\n`;
                    reverseScript += `COMMENT ON COLUMN ${tableName}.${columnName} IS '${originalComment}';\n\n`;
                } else {
                    // 若列在schema中不存在（例如新增列），直接跳过，不输出任何注释或提示
                    // 该列通常会被逆向的 DROP COLUMN 覆盖，不需要单独处理注释
                }
                continue;
            }
            
            // 其他操作的处理可以在这里添加
            // 不输出原语句，仅提示未处理类型
            reverseScript += `/* 未处理的DDL操作（类型不支持自动逆向），请人工处理 */\n`;
        }
        
        return reverseScript;
    }
    
    /**
     * 从表结构信息生成CREATE TABLE语句（优化版本）
     * @param {string} tableName - 表名
     * @param {Object} tableInfo - 表结构信息
     * @returns {string} CREATE TABLE语句
     */
    generateCreateTableFromSchema(tableName, tableInfo) {
        // 使用完整表名（如果有schema信息）
        const fullTableName = tableInfo.fullName || tableName;
        
        // 确保表名包含schema前缀
        const schemaName = this.extractSchemaFromTableName(tableName, tableInfo);
        const tableNameWithSchema = this.ensureSchemaPrefix(tableName, schemaName);
        
        let createSQL = `CREATE TABLE ${tableNameWithSchema} (\n`;
        
        const columns = Object.values(tableInfo.columns);
        const columnDefinitions = [];
        
        for (const column of columns) {
            // 简化的列定义：使用列名和类型
            const columnName = column.name || Object.keys(tableInfo.columns).find(key => tableInfo.columns[key] === column);
            let columnDef = `  ${columnName} ${column.type}`;
            columnDefinitions.push(columnDef);
        }
        
        createSQL += columnDefinitions.join(',\n');
        
        // 生成WITH子句 - 使用固定的WITH属性
        let withClause = '\n) WITH(ORIENTATION = COLUMN, COMPRESSION = LOW, COLVERSION = 2.0, ENABLE_DELTA = FALSE)';
        
        // 如果表信息中有自定义的WITH子句，使用自定义的
        if (tableInfo.withClause && tableInfo.withClause.raw) {
            withClause = `\n) ${tableInfo.withClause.raw}`;
        }
        
        // 添加分布信息 - 支持新的DISTRIBUTE BY语法
        if (tableInfo.distribution) {
            if (tableInfo.distribution.type === 'hash' && tableInfo.distribution.columns.length > 0) {
                withClause += `\nDISTRIBUTE BY HASH(${tableInfo.distribution.columns.join(', ')})`;
            } else if (tableInfo.distribution.type === 'roundrobin') {
                withClause += '\nDISTRIBUTE BY ROUNDROBIN';
            } else if (tableInfo.distribution.type === 'random') {
                // 兼容旧版本的随机分布
                withClause += '\nDISTRIBUTED RANDOMLY';
            }
        } else {
            // 如果没有分布信息，使用默认的ROUNDROBIN
            withClause += '\nDISTRIBUTE BY ROUNDROBIN';
        }
        
        // 添加TO GROUP子句 - 使用固定的组名
        const groupName = (tableInfo.toGroup) ? tableInfo.toGroup : 'LC_DW1';
        withClause += `\nTO GROUP "${groupName}"`;
        
        createSQL += withClause + ';\n';
        
        // 添加表注释（如果有）
        if (tableInfo.comment) {
            createSQL += `COMMENT ON TABLE ${tableNameWithSchema} IS '${tableInfo.comment}';\n`;
        }
        
        // 添加列注释（如果有）
        const columnsWithComments = columns.filter(col => col.comment);
        if (columnsWithComments.length > 0) {
            //createSQL += '\n-- 为字段添加注释\n';
            for (const col of columnsWithComments) {
                const columnName = col.name || Object.keys(tableInfo.columns).find(key => tableInfo.columns[key] === col);
                createSQL += `COMMENT ON COLUMN ${tableNameWithSchema}.${columnName} IS '${col.comment}';\n`;
            }
        }
        
        return createSQL;
    }

    /**
     * 从表名和表信息中提取schema名称
     * @param {string} tableName - 表名
     * @param {Object} tableInfo - 表信息
     * @returns {string|null} schema名称
     */
    extractSchemaFromTableName(tableName, tableInfo) {
        // 首先检查表信息中是否有schema信息
        if (tableInfo.schema) {
            return tableInfo.schema;
        }
        
        // 如果表名包含点号，提取schema部分
        if (tableName.includes('.')) {
            const parts = tableName.split('.');
            if (parts.length >= 2) {
                return parts[0].replace(/[`"]/g, '');
            }
        }
        
        // 如果fullName包含schema信息
        if (tableInfo.fullName && tableInfo.fullName.includes('.')) {
            const parts = tableInfo.fullName.split('.');
            if (parts.length >= 2) {
                return parts[0].replace(/[`"]/g, '');
            }
        }
        
        return null;
    }

    /**
     * 确保表名包含schema前缀
     * @param {string} tableName - 原始表名
     * @param {string} schemaName - schema名称
     * @returns {string} 带schema前缀的表名
     */
    ensureSchemaPrefix(tableName, schemaName) {
        // 如果没有schema名称，返回原表名
        if (!schemaName) {
            return tableName;
        }
        
        // 清理表名中的引号
        const cleanTableName = tableName.replace(/[`"]/g, '');
        
        // 如果表名已经包含schema前缀，直接返回
        if (cleanTableName.includes('.')) {
            return cleanTableName;
        }
        
        // 添加schema前缀
        return `${schemaName}.${cleanTableName}`;
    }

    /**
     * 从JSON Schema生成逆向脚本（优化版本）
     * @param {Object} schemaData - 表结构JSON数据（可选，如果不提供则使用构造函数中的数据）
     * @returns {string} 逆向脚本内容
     */
    generateReverseFromSchema(schemaData = null) {
        // 如果没有传入参数，使用构造函数中的schemaData
        const dataToUse = schemaData || this.schemaData;
        
        if (!dataToUse || !dataToUse.tables) {
            throw new Error('无效的表结构数据');
        }
        
        // 按逆序处理表（后创建的先删除）
        const tables = Object.keys(dataToUse.tables).reverse();
        
        if (tables.length === 0) {
            return '/* 没有找到需要删除的表 */\n';
        }
        
        let reverseScript = `/* 逆向脚本：删除 ${tables.length} 个表 */\n`;
        reverseScript += `/* 生成时间：${new Date().toISOString()} */\n\n`;
        
        for (const tableName of tables) {
            const tableInfo = dataToUse.tables[tableName];
            
            // 使用完整表名（如果有schema信息）
            const fullTableName = tableInfo.fullName || tableName;
            
            reverseScript += `/* 删除表: ${fullTableName}`;
            if (tableInfo.comment) {
                reverseScript += ` (${tableInfo.comment})`;
            }
            reverseScript += ` */\n`;
            
            reverseScript += `DROP TABLE IF EXISTS ${fullTableName};\n\n`;
        }
        
        return reverseScript;
    }
    async generateReverseScripts(deploymentQueue) {
        let folderCount = 0;
        let scriptCount = 0;
        let reverseScriptsByFile = []; // 按文件分组的逆向脚本
        
        try {
            // 按逆序处理部署队列（后执行的先回滚）
            for (let i = deploymentQueue.length - 1; i >= 0; i--) {
                const deploymentItem = deploymentQueue[i];
                folderCount++;
                
                const folderReverse = await this.processFolderReverse(deploymentItem);
                
                if (folderReverse.scripts.length > 0) {
                    // 按逆序处理文件（后执行的先回滚）
                    for (let j = folderReverse.scripts.length - 1; j >= 0; j--) {
                        const script = folderReverse.scripts[j];
                        
                        // 为每个DDL文件生成独立的逆向脚本
                        let fileReverseScript = script.content + '\n\n';
                        
                        reverseScriptsByFile.push({
                            originalFileName: script.fileName,
                            reverseFileName: `rollback_${script.fileName}`,
                            content: fileReverseScript,
                            folderName: deploymentItem.name,
                            originalPath: script.originalPath
                        });
                        
                        scriptCount++;
                    }
                }
            }
            
            // 生成合并的逆向脚本（保持向后兼容）
            let combinedReverseScript = '';
            
            for (const fileScript of reverseScriptsByFile) {
                combinedReverseScript += fileScript.content;
            }
            
            return {
                reverseScript: combinedReverseScript, // 合并的脚本（向后兼容）
                reverseScriptsByFile, // 按文件分组的脚本
                stats: {
                    folderCount,
                    scriptCount
                }
            };
        } catch (error) {
            console.error('生成逆向脚本时发生错误:', error);
            throw error;
        }
    }

    /**
     * 处理单个文件夹的逆向脚本生成
     * @param {Object} deploymentItem - 部署项目
     * @returns {Object} 文件夹逆向脚本
     */
    async processFolderReverse(deploymentItem) {
        const folderReverse = {
            folderName: deploymentItem.folderName,
            phase: deploymentItem.phase,
            scripts: []
        };

        // 按逆序处理文件夹内的SQL文件
        for (let i = deploymentItem.files.length - 1; i >= 0; i--) {
            const file = deploymentItem.files[i];
            
            try {
                const reverseScript = await this.processFileReverse(file);
                if (reverseScript && reverseScript.content.trim()) {
                    folderReverse.scripts.push(reverseScript);
                }
            } catch (error) {
                console.error(`处理文件 ${file.name} 的逆向脚本时发生错误:`, error);
                // 继续处理其他文件，不中断整个流程
            }
        }

        return folderReverse;
    }

    /**
     * 处理单个SQL文件的逆向脚本生成
     * @param {Object} file - SQL文件对象
     * @returns {Object} 文件逆向脚本
     */
    async processFileReverse(file) {
        const fs = require('fs').promises;
        
        try {
            console.log(`正在处理文件: ${file.path}`);
            
            // 读取SQL文件内容
            const sqlContent = await fs.readFile(file.path, 'utf8');
            console.log(`文件内容长度: ${sqlContent.length}`);
            console.log(`文件内容预览: ${sqlContent.substring(0, 200)}...`);
            
            // 解析SQL语句并生成逆向脚本
            const reverseContent = this.parseAndReverse(sqlContent);
            console.log(`生成的逆向内容长度: ${reverseContent.length}`);
            console.log(`逆向内容预览: ${reverseContent.substring(0, 200)}...`);
            
            return {
                fileName: file.name,
                originalPath: file.path,
                content: reverseContent,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`读取文件 ${file.path} 时发生错误:`, error);
            return null;
        }
    }

    /**
     * 解析SQL内容并生成逆向脚本
     * @param {string} sqlContent - SQL文件内容
     * @returns {string} 逆向SQL脚本内容
     */
    parseAndReverse(sqlContent) {
        console.log('开始解析SQL内容...');
        
        // 分割SQL语句
        const statements = this.splitSQLStatements(sqlContent);
        console.log(`分割出 ${statements.length} 个SQL语句`);
        
        // 检测文件类型
        const lines = sqlContent.split('\n').map(line => line.trim()).filter(line => line);
        const isCreateTableOnlyFile = this.isCreateTableOnlyFile(lines);
        const isAlterDropOnlyFile = this.isAlterDropOnlyFile(lines);
        console.log(`检测到文件类型: ${isCreateTableOnlyFile ? '纯建表DDL文件' : isAlterDropOnlyFile ? '纯删除列DDL文件' : '混合DDL文件'}`);
        
        const reverseStatements = [];

        // 按逆序处理每个SQL语句
        for (let i = statements.length - 1; i >= 0; i--) {
            const statement = statements[i].trim();
            console.log(`处理语句 ${i}: ${statement.substring(0, 100)}...`);
            
            // 根据文件类型决定COMMENT处理策略
            if (isCreateTableOnlyFile) {
                // 建表文件：完全忽略所有COMMENT语句
                if (!statement || statement.startsWith('--') || statement.startsWith('/*') ||
                    /^\s*COMMENT\s+ON/i.test(statement)) {
                    console.log('跳过空行、注释或COMMENT语句（建表文件模式）');
                    continue;
                }
            } else if (isAlterDropOnlyFile) {
                // ALTER DROP文件：保留COMMENT语句用于逆向生成ADD语句
                if (!statement || statement.startsWith('--') || statement.startsWith('/*')) {
                    console.log('跳过空行或注释（ALTER DROP文件模式）');
                    continue;
                }
                // COMMENT ON语句在ALTER DROP文件中需要保留，不跳过
            } else {
                // 混合文件：按原逻辑跳过注释和空行
                if (!statement || statement.startsWith('--') || statement.startsWith('/*')) {
                    console.log('跳过空行或注释');
                    continue;
                }
            }

            // 跳过环境指令：SET search_path
            if (this.patterns.SEARCH_PATH.test(statement)) {
                console.log('跳过 SET search_path 语句');
                continue;
            }

            const reverseStatement = this.generateReverseStatement(statement);
            console.log(`生成逆向语句: ${reverseStatement ? reverseStatement.substring(0, 100) + '...' : 'null'}`);
            
            if (reverseStatement) {
                reverseStatements.push(reverseStatement);
            }
        }

        console.log(`总共生成 ${reverseStatements.length} 个逆向语句`);
        return reverseStatements.join('\n\n');
    }

    /**
     * 分割SQL语句
     * @param {string} sqlContent - SQL内容
     * @returns {Array} SQL语句数组
     */
    splitSQLStatements(sqlContent) {
        // 改进的SQL语句分割逻辑
        const statements = [];
        const lines = sqlContent.split('\n');
        let currentStatement = '';
        let inMultiLineComment = false;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // 处理多行注释
            if (line.includes('/*')) {
                inMultiLineComment = true;
            }
            if (line.includes('*/')) {
                inMultiLineComment = false;
                continue;
            }
            if (inMultiLineComment) {
                continue;
            }
            
            // 跳过单行注释行（但保留注释内容用于后续处理）
            if (line.trim().startsWith('--')) {
                // 如果当前语句不为空，先保存
                if (currentStatement.trim()) {
                    statements.push(currentStatement.trim());
                    currentStatement = '';
                }
                // 单独处理注释行
                continue;
            }
            
            // 添加当前行到语句中
            currentStatement += line + '\n';
            
            // 如果行以分号结尾，表示语句结束
            if (line.trim().endsWith(';')) {
                if (currentStatement.trim()) {
                    statements.push(currentStatement.trim());
                }
                currentStatement = '';
            }
        }
        
        // 处理最后一个语句（如果没有以分号结尾）
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }
        
        return statements.filter(stmt => stmt.trim());
    }

    /**
     * 生成单个SQL语句的逆向语句
     * @param {string} statement - 原始SQL语句
     * @returns {string|null} 逆向SQL语句
     */
    generateReverseStatement(statement) {
        const trimmedStatement = statement.trim();
        console.log(`正在生成逆向语句，原语句: ${trimmedStatement}`);

        // 跳过环境指令：SET search_path
        if (this.patterns.SEARCH_PATH && this.patterns.SEARCH_PATH.test(trimmedStatement)) {
            return null;
        }

        // CREATE TABLE → DROP TABLE
        if (this.patterns.CREATE_TABLE.test(trimmedStatement)) {
            console.log('匹配到 CREATE TABLE 语句');
            return this.reverseCreateTable(trimmedStatement);
        }

        // DROP TABLE → CREATE TABLE (需要表结构信息，暂时生成注释)
        if (this.patterns.DROP_TABLE.test(trimmedStatement)) {
            console.log('匹配到 DROP TABLE 语句');
            return this.reverseDropTable(trimmedStatement);
        }

        // ALTER TABLE ADD COLUMN → ALTER TABLE DROP COLUMN
        // 优先检查分区相关操作，避免被 ADD COLUMN 误判
        if (this.patterns.ALTER_ADD_PARTITION && this.patterns.ALTER_ADD_PARTITION.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE ADD PARTITION 语句');
            return this.reverseAlterAddPartition(trimmedStatement);
        }
        if (this.patterns.ALTER_ATTACH_PARTITION && this.patterns.ALTER_ATTACH_PARTITION.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE ATTACH PARTITION 语句');
            return this.reverseAlterAttachPartition(trimmedStatement);
        }
        if (this.patterns.ALTER_ADD_COLUMN.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE ADD COLUMN 语句');
            return this.reverseAlterAddColumn(trimmedStatement);
        }

        // ALTER TABLE DROP COLUMN → ALTER TABLE ADD COLUMN (需要列定义信息，暂时生成注释)
        if (this.patterns.ALTER_DROP_COLUMN.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE DROP COLUMN 语句');
            return this.reverseAlterDropColumn(trimmedStatement);
        }

        // ALTER TABLE MODIFY COLUMN → ALTER TABLE MODIFY COLUMN (生成注释提示)
        if (this.patterns.ALTER_MODIFY_COLUMN.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE MODIFY COLUMN 语句');
            return this.reverseAlterModifyColumn(trimmedStatement);
        }

        // RENAME TABLE → RENAME TABLE (交换表名)
        if (this.patterns.RENAME_TABLE.test(trimmedStatement)) {
            console.log('匹配到 RENAME TABLE 语句');
            return this.reverseRenameTable(trimmedStatement);
        }

        // ALTER TABLE RENAME COLUMN → ALTER TABLE RENAME COLUMN (交换列名)
        if (this.patterns.ALTER_RENAME_COLUMN.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE RENAME COLUMN 语句');
            return this.reverseAlterRenameColumn(trimmedStatement);
        }

        // ALTER TABLE RENAME → ALTER TABLE RENAME (交换列名，不带COLUMN关键字)
        if (this.patterns.ALTER_RENAME.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE RENAME 语句');
            return this.reverseAlterRename(trimmedStatement);
        }

        // ALTER TABLE RENAME TO → ALTER TABLE RENAME TO (交换表名)
        if (this.patterns.ALTER_RENAME_TO.test(trimmedStatement)) {
            console.log('匹配到 ALTER TABLE RENAME TO 语句');
            return this.reverseAlterRenameTo(trimmedStatement);
        }

        // CREATE INDEX → DROP INDEX
        if (this.patterns.CREATE_INDEX.test(trimmedStatement)) {
            console.log('匹配到 CREATE INDEX 语句');
            return this.reverseCreateIndex(trimmedStatement);
        }

        // DROP INDEX → CREATE INDEX (需要索引定义信息，暂时生成注释)
        if (this.patterns.DROP_INDEX.test(trimmedStatement)) {
            console.log('匹配到 DROP INDEX 语句');
            return this.reverseDropIndex(trimmedStatement);
        }

        // CREATE VIEW → DROP VIEW
        if (this.patterns.CREATE_VIEW.test(trimmedStatement)) {
            console.log('匹配到 CREATE VIEW 语句');
            return this.reverseCreateView(trimmedStatement);
        }

        // DROP VIEW → CREATE VIEW (使用JSON中的视图定义)
        if (this.patterns.DROP_VIEW.test(trimmedStatement)) {
            console.log('匹配到 DROP VIEW 语句');
            return this.reverseDropView(trimmedStatement);
        }

        // ALTER VIEW RENAME TO → ALTER VIEW RENAME TO (交换视图名)
        if (this.patterns.ALTER_VIEW_RENAME_TO.test(trimmedStatement)) {
            console.log('匹配到 ALTER VIEW RENAME TO 语句');
            return this.reverseAlterViewRename(trimmedStatement);
        }

        // COMMENT ON TABLE → 恢复原始表注释
        if (this.patterns.COMMENT_ON_TABLE.test(trimmedStatement)) {
            console.log('匹配到 COMMENT ON TABLE 语句');
            return this.reverseCommentOnTable(trimmedStatement);
        }

        // COMMENT ON COLUMN → 恢复原始列注释
        if (this.patterns.COMMENT_ON_COLUMN.test(trimmedStatement)) {
            console.log('匹配到 COMMENT ON COLUMN 语句');
            // 检查是否为视图字段注释，如果是则跳过逆向生成
            const match = trimmedStatement.match(this.patterns.COMMENT_ON_COLUMN);
            if (match) {
                const tableName = match[1];
                // 检查是否为视图
                if (this.isViewName(tableName)) {
                    console.log('跳过视图字段注释的逆向生成');
                    return null;
                }
            }
            return this.reverseCommentOnColumn(trimmedStatement);
        }

        // COMMENT ON VIEW → 恢复原始视图注释
        if (this.patterns.COMMENT_ON_VIEW.test(trimmedStatement)) {
            console.log('匹配到 COMMENT ON VIEW 语句，跳过视图注释的逆向生成');
            return null;
        }

        // 不支持的语句类型：不输出原语句，仅给出泛化提示
        console.log('未匹配到任何已知的SQL语句类型');
        return `/* 不支持自动逆向的语句类型，请人工处理 */`;
    }

    /**
     * 逆向 CREATE TABLE 语句
     */
    /**
     * 逆向 CREATE TABLE 语句
     * 优化逻辑：直接生成对应的DROP TABLE语句
     */
    reverseCreateTable(statement) {
        const match = statement.match(this.patterns.CREATE_TABLE);
        if (match) {
            const tableName = match[1];
            
            console.log(`处理 CREATE TABLE: 表=${tableName}`);
            
            // 简化格式：只保留逆向语句，不包含原语句注释
            let reverseSQL = `DROP TABLE IF EXISTS ${tableName};`;
            
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 ALTER TABLE ADD PARTITION 语句
     * 统一生成 DROP PARTITION；无法解析分区名时提示手动处理
     */
    reverseAlterAddPartition(statement) {
        const match = statement.match(this.patterns.ALTER_ADD_PARTITION);
        if (!match) return null;
        const tableName = match[1];
        const partitionName = match[2];
        const lessThanValue = match[3];
        let reverseSQL = '';
        if (partitionName) {
            reverseSQL += `/* 原语句: ${statement.trim()} */\n`;
            reverseSQL += `ALTER TABLE ${tableName} DROP PARTITION ${partitionName.replace(/[`"]/g, '')};`;
            if (lessThanValue) {
                reverseSQL += `\n/* 原分区范围: VALUES LESS THAN (${lessThanValue}) */`;
            }
        } else {
            reverseSQL += `/* 无法自动识别分区名，请手动补充 DROP PARTITION 语句 */\n`;
            reverseSQL += `/* 示例：ALTER TABLE ${tableName} DROP PARTITION <partition_name>; */`;
        }
        return reverseSQL;
    }

    /**
     * 逆向 ALTER TABLE ATTACH PARTITION（PostgreSQL）
     */
    reverseAlterAttachPartition(statement) {
        const match = statement.match(this.patterns.ALTER_ATTACH_PARTITION);
        if (!match) return null;
        const tableName = match[1];
        const childName = match[2];
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `ALTER TABLE ${tableName} DETACH PARTITION ${childName};`;
        return reverseSQL;
    }

    /**
     * 逆向 DROP TABLE 语句
     */
    reverseDropTable(statement) {
        const match = statement.match(this.patterns.DROP_TABLE);
        if (match) {
            const tableName = match[1];
            
            // 如果有表结构数据，尝试生成完整的CREATE TABLE语句
            if (this.schemaData && this.schemaData.tables) {
                // 统一转换为小写进行匹配（与schema-parser.js保持一致）
                const normalizedTableName = tableName.replace(/[`"]/g, '').toLowerCase();
                
                const tableInfo = this.schemaData.tables[normalizedTableName];
                if (tableInfo && tableInfo.columns) {
                    // 提取schema名称
                    const schemaName = this.extractSchemaFromTableName(tableName, tableInfo);
                    
                    // 使用新的格式生成CREATE TABLE语句
                    let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
                    
                    // 添加SET search_path语句
                    if (schemaName) {
                        reverseSQL += `SET search_path = ${schemaName};\n`;
                    }
                    
                    reverseSQL += this.generateCreateTableFromSchema(tableName, tableInfo);
                    
                    return reverseSQL;
                }
            }
            
            // 如果没有表结构数据，生成注释提示
            let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
            reverseSQL += `/* CREATE TABLE ${tableName} (\n   请在此处添加表结构定义\n); 需要手动提供表结构 */`;
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 ALTER TABLE ADD COLUMN 语句
     */
    /**
     * 逆向 ALTER TABLE ADD COLUMN 语句
     * 优化逻辑：直接生成对应的DROP COLUMN语句，保持原语句格式
     */
    reverseAlterAddColumn(statement) {
        // 如果是分区相关语句，直接交由分区处理
        if (this.patterns.ALTER_ADD_PARTITION && this.patterns.ALTER_ADD_PARTITION.test(statement)) {
            return null;
        }
        const match = statement.match(this.patterns.ALTER_ADD_COLUMN);
        if (match) {
            const tableName = match[1];
            const hasColumnKeyword = match[2]; // 是否包含COLUMN关键字
            const columnName = match[3];
            const columnDefinition = match[4]; // 列定义（可能为空）
            
            console.log(`处理 ALTER TABLE ADD COLUMN: 表=${tableName}, 列=${columnName}, 定义=${columnDefinition || '无定义'}`);
            
            // 简化格式：只保留原语句和逆向语句，保持原语句的格式
            let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
            if (hasColumnKeyword) {
                reverseSQL += `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName};`;
            } else {
                reverseSQL += `ALTER TABLE ${tableName} DROP ${columnName};`;
            }
            
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 ALTER TABLE DROP COLUMN 语句
     */
    reverseAlterDropColumn(statement) {
        const match = statement.match(this.patterns.ALTER_DROP_COLUMN);
        if (match) {
            const tableName = match[1];
            const hasColumnKeyword = match[2]; // 是否包含COLUMN关键字
            const columnName = match[3];
            
            // 如果有表结构数据，尝试获取列定义
            if (this.schemaData && this.schemaData.tables) {
                // 统一转换为小写进行匹配（与schema-parser.js保持一致）
                const normalizedTableName = tableName.replace(/[`"]/g, '').toLowerCase();
                const normalizedColumnName = columnName.replace(/[`"]/g, '').toLowerCase();
                
                const tableInfo = this.schemaData.tables[normalizedTableName];
                if (tableInfo && tableInfo.columns) {
                    const columnInfo = tableInfo.columns[normalizedColumnName];
                    if (columnInfo) {
                        // 构建完整的列定义，包括约束
                        let columnDef = `${columnName} ${columnInfo.type}`; // 不追加 NOT NULL
                        
                        if (columnInfo.default !== null && columnInfo.default !== undefined) {
                            columnDef += ` DEFAULT ${columnInfo.default}`;
                        }
                        
                        if (columnInfo.primaryKey) {
                            columnDef += ' PRIMARY KEY';
                        }
                        
                        if (columnInfo.unique) {
                            columnDef += ' UNIQUE';
                        }
                        
                        if (columnInfo.autoIncrement) {
                            columnDef += ' AUTO_INCREMENT';
                        }
                        
                        // 简化格式：只保留原语句和逆向语句，保持原语句的格式
                        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
                        if (hasColumnKeyword) {
                            reverseSQL += `ALTER TABLE ${tableName} ADD COLUMN ${columnDef};\n`;
                        } else {
                            reverseSQL += `ALTER TABLE ${tableName} ADD ${columnDef};\n`;
                        }
                        
                        // 为ALTER DROP的逆向脚本添加COMMENT ON COLUMN语句（从JSON获取）
                        if (columnInfo.comment) {
                            const cleanTableName = tableName.replace(/[`"]/g, '');
                            const cleanColumnName = columnName.replace(/[`"]/g, '');
                            reverseSQL += `COMMENT ON COLUMN ${cleanTableName}.${cleanColumnName} IS '${columnInfo.comment}';\n`;
                        }
                        
                        return reverseSQL;
                    }
                }
            }
            
            // 如果没有表结构数据，生成注释提示（不显示原语句）
            let reverseSQL = '';
            if (hasColumnKeyword) {
                reverseSQL += `/* ALTER TABLE ${tableName} ADD COLUMN ${columnName} 数据类型; 需要手动提供列定义 */`;
            } else {
                reverseSQL += `/* ALTER TABLE ${tableName} ADD ${columnName} 数据类型; 需要手动提供列定义 */`;
            }
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 CREATE INDEX 语句
     * 优化逻辑：直接生成对应的DROP INDEX语句
     */
    reverseCreateIndex(statement) {
        const match = statement.match(this.patterns.CREATE_INDEX);
        if (match) {
            const indexName = match[1];
            
            console.log(`处理 CREATE INDEX: 索引=${indexName}`);
            
            // 简化格式：只保留原语句和逆向语句
            let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
            reverseSQL += `DROP INDEX IF EXISTS ${indexName};`;
            
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 DROP INDEX 语句
     */
    reverseDropIndex(statement) {
        const match = statement.match(this.patterns.DROP_INDEX);
        if (match) {
            const indexName = match[1];
            
            // 简化格式：只保留原语句和逆向语句
            let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
            reverseSQL += `/* CREATE INDEX ${indexName} ON 表名 (列名); 需要手动提供索引定义 */`;
            return reverseSQL;
        }
        return null;
    }

    /**
     * 逆向 CREATE VIEW 语句 - 使用JSON中的视图定义
     */
    reverseCreateView(statement) {
        const match = statement.match(this.patterns.CREATE_VIEW);
        if (match) {
            const viewName = match[1];
            
            // 尝试从schema数据中获取视图定义
            if (this.schemaData && this.schemaData.views) {
                // 查找匹配的视图（支持不同的命名格式）
                const viewKey = this.findViewInSchema(viewName);
                if (viewKey && this.schemaData.views[viewKey]) {
                    const viewInfo = this.schemaData.views[viewKey];
                    // 直接使用完整的definition，包含CREATE VIEW和COMMENT ON VIEW语句
                    return viewInfo.definition;
                } else {
                    return `DROP VIEW IF EXISTS ${viewName};`;
                }
            } else {
                return `DROP VIEW IF EXISTS ${viewName};`;
            }
        }
        return null;
    }

    /**
     * 逆向 DROP VIEW 语句 - 使用JSON中的视图定义
     */
    reverseDropView(statement) {
        const match = statement.match(this.patterns.DROP_VIEW);
        if (match) {
            const viewName = match[1];
            
            // 尝试从schema数据中获取视图定义
            if (this.schemaData && this.schemaData.views) {
                // 查找匹配的视图（支持不同的命名格式）
                const viewKey = this.findViewInSchema(viewName);
                if (viewKey && this.schemaData.views[viewKey]) {
                    const viewInfo = this.schemaData.views[viewKey];
                    // 直接使用完整的definition，包含CREATE VIEW和COMMENT ON VIEW语句
                    return viewInfo.definition;
                } else {
                    return `/* CREATE OR REPLACE VIEW ${viewName} AS (SELECT ...); 需要手动提供视图定义 */`;
                }
            } else {
                return `/* CREATE OR REPLACE VIEW ${viewName} AS (SELECT ...); 需要手动提供视图定义 */`;
            }
        }
        return null;
    }

    /**
     * 在schema数据中查找视图
     */
    findViewInSchema(viewName) {
        if (!this.schemaData || !this.schemaData.views) {
            return null;
        }
        
        // 清理视图名（移除引号和转换为小写）
        const cleanViewName = viewName.replace(/[`"]/g, '').toLowerCase();
        
        // 直接匹配
        if (this.schemaData.views[cleanViewName]) {
            return cleanViewName;
        }
        
        // 遍历所有视图，查找匹配的
        for (const [key, viewInfo] of Object.entries(this.schemaData.views)) {
            if (viewInfo.name === cleanViewName || 
                viewInfo.fullName === cleanViewName ||
                key === cleanViewName) {
                return key;
            }
        }
        
        return null;
    }

    /**
     * 检查给定的名称是否为视图名称
     */
    isViewName(name) {
        if (!this.schemaData || !this.schemaData.views) {
            return false;
        }
        
        // 清理名称（移除引号和转换为小写）
        const cleanName = name.replace(/[`"]/g, '').toLowerCase();
        
        // 直接匹配
        if (this.schemaData.views[cleanName]) {
            return true;
        }
        
        // 遍历所有视图，查找匹配的
        for (const [key, viewInfo] of Object.entries(this.schemaData.views)) {
            if (viewInfo.name === cleanName || 
                viewInfo.fullName === cleanName ||
                key === cleanName) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 导出逆向脚本到文件
     * @param {Array} reverseScripts - 逆向脚本数组
     * @param {string} outputPath - 输出文件路径
     */
    async exportReverseScripts(reverseScripts, outputPath) {
        const fs = require('fs').promises;
        const path = require('path');

        try {
            let content = '';

            reverseScripts.forEach((folder, folderIndex) => {
                folder.scripts.forEach((script, scriptIndex) => {
                    content += script.content;
                    content += `\n\n`;
                });
            });

            await fs.writeFile(outputPath, content, 'utf8');
            console.log(`逆向脚本已导出到: ${outputPath}`);
            
            return {
                success: true,
                filePath: outputPath,
                message: '逆向脚本导出成功'
            };
        } catch (error) {
            console.error('导出逆向脚本时发生错误:', error);
            return {
                success: false,
                error: error.message,
                message: '逆向脚本导出失败'
            };
        }
    }

    /**
     * 检测是否为纯建表DDL文件（只包含CREATE TABLE语句）
     * @param {Array} lines - DDL文件的行数组
     * @returns {boolean} 是否为纯建表DDL文件
     */
    /**
     * 检测文件是否只包含CREATE TABLE语句
     */
    isCreateTableOnlyFile(lines) {
        let hasCreateTable = false;
        let hasOtherDDL = false;
        
        for (const line of lines) {
            // 跳过空行和注释
            if (this.patterns.EMPTY.test(line) || this.patterns.COMMENT.test(line) || 
                /COMMENT\s+ON/i.test(line)) {
                continue;
            }
            
            // 检查是否为CREATE TABLE语句
            // 同时支持“括号在下一行”的多行建表
            if (this.patterns.CREATE_TABLE.test(line) || this.patterns.CREATE_TABLE_START.test(line)) {
                hasCreateTable = true;
                continue;
            }
            
            // 检查是否包含其他DDL操作
            if (this.patterns.DROP_TABLE.test(line) ||
                this.patterns.ALTER_ADD_COLUMN.test(line) ||
                this.patterns.ALTER_DROP_COLUMN.test(line) ||
                this.patterns.ALTER_MODIFY_COLUMN.test(line) ||
                this.patterns.CREATE_INDEX.test(line) ||
                this.patterns.DROP_INDEX.test(line) ||
                this.patterns.INSERT_INTO.test(line) ||
                this.patterns.UPDATE.test(line) ||
                this.patterns.DELETE_FROM.test(line) ||
                this.patterns.TRUNCATE.test(line)) {
                hasOtherDDL = true;
                break;
            }
            
            // 如果是非空非注释的行，但不匹配任何已知模式，可能是CREATE TABLE的一部分
            // 这里简单处理，认为是CREATE TABLE的一部分
        }
        
        // 只有包含CREATE TABLE且不包含其他DDL操作时，才认为是纯建表文件
        return hasCreateTable && !hasOtherDDL;
    }

    /**
     * 检测文件是否只包含ALTER DROP COLUMN语句
     */
    isAlterDropOnlyFile(lines) {
        let hasAlterDrop = false;
        let hasOtherDDL = false;
        
        for (const line of lines) {
            // 跳过空行和注释
            if (this.patterns.EMPTY.test(line) || this.patterns.COMMENT.test(line) || 
                /COMMENT\s+ON/i.test(line)) {
                continue;
            }
            
            // 检查是否为ALTER DROP COLUMN语句
            if (this.patterns.ALTER_DROP_COLUMN.test(line)) {
                hasAlterDrop = true;
                continue;
            }
            
            // 检查是否包含其他DDL操作
            if (this.patterns.CREATE_TABLE.test(line) ||
                this.patterns.DROP_TABLE.test(line) ||
                this.patterns.ALTER_ADD_COLUMN.test(line) ||
                this.patterns.ALTER_MODIFY_COLUMN.test(line) ||
                this.patterns.CREATE_INDEX.test(line) ||
                this.patterns.DROP_INDEX.test(line) ||
                this.patterns.INSERT_INTO.test(line) ||
                this.patterns.UPDATE.test(line) ||
                this.patterns.DELETE_FROM.test(line) ||
                this.patterns.TRUNCATE.test(line)) {
                hasOtherDDL = true;
                break;
            }
        }
        
        // 只有包含ALTER DROP且不包含其他DDL操作时，才认为是纯删除列文件
        return hasAlterDrop && !hasOtherDDL;
    }

    /**
     * 获取支持的SQL操作类型列表
     */
    /**
     * 逆向 COMMENT ON TABLE 语句
     * @param {string} statement - COMMENT ON TABLE 语句
     * @returns {string} 逆向语句
     */
    reverseCommentOnTable(statement) {
        const match = statement.match(this.patterns.COMMENT_ON_TABLE);
        if (!match) {
            return `/* 无法解析 COMMENT ON TABLE 语句: ${statement} */`;
        }

        const tableName = match[1];
        
        // 从schema中查找原始表注释
        if (this.schema && this.schema.tables) {
            // schema.tables是一个对象，key是完整表名
            const table = this.schema.tables[tableName];
            if (table && table.comment) {
                let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
                reverseSQL += `COMMENT ON TABLE ${tableName} IS '${table.comment}';`;
                return reverseSQL;
            }
        }
        
        // 如果没有找到原始注释，生成注释说明
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `/* 未找到表 ${tableName} 的相关字段与注释 */`;
        return reverseSQL;
    }

    /**
     * 生成 ALTER VIEW RENAME TO 语句的逆向脚本
     * @param {string} statement - ALTER VIEW RENAME TO 语句
     * @returns {string} 逆向语句
     */
    reverseAlterViewRename(statement) {
        const match = statement.match(this.patterns.ALTER_VIEW_RENAME_TO);
        if (!match) {
            return `/* 无法解析 ALTER VIEW RENAME TO 语句: ${statement} */`;
        }

        const oldViewName = match[1];
        const newViewName = match[2];
        
        // 处理新视图名，移除schema前缀（如果存在）
        let cleanNewViewName = newViewName;
        if (newViewName.includes('.')) {
            // 处理 `schema`.`view` 或 schema.view 格式
            const parts = newViewName.split('.');
            cleanNewViewName = parts[parts.length - 1]; // 取最后一部分作为视图名
        }
        
        // 处理旧视图名，提取schema和视图名
        let schemaName = '';
        let cleanOldViewName = oldViewName;
        if (oldViewName.includes('.')) {
            const parts = oldViewName.split('.');
            if (parts.length >= 2) {
                schemaName = parts[0]; // 取第一部分作为schema
                cleanOldViewName = parts[parts.length - 1]; // 取最后一部分作为视图名
            }
        }
        
        // 生成逆向RENAME TO语句：前面的视图名带schema，后面的视图名不带schema
        const reverseOldViewName = schemaName ? `${schemaName}.${cleanNewViewName}` : cleanNewViewName;
        let reverseSQL = `ALTER VIEW ${reverseOldViewName} RENAME TO ${cleanOldViewName};`;
        
        return reverseSQL;
    }

    /**
     * 逆向 COMMENT ON COLUMN 语句
     * @param {string} statement - COMMENT ON COLUMN 语句
     * @returns {string} 逆向语句
     */
    reverseCommentOnColumn(statement) {
        const match = statement.match(this.patterns.COMMENT_ON_COLUMN);
        if (!match) {
            return `/* 无法解析 COMMENT ON COLUMN 语句: ${statement} */`;
        }

        const tableName = match[1];
        const columnName = match[2];
        
        // 简单粗暴：直接转小写匹配JSON数据
        const lowerTableName = tableName.replace(/[`"]/g, '').toLowerCase();
        const lowerColumnName = columnName.replace(/[`"]/g, '').toLowerCase();
        
        // 处理表字段注释（仅当列存在于schema时才生成逆向）
        if (this.schema && this.schema.tables && this.schema.tables[lowerTableName]) {
            const table = this.schema.tables[lowerTableName];
            if (table.columns && table.columns[lowerColumnName]) {
                const column = table.columns[lowerColumnName];
                if (column.comment) {
                    let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
                    reverseSQL += `COMMENT ON COLUMN ${tableName}.${columnName} IS '${column.comment}';`;
                    return reverseSQL;
                }
                // 列存在但没有注释：认为原注释为空，不输出任何逆向语句
                return '';
            }
        }
        // 列在schema中不存在（通常是新增列），直接跳过，不输出任何内容
        return '';
    }

    /**
     * 逆向 COMMENT ON VIEW 语句
     * @param {string} statement - COMMENT ON VIEW 语句
     * @returns {string} 逆向语句
     */
    reverseCommentOnView(statement) {
        const match = statement.match(this.patterns.COMMENT_ON_VIEW);
        if (!match) {
            return `/* 无法解析 COMMENT ON VIEW 语句: ${statement} */`;
        }

        const viewName = match[1];
        
        // 从schema中查找原始视图定义（包含注释）
        if (this.schema && this.schema.views) {
            const viewKey = this.findViewInSchema(viewName);
            if (viewKey && this.schema.views[viewKey]) {
                const viewInfo = this.schema.views[viewKey];
                // 从definition中提取原始的COMMENT ON VIEW语句
                const definition = viewInfo.definition;
                const commentMatch = definition.match(/COMMENT\s+ON\s+VIEW\s+[^;]+;/i);
                
                if (commentMatch) {
                    let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
                    reverseSQL += commentMatch[0];
                    return reverseSQL;
                }
            }
        }
        
        // 如果没有找到原始注释，生成注释说明
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `/* 未找到视图 ${viewName} 的原始注释 */`;
        return reverseSQL;
    }

    /**
     * 逆向 RENAME TABLE 语句
     * @param {string} statement - RENAME TABLE 语句
     * @returns {string} 逆向语句
     */
    reverseRenameTable(statement) {
        const match = statement.match(this.patterns.RENAME_TABLE);
        if (!match) {
            return `/* 无法解析 RENAME TABLE 语句: ${statement} */`;
        }

        const oldTableName = match[1];
        const newTableName = match[2];
        
        // 移除新表名中的schema前缀（如果存在）
        const cleanNewTableName = newTableName.includes('.') ? 
            newTableName.split('.').pop() : newTableName;
        
        // 生成逆向RENAME语句：将新表名重命名回旧表名
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `RENAME TABLE ${cleanNewTableName} TO ${oldTableName};`;
        return reverseSQL;
    }

    /**
     * 逆向 ALTER TABLE RENAME COLUMN 语句
     * @param {string} statement - ALTER TABLE RENAME COLUMN 语句
     * @returns {string} 逆向语句
     */
    reverseAlterRenameColumn(statement) {
        const match = statement.match(this.patterns.ALTER_RENAME_COLUMN);
        if (!match) {
            return `/* 无法解析 ALTER TABLE RENAME COLUMN 语句: ${statement} */`;
        }

        const tableName = match[1];
        const oldColumnName = match[2];
        const newColumnName = match[3];
        
        // 生成逆向RENAME COLUMN语句：将新列名重命名回旧列名
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `ALTER TABLE ${tableName} RENAME COLUMN ${newColumnName} TO ${oldColumnName};`;
        return reverseSQL;
    }

    /**
     * 逆向 ALTER TABLE RENAME 语句（不带COLUMN关键字）
     * @param {string} statement - ALTER TABLE RENAME 语句
     * @returns {string} 逆向语句
     */
    reverseAlterRename(statement) {
        const match = statement.match(this.patterns.ALTER_RENAME);
        if (!match) {
            return `/* 无法解析 ALTER TABLE RENAME 语句: ${statement} */`;
        }

        const tableName = match[1];
        const oldColumnName = match[2];
        const newColumnName = match[3];
        
        // 生成逆向RENAME语句：将新列名重命名回旧列名
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `ALTER TABLE ${tableName} RENAME ${newColumnName} TO ${oldColumnName};`;
        return reverseSQL;
    }

    /**
     * 逆向 ALTER TABLE RENAME TO 语句
     * @param {string} statement - ALTER TABLE RENAME TO 语句
     * @returns {string} 逆向语句
     */
    reverseAlterRenameTo(statement) {
        const match = statement.match(this.patterns.ALTER_RENAME_TO);
        if (!match) {
            return `/* 无法解析 ALTER TABLE RENAME TO 语句: ${statement} */`;
        }

        const oldTableName = match[1];
        const newTableName = match[2];
        
        // 处理新表名，移除schema前缀（如果存在）
        let cleanNewTableName = newTableName;
        if (newTableName.includes('.')) {
            // 处理 `schema`.`table` 或 schema.table 格式
            const parts = newTableName.split('.');
            cleanNewTableName = parts[parts.length - 1]; // 取最后一部分作为表名
        }
        
        // 处理旧表名，提取schema和表名
        let schemaName = '';
        let cleanOldTableName = oldTableName;
        if (oldTableName.includes('.')) {
            const parts = oldTableName.split('.');
            if (parts.length >= 2) {
                schemaName = parts[0]; // 取第一部分作为schema
                cleanOldTableName = parts[parts.length - 1]; // 取最后一部分作为表名
            }
        }
        
        // 生成逆向RENAME TO语句：前面的表名带schema，后面的表名不带schema
        const reverseOldTableName = schemaName ? `${schemaName}.${cleanNewTableName}` : cleanNewTableName;
        let reverseSQL = `/* 原语句: ${statement.trim()} */\n`;
        reverseSQL += `ALTER TABLE ${reverseOldTableName} RENAME TO ${cleanOldTableName};`;
        return reverseSQL;
    }

    getSupportedOperations() {
        return [
            'CREATE TABLE → DROP TABLE',
            'DROP TABLE → CREATE TABLE (需要手动补充表结构)',
            'ALTER TABLE ADD COLUMN → ALTER TABLE DROP COLUMN',
            'ALTER TABLE DROP COLUMN → ALTER TABLE ADD COLUMN (需要手动补充列定义)',
            'CREATE INDEX → DROP INDEX',
            'DROP INDEX → CREATE INDEX (需要手动补充索引定义)',
            'CREATE VIEW → DROP VIEW',
            'DROP VIEW → CREATE VIEW (使用JSON中的视图定义)',
            'COMMENT ON TABLE → 恢复原始表注释',
            'COMMENT ON COLUMN → 恢复原始列注释',
            'COMMENT ON VIEW → 恢复原始视图注释'
        ];
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReverseSQLGenerator;
} else {
    // 浏览器环境
    window.ReverseSQLGenerator = ReverseSQLGenerator;
}