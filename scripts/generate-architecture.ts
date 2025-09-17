#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import ts from 'typescript';

interface ImportInfo {
  source: string; // 导入来源 (from 'xxx')
  imports: string[]; // 导入的内容 ['a', 'b', 'default']
  type: 'static' | 'dynamic'; // import() vs import
  isTypeOnly: boolean; // import type
}

interface ExportInfo {
  name: string;
  type: 'named' | 'default' | 're-export';
  source?: string; // export from 'xxx'
  description?: string; // 从注释中提取的描述
}

interface FunctionInfo {
  name: string;
  isExported: boolean;
  isAsync: boolean;
  parameters: string[];
  returnType?: string;
  description?: string;
  lineNumber: number;
}

interface ClassInfo {
  name: string;
  isExported: boolean;
  extends?: string;
  implements?: string[];
  methods: string[];
  description?: string;
  lineNumber: number;
}

interface FileComments {
  fileHeader?: string; // 文件顶部注释
  description?: string; // 从JSDoc @fileoverview 提取
  author?: string;
  created?: string;
  purpose?: string; // 文件用途
}

interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  directory: string;
  level: number;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: string[]; // 依赖的文件路径
  dependents: string[]; // 依赖此文件的文件路径
  comments: FileComments; // 文件注释信息
  functions: FunctionInfo[]; // 函数列表
  classes: ClassInfo[]; // 类列表
  interfaces: string[]; // 接口列表
  types: string[]; // 类型定义列表
  constants: string[]; // 常量列表
  lineCount: number; // 行数
  complexity: 'low' | 'medium' | 'high'; // 复杂度评估
}

interface DependencyGraph {
  [filePath: string]: string[]; // 文件 -> 它依赖的文件列表
}

interface ProjectStructure {
  files: FileInfo[];
  totalFiles: number;
  directories: string[];
  entryPoints: string[];
  coreModules: string[];
  utilityModules: string[];
  leafModules: string[];
  readingOrder: string[];
  dependencyGraph: DependencyGraph;
  moduleAnalysis: ModuleAnalysis;
  scannedAt: string;
}

/**
 * 提取注释文本并清理格式
 */
function extractCommentText(commentNode: ts.CommentRange, sourceText: string): string {
  const commentText = sourceText.substring(commentNode.pos, commentNode.end);

  // 清理注释格式
  return commentText
    .replace(/^\/\*\*?|\*\/$/g, '') // 移除 /** */ 或 /* */
    .replace(/^\/\/|^\s*\*/gm, '') // 移除 // 和行首的 *
    .replace(/^\s+|\s+$/gm, '') // 移除行首尾空格
    .split('\n')
    .filter(line => line.trim())
    .join('\n')
    .trim();
}

/**
 * 从JSDoc注释中提取特定标签
 */
function parseJSDocTags(commentText: string): { [key: string]: string } {
  const tags: { [key: string]: string } = {};
  const tagRegex = /@(\w+)\s+(.+?)(?=@\w+|$)/gs;
  let match;

  while ((match = tagRegex.exec(commentText)) !== null) {
    tags[match[1]] = match[2].trim();
  }

  return tags;
}

/**
 * 评估文件复杂度
 */
function assessFileComplexity(
  functions: FunctionInfo[],
  classes: ClassInfo[],
  lineCount: number,
  dependencies: number
): 'low' | 'medium' | 'high' {
  let complexityScore = 0;

  // 基于代码行数
  if (lineCount > 300) complexityScore += 3;
  else if (lineCount > 150) complexityScore += 2;
  else if (lineCount > 50) complexityScore += 1;

  // 基于函数数量
  if (functions.length > 20) complexityScore += 3;
  else if (functions.length > 10) complexityScore += 2;
  else if (functions.length > 5) complexityScore += 1;

  // 基于类数量
  complexityScore += classes.length > 5 ? 3 : classes.length > 2 ? 2 : classes.length > 0 ? 1 : 0;

  // 基于依赖数量
  if (dependencies > 20) complexityScore += 3;
  else if (dependencies > 10) complexityScore += 2;
  else if (dependencies > 5) complexityScore += 1;

  if (complexityScore >= 8) return 'high';
  if (complexityScore >= 4) return 'medium';
  return 'low';
}

/**
 * 解析TypeScript文件的AST并提取所有信息
 */
