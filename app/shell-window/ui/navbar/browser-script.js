/* globals beakerDownloads DatArchive */

import * as yo from 'yo-yo'
import emitStream from 'emit-stream'
import prettyBytes from 'pretty-bytes'
import { ucfirst } from '../../../lib/strings'
import { findParent } from '../../../lib/fg/event-handlers'
import * as pages from '../../pages'

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the BrowserMenuNavbarBtn manages all instances, and you should only create one

export class BrowserScriptNavbarBtn {
  constructor () {
    this.downloads = []
    this.sumProgress = null // null means no active downloads
    this.isDropdownOpen = false
    this.shouldPersistProgressBar = false

    // fetch current
    beakerDownloads.getDownloads().then(ds => {
      this.downloads = ds
      this.updateActives()
    })

    // wire up events
    var dlEvents = emitStream(beakerDownloads.eventsStream())
    dlEvents.on('new-download', this.onNewDownload.bind(this))
    dlEvents.on('sum-progress', this.onSumProgress.bind(this))
    dlEvents.on('updated', this.onUpdate.bind(this))
    dlEvents.on('done', this.onDone.bind(this))
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true)
  }

  render () {
    // render the dropdown if open
    var dropdownEl = ''
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div class="dropdown-items with-triangle visible">
            <div class="grid default">
              <div class="grid-item" onclick=${e => this.onOpenPage(e, 'beaker://history')}>
                <i class="fa fa-history"></i>
                History
              </div>

              <div class="grid-item" onclick=${e => this.onOpenPage(e, 'beaker://library')}>
                <i class="fa fa-list"></i>
                Library
              </div>

              <div class="grid-item" onclick=${e => this.onCreateSite(e)}>
                <i class="fa fa-pencil"></i>
                New site
              </div>

              <div class="grid-item" onclick=${e => this.onOpenPage(e, 'beaker://downloads')}>
                <i class="fa fa-download"></i>
                Downloads
              </div>

              <div class="grid-item" onclick=${e => this.onOpenPage(e, 'beaker://bookmarks')}>
                <i class="fa fa-star"></i>
                Bookmarks
              </div>

              <div class="grid-item" onclick=${e => this.onOpenPage(e, 'beaker://settings')}>
                <i class="fa fa-gear"></i>
                Settings
              </div>

            </div>
          </div>
        </div>`
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu browser-dropdown-script">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Script">
          <span class="fa fa-bars"></span>
        </button>
        ${dropdownEl}
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.browser-dropdown-script')).forEach(el => yo.update(el, this.render()))
  }

  doAnimation () {
    Array.from(document.querySelectorAll('.browser-dropdown-menu .toolbar-btn')).forEach(el =>
      el.animate([
        {transform: 'scale(1.0)', color: 'inherit'},
        {transform: 'scale(1.5)', color: '#06c'},
        {transform: 'scale(1.0)', color: 'inherit'}
      ], { duration: 300 })
    )
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen
    this.shouldPersistProgressBar = false // stop persisting if we were, the user clicked
    this.updateActives()
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'browser-dropdown-menu')
    if (parent) return // abort - this was a click on us!
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false
      this.updateActives()
    }
  }

  onNewDownload () {
    this.doAnimation()

    // open the dropdown
    this.isDropdownOpen = true
    this.updateActives()
  }

  onSumProgress (sumProgress) {
    this.sumProgress = sumProgress
    this.updateActives()
  }

  onUpdate (download) {
    // patch data each time we get an update
    var target = this.downloads.find(d => d.id == download.id)
    if (target) {
      // patch item
      for (var k in download) { target[k] = download[k] }
    } else { this.downloads.push(download) }
    this.updateActives()
  }

  onDone (download) {
    this.shouldPersistProgressBar = true // keep progress bar up so the user notices
    this.doAnimation()
    this.onUpdate(download)
  }

  onPause (e, download) {
    e.preventDefault()
    e.stopPropagation()
    beakerDownloads.pause(download.id)
  }

  onResume (e, download) {
    e.preventDefault()
    e.stopPropagation()
    beakerDownloads.resume(download.id)
  }

  onCancel (e, download) {
    e.preventDefault()
    e.stopPropagation()
    beakerDownloads.cancel(download.id)
  }

  onShow (e, download) {
    e.preventDefault()
    e.stopPropagation()
    beakerDownloads.showInFolder(download.id)
      .catch(err => {
        download.fileNotFound = true
        this.updateActives()
      })
  }

  onOpen (e, download) {
    e.preventDefault()
    e.stopPropagation()
    beakerDownloads.open(download.id)
      .catch(err => {
        download.fileNotFound = true
        this.updateActives()
      })
  }

  onClearDownloads (e) {
    e.preventDefault()
    e.stopPropagation()
    this.downloads = []
    this.updateActives()
  }

  async onCreateSite (e) {
    // close dropdown
    this.isDropdownOpen = !this.isDropdownOpen
    this.updateActives()

    var archive = await DatArchive.create()
    pages.getActive().loadURL('beaker://library/' + archive.url.slice('dat://'.length))
  }

  onOpenPage (e, url) {
    pages.setActive(pages.create(url))
    this.isDropdownOpen = false
    this.updateActives()
  }
}
