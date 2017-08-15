/* globals DatArchive */

import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-scratch-api'
// TCW CHANGES -- injects scripts into the webview DOM

export function setup () {
  // listens for the 'inject-scripts' ipc event called in the
  // onDomReady function in shell-window/pages.js
  window.postscriptListener = postscriptListener

  ipcRenderer.on('inject-scripts', (event, prescriptJS, prescriptCSS) => {
    if (prescriptJS) {
      prescriptJS = prescriptJS.toString()
    }
    if (prescriptCSS) {
      prescriptCSS = prescriptCSS.toString()
    }
    inject(prescriptJS, prescriptCSS)
  })
}

function inject (jsString, cssString) {
  // define SECURITY_POLICY constant to inject into the page, to allow
  // parallel scripts to run without compromising security

  const SECURITY_POLICY = `<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'self';\">`

  // define body and head of underlying webview DOM

  const body = document.body || document.getElementsByTagName('body')[0]
  const head = document.head || document.getElementsByTagName('head')[0]

  // add custom security policy

  head.prepend(SECURITY_POLICY)

  // appends javascript to the <body>

  if (jsString) {
    const jsElement = document.createElement('script')
    console.log('jsElement', jsElement)
    jsElement.appendChild(document.createTextNode(jsString))
    body.appendChild(jsElement)
  }

  // appends css to the <head>

  if (cssString) {
    const cssElement = document.createElement('style')
    cssElement.type = 'text/css'
    cssElement.appendChild(document.createTextNode(cssString))
    head.appendChild(cssElement)
  }
}

async function postscriptListener (postscript) {
  console.log('hi!')
  console.log('postscript', postscript)
  const userURL = 'dat://127ba27d39e656cd88ea2c81b060903de33bbaa4b0a1f71e05eb3a1661a78bd4'
  const userDB = await ParallelAPI.open(new DatArchive(userURL))
  console.log('db in inject', userDB)
}

// TCW -- END