async function parseFileAST(filePath: string): Promise<{
  imports: ImportInfo[],
  exports: ExportInfo[],
  comments: FileComments,
  functions: FunctionInfo[],
  classes: ClassInfo[],
  interfaces: string[],
  types: string[],
  constants: string[],
  lineCount: number
}> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const interfaces: string[] = [];
    const types: string[] = [];
    const constants: string[] = [];
    const comments: FileComments = {};

    // 计算行数
    const lineCount = content.split('\n').length;

    // 提取文件头部注释
    const leadingComments = ts.getLeadingCommentRanges(content, 0);
    if (leadingComments && leadingComments.length > 0) {
      const headerComment = extractCommentText(leadingComments[0], content);
      comments.fileHeader = headerComment;

      // 解析JSDoc标签
      const tags = parseJSDocTags(headerComment);
      if (tags.fileoverview || tags.description) {
        comments.description = tags.fileoverview || tags.description;
      }
      if (tags.author) comments.author = tags.author;
      if (tags.created) comments.created = tags.created;
    }

    // 获取前导注释的描述文本
    function getNodeDescription(node: ts.Node): string | undefined {
      const nodeComments = ts.getLeadingCommentRanges(content, node.getFullStart());
      if (nodeComments && nodeComments.length > 0) {
        const commentText = extractCommentText(nodeComments[nodeComments.length - 1], content);
        const tags = parseJSDocTags(commentText);
        return tags.description || commentText.split('\n')[0];
      }
      return undefined;
    }

    function visitNode(node: ts.Node) {
      // 处理 import 语句
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const source = moduleSpecifier.text;
          const importClause = node.importClause;
          const importNames: string[] = [];

          if (importClause) {
            // default import
            if (importClause.name) {
              importNames.push('default');
            }

            // named imports
            if (importClause.namedBindings) {
              if (ts.isNamespaceImport(importClause.namedBindings)) {
                importNames.push('*');
              } else if (ts.isNamedImports(importClause.namedBindings)) {
                importClause.namedBindings.elements.forEach(element => {
                  importNames.push(element.name.text);
                });
              }
            }
          }

          imports.push({
            source,
            imports: importNames,
            type: 'static',
            isTypeOnly: !!(node.importClause?.isTypeOnly)
          });
        }
      }

      // 处理动态 import
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
          const source = node.arguments[0].text;
          imports.push({
            source,
            imports: ['*'],
            type: 'dynamic',
            isTypeOnly: false
          });
        }
      }

      // 处理 export 语句
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          // export from 'xxx'
          const source = node.moduleSpecifier.text;
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach(element => {
              exports.push({
                name: element.name.text,
                type: 're-export',
                source
              });
            });
          } else {
            // export * from 'xxx'
            exports.push({
              name: '*',
              type: 're-export',
              source
            });
          }
        } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          // export { a, b }
          node.exportClause.elements.forEach(element => {
            exports.push({
              name: element.name.text,
              type: 'named'
            });
          });
        }
      }

      // 处理直接 export 的声明
      if (node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          if (node.name) {
            exports.push({
              name: node.name.text,
              type: 'named'
            });
          }
        } else if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach(decl => {
            if (ts.isIdentifier(decl.name)) {
              exports.push({
                name: decl.name.text,
                type: 'named'
              });
            }
          });
        }
      }

      // 处理 export default
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        exports.push({
          name: 'default',
          type: 'default',
          description: getNodeDescription(node)
        });
      }

      // 处理函数声明
      if (ts.isFunctionDeclaration(node) && node.name) {
        const isExported = !!(node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword));
        const isAsync = !!(node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword));
        const parameters = node.parameters.map(param => {
          if (ts.isIdentifier(param.name)) {
            return param.name.text + (param.type ? `: ${param.type.getText()}` : '');
          }
          return param.name.getText();
        });

        functions.push({
          name: node.name.text,
          isExported,
          isAsync,
          parameters,
          returnType: node.type?.getText(),
          description: getNodeDescription(node),
          lineNumber: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1
        });
      }

      // 处理类声明
      if (ts.isClassDeclaration(node) && node.name) {
        const isExported = !!(node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword));
        const extendsClause = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
        const implementsClause = node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ImplementsKeyword);

        const methods = node.members
          .filter(member => ts.isMethodDeclaration(member) && member.name)
          .map(member => {
            if (member.name && ts.isIdentifier(member.name)) {
              return member.name.text;
            }
            return 'unknown';
          });

        classes.push({
          name: node.name.text,
          isExported,
          extends: extendsClause?.types[0]?.getText(),
          implements: implementsClause?.types.map(type => type.getText()),
          methods,
          description: getNodeDescription(node),
          lineNumber: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1
        });
      }

      // 处理接口声明
      if (ts.isInterfaceDeclaration(node)) {
        interfaces.push(node.name.text);
      }

      // 处理类型别名
      if (ts.isTypeAliasDeclaration(node)) {
        types.push(node.name.text);
      }

      // 处理变量声明（常量）
      if (ts.isVariableStatement(node)) {
        const isExported = !!(node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword));
        const isConst = node.declarationList.flags & ts.NodeFlags.Const;

        if (isConst) {
          node.declarationList.declarations.forEach(decl => {
            if (ts.isIdentifier(decl.name)) {
              constants.push(decl.name.text);
            }
          });
        }
      }

      ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);

    return {
      imports,
      exports,
      comments,
      functions,
      classes,
      interfaces,
      types,
      constants,
      lineCount
    };
  } catch (error) {
    console.warn(`警告: 无法解析文件 ${filePath}:`, error);
    return {
      imports: [],
      exports: [],
      comments: {},
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
      constants: [],
      lineCount: 0
    };
  }
}

