/* eslint-disable */

function evalInMainWorld(fn) {
  const script = document.createElement('script')
  script.textContent = `((${fn})())`
  document.documentElement.appendChild(script)
}

function sendIpc(name, ...args) {
  const jsonArgs = [name, ...args].map((arg) => JSON.stringify(arg))
  const funcStr = `() => { electronTest.sendIpc(${jsonArgs.join(', ')}) }`
  evalInMainWorld(funcStr)
}

async function exec(action) {
  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage(action, resolve)
  })

  sendIpc('rpc-exec-success', result)
}

window.addEventListener('message', (event) => {
  exec(event.data)
})

evalInMainWorld(() => {
  window.exec = (json) => window.postMessage(JSON.parse(json))

  setTimeout(() => {
    window.electronTest.sendIpc('rpc-content_scripts-ready')
  }, 300)
})

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'rpc-msg-from-bg': {
      const [name] = message.args
      sendIpc(name)
      break
    }
  }
})
