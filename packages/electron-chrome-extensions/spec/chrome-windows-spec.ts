import { expect } from 'chai'
import { emittedOnce } from './events-helpers'

import { useExtensionBrowser, useServer } from './hooks'

const DEBUG_RPC_UI = !!process.env.DEBUG_RPC_UI;

describe('chrome.windows', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
    contentScriptsReady: 'rpc-content_scripts-ready',
  })

  describe('get()', () => {
    it('gets details on the window', async () => {
      const windowId = browser.window.id
      const result = await browser.crx.execRpc('windows.get', windowId)
      expect(result).to.be.an('object')
      expect(result.id).to.equal(windowId)
    })
  })

  describe('getLastFocused()', () => {
    it('gets the last focused window', async () => {
      // HACK: focus() doesn't actually emit this in tests
      browser.window.emit('focus')
      const windowId = browser.window.id
      const result = await browser.crx.execRpc('windows.getLastFocused')
      expect(result).to.be.an('object')
      expect(result.id).to.equal(windowId)
    })
  })

  // TODO: add test about where windows.getCurrent could execute OK
  describe('getCurrent()', () => {
    // no window got due to lack of host browser in this test suite:
    // `browser.crx.execRpc` would execute the methods in `background.html` of `rpc` extension,
    // so, there's no window to get.
    // 
    // but, if you execute windows.getCurrent in a pages in chrome extension context , it will work
    it(`in crx' background context, the windows.getCurrent no effect`, async () => {
      const result = await browser.crx.execRpc('windows.getCurrent')
      expect(result).to.be.an('null')
    })

    it('call in html page in extension "chrome-rpc"', async function () {
      if (DEBUG_RPC_UI) {
        this.timeout(1e6)
      }

      const result = await browser.crx.callInRpcExtUI('windows.getCurrent')
      expect(result).to.be.an('object')
      expect(result.id).to.equal(browser.window.id)

      // TODO: check result other fields
      ;['focused', 'top', 'left', 'width', 'height', 'incognito', 'type', 'state', 'alwaysOnTop', 'sessionId'].forEach(field => {
        expect(result).to.ownProperty(field)
      })

      if (DEBUG_RPC_UI) {
        await new Promise(resolve => setTimeout(resolve, 1e6))
      }
    })

    it('still no effect on background html', async () => {
      const result = await browser.crx.execRpc('windows.getCurrent')
      expect(result).to.be.an('null')
    })
  })

  describe('remove()', () => {
    it('removes the window', async () => {
      const windowId = browser.window.id
      const closedPromise = emittedOnce(browser.window, 'closed')
      browser.crx.execRpc('windows.remove', windowId)
      await closedPromise
    })

    it('removes the current window', async () => {
      const closedPromise = emittedOnce(browser.window, 'closed')
      browser.crx.execRpc('windows.remove')
      await closedPromise
    })
  })
})
