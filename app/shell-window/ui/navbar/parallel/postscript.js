import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (postscript) {
  return yo`
    <li>
      <div class="list-item sidebarscripts" onclick=${() => injectPostscript(postscript)}>
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

function injectPostscript (postscript) {
  console.log('postscript in button', postscript)
  ipcRenderer.send('inject-widget', postscript)
}
