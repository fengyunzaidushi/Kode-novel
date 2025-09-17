#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';

interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  directory: string;
  level: number;
}

interface ProjectStructure {
  files: FileInfo[];
  totalFiles: number;
  directories: string[];
  entryPoints: string[];
  scannedAt: string;
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
          files.push({
            path: fullPath,
            relativePath: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
            name: entry.name,
            extension: path.extname(entry.name),
            directory: path.dirname(relativePath).replace(/\\/g, '/'),
            level
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
    const files = await scanDirectory(srcPath, projectRoot);

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
      scannedAt: new Date().toISOString()
    };

    // 输出统计信息
    console.log('\n📊 扫描结果统计:');
    console.log(`   📄 TypeScript文件总数: ${structure.totalFiles}`);
    console.log(`   📁 目录总数: ${structure.directories.length}`);
    console.log(`   🚪 识别的入口点: ${structure.entryPoints.length}`);

    if (structure.entryPoints.length > 0) {
      console.log('\n🚪 发现的入口点文件:');
      structure.entryPoints.forEach(entry => {
        console.log(`   • ${entry}`);
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