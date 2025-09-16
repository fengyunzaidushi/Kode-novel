#!/usr/bin/env node
/**
 * 🎯 文件依赖关系分析器
 * 分析TypeScript/TSX文件之间的import/export依赖关系
 *
 * 功能：
 * - 解析文件的import语句，建立依赖图
 * - 识别核心基础文件和叶子文件
 * - 生成注释优先级建议
 * - 创建依赖关系可视化数据
 */

const fs = require('fs');
const path = require('path');

// 文件路径配置
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const PROGRESS_FILE = path.join(__dirname, '../docs/annotation-progress.json');
const DEPENDENCIES_FILE = path.join(__dirname, '../docs/file-dependencies.json');

/**
 * 解析单个文件的import依赖
 * @param {string} filePath - 文件完整路径
 * @returns {Object} 文件依赖信息
 */
function analyzeFileImports(filePath) {
  const relativePath = path.relative(SRC_DIR, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  const dependencies = {
    path: relativePath,
    fullPath: filePath,
    imports: [],      // 该文件导入的其他文件
    importedBy: [],   // 导入该文件的其他文件
    externalImports: [], // 外部库导入
    internalImports: [], // 项目内部导入
    dependencyCount: 0,
    dependentCount: 0
  };

  // 匹配import语句的正则表达式
  const importPatterns = [
    // import ... from './path'
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    // import './path'
    /import\s+['"]([^'"]+)['"]/g,
    // const ... = require('./path')
    /(?:const|let|var)\s+.*?\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  // 解析所有import语句
  importPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      // 跳过类型导入和注释中的import
      const beforeImport = content.substring(0, match.index);
      const lineStart = beforeImport.lastIndexOf('\n');
      const line = content.substring(lineStart, match.index + match[0].length);

      if (line.includes('//') || line.includes('/*') || importPath.includes('@types')) {
        continue;
      }

      if (importPath.startsWith('.')) {
        // 相对路径 - 项目内部依赖
        const resolvedPath = resolveRelativeImport(filePath, importPath);
        if (resolvedPath) {
          dependencies.internalImports.push({
            importPath: importPath,
            resolvedPath: resolvedPath,
            relativePath: path.relative(SRC_DIR, resolvedPath)
          });
        }
      } else if (!importPath.startsWith('@') && !importPath.includes('node_modules')) {
        // 可能是绝对路径的内部导入
        dependencies.internalImports.push({
          importPath: importPath,
          resolvedPath: null,
          relativePath: importPath
        });
      } else {
        // 外部库依赖
        dependencies.externalImports.push(importPath);
      }
    }
  });

  dependencies.dependencyCount = dependencies.internalImports.length;
  dependencies.imports = dependencies.internalImports.map(imp => imp.relativePath);

  return dependencies;
}

/**
 * 解析相对路径导入
 * @param {string} currentFile - 当前文件路径
 * @param {string} importPath - import路径
 * @returns {string|null} 解析后的完整路径
 */
