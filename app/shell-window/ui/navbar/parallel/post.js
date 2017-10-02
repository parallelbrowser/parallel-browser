import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
import * as pages from '../../../pages'
import { Comments } from './comments'
import datURLS from './dat-urls'

// Render the list of scripts in the dropdown
export class Post {
  constructor (post, loadPosts) {
    this.showIcons = false
    this.showComments = false
    this.post = post
    this.loadPosts = loadPosts
    this.userAppURL = datURLS.userAppURL
    console.log('post in constructor', post)
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons
    this.updateActives()
  }

  updateActives () {
    // Array.from(document.querySelectorAll('.post')).forEach(el => yo.update(el, this.render()))
    // yo.update(document.getElementById(this.post._url), this.render())
    // console.log('document in post', document)
    console.log('updating actives in post')
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.post._url))).forEach(el => yo.update(el, this.render()))
  }

  onOpenPage (opts) {
    let path
    switch (opts) {
      case 'user':
        path = this.getViewProfileURL()
        break
      case 'post':
        path = this.getViewPostURL()
        break
      case 'gizmo':
        path = this.getViewGizmoURL()
        break
    }
    const url = this.userAppURL + path
    pages.setActive(pages.create(url))
    this.showIcons = false
    this.updateActives()
  }

  getViewGizmoURL () {
    return '/#gizmo/' + this.post.gizmo._url.slice('dat://'.length)
  }

  getViewPostURL () {
    return '/#post/' + this.post._url.slice('dat://'.length)
  }

  getViewProfileURL () {
    return '/#profile/' + this.post._origin.slice('dat://'.length)
  }

  injectPost (post) {
    console.log('post in button', post)
    ipcRenderer.send('inject-post', post)
  }

  parseDatPath () {
    let dat = this.post._url.replace(/\//g, '')
    dat = dat.replace(/\./g, '')
    dat = dat.replace(/:/g, '')
    return dat
  }

  toggleShowComments () {
    this.showComments = !this.showComments
    this.updateActives()
  }

  render () {
    var icons = ''
    if (this.showIcons) {
      icons = yo`
        <div style="display: inline-block">
          <i class="fa fa-play-circle-o fa-lg" onclick=${() => this.injectPost(this.post)}></i>
          <i class="fa fa-pencil-square-o fa-lg" onclick=${() => this.toggleShowComments()}></i>
          <i class="fa fa-user-circle-o fa-lg" onclick=${() => this.onOpenPage('user')}></i>
          <i class="fa fa-file-text-o fa-lg" onclick=${() => this.onOpenPage('post')}></i>
          <i class="fa fa-superpowers fa-lg" onclick=${() => this.onOpenPage('gizmo')}></i>
        </div>
      `
    }
    return yo`
      <li class="list-item sidebarscripts ${this.parseDatPath()} post" onmouseenter=${() => this.onMouseOverToggle()} onmouseleave=${() => this.onMouseOverToggle()}>
        <div class="list-item">
          <div style="display: inline-block" title=${this.post.author.name}>
            <span><b>${this.post.author.name}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${this.post.postText}</span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>Gizmo: ${this.post.gizmo.gizmoName}</span>
          </div>
          <br>
          ${icons}
          ${this.showComments ? new Comments(this.post, this.loadPosts, this.updateActives.bind(this)).render() : ''}
        </div>
      </li>
    `
  }
}