/**
 * 递归扫描目录并收集所有TypeScript文件
 */
async function scanDirectory(dirPath: string, basePath: string, level: number = 0): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // 跳过node_modules、.git等目录
        if (!shouldSkipDirectory(entry.name)) {
          const subFiles = await scanDirectory(fullPath, basePath, level + 1);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        // 只收集TypeScript文件
        if (isTypeScriptFile(entry.name)) {
          // 解析AST获取所有信息
          const {
            imports,
            exports,
            comments,
            functions,
            classes,
            interfaces,
            types,
            constants,
            lineCount
          } = await parseFileAST(fullPath);

          // 初步计算复杂度（后续会用依赖数量来完善）
          const complexity = assessFileComplexity(functions, classes, lineCount, imports.length);

          files.push({
            path: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
            name: entry.name,
            extension: path.extname(entry.name),
            directory: path.dirname(relativePath).replace(/\\/g, '/'),
            level,
            imports,
            exports,
            dependencies: [], // 稍后计算
            dependents: [], // 稍后计算
            comments,
            functions,
            classes,
            interfaces,
            types,
            constants,
            lineCount,
            complexity
          });
        }
      }
    }
  } catch (error) {
    console.warn(`警告: 无法读取目录 ${dirPath}:`, error);
  }

  return files;
}

/**
 * 判断是否应该跳过某个目录
 */
function shouldSkipDirectory(dirName: string): boolean {
  const skipDirs = [
    'node_modules',
    '.git',
    '.svn',
    'dist',
    'build',
    'coverage',
    '.nyc_output',
    'tmp',
    'temp',
    '.cache',
    '.next',
    '.nuxt',
    '.vscode',
    '.idea'
  ];

  return skipDirs.includes(dirName) || dirName.startsWith('.');
}

/**
 * 判断是否为TypeScript文件
 */
function isTypeScriptFile(fileName: string): boolean {
  const tsExtensions = ['.ts', '.tsx', '.mts', '.cts'];
  const ext = path.extname(fileName);
  return tsExtensions.includes(ext);
}

interface ModuleAnalysis {
  entryPoints: string[];
  coreModules: string[];
  utilityModules: string[];
  leafModules: string[];
  readingOrder: string[];
}

/**
 * 基于依赖关系识别入口点文件
 */
function identifyEntryPointsByDependencies(files: FileInfo[], dependencyGraph: DependencyGraph): string[] {
  const entryPoints: string[] = [];

  // 方法1: 找到没有被其他文件依赖的文件（真正的入口点）
  const dependentFiles = new Set<string>();
  files.forEach(file => {
    file.dependents.forEach(dependent => dependentFiles.add(dependent));
  });

  const trulyIndependentFiles = files
    .filter(file => !dependentFiles.has(file.relativePath))
    .map(file => file.relativePath);

  // 方法2: 常见的入口点文件名模式
  const entryPatterns = [
    /^index\.(ts|tsx|mts|cts)$/,
    /^main\.(ts|tsx|mts|cts)$/,
    /^app\.(ts|tsx|mts|cts)$/,
    /^cli\.(ts|tsx|mts|cts)$/,
    /^server\.(ts|tsx|mts|cts)$/,
    /entrypoint/i,
    /entry/i
  ];

  const patternBasedEntries = files
    .filter(file => entryPatterns.some(pattern => pattern.test(file.name)))
    .map(file => file.relativePath);

  // 方法3: 在entrypoints目录中的文件
  const entrypointDirFiles = files
    .filter(file => file.directory.includes('entrypoint'))
    .map(file => file.relativePath);

  // 合并并去重
  const allEntryPoints = [
    ...trulyIndependentFiles,
    ...patternBasedEntries,
    ...entrypointDirFiles
  ];

  return Array.from(new Set(allEntryPoints));
}

