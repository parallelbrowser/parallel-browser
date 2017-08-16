import * as yo from 'yo-yo'
import loadingView from './loading'
import renderSubscript from './subscript'

export default function (subscripts) {
  if (!subscripts) {
    return loadingView()
  }
  if (subscripts.length === 0) {
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
      ${subscripts.map(p => renderSubscript(p))}
    </ul>
  `
}
