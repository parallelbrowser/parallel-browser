import * as yo from 'yo-yo'
import loadingView from './loading'
import { Post } from './post'

export class PostList {
  constructor (posts, keyset, loadPosts) {
    this.posts = posts
    this.keyset = keyset
    this.loadPosts = loadPosts
  }
  render () {
    if (!this.posts) {
      return loadingView()
    }
    if (this.posts.length === 0) {
      return yo`
        <ul class="post-list">
          <li>
            <div class="list-item sidebarscripts">
              No posts for this page.
            </div>
          </li>
        </ul>
      `
    }

    return yo`
      <ul class="post-list">
        ${this.posts.map(p => new Post(p, this.keyset, this.loadPosts).render())}
      </ul>
    `
  }
}
