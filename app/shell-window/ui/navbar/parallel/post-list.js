import * as yo from 'yo-yo'
import loadingView from './loading'
import { Post } from './post-up'

export default function (posts) {
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
      ${posts.map(p => new Post(p).render())}
    </ul>
  `
}
