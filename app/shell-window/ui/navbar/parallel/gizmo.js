import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (gizmo) {
  return yo`
    <li>
      <div class="list-item sidebarscripts" onclick=${() => injectSubscript(gizmo)}>
          <div style="display: inline-block" title=${gizmo.gizmoName}>
            <span><b>${gizmo.gizmoName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${gizmo.gizmoDescription}</span>
          </div>
      </div>
    </li>
  `
}

function injectSubscript (gizmo) {
  console.log('gizmo in button', gizmo)
  ipcRenderer.send('inject-gizmo', gizmo)
}
