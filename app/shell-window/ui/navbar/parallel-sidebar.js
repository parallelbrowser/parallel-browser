/* globals DatArchive beaker prompt */
import ParallelAPI from 'parallel-scratch-api'
import * as yo from 'yo-yo'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'
import { GizmoList } from './parallel/gizmo-list'
import {PostList} from './parallel/post-list'
import datURLs from './parallel/dat-urls'
import { ipcRenderer } from 'electron'

export class ParallelBtn {
  constructor () {
    this.isDropdownOpen = false
    this.showGizmos = true
    this.gizmos = null
    this.posts = null
    this.userAppURL = null
    this.userProfileURL = null
    this.keyset = null
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
    this.wireIPC()
    this.setup()
  }

  async loadGizmos () {
    const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL))
    this.gizmos = await userDB.listGizmos({
      fetchAuthor: true,
      reverse: true,
      subscriber: this.userProfileURL,
      fetchGizmoDependencies: true
    })
  }

  wireIPC () {
    ipcRenderer.on('keys-reset', e => {
      this.setup()
    })
  }

  setup () {
    beaker.keys.get(0).then(keyset => {
      this.keyset = keyset
      this.userAppURL = keyset.appURL
      this.userProfileURL = keyset.profileURL
      this.loadGizmos()
      this.updateActives()
      pages.on('set-active', this.onSetActive.bind(this))
      pages.on('load-commit', this.onLoadCommit.bind(this))
      pages.on('reload-posts', this.onReloadPosts.bind(this))
    })
  }

  onSetActive (page) {
    this.posts = null
    this.updateActives()
    this.loadGizmos()
    this.loadPosts(page.url)
  }

  onLoadCommit (url) {
    this.posts = null
    this.updateActives()
    this.loadGizmos()
    this.loadPosts(url)
  }

  onReloadPosts (url) {
    this.posts = null
    this.updateActives()
    this.loadGizmos()
    this.loadPosts(url)
  }

  async loadPosts (currentURL) {
    if (currentURL && this.userProfileURL) {
      const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL))
      this.posts = await userDB.listPosts({
        fetchAuthor: true,
        fetchReplies: true,
        countVotes: true,
        reverse: true,
        fetchGizmo: true,
        requester: this.userProfileURL,
        currentURL,
        fetchPostDependencies: true
      })
    }
    this.updateActives()
  }

  toggleKeyPrompt () {
    // const appURL = prompt('Enter the app URL.')
    // const profileURL = prompt('Enter the profile URL.')
    beaker.keys.add(
      'dat://b60149d2cf3cde895ebc17f248d6d6a47eda2818cddf45648eecb8beb3d93b3e',
      'dat://627a7a94c0e4893be3b216fcfc34d39ba1a84794401b3782ba53bbf418ebf70f'
    )
    beaker.keys.get(0).then(keyset => {
      datURLs.userAppURL = keyset.userAppURL
      datURLs.userProfileURL = keyset.userProfileURL
    })
  }

  render () {
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 400px; height: 100vh; position: fixed; overflow: auto;" class="dropdown-items script-dropdown with-triangle visible">
            <div class="grid default">
              <div id="gizmo" class="grid-item ${this.showGizmos ? 'enabled' : ''}" onclick=${() => this.onToggleClick(true)}>
                <i class="fa fa-superpowers"></i>
                Gizmos
              </div>
              <div id="widget" class="grid-item ${this.showGizmos ? '' : 'enabled'}" onclick=${() => this.onToggleClick(false)}>
                <i class="fa fa-file-text-o"></i>
                Posts
              </div>
            </div>
            ${this.showGizmos ? new GizmoList(this.gizmos, this.keyset).render() : new PostList(this.posts, this.keyset, this.loadPosts.bind(this)).render()}
            <div class="footer" style="">
              <a onclick=${e => this.onOpenPage(e, this.userAppURL)}>
                <i class="fa fa-home"></i>
                <span>Home</span>
              </a>
              <a onclick=${e => this.onOpenPage(e, 'beaker://keys')}>
                <i class="fa fa-key" onclick=${() => this.toggleKeyPrompt()}></i>
                <span>Keys</span>
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