function resolveRelativeImport(currentFile, importPath) {
  const currentDir = path.dirname(currentFile);
  let targetPath = path.resolve(currentDir, importPath);

  // 尝试不同的文件扩展名
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  // 首先尝试直接路径
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  // 尝试添加扩展名
  for (const ext of extensions) {
    const pathWithExt = targetPath + ext;
    if (fs.existsSync(pathWithExt)) {
      return pathWithExt;
    }
  }

  // 尝试index文件
  for (const ext of extensions) {
    const indexPath = path.join(targetPath, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * 递归获取所有TypeScript文件
 * @param {string} dir - 目录路径
 * @returns {string[]} 文件路径数组
 */
function getAllTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 构建完整的依赖关系图
 * @returns {Object} 依赖关系图数据
 */
function buildDependencyGraph() {
  console.log('🔍 分析文件依赖关系...');

  const allFiles = getAllTsFiles(SRC_DIR);
  console.log(`📁 发现 ${allFiles.length} 个文件`);

  // 第一步：分析每个文件的import依赖
  const fileAnalyses = new Map();
  const pathToAnalysis = new Map();

  allFiles.forEach(filePath => {
    const analysis = analyzeFileImports(filePath);
    fileAnalyses.set(filePath, analysis);
    pathToAnalysis.set(analysis.path, analysis);
  });

  // 第二步：建立反向依赖关系 (importedBy)
  fileAnalyses.forEach((analysis, filePath) => {
    analysis.internalImports.forEach(imp => {
      const targetAnalysis = pathToAnalysis.get(imp.relativePath);
      if (targetAnalysis) {
        targetAnalysis.importedBy.push(analysis.path);
        targetAnalysis.dependentCount++;
      }
    });
  });

  // 第三步：计算文件重要性得分
  const fileImportanceScores = new Map();
  fileAnalyses.forEach((analysis, filePath) => {
    const score = calculateImportanceScore(analysis);
    fileImportanceScores.set(analysis.path, score);
  });

  // 第四步：生成依赖图数据
  const dependencyGraph = {
    metadata: {
      totalFiles: allFiles.length,
      analysisDate: new Date().toISOString(),
      srcDirectory: path.relative(PROJECT_ROOT, SRC_DIR)
    },
    files: Array.from(fileAnalyses.values()).map(analysis => ({
      ...analysis,
      importanceScore: fileImportanceScores.get(analysis.path) || 0
    })),
    statistics: generateDependencyStatistics(fileAnalyses, fileImportanceScores),
    annotationPriority: generateAnnotationPriority(fileAnalyses, fileImportanceScores)
  };

  return dependencyGraph;
}

/**
 * 计算文件重要性得分
 * @param {Object} analysis - 文件分析结果
 * @returns {number} 重要性得分
 */
function calculateImportanceScore(analysis) {
  let score = 0;

  // 被依赖数量得分 (被更多文件依赖的更重要)
  score += analysis.dependentCount * 3;

  // 文件位置得分 (更靠近根目录的更重要)
  const pathDepth = analysis.path.split(/[\\/]/).length;
  score += Math.max(0, 10 - pathDepth);

  // 文件类型得分
  if (analysis.path.includes('entrypoints/') || analysis.path === 'Tool.ts') {
    score += 20; // 入口点文件
  } else if (analysis.path.includes('types/') || analysis.path.includes('constants/')) {
    score += 15; // 类型和常量文件
  } else if (analysis.path.includes('services/')) {
    score += 12; // 服务文件
  } else if (analysis.path.includes('utils/')) {
    score += 8; // 工具文件
  } else if (analysis.path.includes('components/')) {
    score += 5; // 组件文件
  }

  // 文件名模式得分
  if (analysis.path.endsWith('/index.ts') || analysis.path.endsWith('/index.tsx')) {
    score += 10; // index文件通常是模块入口
  }

  return score;
}

/**
 * 生成依赖关系统计
 * @param {Map} fileAnalyses - 文件分析结果
 * @param {Map} importanceScores - 重要性得分
 * @returns {Object} 统计信息
 */
function generateDependencyStatistics(fileAnalyses, importanceScores) {
  const files = Array.from(fileAnalyses.values());

  const dependencyCounts = files.map(f => f.dependencyCount);
  const dependentCounts = files.map(f => f.dependentCount);
  const scores = Array.from(importanceScores.values());

  // 找出重要文件
  const topImportantFiles = files
    .sort((a, b) => (importanceScores.get(b.path) || 0) - (importanceScores.get(a.path) || 0))
    .slice(0, 10);

  const mostDependedFiles = files
    .filter(f => f.dependentCount > 0)
    .sort((a, b) => b.dependentCount - a.dependentCount)
    .slice(0, 10);

  const leafFiles = files.filter(f => f.dependentCount === 0);

  return {
    totalFiles: files.length,
    averageDependencies: (dependencyCounts.reduce((a, b) => a + b, 0) / files.length).toFixed(2),
    averageDependents: (dependentCounts.reduce((a, b) => a + b, 0) / files.length).toFixed(2),
    maxDependencies: Math.max(...dependencyCounts),
    maxDependents: Math.max(...dependentCounts),
    filesWithNoDependencies: files.filter(f => f.dependencyCount === 0).length,
    filesWithNoDependents: leafFiles.length,
    topImportantFiles: topImportantFiles.map(f => ({
      path: f.path,
      score: importanceScores.get(f.path),
      dependents: f.dependentCount,
      dependencies: f.dependencyCount
    })),
    mostDependedFiles: mostDependedFiles.map(f => ({
      path: f.path,
      dependentCount: f.dependentCount,
      importanceScore: importanceScores.get(f.path)
    })),
    leafFiles: leafFiles.map(f => f.path)
  };
}

/**
 * 生成注释优先级建议
 * @param {Map} fileAnalyses - 文件分析结果
 * @param {Map} importanceScores - 重要性得分
 * @returns {Object} 优先级建议
 */
function generateAnnotationPriority(fileAnalyses, importanceScores) {
  const files = Array.from(fileAnalyses.values());

  // 按重要性得分排序
  const prioritizedFiles = files
    .map(f => ({
      ...f,
      importanceScore: importanceScores.get(f.path) || 0
    }))
    .sort((a, b) => b.importanceScore - a.importanceScore);

  // 分级建议
  const priority = {
    critical: [], // 得分 >= 30
    high: [],     // 得分 >= 20
    medium: [],   // 得分 >= 10
    low: []       // 得分 < 10
  };

  prioritizedFiles.forEach(file => {
    const item = {
      path: file.path,
      score: file.importanceScore,
      dependents: file.dependentCount,
      reason: generatePriorityReason(file)
    };

    if (file.importanceScore >= 30) {
      priority.critical.push(item);
    } else if (file.importanceScore >= 20) {
      priority.high.push(item);
    } else if (file.importanceScore >= 10) {
      priority.medium.push(item);
    } else {
      priority.low.push(item);
    }
  });

  return {
    ...priority,
    recommendedOrder: prioritizedFiles.slice(0, 20).map(f => ({
      path: f.path,
      score: f.importanceScore,
      category: getFileCategoryFromPath(f.path)
    }))
  };
}

/**
 * 生成优先级理由
 * @param {Object} file - 文件信息
 * @returns {string} 优先级理由
 */
function generatePriorityReason(file) {
  const reasons = [];

  if (file.dependentCount > 10) {
    reasons.push(`被${file.dependentCount}个文件依赖`);
  } else if (file.dependentCount > 5) {
    reasons.push(`被${file.dependentCount}个文件依赖`);
  } else if (file.dependentCount > 0) {
    reasons.push(`被${file.dependentCount}个文件依赖`);
  }

  if (file.path.includes('entrypoints/') || file.path === 'Tool.ts') {
    reasons.push('项目入口点');
  } else if (file.path.includes('types/')) {
    reasons.push('类型定义文件');
  } else if (file.path.includes('constants/')) {
    reasons.push('常量定义文件');
  } else if (file.path.includes('services/')) {
    reasons.push('核心服务文件');
  }

  if (file.path.endsWith('/index.ts') || file.path.endsWith('/index.tsx')) {
    reasons.push('模块入口文件');
  }

  return reasons.length > 0 ? reasons.join(', ') : '基础文件';
}

/**
 * 从路径获取文件分类
 * @param {string} filePath - 文件路径
 * @returns {string} 文件分类
 */
function getFileCategoryFromPath(filePath) {
  if (filePath.includes('entrypoints/') || filePath === 'Tool.ts') {
    return 'entry_points';
  } else if (filePath.includes('types/')) {
    return 'types';
  } else if (filePath.includes('constants/')) {
    return 'constants';
  } else if (filePath.includes('services/')) {
    return 'services';
  } else if (filePath.includes('tools/')) {
    return 'tools';
  } else if (filePath.includes('components/')) {
    return 'components';
  } else if (filePath.includes('utils/') || filePath.includes('hooks/')) {
    return 'utilities';
  } else {
    return 'utilities';
  }
}

/**
 * 主分析函数
 */
async function analyzeDependencies() {
  try {
    // 构建依赖关系图
    const dependencyGraph = buildDependencyGraph();

    // 保存依赖关系数据
    fs.writeFileSync(DEPENDENCIES_FILE, JSON.stringify(dependencyGraph, null, 2));

    // 生成报告
    console.log('\n📊 文件依赖关系分析报告');
    console.log('========================');
    console.log(`总文件数: ${dependencyGraph.statistics.totalFiles}`);
    console.log(`平均依赖数: ${dependencyGraph.statistics.averageDependencies}`);
    console.log(`平均被依赖数: ${dependencyGraph.statistics.averageDependents}`);
    console.log(`叶子文件数 (无被依赖): ${dependencyGraph.statistics.filesWithNoDependents}`);
    console.log(`独立文件数 (无依赖): ${dependencyGraph.statistics.filesWithNoDependencies}`);

    console.log('\n🎯 注释优先级建议:');
    console.log(`关键文件 (critical): ${dependencyGraph.annotationPriority.critical.length}个`);
    console.log(`高优先级 (high): ${dependencyGraph.annotationPriority.high.length}个`);
    console.log(`中等优先级 (medium): ${dependencyGraph.annotationPriority.medium.length}个`);
    console.log(`低优先级 (low): ${dependencyGraph.annotationPriority.low.length}个`);

    console.log('\n🔝 最重要的10个文件:');
    dependencyGraph.statistics.topImportantFiles.forEach((file, i) => {
      console.log(`${i+1}. ${file.path} (得分: ${file.score}, 被依赖: ${file.dependents}次)`);
    });

    console.log(`\n✅ 依赖关系分析完成！数据已保存至: ${DEPENDENCIES_FILE}`);

    return dependencyGraph;
  } catch (error) {
    console.error('❌ 依赖关系分析失败:', error.message);
    throw error;
  }
}

// 主执行
if (require.main === module) {
  analyzeDependencies().catch(console.error);
}

module.exports = { analyzeDependencies, buildDependencyGraph };