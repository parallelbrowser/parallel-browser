/* globals DatArchive */
import ParallelAPI from 'parallel-scratch-api'
import * as yo from 'yo-yo'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'
import prescriptList from './parallel/prescript-list'
import postscriptList from './parallel/postscript-list'
// import { ipcRenderer } from 'electron'

export class BrowserScriptNavbarBtn {
  constructor () {
    this.isDropdownOpen = false
    this.showPre = false
    this.prescripts = null
    this.postscripts = null
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
    this.loadPrescripts()
  }
  async loadPrescripts () {
    const userURL = 'dat://127ba27d39e656cd88ea2c81b060903de33bbaa4b0a1f71e05eb3a1661a78bd4'
    const userDB = await ParallelAPI.open(new DatArchive(userURL))
    console.log('userDB', userDB)
    const profile = await userDB.getProfile(userURL)
    console.log('current user profile', profile)
    this.prescripts = await userDB.listPrescripts({
      fetchAuthor: true,
      countVotes: true,
      reverse: true,
      author: 'dat://127ba27d39e656cd88ea2c81b060903de33bbaa4b0a1f71e05eb3a1661a78bd4'
    })
    console.log('these prescripts', this.prescripts)
  }
  render () {
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      // TODO: change the "view all scripts" and "discover" links
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 300px" class="dropdown-items script-dropdown with-triangle visible">

            <div class="grid default">
              <div class="grid-item" onclick=${() => this.prePostClick(true)}>
                <i class="fa fa-file-code-o"></i>
                Gizmos
              </div>
              <div class="grid-item" onclick=${() => this.prePostClick(false)}>
                <i class="fa fa-file-text-o"></i>
                Widgets
              </div>
            </div>


            ${this.showPre ? prescriptList(this.prescripts) : postscriptList(this.postscripts)}

            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, 'dat://87be7e6edfae1bbfb848271fdf0c3a48f310ebd29a36c255b6453483d52f107b')}>
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

  renderPreOrPost () {
    return yo`
      <div>
        <div class="section-header">
          <h3>
            ${this.showPre ? 'Gizmos' : 'Widgets'}
          </h3>
        </div>
        <ul>
          ${this.showPre ? this.scriptsList(this.preScripts) : this.scriptsList(this.postScripts)}
        </ul>
      </div>`
  }

  // Manages the redirect to other scripts from the clicked author
  clickedAuthor (scriptObj) {
      // TODO: send an ipc request for the rest of the scripts from this author
      //       and find a way to display them
    this.updateActives()
  }

  // Toggles whether the user is viewing prescripts or post scripts on the current site
  prePostClick (isPre) {
    if (isPre) {
      this.showPre = true
    } else {
      this.showPre = false
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
