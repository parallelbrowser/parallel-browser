/* globals DatArchive */
import ParallelAPI from 'parallel-scratch-api'
import * as yo from 'yo-yo'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'
import { GizmoList } from './parallel/gizmo-list'
import {PostList} from './parallel/post-list'

export class ParallelBtn {
  constructor () {
    this.isDropdownOpen = false
    this.showGizmos = true
    this.gizmos = null
    this.posts = []
    this.userURL = 'dat://ae24bd05a27e47e0a83694b97ca8a9e98ffa340da6e4a0a325c9852483d377a6'
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
    this.setup()
  }

  async loadGizmos () {
    const userDB = await ParallelAPI.open(new DatArchive(this.userURL))
    this.gizmos = await userDB.listGizmos({
      fetchAuthor: true,
      reverse: true,
      subscriber: this.userURL
    })
  }

  setup () {
    this.loadGizmos()
    this.updateActives()
    pages.on('set-active', this.onSetActive.bind(this))
    pages.on('hash-change', this.onHashChange.bind(this))
    pages.on('reload-posts', this.onReloadPosts.bind(this))
  }

  onSetActive (page) {
    this.posts = null
    this.updateActives()
    this.loadPosts(page.url)
  }

  onHashChange (url) {
    this.posts = null
    this.updateActives()
    this.loadPosts(url)
  }

  onReloadPosts (url) {
    this.posts = null
    this.updateActives()
    this.loadPosts(url)
  }

  async loadPosts (currentURL) {
    if (currentURL) {
      const userDB = await ParallelAPI.open(new DatArchive(this.userURL))
      this.posts = await userDB.listPosts({
        fetchAuthor: true,
        fetchReplies: true,
        countVotes: true,
        reverse: true,
        fetchGizmo: true,
        requester: this.userURL,
        currentURL
      })
    }
    this.updateActives()
  }

  render () {
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 400px; height: 100vh;" class="dropdown-items script-dropdown with-triangle visible">
            <div class="grid default">
              <div id="gizmo" class="grid-item ${this.showGizmos ? 'enabled' : ''}" onclick=${() => this.onToggleClick(true)}>
                <i class="fa fa-file-code-o"></i>
                Gizmos
              </div>
              <div id="widget" class="grid-item ${this.showGizmos ? '' : 'enabled'}" onclick=${() => this.onToggleClick(false)}>
                <i class="fa fa-file-text-o"></i>
                Posts
              </div>
            </div>
            ${this.showGizmos ? new GizmoList(this.gizmos).render() : new PostList(this.posts).render()}
            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, 'dat://a5d20d746829e528e0fc1cf4fd567e245e5213b8fb5bc195f51d2369251cd2c2')}>
                <i class="fa fa-home"></i>
                <span>Home</span>
              </a>
            </div>
          </div>
        </div>
      `
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu browser-dropdown-scripts">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Script">
          <span class="fa fa-code"></span>
        </button>
        ${dropdownEl}
      </div>
    `
  }

  // Manages the redirect to other scripts from the clicked author
  clickedAuthor (scriptObj) {
      // TODO: send an ipc request for the rest of the scripts from this author
      //       and find a way to display them
    this.updateActives()
  }

  // Toggles whether the user is viewing prescripts or post scripts on the current site
  onToggleClick (showGizmos) {
    if (showGizmos) {
      Array.from(document.querySelectorAll('.post-list')).forEach(el => { el.innerHTML = '' })
    } else {
      Array.from(document.querySelectorAll('.gizmo-list')).forEach(el => { el.innerHTML = '' })
    }
    this.showGizmos = showGizmos
    this.updateActives()
  }

  updateActives () {
    console.log('actives in button', Array.from(document.querySelectorAll('.browser-dropdown-scripts')))
    Array.from(document.querySelectorAll('.browser-dropdown-scripts')).forEach(el => yo.update(el, this.render()))
  }

  doAnimation () {
    Array.from(document.querySelectorAll('.browser-dropdown-scripts .toolbar-btn')).forEach(el =>
      el.animate([
        {transform: 'scale(1.0)', color: 'inherit'},
        {transform: 'scale(1.5)', color: '#06c'},
        {transform: 'scale(1.0)', color: 'inherit'}
      ], { duration: 300 })
    )
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen
    this.updateActives()
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'browser-dropdown-scripts')
    if (parent) return // abort - this was a click on us!
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false
      this.updateActives()
    }
  }

  onOpenPage (e, url) {
    pages.setActive(pages.create(url))
    this.isDropdownOpen = false
    this.updateActives()
  }
}