/**
 * 识别核心模块（被多个文件依赖的重要模块）
 */
function identifyCoreModules(files: FileInfo[]): string[] {
  // 按被依赖次数排序
  const modulesByDependents = files
    .map(file => ({
      path: file.relativePath,
      dependentCount: file.dependents.length,
      dependencies: file.dependencies.length
    }))
    .filter(module => module.dependentCount > 0)
    .sort((a, b) => b.dependentCount - a.dependentCount);

  // 核心模块标准：
  // 1. 被至少3个文件依赖
  // 2. 或者被依赖次数在前20%
  const minDependents = Math.max(3, Math.ceil(files.length * 0.05));
  const top20Percent = Math.ceil(modulesByDependents.length * 0.2);

  const coreModules = modulesByDependents
    .slice(0, Math.max(top20Percent, 10))
    .filter(module => module.dependentCount >= Math.min(minDependents, 3))
    .map(module => module.path);

  return coreModules;
}

/**
 * 识别工具模块（通常在utils、helpers目录，被多处引用）
 */
function identifyUtilityModules(files: FileInfo[]): string[] {
  const utilityDirs = ['utils', 'helpers', 'lib', 'common', 'shared', 'constants'];

  return files
    .filter(file => {
      const inUtilityDir = utilityDirs.some(dir => file.directory.includes(dir));
      const hasMultipleDependents = file.dependents.length >= 2;
      return inUtilityDir && hasMultipleDependents;
    })
    .map(file => file.relativePath);
}

/**
 * 识别叶子模块（不被其他文件依赖的功能模块）
 */
function identifyLeafModules(files: FileInfo[]): string[] {
  return files
    .filter(file =>
      file.dependents.length === 0 &&
      file.dependencies.length > 0 &&
      !file.relativePath.includes('entrypoint')
    )
    .map(file => file.relativePath);
}

/**
 * 生成推荐的代码阅读顺序
 */
function generateReadingOrder(
  files: FileInfo[],
  entryPoints: string[],
  coreModules: string[]
): string[] {
  const readingOrder: string[] = [];
  const visited = new Set<string>();

  // 辅助函数：基于依赖关系进行拓扑排序
  function topologicalSort(startFiles: string[]): string[] {
    const result: string[] = [];
    const temp = new Set<string>();
    const perm = new Set<string>();

    function visit(filePath: string) {
      if (perm.has(filePath)) return;
      if (temp.has(filePath)) return; // 循环依赖，跳过

      temp.add(filePath);

      const file = files.find(f => f.relativePath === filePath);
      if (file) {
        // 先访问依赖
        file.dependencies.forEach(dep => {
          if (files.some(f => f.relativePath === dep)) {
            visit(dep);
          }
        });
      }

      temp.delete(filePath);
      perm.add(filePath);
      result.push(filePath);
    }

    startFiles.forEach(file => {
      if (!perm.has(file)) {
        visit(file);
      }
    });

    return result;
  }

  // 1. 从主要入口点开始
  const mainEntryPoints = entryPoints.filter(entry =>
    entry.includes('cli') || entry.includes('main') || entry.includes('index')
  );

  if (mainEntryPoints.length > 0) {
    const entryOrder = topologicalSort(mainEntryPoints);
    readingOrder.push(...entryOrder);
    entryOrder.forEach(file => visited.add(file));
  }

  // 2. 核心模块（按重要性排序）
  const unvisitedCoreModules = coreModules.filter(module => !visited.has(module));
  readingOrder.push(...unvisitedCoreModules);
  unvisitedCoreModules.forEach(file => visited.add(file));

  // 3. 剩余的入口点
  const remainingEntryPoints = entryPoints.filter(entry => !visited.has(entry));
  readingOrder.push(...remainingEntryPoints);
  remainingEntryPoints.forEach(file => visited.add(file));

  // 4. 按目录结构和依赖关系排序剩余文件
  const remainingFiles = files
    .filter(file => !visited.has(file.relativePath))
    .sort((a, b) => {
      // 优先级：services > components > utils > others
      const priorityDirs = ['services', 'components', 'utils', 'tools', 'screens'];
      const aPriority = priorityDirs.findIndex(dir => a.directory.includes(dir));
      const bPriority = priorityDirs.findIndex(dir => b.directory.includes(dir));

      if (aPriority !== bPriority) {
        return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
      }

      // 相同目录内按依赖数排序
      return b.dependents.length - a.dependents.length;
    })
    .map(file => file.relativePath);

  readingOrder.push(...remainingFiles);

  return readingOrder;
}

