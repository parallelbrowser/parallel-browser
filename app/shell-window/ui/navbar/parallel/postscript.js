/* globals DatArchive */

import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
import ParallelAPI from 'parallel-scratch-api'
// Render the list of scripts in the dropdown
export default function (postscript) {
  console.log('window loc', document.location.href)
  getProfile(postscript)
  console.log('post with profile', postscript)
  return yo`
    <li id=${postscript.createdAt}>
      <div><p><i class="fa fa-spinner"></i>Loading...</p></div>
    </li>
  `
}

async function getProfile (postscript) {
  const userURL = 'dat://a87ed34ff60ca766333bc5bde7ddf120ebf11814ab2a84e6923fc087f96ccd11'
  const userDB = await ParallelAPI.open(new DatArchive(userURL))
  postscript.profile = await userDB.getProfile(postscript._origin)
  console.log('profile', postscript.profile)
  yo.update(document.getElementById(postscript.createdAt), yo`
      <li>
        <div class="list-item sidebarscripts" onclick=${() => injectPostscript(postscript)}>
            <div style="display: inline-block" title=${postscript.subscriptName}>
              <span><b>${postscript.subscriptName}</b></span>
            </div>
            <br>
            <div style="display: inline-block">
              <span>${postscript.subscriptInfo}</span>
            </div>
            <br>
            <div style="display: inline-block">
              <span>By ${postscript.profile.name}</span>
            </div>
        </div>
      </li>
    `
  )
}

function injectPostscript (postscript) {
  console.log('postscript in button', postscript)
  ipcRenderer.send('inject-widget', postscript)
}
