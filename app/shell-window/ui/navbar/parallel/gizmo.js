import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
import * as pages from '../../../pages'
// Render the list of scripts in the dropdown
export class Gizmo {
  constructor (gizmo) {
    this.showIcons = false
    this.gizmo = gizmo
    this.userAppURL = 'dat://93b7277e6204d6434597f98aa01f844d813073802d45ebe5538511504ae81da6'
    console.log('this.gizmo in constructor', gizmo)
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons
    this.updateActives()
  }

  updateActives () {
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.gizmo._url))).forEach(el => yo.update(el, this.render()))
  }

  onOpenGizmoPage () {
    const url = this.userAppURL + this.getViewGizmoURL()
    pages.setActive(pages.create(url))
    this.showIcons = false
    this.updateActives()
  }

  getViewGizmoURL () {
    return '/#gizmo/' + this.gizmo._url.slice('dat://'.length)
  }

  injectGizmo (gizmo) {
    console.log('gizmo in button', gizmo)
    ipcRenderer.send('inject-gizmo', gizmo)
  }

  parseDatPath () {
    let dat = this.gizmo._url.replace(/\//g, '')
    dat = dat.replace(/\./g, '')
    dat = dat.replace(/:/g, '')
    return dat
  }

  render () {
    var icons = ''
    if (this.showIcons) {
      icons = yo`
        <div style="display: inline-block">
          <i class="fa fa-play-circle-o fa-lg" onclick=${() => this.injectGizmo(this.gizmo)}></i>
          <i class="fa fa-superpowers fa-lg" onclick=${() => this.onOpenGizmoPage()}></i>
        </div>
      `
    }
    return yo`
      <li class="list-item sidebarscripts ${this.parseDatPath()} gizmo" onmouseenter=${() => this.onMouseOverToggle()} onmouseleave=${() => this.onMouseOverToggle()}>
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
