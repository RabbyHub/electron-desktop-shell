import { ipcMain, BrowserWindow, app, Extension } from 'electron'
import * as http from 'http'
import * as path from 'path'
import { AddressInfo } from 'net'
import { ChromeExtensionOptions, ElectronChromeExtensions } from '../dist'
import { emittedOnce } from './events-helpers'
import { addCrxPreload, createCrxSession } from './crx-helpers'

const DEBUG_RPC_UI = !!process.env.DEBUG_RPC_UI;

export const useServer = () => {
  const emptyPage = '<script>console.log("loaded")</script>'

  // NB. extensions are only allowed on http://, https:// and ftp:// (!) urls by default.
  let server: http.Server
  let url: string

  before(async () => {
    server = http.createServer((req, res) => {
      res.end(emptyPage)
    })
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolve()
      })
    )
  })
  after(() => {
    server.close()
  })

  return {
    getUrl: () => url,
  }
}

const fixtures = path.join(__dirname, 'fixtures')

export const useExtensionBrowser = (opts: {
  url?: () => string
  file?: string
  extensionName: string
  openDevTools?: boolean
  browserWindowOptions?: Electron.BrowserWindowConstructorOptions
  contentScriptsReady?: string | false
  chromeExtensionOptions?: ChromeExtensionOptions
}) => {
  let w: Electron.BrowserWindow
  let extensions: ElectronChromeExtensions
  let extension: Extension
  let partition: string
  let customSession: Electron.Session

  const waitings: Promise<any>[] = []

  before(async () => {
    await Promise.all(waitings);
  })

  beforeEach(async () => {
    const eachWatings: Promise<any>[] = []

    const sessionDetails = createCrxSession()

    partition = sessionDetails.partition
    customSession = sessionDetails.session

    addCrxPreload(customSession)

    extensions = new ElectronChromeExtensions({
      ...opts?.chromeExtensionOptions,
      session: customSession
    })

    /**
     * @description In most REAL cases, we just send ipc message to main process or invoke main process method.
     * we don't need wait for 3rd-parties' content_scripts ready (because we forbid them to communicate with main process).
     * 
     * In these unit tests, some extensions loaded to test if call chains of mv2 below works:
     * 
     * 1. content_scripts -- chrome.runtime.sendMessage --> background.js
     * 2. background.js -- call --> main process
     * 3. main -- reply -> background.js
     * 4. background.js -- reply -> content_scripts
     * 
     * This workflow are not allowed in 3rd party extensions by default. so we don't worry if the content_scripts ready.
     */
    if (opts.contentScriptsReady) {
      eachWatings.push(emittedOnce(ipcMain, opts.contentScriptsReady))
    }
    extension = await customSession.loadExtension(path.join(fixtures, opts.extensionName))

    w = new BrowserWindow({
      show: DEBUG_RPC_UI,
      ...opts.browserWindowOptions,
      webPreferences: {
        session: customSession,
        nodeIntegration: false,
        sandbox: true,
        contextIsolation: true,
        ...opts.browserWindowOptions?.webPreferences,
      },
    })

    if (opts.openDevTools) {
      w.webContents.openDevTools({ mode: 'detach' })
    }

    extensions.addTab(w.webContents, w)

    if (opts.file) {
      await w.loadFile(opts.file)
    } else if (opts.url) {
      await w.loadURL(opts.url())
    }
    
    if (eachWatings.length)
      await Promise.all(eachWatings);
  })

  afterEach(() => {
    if (!w.isDestroyed()) {
      if (w.webContents.isDevToolsOpened()) {
        w.webContents.closeDevTools()
      }

      w.destroy()
    }
  })

  return {
    get window() {
      return w
    },
    get webContents() {
      return w.webContents
    },
    get extensions() {
      return extensions
    },
    get extension() {
      return extension
    },
    get session() {
      return customSession
    },
    get partition() {
      return partition
    },

    crx: {
      async execRpc(method: string, ...args: any[]) {
        const p = emittedOnce(ipcMain, 'rpc-exec-success')
        await w.webContents.executeJavaScript(
          `exec('${JSON.stringify({ type: 'rpc-call-api', method, args })}')`
        )
        const [, result] = await p
        return result
      },

      /**
       * @description call method in extension `rpc`'s html page
       */
      async callInRpcExtUI(method: string, ...args: any[]) {
        if (extension.name !== 'chrome-rpc') {
          throw new Error('[callInRpcExtUI] extension name should be "chrome-rpc"')
        } else {
          console.log('[callInRpcExtUI] extension info:', extension);
        }
        const prevURL = w.webContents.getURL();
        w.webContents.loadURL(`chrome-extension://${extension.id}/index.html`);

        const p = emittedOnce(ipcMain, 'rpc-fast-success')

        await w.webContents.executeJavaScript(
          `(async function () {
            var method = "${method}";
            var args = JSON.parse("${JSON.stringify(args)}");
            // window.args = args;
            var [apiName, subMethod] = method.split('.')

            if (typeof chrome[apiName][subMethod] === 'function') {
              var results = await chrome[apiName][subMethod](...args)
              electronTest.sendIpc('rpc-fast-success', results)
            }
          })();`
        )

        const [, result] = await p
        console.log('[callInRpcExtUI] result:', result);

        w.webContents.loadURL(prevURL);
        return result;
      },

      async rpcEventOnce(eventName: string) {
        const p = emittedOnce(ipcMain, 'rpc-exec-success')
        await w.webContents.executeJavaScript(
          `exec('${JSON.stringify({ type: 'rpc-fast-event-once', name: eventName })}')`
        )
        const [, results] = await p

        if (typeof results === 'string') {
          throw new Error(results)
        }

        return results
      },
    },
  }
}

export const useBackgroundPageLogging = () => {
  app.on('web-contents-created', (event, wc) => {
    if (wc.getType() === 'backgroundPage') {
      wc.on('console-message', (ev, level, message, line, sourceId) => {
        console.log(`(${sourceId}) ${message}`)
      })
    }
  })
}
