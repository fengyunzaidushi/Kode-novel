/**
 * Sentry错误跟踪服务
 * 提供错误监控和上报功能，当前为存根实现，可根据需要启用实际的Sentry集成
 * 这种设计允许在不同环境中灵活控制错误跟踪的行为
 */

/**
 * 初始化Sentry错误跟踪服务
 * 当前为空实现，可根据项目需求启用真实的Sentry SDK初始化逻辑
 * 在生产环境中可能包括DSN配置、环境设置、用户信息捕获等
 */
export function initSentry(): void {
  // 存根实现 - 可以在这里添加真实的Sentry.init()调用
  // 例如: Sentry.init({ dsn: process.env.SENTRY_DSN, ... })
}

/**
 * 捕获并上报异常到Sentry
 * 当前为空实现，在真实场景中会将错误信息发送到Sentry平台进行分析
 * 支持捕获各种类型的错误对象，包括Error实例、字符串和其他异常类型
 * @param error 要捕获的错误对象，可以是Error实例或其他类型的异常信息
 * @returns Promise<void> 异步操作完成的Promise
 */
export async function captureException(error: unknown): Promise<void> {
  // 存根实现 - 可以在这里添加真实的Sentry.captureException()调用
  // 例如: return Sentry.captureException(error)
  // 当前只是静默忽略错误，不进行实际上报
  void error // 防止未使用参数的TypeScript警告
}
