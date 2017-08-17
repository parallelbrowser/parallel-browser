import * as yo from 'yo-yo'
import loadingView from './loading'
import renderPostscript from './postscript'

export default function (postscripts, updatePostscripts) {
  if (!postscripts) {
    return loadingView()
  }
  if (postscripts.length === 0) {
    return yo`
      <ul>
        <li>
          <div class="list-item sidebarscripts">
            No widgets for this page.
          </div>
        </li>
      </ul>
    `
  }

  return yo`
    <ul>
      ${postscripts.map(p => renderPostscript(p, updatePostscripts))}
    </ul>
  `
}
