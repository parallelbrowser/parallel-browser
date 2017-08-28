import * as yo from 'yo-yo'
import loadingView from './loading'
import { Gizmo } from './gizmo'

export default function (gizmos) {
  console.log('gizmos', gizmos)
  if (!gizmos) {
    return loadingView()
  }
  if (gizmos.length === 0) {
    return yo`
      <ul>
        <li>
          <div class="list-item sidebarscripts">
            You are not using any gizmos!
          </div>
        </li>
      </ul>
    `
  }

  return yo`
    <ul>
      ${gizmos.map(g => new Gizmo(g).render())}
    </ul>
  `
}
