import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (subscript) {
  return yo`
    <li>
      <div class="list-item" onclick=${() => injectSubscript(subscript)}>
          <div style="display: inline-block" title=${subscript.subscriptName}>
            <span><b>${subscript.subscriptName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${subscript.subscriptInfo}</span>
          </div>
      </div>
    </li>
  `
}

function injectSubscript (subscript) {
  console.log('subscript in button', subscript)
  ipcRenderer.send('inject-scripts', subscript)
}
