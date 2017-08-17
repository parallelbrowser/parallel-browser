/* globals DatArchive localStorage */

import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-scratch-api'

export function setup () {
  window.savePostscript = savePostscript

  ipcRenderer.on('inject-subscript', (event, subscript) => {
    console.log('here')
    let subscriptCredentials = {
      subscriptName: subscript.subscriptName,
      subscriptInfo: subscript.subscriptInfo,
      subscriptOrigin: subscript.subscriptOrigin,
      subscriptURL: subscript.subscriptURL
    }
    subscriptCredentials = JSON.stringify(subscriptCredentials)
    console.log('creds', subscriptCredentials)
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

  ipcRenderer.on('inject-widget', (event, widget) => {
    toggleWidget(widget)
  })
}

function inject (scriptJS, scriptCSS, scriptURL) {
  // defines body and head of underlying webview DOM

  const body = document.body || document.getElementsByTagName('body')[0]
  const head = document.head || document.getElementsByTagName('head')[0]

  // HACK defines SECURITY_POLICY constant to inject into the page. (surely
  // there's a better way...)

  // const SECURITY_POLICY = `<meta http-equiv="Content-Security-Policy" content="script-src 'self';">`
  // <meta http-equiv="Content-Security-Policy" content="connect-src 'self' file: data: blob: filesystem:; default-src *; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'"/>
  const SECURITY_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src *;
   img-src * 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' *;
   style-src  'self' 'unsafe-inline' *">`
  head.prepend(SECURITY_POLICY)

  // appends javascript to the <body>

  if (scriptJS && scriptURL) {
    const scriptElement = document.createElement('script')
    scriptElement.setAttribute('id', scriptURL)
    scriptElement.appendChild(document.createTextNode(scriptJS))
    body.appendChild(scriptElement)
  }

  if (scriptCSS) {
    const cssElement = document.createElement('style')
    cssElement.type = 'text/css'
    cssElement.appendChild(document.createTextNode(scriptCSS))
    head.appendChild(cssElement)
  }
}

// important! savePostscript is attached to the window and must be defined in
// the prescript. the function gets credentials from localStorage, removes
// the injected script from the dom, then writes the postscript to the user's
// injestdb

async function savePostscript (postscriptJS) {
  const subscriptCredentials = JSON.parse(localStorage.getItem('subscriptCredentials'))
  if (postscriptJS && subscriptCredentials && subscriptCredentials.subscriptURL) {
    removeScript(subscriptCredentials.subscriptURL)
    localStorage.removeItem('subscriptCredentials')
    const postscript = Object.assign({}, {postscriptJS, postscriptHTTP: window.location.href}, subscriptCredentials)
    const userURL = 'dat://2d13045a6f250ff50bd98fe0db2cd57924b59d4d0a4225ea5d040141c55f3b68'
    const userDB = await ParallelAPI.open(new DatArchive(userURL))
    console.log('db', userDB)
    await userDB.postscript(userURL, postscript)
  }
}

function toggleWidget (widget) {
  var element = document.getElementById(widget.subscriptURL)
  if (typeof (element) !== 'undefined' && element !== null) {
    removeScript(widget.subscriptURL)
  } else {
    inject(widget.postscriptJS, null, widget.subscriptURL)
  }
}

function removeScript (id) {
  const scriptElement = document.getElementById(id)
  scriptElement.parentNode.removeChild(scriptElement)
}

// end
