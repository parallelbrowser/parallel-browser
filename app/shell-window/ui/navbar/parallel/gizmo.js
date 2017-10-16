import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
import * as pages from '../../../pages'

// Render the list of scripts in the dropdown
export class Gizmo {
  constructor (gizmo, keyset) {
    this.showIcons = false
    gizmo.keyset = keyset
    this.gizmo = gizmo
    this.keyset = keyset
    this.userAppURL = keyset.appURL
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons
    this.updateActives()
  }

  updateActives () {
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.gizmo._url))).forEach(el => yo.update(el, this.render()))
  }

  onOpenGizmoPage (e) {
    e.stopPropagation()
    const url = this.userAppURL + this.getViewGizmoURL()
    pages.setActive(pages.create(url))
    this.showIcons = false
    this.updateActives()
  }

  getViewGizmoURL () {
    return '/#gizmo/' + this.gizmo._url.slice('dat://'.length)
  }

  injectGizmo (gizmo) {
    ipcRenderer.send('inject-gizmo', gizmo)
  }

  parseDatPath () {
    let dat = this.gizmo._url.replace(/\//g, '')
    dat = dat.replace(/\./g, '')
    dat = dat.replace(/:/g, '')
    return dat
  }

  render () {
    var icons = yo`
        <div style="display: inline-block">
          <span onclick=${(e) => this.onOpenGizmoPage(e)}><i class="fa fa-question-circle-o fa-lg"></i>More Info</span>
        </div>
      `
    return yo`
      <li class="list-item sidebarscripts ${this.parseDatPath()} gizmo" onclick=${() => this.injectGizmo(this.gizmo)}>
        <div class="list-item">
          <div style="display: inline-block" title=${this.gizmo.gizmoName}>
            <span><b>${this.gizmo.gizmoName}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${this.gizmo.gizmoDescription}</span>
          </div>
          <br>
          ${icons}
        </div>
      </li>
    `
  }
}
