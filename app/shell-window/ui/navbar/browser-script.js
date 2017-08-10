/* globals beakerDownloads DatArchive */

import * as yo from 'yo-yo'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'
import { ipcRenderer } from 'electron'


export class BrowserScriptNavbarBtn {
  constructor () {
    this.isDropdownOpen = false
    this.showPre = false
    this.preScripts = null
    this.postScripts = null

    // TODO: find a way to lisen for an ipc message that tells whether you're
    //       on a new site. If they are, set preScripts and postScripts to null

    // wire up events
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
  }


  render () {
    // Set dropdown element
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      //TODO: change the "view all scripts" and "discover" links
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 300px" class="dropdown-items script-dropdown with-triangle visible">

            <div class="grid default">
              <div class="grid-item" onclick=${() => this.prePostClick(true)}>
                <i class="fa fa-file-code-o"></i>
                Pre-Scripts
              </div>
              <div class="grid-item" onclick=${() => this.prePostClick(false)}>
                <i class="fa fa-file-text-o"></i>
                Post-Scripts
              </div>
            </div>


            ${this.renderPreOrPost()}

            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')}>
                <i class="fa fa-eye"></i>
                <span>View All Scripts</span>
              </a>
              <a onclick=${e => this.onOpenPage(e, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')}>
                <i class="fa fa-user-plus"></i>
                <span>Discover</span>
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
    let title = ''

    //TODO: remove after testing, actually retrieve the scripts from somewhere
    //TODO: need to query this from backend instead

    let a = new Date(Date.now())
    let preScripts = [{name: 'PRE', desc: 'Description of Script', time: a.toDateString(), author: 'Songebob', pubKey: 'IAMTHEONETHEONEDONTNEEDAGUNTOGETRESPECTUPONTHESESTREETS', clicked: false},
                      {name: 'PRE', desc: 'Description of Script', time: a.toDateString(), author: 'Sandy', pubKey: 'IAMTHEONETHEONEDONTNEEDAGUNTOGETRESPECTUPONTHESESTREETS', clicked: false}]
    let postScripts = [{name: 'POST', desc: 'Description of Script', time: a.toDateString(), author: 'Patrick', pubKey: 'IAMTHEONETHEONEDONTNEEDAGUNTOGETRESPECTUPONTHESESTREETS', clicked: false},
                      {name: 'POST', desc: 'Description of Script', time: a.toDateString(), author: 'Squidward', pubKey: 'IAMTHEONETHEONEDONTNEEDAGUNTOGETRESPECTUPONTHESESTREETS', clicked: false}]


    // If the user is viewing prescripts, show them. Otherwise, show postscripts for this site
    if(this.showPre) {
      title = 'Your Pre-Scripts';
      if(!this.preScripts){
        this.preScripts = preScripts // TODO: should be this.preScripts || preScriptsQuery
      }
    } else {
      title = 'Your Post-Scripts'
      if(!this.postScripts){
        this.postScripts = postScripts //TODO: should be this.postScripts || postScriptsQuery
      }
    }

    return yo`
      <div>
        <div class="section-header">
          <h3>
            ${title}
          </h3>
        </div>
        <ul>
          ${this.showPre ? this.scriptsList(this.preScripts) : this.scriptsList(this.postScripts)}
        </ul>
      </div>`
  }

  // Render the list of scripts in the dropdown
  scriptsList (scripts) {
    //TODO: programatically get the name of the current user (for comparison against the author of the script)
    let userName = 'Patrick'

    var scriptsList = [];

    // Check if there are any scripts. If not, let the user know
    if(scripts.length === 0){
      scriptsList.push(
        yo`
        <li>
          <div class="list-item">
            No scripts for this page
          </div>
        </li>`
      )
    } else {
      scriptsList = scripts.map((scriptObj, index) => {
        // For every script, add the properly formatted li
        return yo`
          <li>
            <div class="list-item ${scriptObj.clicked ? 'enabled' : ''}">

                <div style="display: inline-block" title=${scriptObj.author} onClick=${() => this.clickedAuthor(scriptObj)}>
                  <i class="fa ${userName === scriptObj.author ? 'fa-user' : 'fa-users'}"></i>
                </div>
                <a onclick=${() => this.toggleActivated(scripts, index)}>
                <div style="display: inline-block">
                  <div>
                    <span> <b>${scriptObj.name}</b></span>
                    <span> <i>${scriptObj.time}</i></span>
                  </div>
                  <div>
                    <span> ${scriptObj.desc}</span>
                    <span> <i> By: ${scriptObj.author}</i></span>
                  </div>
                </div>
                </a>
            </div>
          </li>`
      })
    }

    // The last button is an add new scrips button
    scriptsList = scriptsList.concat(
      //TODO: change the "add new script" link
      yo`
        <li>
          <div class="list-item">
            <a onclick=${e => this.onOpenPage(e, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')}>
              <i class="fa fa-plus"></i>
              <span> Add New Script</span>
            </a>
          </div>
        </li>`
    )

    return scriptsList;
  }

  // Manages the redirect to other scripts from the clicked author
  clickedAuthor (scriptObj) {
      // TODO: send an ipc request for the rest of the scripts from this author
      //       and find a way to display them
      this.updateActives()
  }

  // Manages the toggling of each script on click
  // TODO: this should also send out an ipc message to inject-scripts notifying
  //       a new list of enabled and disabled scripts
  toggleActivated (arr, index) {
    arr[index].clicked = !arr[index].clicked
    this.updateActives()
  }

  // Toggles whether the user is viewing prescripts or post scripts on the current site
  prePostClick (isPre) {
    if(isPre) {
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
