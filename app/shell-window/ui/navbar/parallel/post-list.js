import * as yo from 'yo-yo'
import loadingView from './loading'
import renderPost from './post'

export default function (posts, updatePostscripts) {
  if (!posts) {
    return loadingView()
  }
  if (posts.length === 0) {
    return yo`
      <ul>
        <li>
          <div class="list-item sidebarscripts">
            No posts for this page.
          </div>
        </li>
      </ul>
    `
  }

  return yo`
    <ul>
      ${posts.map(p => renderPost(p, updatePostscripts))}
    </ul>
  `
}
