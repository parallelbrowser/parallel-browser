/* globals DatArchive subscriptCredentials */

import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-scratch-api'
// TCW CHANGES -- injects scripts into the webview DOM

export function setup () {
  // listens for the 'inject-scripts' ipc event called in the
  // onDomReady function in shell-window/pages.js
  window.postscriptListener = postscriptListener

  ipcRenderer.on('inject-scripts', (event, subscript) => {
    console.log('subscript in inject', subscript)
    const subscriptCredentials = {
      subscriptName: subscript.prescriptName,
      subscriptInfo: subscript.prescriptInfo,
      subscriptOrigin: subscript._origin,
      subscriptURL: subscript._url
    }
    window.subscriptCredentials = subscriptCredentials
    let subscriptJS
    let subscriptCSS
    if (subscript.subscriptJS) {
      subscriptJS = subscript.subscriptJS.toString()
    }
    if (subscript.subscriptCSS) {
      subscriptCSS = subscript.subscriptCSS.toString()
    }
    inject(subscriptJS, subscriptCSS)
  })
}

function inject (subscriptJS, subscriptCSS) {
  // define SECURITY_POLICY constant to inject into the page, to allow
  // parallel scripts to run without compromising security

  const SECURITY_POLICY = `<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'self';\">`

  // define body and head of underlying webview DOM

  const body = document.body || document.getElementsByTagName('body')[0]
  const head = document.head || document.getElementsByTagName('head')[0]

  // add custom security policy

  head.prepend(SECURITY_POLICY)

  // appends javascript to the <body>

  if (subscriptJS) {
    const jsElement = document.createElement('script')
    console.log('jsElement', jsElement)
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
  console.log('hi!')
  console.log('postscript', postscriptJS.toString())
  console.log('subscriptCredentials', subscriptCredentials)
  const postscript = Object.assign(subscriptCredentials, {postscriptJS: postscriptJS.outerHTML, postscriptHTPP: window.location.href})
  console.log('postscript obj', postscript)
  const userURL = 'dat://8c6a3e0ce9a6dca628c570476f8bca6b138c2d698742260aae5113f1797ce78a'
  const userDB = await ParallelAPI.open(new DatArchive(userURL))
  await userDB.postscript(userURL, postscript)
  console.log('db in inject', userDB)
}

// TCW -- END
