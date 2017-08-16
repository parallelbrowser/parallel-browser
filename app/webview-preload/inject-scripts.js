/* globals DatArchive localStorage */

import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-scratch-api'
// TCW CHANGES -- injects scripts into the webview DOM

export function setup () {
  // listens for the 'inject-scripts' ipc event called in the
  // onDomReady function in shell-window/pages.js
  window.postscriptListener = postscriptListener

  ipcRenderer.on('inject-scripts', (event, subscript) => {
    let subscriptCredentials = {
      subscriptName: subscript.subscriptName,
      subscriptInfo: subscript.subscriptInfo,
      subscriptOrigin: subscript.subscriptOrigin,
      subscriptURL: subscript.subscriptURL
    }
    subscriptCredentials = JSON.stringify(subscriptCredentials)
    localStorage.setItem('subscriptCredentials', subscriptCredentials)
    let subscriptJS
    let subscriptCSS
    let subscriptURL
    if (subscript.subscriptJS) {
      subscriptJS = subscript.subscriptJS.toString()
    }
    if (subscript.subscriptCSS) {
      subscriptCSS = subscript.subscriptCSS.toString()
    }
    if (subscript.subscriptURL) {
      subscriptURL = subscript.subscriptURL.toString()
    }
    inject(subscriptJS, subscriptCSS, subscriptURL)
  })
}

function inject (subscriptJS, subscriptCSS, subscriptURL) {
  // define SECURITY_POLICY constant to inject into the page, to allow
  // parallel scripts to run without compromising security

  const SECURITY_POLICY = `<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'self';\">`

  // define body and head of underlying webview DOM

  const body = document.body || document.getElementsByTagName('body')[0]
  const head = document.head || document.getElementsByTagName('head')[0]

  // add custom security policy

  head.prepend(SECURITY_POLICY)

  // appends javascript to the <body>

  if (subscriptJS && subscriptURL) {
    const jsElement = document.createElement('script')
    jsElement.setAttribute('id', subscriptURL)
    jsElement.appendChild(document.createTextNode(subscriptJS))
    body.appendChild(jsElement)
  }

  // appends css to the <head>

  if (subscriptCSS) {
    const cssElement = document.createElement('style')
    cssElement.type = 'text/css'
    cssElement.appendChild(document.createTextNode(subscriptCSS))
    head.appendChild(cssElement)
  }
}

async function postscriptListener (postscriptJS) {
  const subscriptCredentials = JSON.parse(localStorage.getItem('subscriptCredentials'))
  if (postscriptJS && subscriptCredentials && subscriptCredentials.subscriptURL) {
    const script = document.getElementById(subscriptCredentials.subscriptURL)
    script.parentNode.removeChild(script)
    localStorage.removeItem('subscriptCredentials')
    const postscript = Object.assign({}, {postscriptJS: postscriptJS.outerHTML, postscriptHTPP: window.location.href}, subscriptCredentials)
    const userURL = 'dat://8c6a3e0ce9a6dca628c570476f8bca6b138c2d698742260aae5113f1797ce78a'
    const userDB = await ParallelAPI.open(new DatArchive(userURL))
    await userDB.postscript(userURL, postscript)
  }
}

// TCW -- END