/**
 * 综合分析项目模块结构
 */
function analyzeProjectModules(files: FileInfo[], dependencyGraph: DependencyGraph): ModuleAnalysis {
  const entryPoints = identifyEntryPointsByDependencies(files, dependencyGraph);
  const coreModules = identifyCoreModules(files);
  const utilityModules = identifyUtilityModules(files);
  const leafModules = identifyLeafModules(files);
  const readingOrder = generateReadingOrder(files, entryPoints, coreModules);

  return {
    entryPoints,
    coreModules,
    utilityModules,
    leafModules,
    readingOrder
  };
}

/**
 * 解析import路径为实际文件路径
 */
function resolveImportPath(importSource: string, currentFilePath: string, allFiles: FileInfo[]): string | null {
  // 跳过非相对路径的导入 (node_modules, 内置模块等)
  if (!importSource.startsWith('.')) {
    return null;
  }

  const currentDir = path.dirname(currentFilePath);
  const resolvedPath = path.resolve(currentDir, importSource);

  // 尝试不同的扩展名
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

  for (const ext of extensions) {
    const fullPath = resolvedPath + ext;
    const file = allFiles.find(f => f.path === fullPath);
    if (file) {
      return file.relativePath;
    }
  }

  return null;
}

/**
 * 计算文件间的依赖关系
 */
function calculateDependencies(files: FileInfo[]): { files: FileInfo[], dependencyGraph: DependencyGraph } {
  const dependencyGraph: DependencyGraph = {};

  // 初始化依赖图
  files.forEach(file => {
    dependencyGraph[file.relativePath] = [];
  });

  // 计算每个文件的依赖
  files.forEach(file => {
    file.imports.forEach(importInfo => {
      const resolvedPath = resolveImportPath(importInfo.source, file.path, files);
      if (resolvedPath) {
        // 添加到dependencies
        if (!file.dependencies.includes(resolvedPath)) {
          file.dependencies.push(resolvedPath);
        }

        // 添加到依赖图
        if (!dependencyGraph[file.relativePath].includes(resolvedPath)) {
          dependencyGraph[file.relativePath].push(resolvedPath);
        }

        // 添加到被依赖文件的dependents
        const dependentFile = files.find(f => f.relativePath === resolvedPath);
        if (dependentFile && !dependentFile.dependents.includes(file.relativePath)) {
          dependentFile.dependents.push(file.relativePath);
        }
      }
    });
  });

  return { files, dependencyGraph };
}

/**
 * 获取所有唯一的目录路径
 */
function getDirectories(files: FileInfo[]): string[] {
  const directories = new Set<string>();

  for (const file of files) {
    const dir = file.directory;
    if (dir && dir !== '.') {
      directories.add(dir);

      // 添加父目录
      const parts = dir.split('/');
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    }
  }

  return Array.from(directories).sort();
}

/**
 * 主函数：扫描项目架构
 */
