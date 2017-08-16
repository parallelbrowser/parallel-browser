import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (postscript, updatePostscripts) {
  return yo`
    <li>
      <div class="list-item" onclick=${() => injectPostscript(postscript, updatePostscripts)}>
          <div style="display: inline-block" title=${postscript.subscriptName}>
            <span><b>${postscript.subscriptName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${postscript.subscriptInfo}</span>
          </div>
      </div>
    </li>
  `
}

function injectPostscript (postscript, updatePostscripts) {
  console.log('postscript in button', postscript)
  ipcRenderer.send('inject-scripts', postscript)
  setTimeout(() => updatePostscripts, 1000)
}
