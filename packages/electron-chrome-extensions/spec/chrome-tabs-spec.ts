import { expect } from 'chai'
import { BrowserWindow } from 'electron'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.tabs', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
    contentScriptsReady: 'rpc-content_scripts-ready',
    chromeExtensionOptions: {
      windowsGetCurrent: (win, { event, lastFocusedWindow }) => {
        return win || lastFocusedWindow!
      }
    }
  })

  describe('get()', () => {
    it('returns tab details', async () => {
      const tabId = browser.window.webContents.id
      const result = await browser.crx.execRpc('tabs.get', tabId)
      expect(result).to.be.an('object')
      expect(result.id).to.equal(tabId)
      expect(result.windowId).to.equal(browser.window.id)
    })
  })

  describe('update()', () => {
    it('navigates the tab', async () => {
      const tabId = browser.window.webContents.id
      const updateUrl = `${server.getUrl()}/foo`
      const navigatePromise = emittedOnce(browser.window.webContents, 'did-navigate')
      browser.crx.execRpc('tabs.update', tabId, { url: updateUrl })
      await navigatePromise
      expect(browser.window.webContents.getURL()).to.equal(updateUrl)
    })
  })

  describe('getCurrent()', () => {
    it('fails to get the active tab from a non-tab context', async () => {
      const result = await browser.crx.execRpc('tabs.getCurrent')
      expect(result).to.not.be.an('object')
    })
  })

  describe('query()', () => {
    it('gets the active tab', async () => {
      const result = await browser.crx.execRpc('tabs.query', { active: true })
      expect(result).to.be.an('array')
      expect(result).to.be.length(1)
      expect(result[0].id).to.be.equal(browser.window.webContents.id)
      expect(result[0].windowId).to.be.equal(browser.window.id)
    })

    it('gets the active tab of multiple windows', async () => {
      const secondWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          session: browser.session,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      browser.extensions.addTab(secondWindow.webContents, secondWindow)

      const result = await browser.crx.execRpc('tabs.query', { active: true })
      expect(result).to.be.an('array')
      expect(result).to.be.length(2)
      expect(result[0].windowId).to.be.equal(browser.window.id)
      expect(result[1].windowId).to.be.equal(secondWindow.id)
    })
  })

  describe('executeScript()', () => {
    it('injects code into a tab', async () => {
      const tabId = browser.window.webContents.id
      const [result] = await browser.crx.execRpc('tabs.executeScript', tabId, {
        code: 'location.href',
      })
      expect(result).to.equal(browser.window.webContents.getURL())
    })

    it('injects code into the active tab', async () => {
      const [result] = await browser.crx.execRpc('tabs.executeScript', { code: 'location.href' })
      expect(result).to.equal(browser.window.webContents.getURL())
    })
  })

  describe('onCreated', () => {
    it('emits when tab is added', async () => {
      const p = browser.crx.rpcEventOnce('tabs.onCreated')

      const secondWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          session: browser.session,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      const secondTab = secondWindow.webContents

      const url = `${server.getUrl()}/foo`
      await secondWindow.loadURL(url)

      browser.extensions.addTab(secondTab, secondWindow)

      const [tabDetails] = await p
      expect(tabDetails).to.be.an('object')
      expect(tabDetails.id).to.equal(secondTab.id)
      expect(tabDetails.windowId).to.equal(secondWindow.id)
      expect(tabDetails.url).to.equal(secondTab.getURL())
    })
  })
})
