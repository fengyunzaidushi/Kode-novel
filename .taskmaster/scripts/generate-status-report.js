#!/usr/bin/env node
/**
 * 🎯 注释状态详细报告生成器
 * 基于分析数据生成详细的注释进度报告
 *
 * 功能：
 * - 生成按优先级和分类排序的待注释文件清单
 * - 统计各分类的完成率和进度
 * - 生成文件依赖关系分析
 * - 输出下一步注释建议
 */

const fs = require('fs');
const path = require('path');

// 文件路径配置
const PROGRESS_FILE = path.join(__dirname, '../docs/annotation-progress.json');
const REPORT_DIR = path.join(__dirname, '../reports');

/**
 * 生成详细状态报告
 */
function generateDetailedReport() {
  console.log('📊 生成详细注释状态报告...');

  // 读取进度数据
  const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  const { projectInfo, fileTracking, progressStats } = progressData;

  // 确保报告目录存在
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  // 1. 生成优先级排序的文件清单
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const statusOrder = ['pending', 'in-progress', 'complete', 'needs-review', 'reviewed'];

  const filesByPriority = {};
  const filesByStatus = {};
  const filesByCategory = {};

  // 整理文件数据
  Object.entries(fileTracking).forEach(([filePath, fileData]) => {
    const { priority, status, category } = fileData;

    // 按优先级整理
    if (!filesByPriority[priority]) filesByPriority[priority] = [];
    filesByPriority[priority].push({ path: filePath, ...fileData });

    // 按状态整理
    if (!filesByStatus[status]) filesByStatus[status] = [];
    filesByStatus[status].push({ path: filePath, ...fileData });

    // 按分类整理
    if (!filesByCategory[category]) filesByCategory[category] = { files: [], stats: { total: 0, complete: 0 } };
    filesByCategory[category].files.push({ path: filePath, ...fileData });
    filesByCategory[category].stats.total++;
    if (status === 'complete') filesByCategory[category].stats.complete++;
  });

  // 2. 生成HTML报告
  const htmlReport = generateHtmlReport(progressData, filesByPriority, filesByStatus, filesByCategory);
  fs.writeFileSync(path.join(REPORT_DIR, 'annotation-status-report.html'), htmlReport);

  // 3. 生成Markdown报告
  const markdownReport = generateMarkdownReport(progressData, filesByPriority, filesByStatus, filesByCategory);
  fs.writeFileSync(path.join(REPORT_DIR, 'annotation-status-report.md'), markdownReport);

  // 4. 生成下一步建议
  const nextStepsSuggestions = generateNextStepsSuggestions(filesByPriority, filesByStatus);
  fs.writeFileSync(path.join(REPORT_DIR, 'next-steps-suggestions.md'), nextStepsSuggestions);

  console.log('✅ 报告生成完成！');
  console.log(`   HTML报告: ${path.join(REPORT_DIR, 'annotation-status-report.html')}`);
  console.log(`   Markdown报告: ${path.join(REPORT_DIR, 'annotation-status-report.md')}`);
  console.log(`   下一步建议: ${path.join(REPORT_DIR, 'next-steps-suggestions.md')}`);

  return {
    htmlReportPath: path.join(REPORT_DIR, 'annotation-status-report.html'),
    markdownReportPath: path.join(REPORT_DIR, 'annotation-status-report.md'),
    nextStepsPath: path.join(REPORT_DIR, 'next-steps-suggestions.md')
  };
}

/**
 * 生成HTML报告
 */
