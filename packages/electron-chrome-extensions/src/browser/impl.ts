import type { ExtensionEvent } from "./router"

type PromiseOrIt<T> = Promise<T> | T

/** App-specific implementation details for extensions. */
export interface ChromeExtensionImpl {
  createTab?(
    details: chrome.tabs.CreateProperties
  ): PromiseOrIt<[Electron.WebContents, Electron.BrowserWindow]>
  selectTab?(tab: Electron.WebContents, window: Electron.BrowserWindow): void
  removeTab?(tab: Electron.WebContents, window: Electron.BrowserWindow): void

  /**
   * Populate additional details to a tab descriptor which gets passed back to
   * background pages and content scripts.
   */
  assignTabDetails?(details: chrome.tabs.Tab, tab: Electron.WebContents): void
  
  /**
   * @description get current window from where javascript is running
   */
  windowsGetCurrent?: (win: Electron.BrowserWindow | null, ctx: {
    event: ExtensionEvent
    lastFocusedWindow: Electron.BrowserWindow | null
    // event: ExtensionEvent
  }) => PromiseOrIt<Electron.BrowserWindow | null>
  createWindow?(details: chrome.windows.CreateData): PromiseOrIt<Electron.BrowserWindow>
  removeWindow?(window: Electron.BrowserWindow): void
}
