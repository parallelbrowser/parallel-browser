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
  const userURL = 'dat://749d4e76ba9d82e7dfe7e66ef0666e9d0c54475ba3bc7f83ab7da5f29bd8abcf'
  const userDB = await ParallelAPI.open(new DatArchive(userURL))
  postscript.profile = await userDB.getProfile(postscript.subscriptOrigin)
  yo.update(document.getElementById(postscript.createdAt), yo`
      <li>
        <div class="list-item" onclick=${() => injectPostscript(postscript)}>
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
