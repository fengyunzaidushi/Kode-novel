/**
 * 🎯 通用类型定义 - 项目通用的基础类型
 *
 * 🏗️ 核心功能：
 * - 提供项目中使用的通用类型定义
 * - 确保类型安全和一致性
 * - 简化其他模块的类型导入
 *
 * 🔄 依赖关系：
 * - 上游：被整个项目的类型系统使用
 * - 下游：基础类型定义，无外部依赖
 *
 * 📊 使用场景：
 * - 统一的 UUID 类型定义
 * - 跨模块的类型一致性保证
 * - TypeScript 类型检查和推断
 *
 * 🔧 技术实现：
 * - 使用 TypeScript 模板字面量类型
 * - 严格的 UUID 格式验证
 * - 类型级别的字符串格式约束
 */

/**
 * UUID 类型定义 - 标准 UUID v4 格式的类型安全表示
 *
 * 使用 TypeScript 模板字面量类型确保 UUID 符合标准格式：
 * xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *
 * @example
 * ```typescript
 * const validUuid: UUID = "550e8400-e29b-41d4-a716-446655440000";
 * const invalidUuid: UUID = "not-a-uuid"; // TypeScript 错误
 * ```
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;