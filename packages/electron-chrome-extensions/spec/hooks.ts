import { ipcMain, BrowserWindow, app, Extension } from 'electron'
import * as http from 'http'
import * as path from 'path'
import { AddressInfo } from 'net'
import { ElectronChromeExtensions } from '../dist'
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
}) => {
  let w: Electron.BrowserWindow
  let extensions: ElectronChromeExtensions
  let extension: Extension
  let partition: string
  let customSession: Electron.Session

  beforeEach(async () => {
    const sessionDetails = createCrxSession()

    partition = sessionDetails.partition
    customSession = sessionDetails.session

    addCrxPreload(customSession)

    extensions = new ElectronChromeExtensions({ session: customSession })

    extension = await customSession.loadExtension(path.join(fixtures, opts.extensionName))

    w = new BrowserWindow({
      show: DEBUG_RPC_UI,
      webPreferences: { session: customSession, nodeIntegration: false, contextIsolation: true },
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
      async exec(method: string, ...args: any[]) {
        const p = emittedOnce(ipcMain, 'success')
        await w.webContents.executeJavaScript(
          `exec('${JSON.stringify({ type: 'api', method, args })}')`
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

        const p = emittedOnce(ipcMain, 'rpc-success')

        await w.webContents.executeJavaScript(
          `(async function () {
            var method = "${method}";
            var args = JSON.parse("${JSON.stringify(args)}");
            // window.args = args;
            var [apiName, subMethod] = method.split('.')

            if (typeof chrome[apiName][subMethod] === 'function') {
              var results = await chrome[apiName][subMethod](...args)
              electronTest.sendIpc('rpc-success', results)
            }
          })();`
        )

        const [, result] = await p
        console.log('[callInRpcExtUI] result:', result);

        w.webContents.loadURL(prevURL);
        return result;
      },

      async eventOnce(eventName: string) {
        const p = emittedOnce(ipcMain, 'success')
        await w.webContents.executeJavaScript(
          `exec('${JSON.stringify({ type: 'event-once', name: eventName })}')`
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
