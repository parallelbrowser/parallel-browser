/* globals DatArchive */

import * as yo from 'yo-yo'
const debounce = require('debounce')
const moment = require('moment')
import * as pages from '../../../pages'
import ParallelAPI from 'parallel-scratch-api'

export class Comments {
  constructor (post, loadPosts, updatePostActives) {
    this.post = post
    this.loadPosts = loadPosts
    this.updatePostActives = updatePostActives
    this.replies = post.replies || []
    this.commentDraft = ''
    this.userAppURL = 'dat://e1894210760ba8220f4187702ec450bc263e7f609b2746359cea38893031975b'
    this.userProfileURL = 'dat://3b585d9f087aa8002418194f245cc87f9f0483c31f13ef382516d5d6b60f71bd'
  }
  render () {
    return yo`
    <div class="comments ${this.parseDatPath()}">
      <div class="comments-editor">
        <textarea style="cursor: auto" onkeypress=${this.onDetectEnter.bind(this)} onkeyup=${debounce(this.onChangeComment.bind(this), 300)} type="text" placeholder="Write a comment...">${this.commentDraft}</textarea>
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

  parseDatPath () {
    let dat = this.post._url.replace(/\//g, '')
    dat = dat.replace(/\./g, '')
    dat = dat.replace(/:/g, '')
    return dat + 'comments'
  }

  onOpenProfilePage (author) {
    const url = this.userAppURL + this.getViewProfileURL(author)
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
    const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL))
    try {
      await userDB.broadcast(
        this.userProfileURL,
        {text: this.commentDraft, threadParent: this.post._url})
    } catch (e) {
      console.error(e)
      return
    }
    this.commentDraft = ''
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.post._url) + 'comments')).forEach(el => el.remove())
    this.loadPosts(this.post.postHTTP)
    this.updatePostActives()
    this.updateActives()
  }

  updateActives () {
    console.log('updating actives in comments')
    // Array.from(document.querySelectorAll('.comments')).forEach(el => { el.innerHTML = '' })
    // Array.from(document.querySelectorAll('.post')).forEach(el => { el.innerHTML = '' })
    // Array.from(document.querySelectorAll('.' + this.parseDatPath(this.post._url) + 'comments')).forEach(el => yo.update(el, this.render()))
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
