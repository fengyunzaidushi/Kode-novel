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
}

interface DependencyGraph {
  [filePath: string]: string[]; // 文件 -> 它依赖的文件列表
}

interface ProjectStructure {
  files: FileInfo[];
  totalFiles: number;
  directories: string[];
  entryPoints: string[];
  dependencyGraph: DependencyGraph;
  scannedAt: string;
}

/**
 * 解析TypeScript文件的AST并提取import/export信息
 */
async function parseFileAST(filePath: string): Promise<{ imports: ImportInfo[], exports: ExportInfo[] }> {
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
          type: 'default'
        });
      }

      ts.forEachChild(node, visitNode);
    }

    visitNode(sourceFile);

    return { imports, exports };
  } catch (error) {
    console.warn(`警告: 无法解析文件 ${filePath}:`, error);
    return { imports: [], exports: [] };
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
          // 解析AST获取import/export信息
          const { imports, exports } = await parseFileAST(fullPath);

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
            dependents: [] // 稍后计算
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

/**
 * 识别可能的入口点文件
 */
function identifyEntryPoints(files: FileInfo[]): string[] {
  const entryPoints: string[] = [];

  // 常见的入口点文件名模式
  const entryPatterns = [
    /^index\.(ts|tsx|mts|cts)$/,
    /^main\.(ts|tsx|mts|cts)$/,
    /^app\.(ts|tsx|mts|cts)$/,
    /^cli\.(ts|tsx|mts|cts)$/,
    /^server\.(ts|tsx|mts|cts)$/,
    /entrypoint/i,
    /entry/i
  ];

  for (const file of files) {
    const fileName = file.name;
    const isEntryFile = entryPatterns.some(pattern => pattern.test(fileName));

    if (isEntryFile) {
      entryPoints.push(file.relativePath);
    }
  }

  return entryPoints;
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

    // 识别入口点
    const entryPoints = identifyEntryPoints(files);

    // 获取目录结构
    const directories = getDirectories(files);

    // 生成项目结构数据
    const structure: ProjectStructure = {
      files,
      totalFiles: files.length,
      directories,
      entryPoints,
      dependencyGraph,
      scannedAt: new Date().toISOString()
    };

    // 计算依赖关系统计
    const totalDependencies = Object.values(dependencyGraph).reduce((sum, deps) => sum + deps.length, 0);
    const filesWithDependencies = Object.values(dependencyGraph).filter(deps => deps.length > 0).length;
    const maxDependencies = Math.max(...Object.values(dependencyGraph).map(deps => deps.length));

    // 输出统计信息
    console.log('\n📊 扫描结果统计:');
    console.log(`   📄 TypeScript文件总数: ${structure.totalFiles}`);
    console.log(`   📁 目录总数: ${structure.directories.length}`);
    console.log(`   🚪 识别的入口点: ${structure.entryPoints.length}`);
    console.log(`   🔗 依赖关系总数: ${totalDependencies}`);
    console.log(`   📦 有依赖的文件: ${filesWithDependencies}/${structure.totalFiles}`);
    console.log(`   📈 最大依赖数: ${maxDependencies}`);

    if (structure.entryPoints.length > 0) {
      console.log('\n🚪 发现的入口点文件:');
      structure.entryPoints.forEach(entry => {
        console.log(`   • ${entry}`);
      });
    }

    // 显示依赖关系最复杂的几个文件
    const sortedByDependencies = Object.entries(dependencyGraph)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 5);

    if (sortedByDependencies.length > 0 && sortedByDependencies[0][1].length > 0) {
      console.log('\n🔗 依赖关系最复杂的文件:');
      sortedByDependencies.forEach(([file, deps]) => {
        if (deps.length > 0) {
          console.log(`   • ${file} (${deps.length}个依赖)`);
        }
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