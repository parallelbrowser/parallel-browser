import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
// Render the list of scripts in the dropdown
export default function (post) {
  console.log('post in renderPost', post)
  return yo`
    <li>
      <div class="list-item sidebarscripts" onclick=${() => injectPost(post)}>
          <div style="display: inline-block" title=${post.gizmo.gizmoName}>
            <span><b>${post.gizmo.gizmoName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${post.gizmo.gizmoDescription}</span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>By ${post.author.name}</span>
          </div>
      </div>
    </li>
  `
}

function injectPost (post) {
  console.log('post in button', post)
  ipcRenderer.send('inject-post', post)
}
