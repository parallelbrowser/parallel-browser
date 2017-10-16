/* globals DatArchive localStorage  */

import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-api'

let profileURL

export function setup () {
  window.savePostParams = savePostParams

  ipcRenderer.on('inject-gizmo', (event, gizmo) => {
    profileURL = gizmo.keyset.profileURL
    localStorage.setItem('activeGizmoURL', gizmo._url)
    gizmo.fullDependencies.forEach((d, idx) => {
      inject(d.gizmoJS, d.gizmoCSS, d._url)
    })
    inject(gizmo.gizmoJS, gizmo.gizmoCSS, gizmo._url)
  })

  ipcRenderer.on('inject-post', (event, post) => {
    togglePost(post)
  })
}

function inject (js, css, gizmoURL) {
  const body = document.body || document.getElementsByTagName('body')[0]
  const head = document.head || document.getElementsByTagName('head')[0]

  // const SECURITY_POLICY = `<meta http-equiv="Content-Security-Policy" content="script-src 'self';">`
  // <meta http-equiv="Content-Security-Policy" content="connect-src 'self' file: data: blob: filesystem:; default-src *; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'"/>
  const SECURITY_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src *;
   img-src * 'self' data: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' *;
   style-src 'self' 'unsafe-inline' *">`
  head.prepend(SECURITY_POLICY)

  if (css) {
    const cssElement = document.createElement('style')
    cssElement.type = 'text/css'
    cssElement.appendChild(document.createTextNode(css))
    head.appendChild(cssElement)
  }

  if (js && gizmoURL) {
    const scriptElement = document.createElement('script')
    scriptElement.setAttribute('id', gizmoURL)
    scriptElement.appendChild(document.createTextNode(js))
    body.appendChild(scriptElement)
  }
}

function togglePost (post) {
  post.postDependencies.forEach((d, idx) => {
    inject(d.gizmoJS, d.gizmoCSS, d._url)
  })
  window.postParams = JSON.parse(post.postParams)
  inject(post.gizmo.postJS, post.gizmo.postCSS, post.gizmoURL)
}

async function savePostParams (postParams) {
  const gizmoURL = localStorage.getItem('activeGizmoURL')
  localStorage.removeItem('activeGizmoURL')
  let postHTTP = window.location.href
  if (postHTTP.indexOf('?') !== -1) {
    postHTTP = postHTTP.split('?')[0]
  }
  const postText = window.prompt('Describe your post.')
  if (postParams && gizmoURL && postHTTP) {
    postParams = JSON.stringify(postParams)
    const post = {
      postParams,
      postHTTP,
      postText,
      gizmoURL
    }
    const userDB = await ParallelAPI.open(new DatArchive(profileURL))
    await userDB.post(profileURL, post)
  }
  ipcRenderer.sendToHost('reload-posts', window.location.href)
}