async function generateProjectStructure(): Promise<void> {
  try {
    const projectRoot = process.cwd();
    const srcPath = path.join(projectRoot, 'src');

    console.log('🔍 开始扫描项目架构...');
    console.log(`📁 项目根目录: ${projectRoot}`);
    console.log(`📂 源码目录: ${srcPath}`);

    // 检查src目录是否存在
    try {
      await fs.access(srcPath);
    } catch {
      console.error('❌ 错误: src目录不存在');
      process.exit(1);
    }

    // 扫描所有TypeScript文件
    const scannedFiles = await scanDirectory(srcPath, projectRoot);

    console.log('🔍 计算文件依赖关系...');

    // 计算依赖关系
    const { files, dependencyGraph } = calculateDependencies(scannedFiles);

    console.log('🧠 分析模块结构和入口点...');

    // 综合分析项目模块结构
    const moduleAnalysis = analyzeProjectModules(files, dependencyGraph);

    // 获取目录结构
    const directories = getDirectories(files);

    // 生成项目结构数据
    const structure: ProjectStructure = {
      files,
      totalFiles: files.length,
      directories,
      entryPoints: moduleAnalysis.entryPoints,
      coreModules: moduleAnalysis.coreModules,
      utilityModules: moduleAnalysis.utilityModules,
      leafModules: moduleAnalysis.leafModules,
      readingOrder: moduleAnalysis.readingOrder,
      dependencyGraph,
      moduleAnalysis,
      scannedAt: new Date().toISOString()
    };

    // 计算依赖关系统计
    const totalDependencies = Object.values(dependencyGraph).reduce((sum, deps) => sum + deps.length, 0);
    const filesWithDependencies = Object.values(dependencyGraph).filter(deps => deps.length > 0).length;
    const maxDependencies = Math.max(...Object.values(dependencyGraph).map(deps => deps.length));

    // 计算代码统计
    const totalLines = files.reduce((sum, file) => sum + file.lineCount, 0);
    const totalFunctions = files.reduce((sum, file) => sum + file.functions.length, 0);
    const totalClasses = files.reduce((sum, file) => sum + file.classes.length, 0);
    const totalInterfaces = files.reduce((sum, file) => sum + file.interfaces.length, 0);
    const totalTypes = files.reduce((sum, file) => sum + file.types.length, 0);
    const filesWithComments = files.filter(file => file.comments.fileHeader || file.comments.description).length;

    // 复杂度分布
    const complexityStats = {
      high: files.filter(f => f.complexity === 'high').length,
      medium: files.filter(f => f.complexity === 'medium').length,
      low: files.filter(f => f.complexity === 'low').length
    };

    // 输出统计信息
    console.log('\n📊 扫描结果统计:');
    console.log(`   📄 TypeScript文件总数: ${structure.totalFiles}`);
    console.log(`   📁 目录总数: ${structure.directories.length}`);
    console.log(`   📝 代码总行数: ${totalLines.toLocaleString()}`);
    console.log(`   📊 文件复杂度: 高 ${complexityStats.high} | 中 ${complexityStats.medium} | 低 ${complexityStats.low}`);
    console.log(`   🚪 识别的入口点: ${structure.entryPoints.length}`);
    console.log(`   🏗️  核心模块: ${structure.coreModules.length}`);
    console.log(`   🔧 工具模块: ${structure.utilityModules.length}`);
    console.log(`   🍃 叶子模块: ${structure.leafModules.length}`);
    console.log(`   🔗 依赖关系总数: ${totalDependencies}`);
    console.log(`   📦 有依赖的文件: ${filesWithDependencies}/${structure.totalFiles}`);
    console.log(`   📈 最大依赖数: ${maxDependencies}`);
    console.log(`   💬 有注释的文件: ${filesWithComments}/${structure.totalFiles} (${Math.round(filesWithComments/structure.totalFiles*100)}%)`);

    console.log('\n📈 代码结构统计:');
    console.log(`   🔧 函数总数: ${totalFunctions}`);
    console.log(`   🏗️  类总数: ${totalClasses}`);
    console.log(`   📋 接口总数: ${totalInterfaces}`);
    console.log(`   🏷️  类型定义: ${totalTypes}`);

    if (structure.entryPoints.length > 0) {
      console.log('\n🚪 发现的入口点文件:');
      structure.entryPoints.forEach(entry => {
        console.log(`   • ${entry}`);
      });
    }

    if (structure.coreModules.length > 0) {
      console.log('\n🏗️  核心模块 (被多个文件依赖):');
      structure.coreModules.slice(0, 8).forEach(module => {
        const file = files.find(f => f.relativePath === module);
        if (file) {
          console.log(`   • ${module} (${file.dependents.length}个依赖者)`);
        }
      });
    }

    if (structure.utilityModules.length > 0) {
      console.log('\n🔧 工具模块:');
      structure.utilityModules.slice(0, 5).forEach(module => {
        console.log(`   • ${module}`);
      });
    }

    // 显示推荐的阅读顺序（前10个）
    if (structure.readingOrder.length > 0) {
      console.log('\n📖 推荐的代码阅读顺序 (前10个文件):');
      structure.readingOrder.slice(0, 10).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file}`);
      });
    }

    // 输出文件到JSON
    const outputPath = path.join(projectRoot, '.taskmaster', 'reports', 'project-structure.json');

    // 确保输出目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // 写入文件
    await fs.writeFile(outputPath, JSON.stringify(structure, null, 2));

    console.log(`\n✅ 项目结构已保存到: ${outputPath}`);
    console.log('\n🎉 扫描完成！');

  } catch (error) {
    console.error('❌ 扫描过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  generateProjectStructure();
}

export { generateProjectStructure, scanDirectory, FileInfo, ProjectStructure };