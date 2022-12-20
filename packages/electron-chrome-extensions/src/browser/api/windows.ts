import path from 'node:path'
import { parse } from 'node:url'
import { BrowserWindow } from 'electron'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'
import { ensureSuffix } from '../utils'

const debug = require('debug')('electron-chrome-extensions:windows')

const getWindowState = (win: BrowserWindow): chrome.windows.Window['state'] => {
  if (win.isMaximized()) return 'maximized'
  if (win.isMinimized()) return 'minimized'
  if (win.isFullScreen()) return 'fullscreen'
  return 'normal'
}

export class WindowsAPI {
  static WINDOW_ID_NONE = -1
  static WINDOW_ID_CURRENT = -2

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('windows.get', this.get.bind(this))
    handle('windows.getCurrent', this.getCurrent.bind(this))
    handle('windows.getLastFocused', this.getLastFocused.bind(this))
    handle('windows.getAll', this.getAll.bind(this))
    handle('windows.create', this.create.bind(this))
    handle('windows.update', this.update.bind(this))
    handle('windows.remove', this.remove.bind(this))

    this.ctx.store.on('window-added', this.observeWindow.bind(this))
  }

  private observeWindow(window: Electron.BrowserWindow) {
    const windowId = window.id

    window.on('focus', () => {
      this.onFocusChanged(windowId)
    })

    window.once('closed', () => {
      this.ctx.store.windowDetailsCache.delete(windowId)
      this.ctx.store.removeWindow(window)
      this.onRemoved(windowId)
    })

    const onRestoreOrMove = () => {
      const details = this.getWindowDetails(window)
      details.state = 'normal';
      this.ctx.store.windowDetailsCache.set(windowId, details)
    };
    window.on('restore', onRestoreOrMove)
    if (process.platform === 'win32') {
      window.on('moved', onRestoreOrMove)
    }

    window.on('minimize', () => {
      const details = this.getWindowDetails(window)
      details.state = 'minimized';
      this.ctx.store.windowDetailsCache.set(windowId, details)
    })

    window.on('maximize', () => {
      const details = this.getWindowDetails(window)
      details.state = 'maximized';
      this.ctx.store.windowDetailsCache.set(windowId, details)
    })

    const onEnterFullscreen = () => {
      const details = this.getWindowDetails(window)
      details.state = 'fullscreen';
      this.ctx.store.windowDetailsCache.set(windowId, details)
    };
    window.on('enter-full-screen', onEnterFullscreen);
    window.on('enter-html-full-screen', onEnterFullscreen);

    const onLeaveFullscreen = () => {
      const details = this.getWindowDetails(window)
      details.state = getWindowState(window);
      this.ctx.store.windowDetailsCache.set(windowId, details)
    };
    window.on('leave-full-screen', onLeaveFullscreen);
    window.on('leave-html-full-screen', onLeaveFullscreen);

    this.onCreated(windowId)

    debug(`Observing window[${windowId}]`)
  }

  private createWindowDetails(win: BrowserWindow) {
    const details: Partial<chrome.windows.Window> = {
      id: win.id,
      focused: win.isFocused(),
      top: win.getPosition()[1],
      left: win.getPosition()[0],
      width: win.getSize()[0],
      height: win.getSize()[1],
      tabs: Array.from(this.ctx.store.tabs)
        .filter((tab) => {
          const ownerWindow = this.ctx.store.tabToWindow.get(tab)
          return ownerWindow?.isDestroyed() ? false : ownerWindow?.id === win.id
        })
        .map((tab) => this.ctx.store.tabDetailsCache.get(tab.id) as chrome.tabs.Tab)
        .filter(Boolean),
      incognito: !win.webContents.session.isPersistent(),
      type: 'normal', // TODO
      state: getWindowState(win),
      alwaysOnTop: win.isAlwaysOnTop(),
      sessionId: 'default', // TODO
    }

    this.ctx.store.windowDetailsCache.set(win.id, details)
    return details
  }

  private getWindowDetails(win: BrowserWindow) {
    if (this.ctx.store.windowDetailsCache.has(win.id)) {
      return this.ctx.store.windowDetailsCache.get(win.id)!
    }
    const details = this.createWindowDetails(win)
    return details
  }

  private async getWindowFromId(event: ExtensionEvent, id: number) {
    if (id === WindowsAPI.WINDOW_ID_CURRENT) {
      return (await this.ctx.store.windowsGetCurrent(event))
        || this.ctx.store.getLastFocusedWindow()
    } else {
      return this.ctx.store.getWindowById(event, id)
    }
  }

  private async get(event: ExtensionEvent, windowId: number) {
    let win: Electron.BrowserWindow | null;
    if (windowId === WindowsAPI.WINDOW_ID_CURRENT) {
      win = await this.ctx.store.windowsGetCurrent(event) || this.ctx.store.getLastFocusedWindow() || null;
    } else {
      win = await this.getWindowFromId(event, windowId) || null;
    }
    if (!win) return { id: WindowsAPI.WINDOW_ID_NONE }
    return this.getWindowDetails(win)
  }

  private getLastFocused(event: ExtensionEvent) {
    const win = this.ctx.store.getLastFocusedWindow()
    return win ? this.getWindowDetails(win) : null
  }

  // not same with `getLastFocused`, `getCurrent` means the host window where javascript executing
  private async getCurrent(event: ExtensionEvent) {
    const win = await this.ctx.store.windowsGetCurrent(event);

    return win ? this.getWindowDetails(win) : null
  }

  private getAll(event: ExtensionEvent) {
    return Array.from(this.ctx.store.windows).map(this.getWindowDetails.bind(this))
  }

  private async create(event: ExtensionEvent, details: chrome.windows.CreateData) {
    const baseURL = ensureSuffix(event.extension.url, '/');

    let url = Array.isArray(details.url) ? details.url[0] : details.url || ''

    const urlInfo = parse(url);

    if (!urlInfo.protocol && !urlInfo.hostname) {
      url = path.posix.join(baseURL, url);
    } else if (!urlInfo.hostname) {
      url = path.posix.join(baseURL, url);
    }
    
    const win = await this.ctx.store.createWindow(event, {...details, url})
    return this.getWindowDetails(win)
  }

  private async update(
    event: ExtensionEvent,
    windowId: number,
    updateProperties: chrome.windows.UpdateInfo = {}
  ) {
    const win = await this.getWindowFromId(event, windowId)
    if (!win) return

    const props = updateProperties

    if (props.state) {
      switch (props.state) {
        case 'maximized':
          win.maximize()
          break
        case 'minimized':
          win.minimize()
          break
        case 'fullscreen':
          if (win.fullScreenable) win.setFullScreen(true)
          else {
            console.warn('window is not fullScreenable')
          }
          break
        case 'normal': {
          if (win.isFullScreen()) {
            win.setFullScreen(false)
          } else if (win.isMinimized() || win.isMaximized()) {
            win.restore()
          }
          break
        }
      }
    }

    return this.createWindowDetails(win)
  }

  private async remove(event: ExtensionEvent, windowId: number = WindowsAPI.WINDOW_ID_CURRENT) {
    const win = await this.getWindowFromId(event, windowId)
    if (!win) return
    const removedWindowId = win.id
    await this.ctx.store.removeWindow(win)
    this.onRemoved(removedWindowId)
  }

  onCreated(windowId: number) {
    const window = this.ctx.store.findWindowById(windowId)
    if (!window) return
    const windowDetails = this.getWindowDetails(window)
    this.ctx.router.broadcastEvent('windows.onCreated', windowDetails)
  }

  onRemoved(windowId: number) {
    this.ctx.router.broadcastEvent('windows.onRemoved', windowId)
  }

  onFocusChanged(windowId: number) {
    if (this.ctx.store.lastFocusedWindowId === windowId) return

    this.ctx.store.lastFocusedWindowId = windowId
    this.ctx.router.broadcastEvent('windows.onFocusChanged', windowId)
  }
}
