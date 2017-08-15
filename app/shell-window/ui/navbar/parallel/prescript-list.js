import * as yo from 'yo-yo'
import loadingView from './loading'
import renderPrescript from './prescript'

export default function (prescripts) {
  if (!prescripts) {
    return loadingView()
  }
  if (prescripts.length === 0) {
    return yo`
      <ul>
        <li>
          <div class="list-item">
            You are not using any gizmos!
          </div>
        </li>
      </ul>
    `
  }

  return yo`
    <ul>
      ${prescripts.map(p => renderPrescript(p))}
    </ul>
  `
}
