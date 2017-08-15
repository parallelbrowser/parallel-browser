import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (prescript) {
  return yo`
    <li>
      <div class="list-item" onclick=${() => hi(prescript)}>
          <div style="display: inline-block" title=${prescript.prescriptName}>
            <span><b>${prescript.prescriptName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${prescript.prescriptInfo}</span>
          </div>
      </div>
    </li>
  `
}

function hi (prescript) {
  console.log('prescript in button', prescript)
  ipcRenderer.send('inject-scripts', prescript)
}
