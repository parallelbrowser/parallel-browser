import * as yo from 'yo-yo'
import {ArchivesList} from 'builtin-pages-lib'
import {pluralize} from '../../lib/strings'
import {findParent} from '../../lib/fg/event-handlers'

var isShelfOpen = false
var update


export function renderShelf (shelfOpenBody, shelfClosedBody) {
  if (!isShelfOpen) {
    return yo`
      <div class="shelf closed" onclick=${toggleShelf}>
        ${shelfClosedBody}
      </div>
    `
  }

  return yo`
    <div class="shelf open" onmouseout=${onMouseOutShelf}>
      ${shelfOpenBody}
    </div>
  `
}

export function setUpdate(updateFunc) {
  update = updateFunc
}

function toggleShelf () {
  isShelfOpen = !isShelfOpen
  update()
}

function onMouseOutShelf (e) {
  if (!findParent(e.relatedTarget, 'shelf')) {
    isShelfOpen = false
    update()
  }
}
