#!/usr/bin/env node
/**
 * 🎯 注释状态分析脚本
 * 分析src目录下所有TypeScript/TSX文件的注释状态
 *
 * 功能：
 * - 扫描所有.ts/.tsx文件
 * - 分析文件头注释状态
 * - 检查函数和类的JSDoc注释
 * - 统计注释覆盖率
 * - 生成详细报告
 */

const fs = require('fs');
const path = require('path');

// 项目根目录和配置
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const PROGRESS_FILE = path.join(__dirname, '../docs/annotation-progress.json');

/**
 * 分析单个文件的注释状态
 * @param {string} filePath - 文件路径
 * @returns {Object} 注释状态分析结果
 */
function analyzeFileAnnotations(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(SRC_DIR, filePath);

  const analysis = {
    path: relativePath,
    fullPath: filePath,
    hasFileHeader: false,
    hasChineseComments: false,
    functionCount: 0,
    annotatedFunctions: 0,
    classCount: 0,
    annotatedClasses: 0,
    interfaceCount: 0,
    annotatedInterfaces: 0,
    commentLines: 0,
    totalLines: content.split('\n').length,
    category: categorizeFile(relativePath),
    priority: getPriorityLevel(relativePath),
    status: 'pending'
  };

  // 检查文件头注释
  const lines = content.split('\n');
  const firstNonEmptyLines = lines.slice(0, 10).join('\n');

  // 检查是否有文件头注释（包含emoji或描述性注释）
  if (firstNonEmptyLines.includes('/**') ||
      firstNonEmptyLines.includes('//') ||
      /[🎯🏗️🔄📊📈⚡🛡️🎨🔧]/u.test(firstNonEmptyLines)) {
    analysis.hasFileHeader = true;
  }

  // 检查中文注释
  if (/[\u4e00-\u9fff]/.test(content)) {
    analysis.hasChineseComments = true;
  }

  // 统计注释行数
  analysis.commentLines = lines.filter(line =>
    line.trim().startsWith('//') ||
    line.trim().startsWith('*') ||
    line.trim().startsWith('/**') ||
    line.trim().startsWith('*/')
  ).length;

  // 分析函数注释
  const functionMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+/g) || [];
  const arrowFunctionMatches = content.match(/(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?\(/g) || [];
  analysis.functionCount = functionMatches.length + arrowFunctionMatches.length;

  // 分析类注释
  const classMatches = content.match(/(?:export\s+)?class\s+\w+/g) || [];
  analysis.classCount = classMatches.length;

  // 分析接口注释
  const interfaceMatches = content.match(/(?:export\s+)?interface\s+\w+/g) || [];
  analysis.interfaceCount = interfaceMatches.length;

  // 简单估算注释覆盖情况（基于JSDoc模式）
  const jsdocMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
  analysis.annotatedFunctions = Math.min(jsdocMatches.length, analysis.functionCount);
  analysis.annotatedClasses = Math.min(jsdocMatches.length - analysis.annotatedFunctions, analysis.classCount);
  analysis.annotatedInterfaces = Math.min(jsdocMatches.length - analysis.annotatedFunctions - analysis.annotatedClasses, analysis.interfaceCount);

  // 确定文件状态
  if (analysis.hasFileHeader && analysis.hasChineseComments && analysis.commentLines > 5) {
    analysis.status = 'complete';
  } else if (analysis.hasFileHeader || analysis.hasChineseComments) {
    analysis.status = 'in-progress';
  } else {
    analysis.status = 'pending';
  }

  return analysis;
}

/**
 * 根据文件路径分类
 * @param {string} filePath - 相对文件路径
 * @returns {string} 文件分类
 */
function categorizeFile(filePath) {
  const path_lower = filePath.toLowerCase();

  if (path_lower.includes('entrypoints/') || path_lower === 'tool.ts') {
    return 'entry_points';
  } else if (path_lower.includes('types/') || path_lower === 'types.ts') {
    return 'types';
  } else if (path_lower.includes('constants/')) {
    return 'constants';
  } else if (path_lower.includes('services/')) {
    return 'services';
  } else if (path_lower.includes('tools/')) {
    return 'tools';
  } else if (path_lower.includes('components/')) {
    return 'components';
  } else if (path_lower.includes('utils/') || path_lower.includes('hooks/')) {
    return 'utilities';
  } else if (path_lower.includes('screens/') || path_lower === 'context.ts') {
    return 'core_interfaces';
  } else {
    return 'utilities';
  }
}

/**
 * 获取文件优先级
 * @param {string} filePath - 相对文件路径
 * @returns {string} 优先级级别
 */
function getPriorityLevel(filePath) {
  const category = categorizeFile(filePath);

  const priorityMap = {
    'entry_points': 'critical',
    'core_interfaces': 'critical',
    'services': 'high',
    'tools': 'high',
    'components': 'medium',
    'utilities': 'medium',
    'types': 'medium',
    'constants': 'low'
  };

  return priorityMap[category] || 'medium';
}

/**
 * 递归获取所有TypeScript/TSX文件
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
 * 主分析函数
 */
async function analyzeAnnotationProgress() {
  console.log('🔍 开始分析注释状态...');

  // 获取所有TypeScript/TSX文件
  const allFiles = getAllTsFiles(SRC_DIR);
  const files = allFiles.map(f => path.relative(SRC_DIR, f));

  console.log(`📁 发现 ${files.length} 个文件`);

  // 分析每个文件
  const analyses = [];
  const categoryStats = {};
  const statusStats = { pending: 0, 'in-progress': 0, complete: 0, 'needs-review': 0, reviewed: 0 };

  for (const file of files) {
    const fullPath = path.join(SRC_DIR, file);
    const analysis = analyzeFileAnnotations(fullPath);
    analyses.push(analysis);

    // 统计分类
    if (!categoryStats[analysis.category]) {
      categoryStats[analysis.category] = { total: 0, complete: 0, files: [] };
    }
    categoryStats[analysis.category].total++;
    categoryStats[analysis.category].files.push(analysis);

    if (analysis.status === 'complete') {
      categoryStats[analysis.category].complete++;
    }

    // 统计状态
    statusStats[analysis.status]++;
  }

  // 加载现有进度文件
  let progressData;
  try {
    progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch (error) {
    console.error('❌ 无法读取进度文件，将创建新文件');
    return;
  }

  // 更新进度数据
  progressData.projectInfo.totalFiles = files.length;
  progressData.projectInfo.lastUpdated = new Date().toISOString();

  // 更新统计信息
  progressData.progressStats = {
    total: files.length,
    pending: statusStats.pending,
    inProgress: statusStats['in-progress'],
    complete: statusStats.complete,
    needsReview: statusStats['needs-review'],
    reviewed: statusStats.reviewed,
    completionRate: ((statusStats.complete / files.length) * 100).toFixed(1) + '%'
  };

  // 更新文件分类
  for (const [category, data] of Object.entries(categoryStats)) {
    if (progressData.fileCategories[category]) {
      progressData.fileCategories[category].files = data.files;
    }
  }

  // 创建文件跟踪映射
  progressData.fileTracking = {};
  analyses.forEach(analysis => {
    progressData.fileTracking[analysis.path] = {
      status: analysis.status,
      category: analysis.category,
      priority: analysis.priority,
      hasFileHeader: analysis.hasFileHeader,
      hasChineseComments: analysis.hasChineseComments,
      commentLines: analysis.commentLines,
      totalLines: analysis.totalLines,
      commentRatio: (analysis.commentLines / analysis.totalLines * 100).toFixed(1) + '%',
      lastAnalyzed: new Date().toISOString()
    };
  });

  // 保存更新的进度文件
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));

  // 生成报告
  console.log('\n📊 注释状态分析报告');
  console.log('==================');
  console.log(`总文件数: ${files.length}`);
  console.log(`已完成注释: ${statusStats.complete} (${((statusStats.complete / files.length) * 100).toFixed(1)}%)`);
  console.log(`注释进行中: ${statusStats['in-progress']} (${((statusStats['in-progress'] / files.length) * 100).toFixed(1)}%)`);
  console.log(`待注释: ${statusStats.pending} (${((statusStats.pending / files.length) * 100).toFixed(1)}%)`);

  console.log('\n📂 按分类统计:');
  Object.entries(categoryStats).forEach(([category, data]) => {
    const completionRate = (data.complete / data.total * 100).toFixed(1);
    console.log(`  ${category}: ${data.complete}/${data.total} (${completionRate}%)`);
  });

  console.log(`\n✅ 分析完成！进度数据已更新至: ${PROGRESS_FILE}`);

  // 输出需要优先注释的文件
  const priorityFiles = analyses.filter(a => a.priority === 'critical' && a.status === 'pending');
  if (priorityFiles.length > 0) {
    console.log('\n🚨 优先注释文件列表:');
    priorityFiles.forEach(file => {
      console.log(`  - ${file.path} (${file.category})`);
    });
  }
}

// 运行分析
if (require.main === module) {
  analyzeAnnotationProgress().catch(console.error);
}

module.exports = { analyzeAnnotationProgress, analyzeFileAnnotations };