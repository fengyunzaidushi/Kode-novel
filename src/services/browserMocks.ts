/**
 * 浏览器API模拟服务
 * 为@statsig/js-client在Node.js环境中提供必要的浏览器API模拟
 * 实现了最小化的DOM和BOM API子集，确保第三方客户端库能在CLI环境中正常运行
 */

/**
 * Document对象模拟 - 支持可见性状态跟踪
 * 模拟浏览器中document对象，主要用于支持页面可见性监测和语言设置
 */
const mockDocument = {
  visibilityState: 'visible' as const,  // 页面可见性状态，固定为可见
  documentElement: {
    lang: 'en',                         // 文档语言设置，默认英文
  },
  /**
   * 事件监听器模拟
   * 支持基本的事件监听功能，但在Node.js环境中为空操作
   * @param _event 事件类型（如visibilitychange）
   * @param _handler 事件处理函数
   */
  addEventListener: (
    _event: string,
    _handler: EventListenerOrEventListenerObject,
  ) => {
    // 可见性变化事件通过window.document引用处理
    // 在Node.js环境中不需要实际监听，只需提供接口兼容性
  },
} as const

/**
 * Window对象模拟 - 支持焦点/失焦和页面卸载处理
 * 模拟浏览器window对象，主要用于支持第三方库的窗口状态检测和事件处理
 * 提供窗口尺寸、位置信息和基础事件系统
 */
export const mockWindow = {
  document: mockDocument,              // 嵌入的document对象模拟
  location: {
    href: 'node://localhost',         // 模拟的页面URL，标识Node.js环境
    pathname: '/',                   // 模拟的路径，默认根目录
  },
  /**
   * 窗口事件监听器
   * 支持窗口生命周期事件，特别是页面卸载事件的处理
   * @param event 事件类型（beforeunload、focus、blur等）
   * @param handler 事件处理函数
   */
  addEventListener: (
    event: string,
    handler: EventListenerOrEventListenerObject,
  ) => {
    if (event === 'beforeunload') {
      // 捕获页面卸载事件处理器，在进程退出时运行
      // 这对于数据清理和资源释放非常重要
      process.on('exit', () => {
        if (typeof handler === 'function') {
          handler({} as Event)           // 直接调用函数处理器
        } else {
          handler.handleEvent({} as Event) // 调用对象的handleEvent方法
        }
      })
    }
    // 其他事件（focus/blur）在Node.js中不是关键需求，忽略即可
  },
  /**
   * 窗口焦点方法模拟
   * 在Node.js环境中为空操作，但保持API兼容性
   */
  focus: () => {
    // 焦点在Node.js中是无操作，只为了API兼容性
  },
  innerHeight: 768,                   // 模拟窗口高度（像素）
  innerWidth: 1024,                   // 模拟窗口宽度（像素）
} as const

/**
 * Navigator对象模拟 - 支持基础的信标发送功能
 * 模拟浏览器navigator对象，主要用于支持统计分析和用户环境检测
 * 提供用户代理、语言设置和网络通信功能
 */
export const mockNavigator = {
  /**
   * 信标发送方法模拟
   * 模拟beacon API，用于向服务器发送少量数据（通常是统计数据）
   * 在Node.js中返回成功但不实际发送，防止意外的网络请求
   * @param _url 目标URL地址
   * @param _data 要发送的数据（字符串或Blob）
   * @returns 总是返回true表示“成功”
   */
  sendBeacon: (_url: string, _data: string | Blob): boolean => {
    // Beacon用于统计分析 - 返回成功但不实际发送
    // 在CLI环境中避免不必要的网络请求，保持应用程序的纯净性
    return true
  },
  // 模拟Node.js环境的用户代理字符串，包含WebKit和Chrome标识
  userAgent:
    'Mozilla/5.0 (Node.js) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
  language: 'en-US',                  // 默认语言设置为美式英文
} as const

/**
 * 条件性全局对象注入
 * 仅在Node.js环境中运行时才注入mock对象，防止在浏览器环境中覆盖原生对象
 * 使用环境检测确保只在必要时才进行模拟，保持最小干扰原则
 */

// 检测并注入window对象模拟
if (typeof window === 'undefined') {
  // @ts-expect-error: 故意为Node.js环境应用部分mock对象
  // TypeScript类型检查忽略：mock对象不包含所有浏览器API
  global.window = mockWindow
}

// 检测并注入navigator对象模拟
if (typeof navigator === 'undefined') {
  // @ts-expect-error: 故意为Node.js环境应用部分mock对象
  // 只模拟必要的API子集，不实现完整的navigator对象
  global.navigator = mockNavigator
}
