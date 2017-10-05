/* globals beaker */
import { ipcRenderer} from 'electron'

const yo = require('yo-yo')
const co = require('co')

// globals
//

// keys, cached in memory
var keys

// main
// =

co(function * () {
  // get the bookmarks, ordered by # of views
  keys = yield beaker.keys.get(0)
  console.log('keys in keys', keys)
  keys = [{title: 'App Key', url: keys.appURL}, {title: 'Profile Key', url: keys.profileURL}]
  render()
})

// rendering
// =

function render () {
  const renderRow = (row, i) =>
    row.isEditing ? renderRowEditing(row, i) : renderRowDefault(row, i)

  const renderRowEditing = (row, i) =>
    yo`
    <li class="ll-row editing ll-link bookmarks__row bookmarks__row--editing" data-row=${i}>
      <div class="link">
        <div class="inputs bookmarks__inputs">
          <input name="title" value=${row.editTitle} onkeyup=${onKeyUp(i)} />
          <input name="url" value=${row.editUrl} onkeyup=${onKeyUp(i)} />
        </div>
      </div>
    </li>`

  const renderRowDefault = (row, i) =>
    yo`
      <li class="ll-row bookmarks__row" data-row=${i}>
        <a class="link bookmark__link" title=${row.title} />
          <img class="favicon bookmark__favicon" src=${'beaker-favicon:' + row.url} />
          <span class="title bookmark__title">${row.title}</span>
          <span class="title bookmark__title">${row.url}</span>
        </a>
        <div class="actions bookmark__actions">
          <i class="fa fa-pencil" onclick=${onClickEdit(i)} title="Edit Key"></i>
        </div>
      </li>`

  var helpEl = ''
  if (keys.length === 0) {
    helpEl = yo`<span class="bookmarks__info">No keys.</span>`
  }

  yo.update(
    document.querySelector('.bookmarks-wrapper'),
    yo`
        <div class="bookmarks-wrapper">
          <h1 class="ll-heading">Keys</h1>
          <ul class="links-list bookmarks">
            ${keys.map(renderRow)}
            ${helpEl}
          </ul>
          <h3>Setting Up Your Sidebar</h3>
          <ol>
            <li>Make sure you've copied your profile key into your clipboard.</li>
            <li>Hover over the Profile Key field (empty by default).</li>
            <li>Click the pencil icon to edit, and clear the field.</li>
            <li>Paste in your profile key, then press "Enter."</li>
            <li>Restart and reopen Parallel</li>
            <li>You're done!</li>
          </ol>
        </div>`)
}

// event handlers
// =

function onClickEdit (i) {
  return e => {
    e.preventDefault()
    e.stopPropagation()

    // capture initial value
    keys[i].editTitle = keys[i].title
    keys[i].editUrl = keys[i].url

    // enter edit-mode
    keys[i].isEditing = true
    render()
    document.querySelector(`[data-row="${i}"] input`).focus()
  }
}

function onKeyUp (i) {
  return e => {
    if (e.keyCode == 13) {
      // enter-key
      // capture the old url
      var oldUrl = keys[i].url

      // update values
      keys[i].title = document.querySelector(`[data-row="${i}"] [name="title"]`).value
      keys[i].url = document.querySelector(`[data-row="${i}"] [name="url"]`).value

      // exit edit-mode
      keys[i].isEditing = false
      render()

      // save in backend
      beaker.keys.add(keys[0].url, keys[1].url)
      ipcRenderer.send('keys-reset')
    } else if (e.keyCode == 27) {
      // escape-key
      // exit edit-mode
      keys[i].isEditing = false
      render()
    } else {
      // all else
      // update edit values
      if (e.target.name == 'title') { keys[i].editTitle = e.target.value }
      if (e.target.name == 'url') { keys[i].editUrl = e.target.value }
    }
  }
}
