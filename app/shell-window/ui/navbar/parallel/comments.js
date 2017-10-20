/* globals DatArchive */

import * as yo from 'yo-yo'
const debounce = require('debounce')
const moment = require('moment')
import * as pages from '../../../pages'
import ParallelAPI from 'parallel-api'

export class Comments {
  constructor (post, keyset, loadPosts, updatePostActives) {
    this.post = post
    this.loadPosts = loadPosts
    this.updatePostActives = updatePostActives
    this.replies = post.replies || []
    this.commentDraft = ''
    this.keyset = keyset
  }
  render () {
    return yo`
    <div class="comments" id=${this.parseDatPath()}>
      <div class="comments-editor">
        <textarea style="cursor: auto" onkeypress=${this.onDetectEnter.bind(this)} onclick=${(e) => this.stopProp(e)} onkeyup=${(e) => this.onChangeComment(e)} type="text" placeholder="Write a comment...">${this.commentDraft}</textarea>
      </div>

      ${this.replies.map(r => yo`
        <div class="comment">
          <div class="content">
            <span onlick=${() => this.onOpenProfilePage(r.author)} class="author">${r.author.name}: </span>
            <span class="comment-text">${r.text} -- </span> <a class="ts">${this.niceDate(r.createdAt)}</span>
            <div class="footer">
            </div>
          </div>
        </div>`
      )}
    </div>
    `
  }

  stopProp (e) {
    e.stopPropagation()
  }

  parseDatPath () {
    let dat = this.post._url.replace(/\//g, '')
    dat = dat.replace(/\./g, '')
    dat = dat.replace(/:/g, '')
    return dat + 'comments'
  }

  onOpenProfilePage (author) {
    const url = this.keyset.appURL + this.getViewProfileURL(author)
    pages.setActive(pages.create(url))
  }

  getViewProfileURL (author) {
    return '/#profile/' + author._origin.slice('dat://'.length)
  }

  onDetectEnter (e) {
    if (e.which == 13 || e.keyCode == 13) {
      e.preventDefault()
      this.submitComment()
    }
  }

  async submitComment () {
    let newReply = {author: {_origin: this.keyset.profileURL, name: 'You'}, text: this.commentDraft, createdAt: Date.now()}
    console.log('newreply', newReply)
    this.replies.push(newReply)
    console.log('this.replies', this.replies)
    console.log('el', document.getElementById(this.parseDatPath()))
    const finalComment = this.commentDraft

    this.commentDraft = ''
    this.updatePostActives()
    yo.update(document.getElementById(this.parseDatPath()), this.render())
    const userDB = await ParallelAPI.open(new DatArchive(this.keyset.profileURL))
    try {
      await userDB.broadcast(
        this.keyset.profileURL,
        {text: finalComment, threadParent: this.post._url})
    } catch (e) {
      console.error(e)
      return
    }
  }

  onChangeComment (e) {
    this.commentDraft = e.target.value
  }

  niceDate (ts, opts) {
    const endOfToday = moment().endOf('day')
    if (typeof ts === 'number') { ts = moment(ts) }
    if (ts.isSame(endOfToday, 'day')) {
      if (opts && opts.noTime) { return 'today' }
      return ts.fromNow()
    } else if (ts.isSame(endOfToday.subtract(1, 'day'), 'day')) { return 'yesterday' } else if (ts.isSame(endOfToday, 'month')) { return ts.fromNow() }
    return ts.format('ll')
  }
}
