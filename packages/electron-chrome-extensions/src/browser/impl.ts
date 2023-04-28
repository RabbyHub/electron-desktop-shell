import type { ExtensionEvent } from "./router"

type PromiseOrIt<T> = Promise<T> | T
type ArrayOrIt<T> = T extends any[] ? T : T[]

type ImplContext = {
  event: ExtensionEvent
};

/** App-specific implementation details for extensions. */
export interface ChromeExtensionImpl {
  createTab?(
    details: chrome.tabs.CreateProperties, ctx: ImplContext
  ): PromiseOrIt<[Electron.WebContents, Electron.BrowserWindow] | false>
  selectTab?(tab: Electron.WebContents, window: Electron.BrowserWindow): void
  removeTab?(tab: Electron.WebContents, window: Electron.BrowserWindow): void

  /**
   * Populate additional details to a tab descriptor which gets passed back to
   * background pages and content scripts.
   */
  assignTabDetails?(details: chrome.tabs.Tab, tab: Electron.WebContents): void

  /**
   * @description in most case, use this extension to manage a BrowserWindow used as a tabbed browser,
   * this would effect some judgement inner the extension, like if we need to unref the window when all
   * tabs related to it are closed --- in general, we said YES, but maybe sometimes you don't want to do
   * like that, you can return false to tell us that.
   * @param window 
   */
  getTabbedBrowserWindowBehavior?(ctx: {
    window: Electron.BrowserWindow,
    tabs: Set<Electron.WebContents>,
  }): PromiseOrIt<{
    /**
     * @default true
     */
    keepRefWindowOnAllTabsClosed?: boolean
  }>
  
  /**
   * @description get current window from where javascript is running
   */
  windowsGetCurrent?: (win: Electron.BrowserWindow | null, ctx: ImplContext & {
    lastFocusedWindow: Electron.BrowserWindow | null
  }) => PromiseOrIt<Electron.BrowserWindow | null>
  getWindowById?: (ctx: ImplContext & {
    foundWindow: Electron.BrowserWindow | undefined,
  }, id: number) => PromiseOrIt<Electron.BrowserWindow | null>
  createWindow?(details: chrome.windows.CreateData, ctx: ImplContext): PromiseOrIt<Electron.BrowserWindow>
  removeWindow?(window: Electron.BrowserWindow): void
}
