/**
 * 🎯 请求上下文管理器 - 完美状态隔离机制
 *
 * 🏗️ 核心功能：
 * - 为每个请求创建独立的上下文和取消控制器
 * - 提供完美的状态隔离，避免请求间相互干扰
 * - 支持多种请求类型的生命周期管理
 * - 实现安全的请求取消和清理机制
 *
 * 🔄 依赖关系：
 * - 上游：被工具执行系统和查询处理器调用
 * - 下游：依赖浏览器原生 AbortController API
 *
 * 📊 使用场景：
 * - 用户查询处理时创建请求上下文
 * - 工具执行期间的状态管理
 * - 长时间运行任务的取消控制
 * - 多请求并发时的状态隔离
 *
 * 🔧 技术实现：
 * - 基于官方 Kode 模式的状态隔离设计
 * - 使用 crypto.randomUUID() 生成唯一标识
 * - AbortController 实现优雅的取消机制
 * - 事件监听器的自动清理防止内存泄漏
 */

/**
 * 请求上下文接口 - 每个请求的完整状态信息
 */
export interface RequestContext {
  /** 请求的唯一标识符 */
  id: string
  /** 请求取消控制器，用于优雅中断操作 */
  abortController: AbortController
  /** 请求开始时间戳，用于性能监控 */
  startTime: number
  /** 请求是否仍处于活跃状态 */
  isActive: boolean
  /** 请求类型：查询、工具调用或编程任务 */
  type: 'query' | 'tool' | 'koding'
}

/**
 * 取消屏障接口 - 提供安全的请求取消机制
 *
 * 确保只有特定请求的取消信号才会被响应，避免误取消其他请求
 */
export interface AbortBarrier {
  /** 关联的请求ID */
  requestId: string
  /** 检查当前请求是否已被取消 */
  checkAbort(): boolean
  /** 注册请求取消时的回调函数 */
  onAbort(callback: () => void): void
  /** 清理所有监听器和资源 */
  cleanup(): void
}

/**
 * 创建新的请求上下文
 *
 * @param type - 请求类型，默认为 'query'
 * @returns 新创建的请求上下文对象
 *
 * @example
 * ```typescript
 * // 创建查询请求上下文
 * const queryContext = createRequestContext('query');
 *
 * // 创建工具执行上下文
 * const toolContext = createRequestContext('tool');
 * ```
 */
export function createRequestContext(
  type: RequestContext['type'] = 'query',
): RequestContext {
  return {
    id: crypto.randomUUID(),
    abortController: new AbortController(),
    startTime: Date.now(),
    isActive: true,
    type,
  }
}

/**
 * 创建取消屏障 - 为请求提供安全的取消机制
 *
 * 该函数创建一个取消屏障，确保只有特定请求的取消信号被响应，
 * 避免了多请求环境下的误取消问题。
 *
 * @param requestContext - 要关联的请求上下文
 * @returns 取消屏障对象，包含取消检查和清理方法
 *
 * @example
 * ```typescript
 * const context = createRequestContext('tool');
 * const barrier = createAbortBarrier(context);
 *
 * // 注册取消回调
 * barrier.onAbort(() => {
 *   console.log('请求已取消');
 * });
 *
 * // 检查是否已取消
 * if (barrier.checkAbort()) {
 *   return; // 提前退出
 * }
 *
 * // 完成后清理
 * barrier.cleanup();
 * ```
 */
export function createAbortBarrier(
  requestContext: RequestContext,
): AbortBarrier {
  let cleanupCallbacks: (() => void)[] = []

  return {
    requestId: requestContext.id,

    checkAbort(): boolean {
      // Only respond to aborts for THIS specific request
      return (
        requestContext.isActive && requestContext.abortController.signal.aborted
      )
    },

    onAbort(callback: () => void): void {
      if (requestContext.isActive) {
        const abortHandler = () => {
          if (requestContext.isActive) {
            callback()
          }
        }
        requestContext.abortController.signal.addEventListener(
          'abort',
          abortHandler,
        )
        cleanupCallbacks.push(() => {
          requestContext.abortController.signal.removeEventListener(
            'abort',
            abortHandler,
          )
        })
      }
    },

    cleanup(): void {
      cleanupCallbacks.forEach(cleanup => cleanup())
      cleanupCallbacks = []
      requestContext.isActive = false
    },
  }
}
