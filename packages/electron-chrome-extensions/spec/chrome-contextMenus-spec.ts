import { expect } from 'chai'
import { ipcMain } from 'electron'
import { IS_APP_GT_16 } from './app-ver'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'
import { uuid } from './spec-helpers'

const getFakeContextMenuParams = (
  params?: Partial<Electron.ContextMenuParams>
): Electron.ContextMenuParams => {
  return {
    x: 319,
    y: 182,
    linkURL: '',
    linkText: '',
    pageURL: 'chrome-extension://dpgalgddpmpckbgmjaagknaelkenbldf/index.html',     
    frameURL: '',
    srcURL: '',
    mediaType: 'none',
    mediaFlags: {
      inError: false,
      isPaused: false,
      isMuted: false,
      canSave: false,
      hasAudio: false,
      isLooping: false,
      isControlsVisible: false,
      canToggleControls: false,
      canPrint: false,
      canRotate: false,
      canShowPictureInPicture: false,
      isShowingPictureInPicture: false,
      canLoop: false
    },
    hasImageContents: false,
    isEditable: false,
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: false,
      canPaste: false,
      canDelete: false,
      canSelectAll: true,
      canEditRichly: false
    },
    selectionText: '',
    titleText: '',
    altText: '',
    suggestedFilename: '',
    misspelledWord: '',
    selectionRect: { x: 186, y: 8, width: 1, height: 16 },
    dictionarySuggestions: [],
    spellcheckEnabled: false,
    frameCharset: 'windows-1252',
    referrerPolicy: 'default',
    selectionStartOffset: 0,
    inputFieldType: 'none',
    menuSourceType: 'mouse',
    ...params,
  } as any
}

describe('chrome.contextMenus', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
    contentScriptsReady: 'rpc-content_scripts-ready',
  })

  const getContextMenuItems = async () => {
    const promise = new Promise<Electron.MenuItem[]>((resolve) => {
      browser.webContents.once('context-menu', (_, params) => {
        const items = browser.extensions.getContextMenuItems(browser.webContents, params)
        resolve(items)
      })
    })

    browser.window.focus();
    browser.webContents.focus();
    
    /**
     * There no effect to 'context-menu' event by calling `browser.webContents.sendInputEvent(...)`
     * from electron@17.x, we mock the event by calling `browser.webContents.emit(...)` directly
     * 
     * TODO: btw, we can compare version with semver if we want more strict check, but just soso now
     */
    if (IS_APP_GT_16) {
      browser.webContents.emit('context-menu', {}, getFakeContextMenuParams({
        pageURL: browser.webContents.getURL(),
      }))
    } else {
      // Simulate right-click to create context-menu event.
      const opts = { x: 0, y: 0, button: 'right' as const }
      browser.webContents.sendInputEvent({ ...opts, type: 'mouseDown' })
      browser.webContents.sendInputEvent({ ...opts, type: 'mouseUp' })
      browser.webContents.sendInputEvent({ ...opts, type: 'contextMenu' })
    }

    return await promise
  }

  describe('create()', () => {
    it('creates item with label', async () => {
      const id = uuid()
      const title = 'ヤッホー'
      await browser.crx.execRpc('contextMenus.create', { id, title })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].id).to.equal(id)
      expect(items[0].label).to.equal(title)
    })

    it('creates a child item', async () => {
      const parentId = uuid()
      const id = uuid()
      await browser.crx.execRpc('contextMenus.create', { id: parentId, title: 'parent' })
      await browser.crx.execRpc('contextMenus.create', { id, parentId, title: 'child' })
      const items = await getContextMenuItems()
      expect(items).to.have.lengthOf(1)
      expect(items[0].label).to.equal('parent')
      expect(items[0].submenu).to.exist
      expect(items[0].submenu!.items).to.have.lengthOf(1)
      expect(items[0].submenu!.items[0].label).to.equal('child')
    })

    it('invokes the create callback', async () => {
      const ipcName = 'create-callback'
      await browser.crx.execRpc('contextMenus.create', {
        title: 'callback',
        onclick: { __IPC_FN__: ipcName },
      })
      const items = await getContextMenuItems()
      const p = emittedOnce(ipcMain, ipcName)
      items[0].click()
      await p
    })
  })

  describe('remove()', () => {
    it('removes item', async () => {
      const id = uuid()
      await browser.crx.execRpc('contextMenus.create', { id })
      await browser.crx.execRpc('contextMenus.remove', id)
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })

  describe('removeAll()', () => {
    it('removes all items', async () => {
      await browser.crx.execRpc('contextMenus.create', {})
      await browser.crx.execRpc('contextMenus.create', {})
      await browser.crx.execRpc('contextMenus.removeAll')
      const items = await getContextMenuItems()
      expect(items).to.be.empty
    })
  })
})
