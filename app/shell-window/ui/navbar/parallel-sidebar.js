/* globals DatArchive */
import ParallelAPI from 'parallel-scratch-api'
import * as yo from 'yo-yo'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'
import subscriptList from './parallel/subscript-list'
import postscriptList from './parallel/postscript-list'

export class ParallelBtn {
  constructor () {
    this.isDropdownOpen = false
    this.showSubscripts = true
    this.subscripts = null
    this.postscripts = null
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
    this.loadSubscripts()
    this.loadPostscripts()
  }

  async loadSubscripts () {
    const userURL = 'dat://749d4e76ba9d82e7dfe7e66ef0666e9d0c54475ba3bc7f83ab7da5f29bd8abcf'
    const userDB = await ParallelAPI.open(new DatArchive(userURL))
    const profile = await userDB.getProfile(userURL)
    this.subscripts = profile.subscripts
  }

  async loadPostscripts () {
    const userURL = 'dat://749d4e76ba9d82e7dfe7e66ef0666e9d0c54475ba3bc7f83ab7da5f29bd8abcf'
    const userDB = await ParallelAPI.open(new DatArchive(userURL))
    this.postscripts = await userDB.listPostscripts()
    const currentURL = this.getCurrentURL()
    this.postscripts = this.postscripts.filter(p => {
      return p.postscriptHTTP === currentURL
    })
  }

  getCurrentURL () {
    var webviews = document.getElementById('webviews').children
    var currentURL
    for (var i = 0; i < webviews.length; i++) {
      var webview = webviews[i]
      if (!webview.className.includes('hidden')) {
        currentURL = webview.src
      }
    }
    return currentURL
  }

  render () {
    this.loadPostscripts()
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      // TODO: change the "view all scripts" and "discover" links
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 300px" class="dropdown-items script-dropdown with-triangle visible">

            <div class="grid default">
              <div class="grid-item" onclick=${() => this.onToggleClick(true)}>
                <i class="fa fa-file-code-o"></i>
                Gizmos
              </div>
              <div class="grid-item" onclick=${() => this.onToggleClick(false)}>
                <i class="fa fa-file-text-o"></i>
                Widgets
              </div>
            </div>


            ${this.showSubscripts ? subscriptList(this.subscripts) : postscriptList(this.postscripts)}

            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, 'dat://8c6a3e0ce9a6dca628c570476f8bca6b138c2d698742260aae5113f1797ce78a')}>
                <i class="fa fa-home"></i>
                <span>Home</span>
              </a>
            </div>

          </div>
        </div>`
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu browser-dropdown-scripts">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Script">
          <span class="fa fa-code"></span>
        </button>
        ${dropdownEl}
      </div>`
  }

  // Manages the redirect to other scripts from the clicked author
  clickedAuthor (scriptObj) {
      // TODO: send an ipc request for the rest of the scripts from this author
      //       and find a way to display them
    this.updateActives()
  }

  // Toggles whether the user is viewing prescripts or post scripts on the current site
  onToggleClick (showSubscripts) {
    this.showSubscripts = showSubscripts
    if (showSubscripts) {
      this.loadSubscripts()
    } else {
      this.loadPostscripts()
    }
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