function generateHtmlReport(progressData, filesByPriority, filesByStatus, filesByCategory) {
  const { projectInfo, progressStats } = progressData;
  const completionRate = parseFloat(progressStats.completionRate);

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kode项目注释状态报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 40px; background: #fafafa; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
        h1, h2, h3 { color: #333; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .stat-card { padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #0066cc; }
        .stat-label { color: #666; margin-top: 5px; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #28a745, #20c997); transition: width 0.3s ease; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background: #f8f9fa; font-weight: 600; }
        .status-pending { color: #6c757d; }
        .status-in-progress { color: #fd7e14; }
        .status-complete { color: #28a745; }
        .priority-critical { color: #dc3545; font-weight: bold; }
        .priority-high { color: #fd7e14; font-weight: bold; }
        .priority-medium { color: #0066cc; }
        .priority-low { color: #6c757d; }
        .file-path { font-family: 'Monaco', 'Consolas', monospace; font-size: 0.9em; }
        .section { margin: 40px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Kode项目注释状态报告</h1>
        <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>

        <div class="section">
            <h2>📈 总体进度</h2>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${completionRate}%"></div>
            </div>
            <p style="text-align: center; font-weight: bold;">完成率: ${progressStats.completionRate}</p>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${progressStats.total}</div>
                    <div class="stat-label">总文件数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${progressStats.complete}</div>
                    <div class="stat-label">已完成</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${progressStats.inProgress}</div>
                    <div class="stat-label">进行中</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${progressStats.pending}</div>
                    <div class="stat-label">待处理</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🚨 优先级文件分布</h2>
            ${generatePriorityTables(filesByPriority)}
        </div>

        <div class="section">
            <h2>📂 分类统计</h2>
            ${generateCategoryTable(filesByCategory)}
        </div>

        <div class="section">
            <h2>📋 状态分布</h2>
            ${generateStatusTable(filesByStatus)}
        </div>
    </div>
</body>
</html>
  `.trim();
}

function generatePriorityTables(filesByPriority) {
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const priorityLabels = {
    critical: '🔴 关键优先级',
    high: '🟠 高优先级',
    medium: '🔵 中等优先级',
    low: '🟡 低优先级'
  };

  return priorityOrder.map(priority => {
    const files = filesByPriority[priority] || [];
    if (files.length === 0) return '';

    const pendingFiles = files.filter(f => f.status === 'pending');

    return `
      <h3>${priorityLabels[priority]} (${files.length}个文件, ${pendingFiles.length}个待处理)</h3>
      <table>
        <thead>
          <tr><th>文件路径</th><th>状态</th><th>分类</th><th>注释比例</th></tr>
        </thead>
        <tbody>
          ${files.slice(0, 10).map(file => `
            <tr>
              <td class="file-path">${file.path}</td>
              <td class="status-${file.status}">${file.status}</td>
              <td>${file.category}</td>
              <td>${file.commentRatio}</td>
            </tr>
          `).join('')}
          ${files.length > 10 ? `<tr><td colspan="4" style="text-align: center; color: #666;">... 还有 ${files.length - 10} 个文件</td></tr>` : ''}
        </tbody>
      </table>
    `;
  }).join('');
}

function generateCategoryTable(filesByCategory) {
  return `
    <table>
      <thead>
        <tr><th>分类</th><th>总文件数</th><th>已完成</th><th>完成率</th></tr>
      </thead>
      <tbody>
        ${Object.entries(filesByCategory).map(([category, data]) => {
          const completionRate = (data.stats.complete / data.stats.total * 100).toFixed(1);
          return `
            <tr>
              <td>${category}</td>
              <td>${data.stats.total}</td>
              <td>${data.stats.complete}</td>
              <td>${completionRate}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function generateStatusTable(filesByStatus) {
  const statusLabels = {
    pending: '⏳ 待处理',
    'in-progress': '🔄 进行中',
    complete: '✅ 已完成',
    'needs-review': '👀 需审查',
    reviewed: '✨ 已审查'
  };

  return `
    <table>
      <thead>
        <tr><th>状态</th><th>文件数量</th><th>占比</th></tr>
      </thead>
      <tbody>
        ${Object.entries(filesByStatus).map(([status, files]) => {
          const percentage = (files.length / Object.keys(require(PROGRESS_FILE).fileTracking).length * 100).toFixed(1);
          return `
            <tr>
              <td>${statusLabels[status]}</td>
              <td>${files.length}</td>
              <td>${percentage}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * 生成Markdown报告
 */
function generateMarkdownReport(progressData, filesByPriority, filesByStatus, filesByCategory) {
  const { projectInfo, progressStats } = progressData;

  const priorityFiles = filesByPriority.critical || [];
  const pendingCritical = priorityFiles.filter(f => f.status === 'pending');

  return `# 📊 Kode项目注释状态报告

**生成时间**: ${new Date().toLocaleString('zh-CN')}

## 📈 总体进度

- **总文件数**: ${progressStats.total}
- **已完成**: ${progressStats.complete} (${progressStats.completionRate})
- **进行中**: ${progressStats.inProgress}
- **待处理**: ${progressStats.pending}

## 🚨 关键优先级文件 (${priorityFiles.length}个)

${pendingCritical.length > 0 ? `### 待处理的关键文件 (${pendingCritical.length}个):

${pendingCritical.map(f => `- \`${f.path}\` (${f.category}) - ${f.commentRatio} 注释率`).join('\n')}` : '✅ 所有关键文件已完成注释！'}

## 📂 分类完成情况

${Object.entries(filesByCategory).map(([category, data]) => {
  const completionRate = (data.stats.complete / data.stats.total * 100).toFixed(1);
  return `- **${category}**: ${data.stats.complete}/${data.stats.total} (${completionRate}%)`;
}).join('\n')}

## 📋 下一步建议

${generateNextStepsMarkdown(filesByPriority, filesByStatus)}

---
*报告由注释状态分析系统自动生成*`;
}

function generateNextStepsMarkdown(filesByPriority, filesByStatus) {
  const criticalPending = (filesByPriority.critical || []).filter(f => f.status === 'pending');
  const highPending = (filesByPriority.high || []).filter(f => f.status === 'pending');

  let suggestions = [];

  if (criticalPending.length > 0) {
    suggestions.push('1. **优先注释关键文件**: ' + criticalPending.slice(0, 3).map(f => f.path).join(', '));
  }

  if (highPending.length > 0) {
    suggestions.push('2. **处理高优先级文件**: ' + highPending.slice(0, 5).map(f => f.path).join(', '));
  }

  const inProgress = filesByStatus['in-progress'] || [];
  if (inProgress.length > 0) {
    suggestions.push('3. **完成进行中的文件**: ' + inProgress.slice(0, 3).map(f => f.path).join(', '));
  }

  return suggestions.length > 0 ? suggestions.join('\n') : '✅ 所有高优先级文件已处理完成！';
}

/**
 * 生成下一步建议
 */
function generateNextStepsSuggestions(filesByPriority, filesByStatus) {
  const criticalPending = (filesByPriority.critical || []).filter(f => f.status === 'pending');
  const highPending = (filesByPriority.high || []).filter(f => f.status === 'pending');
  const inProgress = filesByStatus['in-progress'] || [];

  return `# 📋 注释工作下一步建议

## 🎯 立即行动项

${criticalPending.length > 0 ? `### 1. 关键优先级文件 (${criticalPending.length}个待处理)
${criticalPending.map((f, i) => `${i+1}. \`${f.path}\`
   - 分类: ${f.category}
   - 当前注释率: ${f.commentRatio}
   - 建议: 立即开始注释工作
`).join('\n')}` : '✅ 所有关键文件已完成'}

${highPending.length > 0 ? `### 2. 高优先级文件 (${highPending.length}个待处理)
${highPending.slice(0, 10).map((f, i) => `${i+1}. \`${f.path}\` (${f.category}) - ${f.commentRatio}`).join('\n')}
${highPending.length > 10 ? `\n... 还有 ${highPending.length - 10} 个文件` : ''}` : '✅ 所有高优先级文件已完成'}

${inProgress.length > 0 ? `### 3. 完成进行中的文件 (${inProgress.length}个)
${inProgress.map((f, i) => `${i+1}. \`${f.path}\` (${f.category}) - ${f.commentRatio}`).join('\n')}` : '✅ 没有进行中的文件'}

## 📊 工作策略建议

1. **按优先级顺序**: 优先完成 critical → high → medium → low
2. **按分类批量处理**: 同类文件一起处理，提高效率
3. **文件依赖关系**: 优先注释被其他文件依赖的基础文件
4. **注释质量**: 确保每个文件都有完整的文件头和关键函数注释

## 🔄 定期检查

- 每完成10个文件后运行: \`node .taskmaster/scripts/analyze-annotation-status.js\`
- 更新进度报告: \`node .taskmaster/scripts/generate-status-report.js\`

---
*建议由注释进度跟踪系统生成 - ${new Date().toLocaleString('zh-CN')}*`;
}

// 主执行函数
if (require.main === module) {
  try {
    const reportPaths = generateDetailedReport();
    console.log('\n📈 报告生成成功！');
    console.log('可以打开HTML报告查看详细信息，或查看Markdown文件获取快速概览。');
  } catch (error) {
    console.error('❌ 生成报告时出错:', error.message);
    process.exit(1);
  }
}

module.exports = { generateDetailedReport };