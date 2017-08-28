import { ipcRenderer } from 'electron'
import * as yo from 'yo-yo'
import * as pages from '../../../pages'
// Render the list of scripts in the dropdown
export class Gizmo {
  constructor (gizmo) {
    console.log('gizmo', gizmo)
    this.showIcons = false
    this.gizmo = gizmo
    this.userAppURL = 'dat://a5d20d746829e528e0fc1cf4fd567e245e5213b8fb5bc195f51d2369251cd2c2'
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons
    this.updateActives()
  }

  updateActives () {
    yo.update(document.getElementById(this.gizmo._url), this.render())
  }

  onOpenPage () {
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

  render () {
    var icons = ''
    if (this.showIcons) {
      icons = yo`
        <div style="display: inline-block">
          <i class="fa fa-play-circle-o fa-lg" onclick=${() => this.injectGizmo(this.gizmo)}></i>
          <i class="fa fa-cog fa-lg" onclick=${() => this.onOpenPage()}></i>
        </div>
      `
    }
    return yo`
      <li id=${this.gizmo._url} class="list-item sidebarscripts gizmo" onmouseenter=${() => this.onMouseOverToggle()} onmouseleave=${() => this.onMouseOverToggle()}>
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
