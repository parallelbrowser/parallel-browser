(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var electron = require('electron');
var yo = require('yo-yo');
var EventEmitter = _interopDefault(require('events'));
var path = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));
var parseDatURL = _interopDefault(require('parse-dat-url'));
var prettyHash = _interopDefault(require('pretty-hash'));
var emitStream = _interopDefault(require('emit-stream'));
var prettyBytes = _interopDefault(require('pretty-bytes'));
var ParallelAPI = _interopDefault(require('parallel-scratch-api'));
var rpc = _interopDefault(require('pauls-electron-rpc'));
var errors = _interopDefault(require('beaker-error-constants'));

/* globals URL DatArchive */

var events$1 = new EventEmitter();
var webviewsEl;
var sidebarEl;
var dragHandleEl;
var activePanel;
var panels = {}; // pageId => {webview: Element, target: String (the url)}
var sidebarWidth = 310;

// exported api
// =

function on$1 (...args) {
  events$1.on.apply(events$1, args);
}

function getIsOpen (page) {
  page = page || getActive();
  return (page.id in panels)
}

function getIsAvailable () {
  var page = getActive();
  return (page && page.url && page.url.startsWith('dat://'))
}

function setup$4 () {
  webviewsEl = document.getElementById('webviews');
  sidebarEl = document.getElementById('dat-sidebar');
  dragHandleEl = document.getElementById('dat-sidebar-draghandle');
  dragHandleEl.addEventListener('mousedown', onDragMouseDown);
  dragHandleEl.addEventListener('mouseup', onDragMouseUp);
  window.addEventListener('resize', doResize);
}

function toggle (page) {
  if (getIsOpen(page)) close(page);
  else open(page);
}

function open (page) {
  if (getIsOpen(page)) return
  setActivePanel(setupPanel(page || getActive()));
  setActivePanelVisibility();
  events$1.emit('change');
}

function close (page) {
  page = page || getActive();
  if (!getIsOpen(page)) return
  destroyPanel(page.id);
  setActivePanelVisibility();
  events$1.emit('change');
}

function onPageChangeLocation (page) {
  if (!getIsOpen(page)) return
  setupPanel(page);
  setActivePanelVisibility();
  events$1.emit('change');
}

function onPageSetActive (page) {
  setActivePanel(panels[page.id]);
  setActivePanelVisibility();
  events$1.emit('change');
}

function onPageClose (page) {
  if (!page || !page.id) {
    return console.log(new Error('Passed a bad page object'))
  }
  close(page);
}

// panel management
// =

function setupPanel (page) {
  // only make visible for dat pages
  if (!page.url.startsWith('dat://')) {
    destroyPanel(page.id);
    return null
  }

  // get/create the panel
  var panel = panels[page.id];
  if (!panel) {
    panel = panels[page.id] = {webview: null, target: null};
  }
  var oldUrl = panel.target;
  panel.target = page.url;
  var wvUrl = `beaker://dat-sidebar/${page.url}`;

  // create/update webview as needed
  if (!panel.webview) {
    var wv = createWebviewEl('dat-sidebar-webview', wvUrl);
    wv.addEventListener('ipc-message', onIPCMessage);
    sidebarEl.appendChild(wv);
    panel.webview = wv;
  } else {
    // only load a new URL if the domain has changed
    checkIsNewLocation();
    async function checkIsNewLocation () {
      let isNewLocation = true;
      try {
        let oldUrlParsed = new URL(oldUrl);
        let newUrlParsed = new URL(page.url);
        if (oldUrlParsed.protocol === newUrlParsed.protocol) {
          // resolve the DNS
          let [oldKey, newKey] = await Promise.all([
            DatArchive.resolveName(oldUrlParsed.hostname),
            DatArchive.resolveName(newUrlParsed.hostname)
          ]);
          if (oldKey === newKey) {
            isNewLocation = false;
          }
        }
      } catch (e) { /* ignore */ }
      if (isNewLocation) {
        panel.webview.loadURL(wvUrl);
      }
    }
  }

  return panel
}

function setActivePanel (panel) {
  activePanel = panel;
}

function destroyPanel (id) {
  var panel = panels[id];
  if (!panel) return
  if (panel.webview) {
    sidebarEl.removeChild(panel.webview);
  }
  if (activePanel === panel) {
    activePanel = null;
  }
  delete panels[id];
}

// sidebar rendering
// =

function setActivePanelVisibility () {
  if (!activePanel) {
    hideSidebar();
    return
  }

  // hide all sidebar webviews
  for (var id in panels) {
    if (panels[id].webview) {
      panels[id].webview.classList.add('hidden');
    }
  }

  // make visible
  activePanel.webview.classList.remove('hidden');
  setTimeout(() => reflowWebview(activePanel.webview), 60);
  showSidebar();
}

function showSidebar () {
  sidebarEl.classList.add('open');
  doResize();
}

function hideSidebar () {
  sidebarEl.classList.remove('open');
  doResize();
}

// HACK
// on some devices, the webview has some rendering errors
// by triggering a reflow, we seem to force the errors to resolve
// -prf
function reflowWebview (el) {
  el.style.width = 'auto';
  // trigger reflow
  el.offsetHeight; // eslint-disable-line no-unused-expressions
  el.style.width = '100%';
}

// resizing behaviors
// =

function doResize () {
  // set the sidebar width
  sidebarEl.style.width = `${sidebarWidth}px`;

  // resize each webview individually
  var pageSize = document.body.getClientRects()[0];
  Array.from(webviewsEl.querySelectorAll('webview')).forEach(wv => {
    var id = wv.dataset.id || '';
    if (panels[id]) {
      wv.style.width = `${pageSize.width - sidebarWidth}px`;
    } else {
      wv.style.width = '100%';
    }
  });
}

function onDragMouseDown (e) {
  window.addEventListener('mousemove', onDragMouseMove);
  window.addEventListener('mouseup', onDragMouseUp, {once: true});
}

function onDragMouseUp (e) {
  window.removeEventListener('mousemove', onDragMouseMove);
}

function onDragMouseMove (e) {
  var pageSize = document.body.getClientRects()[0];
  sidebarWidth = pageSize.width - e.x;
  if (sidebarWidth < 310) sidebarWidth = 310;
  doResize();
}

/* globals beakerBrowser */

class UpdatesNavbarBtn {
  constructor () {
    this.isUpdateAvailable = false;
    this.isDropdownOpen = false;

    var browserEvents = emitStream(beakerBrowser.eventsStream());
    browserEvents.on('updater-state-changed', this.onUpdaterStateChange.bind(this));
  }

  render () {
    // render nothing if no update is availabe
    if (!this.isUpdateAvailable) { return yo`<div class="toolbar-updates"></div>` }

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="toolbar-dropdown toolbar-updates-dropdown">
          <div class="toolbar-updates-dropdown-inner dropdown-items">
            A new version of Beaker is ready to install.
            <a href="#" onclick=${this.onClickRestart.bind(this)}>Restart now.</a>
          </div>
        </div>`;
    }

    // render btn
    return yo`<div class="toolbar-updates">
      <button class="toolbar-btn toolbar-updates-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickUpdates(e)} title="Update available">
        <span class="icon icon-up-circled"></span>
      </button>
      ${dropdownEl}
    </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.toolbar-updates')).forEach(el => yo.update(el, this.render()));
  }

  onClickUpdates (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  onUpdaterStateChange (state) {
    this.isUpdateAvailable = state == 'downloaded';
    this.updateActives();
  }

  onClickRestart (e) {
    e.preventDefault();
    beakerBrowser.restartBrowser();
  }
}

function getPermId (permissionToken) {
  return permissionToken.split(':')[0]
}

function getPermParam (permissionToken) {
  return permissionToken.split(':').slice(1).join(':')
}

function ucfirst (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function pluralize (num, base, suffix = 's') {
  if (num === 1) { return base }
  return base + suffix
}

function findParent (node, test) {
  if (typeof test === 'string') {
    // classname default
    var cls = test;
    test = el => el.classList && el.classList.contains(cls);
  }

  while (node) {
    if (test(node)) {
      return node
    }
    node = node.parentNode;
  }
}

/* globals beakerDownloads DatArchive */

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the BrowserMenuNavbarBtn manages all instances, and you should only create one

class BrowserMenuNavbarBtn {
  constructor () {
    this.downloads = [];
    this.sumProgress = null; // null means no active downloads
    this.isDropdownOpen = false;
    this.shouldPersistProgressBar = false;

    // fetch current
    beakerDownloads.getDownloads().then(ds => {
      this.downloads = ds;
      this.updateActives();
    });

    // wire up events
    var dlEvents = emitStream(beakerDownloads.eventsStream());
    dlEvents.on('new-download', this.onNewDownload.bind(this));
    dlEvents.on('sum-progress', this.onSumProgress.bind(this));
    dlEvents.on('updated', this.onUpdate.bind(this));
    dlEvents.on('done', this.onDone.bind(this));
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    // show active, then inactive, with a limit of 5 items
    var progressingDownloads = this.downloads.filter(d => d.state == 'progressing').reverse();
    var activeDownloads = (progressingDownloads.concat(this.downloads.filter(d => d.state != 'progressing').reverse())).slice(0, 5);

    // render the progress bar if downloading anything
    var progressEl = '';

    if ((progressingDownloads.length > 0 || this.shouldPersistProgressBar) && this.sumProgress && this.sumProgress.receivedBytes <= this.sumProgress.totalBytes) {
      progressEl = yo`<progress value=${this.sumProgress.receivedBytes} max=${this.sumProgress.totalBytes}></progress>`;
    }

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      let downloadEls = activeDownloads.map(d => {
        // status
        var status = d.state === 'completed' ? '' : d.state;
        if (status == 'progressing') {
          status = prettyBytes(d.receivedBytes) + ' / ' + prettyBytes(d.totalBytes);
          if (d.isPaused) { status += ', Paused'; }
        } else { status = ucfirst(status); }

        // ctrls
        var ctrlsEl;
        if (d.state == 'completed') {
          // actions
          if (!d.fileNotFound) {
            ctrlsEl = yo`
              <li class="download-item-ctrls complete">
                <a onclick=${e => this.onOpen(e, d)}>Open file</a>
                <a onclick=${e => this.onShow(e, d)}>Show in folder</a>
              </li>`;
          } else {
            ctrlsEl = yo`
              <li class="download-item-ctrls not-found">
                File not found (moved or deleted)
              </li>`;
          }
        } else if (d.state == 'progressing') {
          ctrlsEl = yo`
            <li class="download-item-ctrls paused">
              ${d.isPaused
                ? yo`<a onclick=${e => this.onResume(e, d)}>Resume</a>`
                : yo`<a onclick=${e => this.onPause(e, d)}>Pause</a>`}
              <a onclick=${e => this.onCancel(e, d)}>Cancel</a>
            </li>`;
        }

        // render download
        return yo`
          <li class="download-item">
            <div class="name">${d.name}</div>
            <div class="status">
              ${d.state == 'progressing'
                ? yo`<progress value=${d.receivedBytes} max=${d.totalBytes}></progress>`
                : ''}
              ${status}
            </div>
            ${ctrlsEl}
          </li>`
      });
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

            ${downloadEls.length ? yo`
              <div>
                <hr>
                <div class="downloads">
                  <h2>Downloads</h2>
                  <ul class="downloads-list">${downloadEls}</ul>
                </div>
              </div>` : ''}

            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, 'https://github.com/beakerbrowser/beaker/issues')}>
                <i class="fa fa-info-circle"></i>
                <span>Report an issue</span>
              </a>
              <a onclick=${e => this.onOpenPage(e, 'https://beakerbrowser.com/docs')}>
                <i class="fa fa-question"></i>
                <span>Help</span>
              </a>
            </div>
          </div>
        </div>`;
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu browser-dropdown-menu">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Menu">
          <span class="fa fa-bars"></span>
          ${progressEl}
        </button>
        ${dropdownEl}
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.browser-dropdown-menu')).forEach(el => yo.update(el, this.render()));
  }

  doAnimation () {
    Array.from(document.querySelectorAll('.browser-dropdown-menu .toolbar-btn')).forEach(el =>
      el.animate([
        {transform: 'scale(1.0)', color: 'inherit'},
        {transform: 'scale(1.5)', color: '#06c'},
        {transform: 'scale(1.0)', color: 'inherit'}
      ], { duration: 300 })
    );
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.shouldPersistProgressBar = false; // stop persisting if we were, the user clicked
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'browser-dropdown-menu');
    if (parent) return // abort - this was a click on us!
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  onNewDownload () {
    this.doAnimation();

    // open the dropdown
    this.isDropdownOpen = true;
    this.updateActives();
  }

  onSumProgress (sumProgress) {
    this.sumProgress = sumProgress;
    this.updateActives();
  }

  onUpdate (download) {
    // patch data each time we get an update
    var target = this.downloads.find(d => d.id == download.id);
    if (target) {
      // patch item
      for (var k in download) { target[k] = download[k]; }
    } else { this.downloads.push(download); }
    this.updateActives();
  }

  onDone (download) {
    this.shouldPersistProgressBar = true; // keep progress bar up so the user notices
    this.doAnimation();
    this.onUpdate(download);
  }

  onPause (e, download) {
    e.preventDefault();
    e.stopPropagation();
    beakerDownloads.pause(download.id);
  }

  onResume (e, download) {
    e.preventDefault();
    e.stopPropagation();
    beakerDownloads.resume(download.id);
  }

  onCancel (e, download) {
    e.preventDefault();
    e.stopPropagation();
    beakerDownloads.cancel(download.id);
  }

  onShow (e, download) {
    e.preventDefault();
    e.stopPropagation();
    beakerDownloads.showInFolder(download.id)
      .catch(err => {
        download.fileNotFound = true;
        this.updateActives();
      });
  }

  onOpen (e, download) {
    e.preventDefault();
    e.stopPropagation();
    beakerDownloads.open(download.id)
      .catch(err => {
        download.fileNotFound = true;
        this.updateActives();
      });
  }

  onClearDownloads (e) {
    e.preventDefault();
    e.stopPropagation();
    this.downloads = [];
    this.updateActives();
  }

  async onCreateSite (e) {
    // close dropdown
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();

    var archive = await DatArchive.create();
    getActive().loadURL('beaker://library/' + archive.url.slice('dat://'.length));
  }

  onOpenPage (e, url) {
    setActive(create(url));
    this.isDropdownOpen = false;
    this.updateActives();
  }
}

var loadingView = function () {
  return yo`
      <div><p><i class="fa fa-spinner"></i>Loading...</p></div>
  `
};

var datURLS = {
  userAppURL: 'dat://b60149d2cf3cde895ebc17f248d6d6a47eda2818cddf45648eecb8beb3d93b3e',
  userProfileURL: 'dat://627a7a94c0e4893be3b216fcfc34d39ba1a84794401b3782ba53bbf418ebf70f'
};

// Render the list of scripts in the dropdown
class Gizmo {
  constructor (gizmo) {
    this.showIcons = false;
    this.gizmo = gizmo;
    this.userAppURL = datURLS.userAppURL;
    console.log('this.gizmo in constructor', gizmo);
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons;
    this.updateActives();
  }

  updateActives () {
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.gizmo._url))).forEach(el => yo.update(el, this.render()));
  }

  onOpenGizmoPage () {
    const url = this.userAppURL + this.getViewGizmoURL();
    setActive(create(url));
    this.showIcons = false;
    this.updateActives();
  }

  getViewGizmoURL () {
    return '/#gizmo/' + this.gizmo._url.slice('dat://'.length)
  }

  injectGizmo (gizmo) {
    console.log('gizmo in button', gizmo);
    electron.ipcRenderer.send('inject-gizmo', gizmo);
  }

  parseDatPath () {
    let dat = this.gizmo._url.replace(/\//g, '');
    dat = dat.replace(/\./g, '');
    dat = dat.replace(/:/g, '');
    return dat
  }

  render () {
    var icons = '';
    if (this.showIcons) {
      icons = yo`
        <div style="display: inline-block">
          <i class="fa fa-play-circle-o fa-lg" onclick=${() => this.injectGizmo(this.gizmo)}></i>
          <i class="fa fa-superpowers fa-lg" onclick=${() => this.onOpenGizmoPage()}></i>
        </div>
      `;
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

class GizmoList {
  constructor (gizmos) {
    this.gizmos = gizmos;
  }

  render () {
    if (!this.gizmos) {
      return loadingView()
    }
    if (this.gizmos.length === 0) {
      return yo`
        <ul class="gizmo-list">
          <li>
            <div class="list-item sidebarscripts">
              You are not using any gizmos!
            </div>
          </li>
        </ul>
      `
    }

    return yo`
      <ul class="gizmo-list">
        ${this.gizmos.map(g => new Gizmo(g).render())}
      </ul>
    `
  }
}

/* globals DatArchive */

const debounce = require('debounce');
const moment = require('moment');
class Comments {
  constructor (post, loadPosts, updatePostActives) {
    this.post = post;
    this.loadPosts = loadPosts;
    this.updatePostActives = updatePostActives;
    this.replies = post.replies || [];
    this.commentDraft = '';
    this.userAppURL = datURLS.userAppURL;
    this.userProfileURL = datURLS.userProfileURL;
    this.el = this.render();
  }
  render () {
    return yo`
    <div class="comments" id=${this.parseDatPath()}>
      <div class="comments-editor">
        <textarea style="cursor: auto" onkeypress=${this.onDetectEnter.bind(this)} onkeyup=${debounce(this.onChangeComment.bind(this), 300)} type="text" placeholder="Write a comment...">${this.commentDraft}</textarea>
      </div>

      ${this.replies.map(r => yo`
        <div class="comment">
          <div class="content">
            <span onlick=${() => this.onOpenProfilePage(r.author)} class="author">${r.author.name}: </span>
            <span class="comment-text">${r.text} -- </span> <a class="ts">${this.niceDate(r.createdAt)}</span>
            <div class="footer">
            </div>
          </div>
        </div>`
      )}
    </div>
    `
  }

  parseDatPath () {
    let dat = this.post._url.replace(/\//g, '');
    dat = dat.replace(/\./g, '');
    dat = dat.replace(/:/g, '');
    return dat + 'comments'
  }

  onOpenProfilePage (author) {
    const url = this.userAppURL + this.getViewProfileURL(author);
    setActive(create(url));
  }

  getViewProfileURL (author) {
    return '/#profile/' + author._origin.slice('dat://'.length)
  }

  onDetectEnter (e) {
    if (e.which == 13 || e.keyCode == 13) {
      e.preventDefault();
      this.submitComment();
    }
  }

  async submitComment () {
    const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL));
    try {
      await userDB.broadcast(
        this.userProfileURL,
        {text: this.commentDraft, threadParent: this.post._url});
    } catch (e) {
      console.error(e);
      return
    }
    this.commentDraft = '';
    this.loadPosts(this.post.postHTTP);
    this.updatePostActives();
    yo.update(this.el, this.render());
  }

  onChangeComment (e) {
    this.commentDraft = e.target.value;
  }

  niceDate (ts, opts) {
    const endOfToday = moment().endOf('day');
    if (typeof ts === 'number') { ts = moment(ts); }
    if (ts.isSame(endOfToday, 'day')) {
      if (opts && opts.noTime) { return 'today' }
      return ts.fromNow()
    } else if (ts.isSame(endOfToday.subtract(1, 'day'), 'day')) { return 'yesterday' } else if (ts.isSame(endOfToday, 'month')) { return ts.fromNow() }
    return ts.format('ll')
  }
}

// Render the list of scripts in the dropdown
class Post {
  constructor (post, loadPosts) {
    this.showIcons = false;
    this.showComments = false;
    this.post = post;
    this.loadPosts = loadPosts;
    this.userAppURL = datURLS.userAppURL;
    console.log('post in constructor', post);
  }

  onMouseOverToggle () {
    this.showIcons = !this.showIcons;
    this.updateActives();
  }

  updateActives () {
    // Array.from(document.querySelectorAll('.post')).forEach(el => yo.update(el, this.render()))
    // yo.update(document.getElementById(this.post._url), this.render())
    // console.log('document in post', document)
    console.log('updating actives in post');
    Array.from(document.querySelectorAll('.' + this.parseDatPath(this.post._url))).forEach(el => yo.update(el, this.render()));
  }

  onOpenPage (opts) {
    let path$$1;
    switch (opts) {
      case 'user':
        path$$1 = this.getViewProfileURL();
        break
      case 'post':
        path$$1 = this.getViewPostURL();
        break
      case 'gizmo':
        path$$1 = this.getViewGizmoURL();
        break
    }
    const url = this.userAppURL + path$$1;
    setActive(create(url));
    this.showIcons = false;
    this.updateActives();
  }

  getViewGizmoURL () {
    return '/#gizmo/' + this.post.gizmo._url.slice('dat://'.length)
  }

  getViewPostURL () {
    return '/#post/' + this.post._url.slice('dat://'.length)
  }

  getViewProfileURL () {
    return '/#profile/' + this.post._origin.slice('dat://'.length)
  }

  injectPost (post) {
    console.log('post in button', post);
    electron.ipcRenderer.send('inject-post', post);
  }

  parseDatPath () {
    let dat = this.post._url.replace(/\//g, '');
    dat = dat.replace(/\./g, '');
    dat = dat.replace(/:/g, '');
    return dat
  }

  toggleShowComments () {
    this.showComments = !this.showComments;
    this.updateActives();
  }

  render () {
    var icons = '';
    if (this.showIcons) {
      icons = yo`
        <div style="display: inline-block">
          <i class="fa fa-play-circle-o fa-lg" onclick=${() => this.injectPost(this.post)}></i>
          <i class="fa fa-pencil-square-o fa-lg" onclick=${() => this.toggleShowComments()}></i>
          <i class="fa fa-user-circle-o fa-lg" onclick=${() => this.onOpenPage('user')}></i>
          <i class="fa fa-file-text-o fa-lg" onclick=${() => this.onOpenPage('post')}></i>
          <i class="fa fa-superpowers fa-lg" onclick=${() => this.onOpenPage('gizmo')}></i>
        </div>
      `;
    }
    return yo`
      <li class="list-item sidebarscripts ${this.parseDatPath()} post" onmouseenter=${() => this.onMouseOverToggle()} onmouseleave=${() => this.onMouseOverToggle()}>
        <div class="list-item">
          <div style="display: inline-block" title=${this.post.author.name}>
            <span><b>${this.post.author.name}</b></span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>${this.post.postText}</span>
          </div>
          <br>
          <div style="display: inline-block">
            <span>Gizmo: ${this.post.gizmo.gizmoName}</span>
          </div>
          <br>
          ${icons}
          ${this.showComments ? new Comments(this.post, this.loadPosts, this.updateActives.bind(this)).render() : ''}
        </div>
      </li>
    `
  }
}

class PostList {
  constructor (posts, loadPosts, updateSidebarActives) {
    this.posts = posts;
    this.loadPosts = loadPosts;
  }
  render () {
    if (!this.posts) {
      return loadingView()
    }
    if (this.posts.length === 0) {
      return yo`
        <ul class="post-list">
          <li>
            <div class="list-item sidebarscripts">
              No posts for this page.
            </div>
          </li>
        </ul>
      `
    }

    return yo`
      <ul class="post-list">
        ${this.posts.map(p => new Post(p, this.loadPosts).render())}
      </ul>
    `
  }
}

/* globals DatArchive */
class ParallelBtn {
  constructor () {
    this.isDropdownOpen = false;
    this.showGizmos = true;
    this.gizmos = null;
    this.posts = null;
    this.userAppURL = datURLS.userAppURL;
    this.userProfileURL = datURLS.userProfileURL;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
    this.setup();
  }

  async loadGizmos () {
    const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL));
    this.gizmos = await userDB.listGizmos({
      fetchAuthor: true,
      reverse: true,
      subscriber: this.userProfileURL,
      fetchGizmoDependencies: true
    });
    console.log('this.gizmos after load', this.gizmos);
  }

  setup () {
    this.loadGizmos();
    this.updateActives();
    on$$1('set-active', this.onSetActive.bind(this));
    on$$1('load-commit', this.onLoadCommit.bind(this));
    on$$1('reload-posts', this.onReloadPosts.bind(this));
  }

  onSetActive (page) {
    this.posts = null;
    this.updateActives();
    this.loadPosts(page.url);
  }

  onLoadCommit (url) {
    this.posts = null;
    this.updateActives();
    this.loadPosts(url);
  }

  onReloadPosts (url) {
    this.posts = null;
    this.updateActives();
    this.loadPosts(url);
  }

  async loadPosts (currentURL) {
    console.log('I am called!');
    if (currentURL) {
      const userDB = await ParallelAPI.open(new DatArchive(this.userProfileURL));
      this.posts = await userDB.listPosts({
        fetchAuthor: true,
        fetchReplies: true,
        countVotes: true,
        reverse: true,
        fetchGizmo: true,
        requester: this.userProfileURL,
        currentURL,
        fetchPostDependencies: true
      });
    }
    console.log('Posts when I am done!', this.posts);
    this.updateActives();
  }

  render () {
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      dropdownEl = yo`
        <div class="script-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div style="width: 400px; height: 100vh;" class="dropdown-items script-dropdown with-triangle visible">
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
            ${this.showGizmos ? new GizmoList(this.gizmos).render() : new PostList(this.posts, this.loadPosts.bind(this)).render()}
            <div class="footer">
              <a onclick=${e => this.onOpenPage(e, this.userAppURL)}>
                <i class="fa fa-home"></i>
                <span>Home</span>
              </a>
            </div>
          </div>
        </div>
      `;
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
    this.updateActives();
  }

  // Toggles whether the user is viewing prescripts or post scripts on the current site
  onToggleClick (showGizmos) {
    if (showGizmos) {
      Array.from(document.querySelectorAll('.post-list')).forEach(el => { el.innerHTML = ''; });
    } else {
      Array.from(document.querySelectorAll('.gizmo-list')).forEach(el => { el.innerHTML = ''; });
    }
    this.showGizmos = showGizmos;
    this.updateActives();
  }

  updateActives () {
    Array.from(document.querySelectorAll('.browser-dropdown-scripts')).forEach(el => yo.update(el, this.render()));
  }

  doAnimation () {
    Array.from(document.querySelectorAll('.browser-dropdown-scripts .toolbar-btn')).forEach(el =>
      el.animate([
        {transform: 'scale(1.0)', color: 'inherit'},
        {transform: 'scale(1.5)', color: '#06c'},
        {transform: 'scale(1.0)', color: 'inherit'}
      ], { duration: 300 })
    );
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'browser-dropdown-scripts');
    if (parent) return // abort - this was a click on us!
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  onOpenPage (e, url) {
    setActive(create(url));
    this.isDropdownOpen = false;
    this.updateActives();
  }
}

/* globals beaker DatArchive beakerBrowser */

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the PageMenuNavbarBtn manages all instances, and you should only create one

class PageMenuNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    this.isOpenwithOpen = false;
    this.openwithMouseLeaveTimer = null;
    window.addEventListener('mousedown', this.onClickAnywhere.bind(this), true);
  }

  render () {
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return yo`<span />`
    }
    const isSaved = page.siteInfo && page.siteInfo.userSettings && page.siteInfo.userSettings.isSaved;

    // render the dropdown if open
    var dropdownEl = '';
    if (this.isDropdownOpen) {
      var openwithSublist;
      if (this.isOpenwithOpen) {
        openwithSublist = yo`
          <div class="dropdown-items sublist">
            <div class="list">
              <div class="list-item" onclick=${() => this.onClickOpenwithLibrary()}>
                Library
              </div>
            </div>
          </div>
        `;
      }
      dropdownEl = yo`
        <div class="toolbar-dropdown dropdown toolbar-dropdown-menu-dropdown">
          <div class="dropdown-items with-triangle visible">
            <div class="list">
              ${isSaved
                ? yo`
                    <div class="list-item" onclick=${() => this.onClickRemove()}>
                      <i class="fa fa-trash"></i>
                      Remove from Library
                    </div>
                  `
                : yo`
                    <div class="list-item" onclick=${() => this.onClickAdd()}>
                      <i class="fa fa-plus"></i>
                      Add to Library
                    </div>
                  `}
              <hr />
              <div
                class="list-item"
                onmouseenter=${() => this.onMouseEnterOpenwith()}
                onmouseleave=${() => this.onMouseLeaveOpenwith()}
              >
                <i class="fa fa-share"></i>
                Open with...
                <i class="fa fa-caret-right"></i>
                ${openwithSublist}
              </div>
              <hr />
              <div class="list-item" onclick=${() => this.onClickFork()}>
                <i class="fa fa-code-fork"></i>
                Fork this site
              </div>
              <div class="list-item" onclick=${() => this.onClickDownloadZip()}>
                <i class="fa fa-file-archive-o"></i>
                Download as .zip
              </div>
            </div>
          </div>
        </div>`;
    }

    // render btn
    return yo`
      <div class="toolbar-dropdown-menu page-dropdown-menu">
        <button class="toolbar-btn toolbar-dropdown-menu-btn ${this.isDropdownOpen ? 'pressed' : ''}" onclick=${e => this.onClickBtn(e)} title="Menu">
          <span class="fa fa-caret-down"></span>
        </button>
        ${dropdownEl}
      </div>`
  }

  updateActives () {
    Array.from(document.querySelectorAll('.page-dropdown-menu')).forEach(el => yo.update(el, this.render()));
  }

  close () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.isOpenwithOpen = false;
      this.updateActives();
    }
  }

  onClickBtn (e) {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (!this.isDropdownOpen) {
      this.isOpenwithOpen = false;
    }
    this.updateActives();
  }

  onClickAnywhere (e) {
    var parent = findParent(e.target, 'page-dropdown-menu');
    if (parent) return // abort - this was a click on us!
    this.close();
  }

  async onClickAdd () {
    this.close();
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return
    }
    page.siteInfo.userSettings = await beaker.archives.add(page.siteInfo.key);
  }

  async onClickRemove () {
    this.close();
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return
    }
    page.siteInfo.userSettings = await beaker.archives.remove(page.siteInfo.key);
  }

  onMouseEnterOpenwith () {
    if (this.openwithMouseLeaveTimer) {
      clearTimeout(this.openwithMouseLeaveTimer);
      this.openwithMouseLeaveTimer = null;
    }
    this.isOpenwithOpen = true;
    this.updateActives();
  }

  onMouseLeaveOpenwith () {
    this.openwithMouseLeaveTimer = setTimeout(() => {
      this.isOpenwithOpen = false;
      this.updateActives();
    }, 300);
  }

  onClickOpenwithLibrary () {
    this.close();
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return
    }
    page.loadURL(`beaker://library/${page.siteInfo.key}`);
  }

  onClickFork () {
    this.close();
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return
    }
    DatArchive.fork(page.siteInfo.key).catch(() => {});
  }

  onClickDownloadZip () {
    this.close();
    var page = getActive();
    if (!page || !page.protocolInfo || page.protocolInfo.scheme !== 'dat:') {
      return
    }
    beakerBrowser.downloadURL(`dat://${page.siteInfo.key}/?download_as=zip`);
  }
}

class DatSidebarBtn {
  constructor () {
    on$1('change', this.updateActives.bind(this));
  }

  render () {
    if (!getIsAvailable() || !getIsOpen()) {
      // hide the button
      return yo`<button class="toolbar-btn dat-sidebar btn hidden"></button>`
    }
    
    return yo`
      <button title="Toggle sidebar" class="toolbar-btn dat-sidebar btn pressed" onclick=${e => this.onClickBtn(e)}>
        <i class="fa fa-columns"></i>
      </button>
    `
  }

  onClickBtn (e) {
    toggle();
    this.updateActives();
  }

  updateActives () {
    Array.from(document.querySelectorAll('.dat-sidebar.btn')).forEach(el => yo.update(el, this.render()));
  }
}

/* globals beaker */

// front-end only:
var yo$1;
if (typeof document !== 'undefined') {
  yo$1 = require('yo-yo');
}

// HACK
// this is the best way I could figure out for pulling in the dat title, given the current perms flow
// not ideal but it works
// (note the in memory caching)
// -prf
var datTitleMap = {};
function lazyDatTitleElement (archiveKey, title) {
  // if we have the title, render now
  if (title) return title
  if (archiveKey in datTitleMap) return datTitleMap[archiveKey] // pull from cache

  // no title, we need to look it up. render now, then update
  var el = yo$1`<span>${prettyHash(archiveKey)}</span>`;
  el.id = 'lazy-' + archiveKey;
  beaker.archives.get(archiveKey).then(details => {
    datTitleMap[archiveKey] = details.title; // cache
    el.textContent = details.title; // render
  });
  return el
}

var PERMS = {
  js: {
    desc: 'Run Javascript',
    icon: 'code',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: true
  },
  network: {
    desc: param => {
      if (param === '*') return 'access the network freely'
      return 'contact ' + param
    },
    icon: 'cloud',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: true
  },
  createDat: {
    desc: (param, pages, opts = {}) => {
      if (opts.title) return `create a new Dat archive, "${opts.title}"`
      return 'create a new Dat archive'
    },
    icon: 'folder',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  modifyDat: {
    desc: (param, pages, opts = {}) => {
      const firstWord = opts.capitalize ? 'Write' : 'write';
      const title = lazyDatTitleElement(param, opts.title);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>${firstWord} files to <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'folder',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  deleteDat: {
    desc: (param, pages, opts = {}) => {
      const firstWord = opts.capitalize ? 'Delete' : 'delete';
      const title = lazyDatTitleElement(param, opts.title);
      const viewArchive = () => pages.setActive(pages.create('beaker://library/' + param));
      return yo$1`<span>${firstWord} the archive <a onclick=${viewArchive}>${title}</a></span>`
    },
    icon: 'folder',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  media: {
    desc: 'use your camera and microphone',
    icon: 'mic',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  geolocation: {
    desc: 'know your location',
    icon: '',
    persist: false,
    alwaysDisallow: true, // NOTE geolocation is disabled, right now
    requiresRefresh: false
  },
  notifications: {
    desc: 'create desktop notifications',
    icon: 'comment',
    persist: true,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  midiSysex: {
    desc: 'access your MIDI devices',
    icon: 'sound',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  pointerLock: {
    desc: 'lock your cursor',
    icon: 'mouse',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false
  },
  fullscreen: {
    desc: 'go fullscreen',
    icon: 'resize-full',
    persist: true,
    alwaysAllow: true,
    requiresRefresh: false
  },
  openExternal: {
    desc: 'open this URL in another program: ',
    icon: '',
    persist: false,
    alwaysDisallow: false,
    requiresRefresh: false
  }
};

/* globals beakerSitedata */

class SiteInfoNavbarBtn {
  constructor () {
    this.isDropdownOpen = false;
    this.siteInfo = false;
    this.sitePerms = false;
    this.siteInfoOverride = false;
    this.protocolInfo = false;
    this.siteLoadError = false;
    window.addEventListener('click', e => this.onClickAnywhere(e)); // close dropdown on click outside
    on$$1('set-active', e => this.closeDropdown()); // close dropdown on tab change
  }

  render () {
    // pull details
    var icon = '';
    var protocolLabel = '';
    var protocolCls = 'insecure';
    var gotInsecureResponse = this.siteLoadError && this.siteLoadError.isInsecureResponse;

    if (this.siteLoadError) {
      icon = 'exclamation-circle';
      protocolLabel = '';
    }

    if (this.protocolInfo) {
      var isHttps = ['https:'].includes(this.protocolInfo.scheme);

      if (isHttps && !gotInsecureResponse && !this.siteLoadError) {
        icon = 'lock';
        protocolLabel = 'Secure';
        protocolCls = 'secure';
      } else if (this.protocolInfo.scheme === 'http:' || (isHttps && gotInsecureResponse)) {
        icon = 'exclamation-circle https-error';
        protocolLabel = 'Not secure';
      } else if (this.protocolInfo.scheme === 'dat:') {
        icon = 'share-alt';
        protocolLabel = 'Secure P2P';
        protocolCls = 'p2p';
      } else if (this.protocolInfo.scheme === 'beaker:') {
        protocolCls = 'beaker';
        icon = '';
      }
    }

    // render btn
    var iconEl = (icon) ? yo`<i class="fa fa-${icon}"></i>` : '';
    var titleEl = (protocolLabel) ? yo`<span class="title">${protocolLabel}</span>` : '';
    return yo`<div class="toolbar-site-info ${protocolCls}">
      <button onclick=${e => this.toggleDropdown(e)}>${iconEl} ${titleEl}</button>
      ${this.renderDropdown()}
    </div>`
  }

  renderDropdown () {
    if (!this.isDropdownOpen) {
      return ''
    }

    // pull details
    var protocolDesc = '';
    if (this.protocolInfo) {
      if (['https:'].includes(this.protocolInfo.scheme)) {
        protocolDesc = 'Your connection to this site is secure.';
      } else if (this.protocolInfo.scheme === 'http:') {
        protocolDesc = yo`
          <div>
            <p>
              Your connection to this site is not secure.
            </p>

            <small>
              You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers.
            </small>
          </div>
        `;
      } else if (['dat:'].indexOf(this.protocolInfo.scheme) != -1) {
        protocolDesc = yo`<span>
          This site was downloaded from a secure peer-to-peer network.
          <a onclick=${e => this.learnMore()}>Learn More</a>
        </span>`;
      }
    }

    // site permissions
    var permsEls = [];
    if (this.sitePerms) {
      for (var k in this.sitePerms) {
        permsEls.push(this.renderPerm(k, this.sitePerms[k]));
      }
    }
    if (this.siteInfo && this.siteInfo.requiresRefresh) {
      permsEls.push(yo`<div>
        <a><label class="checked" onclick=${this.onClickRefresh.bind(this)}><span class="icon icon-ccw"></span> Refresh to apply changes.</label></a>
      </div>`);
    }

    // dropdown
    return yo`
      <div class="dropdown toolbar-dropdown toolbar-site-info-dropdown">
        <div class="dropdown-items visible with-triangle left">
          <div class="details">
            <div class="details-title">
              ${this.getTitle() || this.getHostname() || this.getUrl()}
            </div>
            <p class="details-desc">
              ${protocolDesc}
            </p>
          </div>
          <div class="perms">${permsEls}</div>
        </div>
      </div>`
  }

  getTitle () {
    var title = '';
    if (this.siteInfoOverride && this.siteInfoOverride.title) {
      title = this.siteInfoOverride.title;
    } else if (this.siteInfo && this.siteInfo.title) {
      title = this.siteInfo.title;
    } else if (this.protocolInfo && this.protocolInfo.scheme === 'dat:') {
      title = 'Untitled';
    }
    return title
  }

  getUrl () {
    return (this.protocolInfo) ? this.protocolInfo.url : ''
  }

  getHostname () {
    return (this.protocolInfo) ? this.protocolInfo.hostname : ''
  }

  updateActives () {
    // FIXME
    // calling `this.render` for all active site-infos is definitely wrong
    // there is state captured in `this` that is specific to each instance
    // ...this entire thing is kind of bad
    // -prf
    Array.from(document.querySelectorAll('.toolbar-site-info')).forEach(el => yo.update(el, this.render()));
  }

  onClickAnywhere (e) {
    if (!this.isDropdownOpen) return
    // close the dropdown if not a click within the dropdown
    if (findParent(e.target, 'toolbar-site-info-dropdown')) return
    this.closeDropdown();
  }

  onClickRefresh () {
    getActive().reload();
    this.closeDropdown();
  }

  closeDropdown () {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.updateActives();
    }
  }

  toggleDropdown (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    this.isDropdownOpen = !this.isDropdownOpen;
    this.updateActives();
  }

  renderPerm (perm, value) {
    const permId = getPermId(perm);
    const permParam = getPermParam(perm);
    var icon = PERMS[permId] ? PERMS[permId].icon : '';
    var desc = PERMS[permId] ? PERMS[permId].desc : '';
    if (typeof desc === 'function') desc = desc(permParam, pages$1, { capitalize: true });
    if (typeof desc === 'string') desc = ucfirst(desc);
    return yo`<div>
      <label class=${value ? 'checked' : ''} onclick=${e => this.togglePerm(perm)}><input type="checkbox" value="${perm}" ${value ? 'checked' : ''} /> <span class="icon icon-${icon}"></span> ${desc}</label>
    </div>`
  }

  togglePerm (perm) {
    // update perm
    var newValue = (this.sitePerms[perm] === 1) ? 0 : 1;
    beakerSitedata.setPermission(this.protocolInfo.url, perm, newValue).then(() => {
      this.sitePerms[perm] = newValue;

      // requires refresh?
      const permId = getPermId(perm);
      this.siteInfo.requiresRefresh = (PERMS[permId] && PERMS[permId].requiresRefresh);

      // rerender
      this.updateActives();
    });
  }

  viewSiteFiles (subpage) {
    const { hostname } = this.protocolInfo;
    setActive(create('beaker://library/' + hostname + '#' + subpage));
    this.closeDropdown();
  }

  learnMore () {
    setActive(create('https://github.com/beakerbrowser/beaker/wiki/Is-Dat-%22Secure-P2P%3F%22'));
  }
}

/* globals URL beaker */

const KEYCODE_DOWN = 40;
const KEYCODE_UP = 38;
const KEYCODE_ESC = 27;
const KEYCODE_ENTER = 13;
const KEYCODE_N = 78;
const KEYCODE_P = 80;

const isDatHashRegex = /^[a-z0-9]{64}/i;

// globals
// =

var toolbarNavDiv = document.getElementById('toolbar-nav');
var updatesNavbarBtn = null;
var datSidebarBtn = null;
var browserMenuNavbarBtn = null;
var parallelBtn = null;
var pageMenuNavbarBtn = null;
var siteInfoNavbarBtn = null;

// autocomplete data
var autocompleteCurrentValue = null;
var autocompleteCurrentSelection = 0;
var autocompleteResults = null; // if set to an array, will render dropdown

// exported functions
// =

function setup$3 () {
  // create the button managers
  updatesNavbarBtn = new UpdatesNavbarBtn();
  datSidebarBtn = new DatSidebarBtn();
  browserMenuNavbarBtn = new BrowserMenuNavbarBtn();
  parallelBtn = new ParallelBtn();
  pageMenuNavbarBtn = new PageMenuNavbarBtn();
  siteInfoNavbarBtn = new SiteInfoNavbarBtn();
}

function createEl (id) {
  // render
  var el = render(id, null);
  toolbarNavDiv.appendChild(el);
  return el
}

function destroyEl (id) {
  var el = document.querySelector(`.toolbar-actions[data-id="${id}"]`);
  if (el) {
    toolbarNavDiv.removeChild(el);
  }
}

function focusLocation (page) {
  var el = page.navbarEl.querySelector('.nav-location-input');
  el.classList.remove('hidden');
  el.focus();
  el.select();
}

function isLocationFocused (page) {
  // fetch current page, if not given
  page = page || getActive();

  // get element and pull state
  var addrEl = page.navbarEl.querySelector('.nav-location-input');
  return addrEl.matches(':focus')
}

function showInpageFind (page) {
  // show control and highlight text
  page.isInpageFinding = true;
  update$1(page);
  var el = page.navbarEl.querySelector('.nav-find-input');
  el.focus();
  el.select();
}

function hideInpageFind (page) {
  if (page.isInpageFinding) {
    page.stopFindInPageAsync('clearSelection');
    page.isInpageFinding = false;
    update$1(page);
  }
}

function clearAutocomplete () {
  if (autocompleteResults) {
    autocompleteCurrentValue = null;
    autocompleteCurrentSelection = 0;
    autocompleteResults = null;
    update$1();
  }
}

function update$1 (page) {
  // fetch current page, if not given
  page = page || getActive();
  if (!page.webviewEl) return

  // render
  yo.update(page.navbarEl, render(page.id, page));
}

function updateLocation (page) {
  // fetch current page, if not given
  page = page || getActive();

  // update location
  var addrEl = page.navbarEl.querySelector('.nav-location-input');
  var isAddrElFocused = addrEl.matches(':focus');
  if (!isAddrElFocused || !addrEl.value) { // only update if not focused or empty, so we dont mess up what the user is doing
    addrEl.value = page.getIntendedURL();
    if (isAddrElFocused) {
      addrEl.select(); // if was focused, then select what we put in
    }
  }
}

function closeMenus () {
  browserMenuNavbarBtn.isDropdownOpen = false;
  browserMenuNavbarBtn.updateActives();

  parallelBtn.isDropdownOpen = false;

  pageMenuNavbarBtn.close();
}

// internal helpers
// =

function render (id, page) {
  const isLoading = page && page.isLoading();
  const isViewingDat = page && page.getURL().startsWith('dat:');
  const siteHasDatAlternative = page && page.siteHasDatAlternative;
  const gotInsecureResponse = page && page.siteLoadError && page.siteLoadError.isInsecureResponse;
  const siteLoadError = page && page.siteLoadError;

  // back/forward should be disabled if its not possible go back/forward
  var backDisabled = (page && page.canGoBack()) ? '' : 'disabled';
  var forwardDisabled = (page && page.canGoForward()) ? '' : 'disabled';

  // render reload/cancel btn
  var reloadBtn = (isLoading)
    ? yo`
        <button class="toolbar-btn nav-cancel-btn" onclick=${onClickCancel}>
          <span class="fa fa-times"></span>
        </button>`
    : yo`
        <button class="toolbar-btn nav-reload-btn" onclick=${onClickReload} title="Reload this page">
          <span class="fa fa-refresh"></span>
        </button>`;

  // `page` is null on initial render
  // and the toolbar should be hidden on initial render
  // and it should be hidden if the page isnt active
  var toolbarHidden = (!page || !page.isActive) ? ' hidden' : '';

  // preserve the current finder value and focus
  var findEl = page && page.navbarEl.querySelector('.nav-find-input');
  var findValue = findEl ? findEl.value : '';

  // inpage finder ctrl
  var inpageFinder = (page && page.isInpageFinding)
    ? yo`<input
            type="text"
            class="nav-find-input"
            placeholder="Find in page..."
            oninput=${onInputFind}
            onkeydown=${onKeydownFind}
            value=${findValue} />`
    : '';

  // bookmark toggle state
  var bookmarkBtnClass = 'nav-bookmark-btn' + ((page && !!page.bookmark) ? ' active' : '');

  // zoom btn should only show if zoom is not the default setting
  var zoomBtn = '';
  if (page && page.zoom != 0) {
    // I dont know what that formula is, so I solved this problem like any good programmer would, by stealing the values from chrome
    var zoomPct = ({
      '-0.5': 90,
      '-1': 75,
      '-1.5': 67,
      '-2': 50,
      '-2.5': 33,
      '-3': 25,
      '0': 100,
      '0.5': 110,
      '1': 125,
      '1.5': 150,
      '2': 175,
      '2.5': 200,
      '3': 250,
      '3.5': 300,
      '4': 400,
      '4.5': 500
    })[page.zoom];
    var zoomIcon = zoomPct < 100 ? '-minus' : '-plus';
    zoomBtn = yo`
      <button onclick=${onClickZoom} title="Zoom: ${zoomPct}%" class="zoom">
        <i class=${'fa fa-search' + zoomIcon}></i>
        ${zoomPct}%
      </button>`;
  }

  // dat buttons
  var datBtns = '';

  if (isViewingDat) {
    let numPeers = page.siteInfo ? page.siteInfo.peers : 0;
    var isLiveReloading = page.isLiveReloading();

    datBtns = [
      yo`
        <button class="nav-peers-btn" onclick=${onClickPeercount}>
          <i class="fa fa-share-alt"></i> ${numPeers} ${pluralize(numPeers, 'peer')}
        </button>`,
      yo`<button class="nav-live-reload-btn ${isLiveReloading ? 'active' : ''}" title="Turn ${isLiveReloading ? 'off' : 'on'} live reloading" onclick=${onClickLiveReload}>
          <i class="fa fa-bolt"></i>
        </button>`
    ];
  } else if (siteHasDatAlternative) {
    datBtns = [
      yo`<button
        class="callout"
        title="Go to Dat Version of this Site"
        onclick=${onClickGotoDatVersion}
      >
        <span class="fa fa-share-alt"></span> P2P version available
      </button>`
    ];
  }

  // autocomplete dropdown
  var autocompleteDropdown = '';
  if (autocompleteResults) {
    autocompleteDropdown = yo`
      <div class="autocomplete-dropdown" onclick=${onClickAutocompleteDropdown}>
        ${autocompleteResults.map((r, i) => {
          // content
          var iconCls = 'icon icon-' + ((r.search) ? 'search' : 'window');
          var contentColumn;
          if (r.search) { contentColumn = yo`<span class="result-search">${r.search}</span>`; } else {
            contentColumn = yo`<span class="result-url"></span>`;
            if (r.urlDecorated) {
              contentColumn.innerHTML = r.urlDecorated; // use innerHTML so our decoration can show
            } else {
              contentColumn.textContent = r.url;
            }
          }
          var titleColumn = yo`<span class="result-title"></span>`;
          if (r.titleDecorated) {
            titleColumn.innerHTML = r.titleDecorated; // use innerHTML so our decoration can show
          } else {
            titleColumn.textContent = r.title;
          }

          // selection
          var rowCls = 'result';
          if (i == autocompleteCurrentSelection) { rowCls += ' selected'; }

          // result row
          return yo`<div class=${rowCls} data-result-index=${i}>
            <span class=${iconCls}></span>
            ${contentColumn}
            ${titleColumn}
          </div>`
        })}
      </div>
    `;
  }

  // preserve the current address value
  var addrEl = page && page.navbarEl.querySelector('.nav-location-input');
  var addrValue = addrEl ? addrEl.value : '';
  if (!addrValue && page) {
    addrValue = page.getIntendedURL();
  }
  var isAddrElFocused = addrEl && addrEl.matches(':focus');

  // setup menus
  siteInfoNavbarBtn.protocolInfo = (page && page.protocolInfo);
  siteInfoNavbarBtn.siteInfo = (page && page.siteInfo);
  siteInfoNavbarBtn.sitePerms = (page && page.sitePerms);
  siteInfoNavbarBtn.siteInfoOverride = (page && page.siteInfoOverride);
  siteInfoNavbarBtn.siteLoadError = (page && page.siteLoadError);

  // the main URL input
  var locationInput = yo`
    <input
      type="text"
      class="nav-location-input ${(!isAddrElFocused) ? ' hidden' : ''}"
      onfocus=${onFocusLocation}
      onblur=${onBlurLocation}
      onkeydown=${onKeydownLocation}
      oninput=${onInputLocation}
      value=${addrValue} />
  `;

  // a prettified rendering of the main URL input
  var locationPrettyView = renderPrettyLocation(addrValue, isAddrElFocused, gotInsecureResponse, siteLoadError);

  // render
  return yo`
    <div data-id=${id} class="toolbar-actions${toolbarHidden}">
      <div class="toolbar-group">
        <button class="toolbar-btn nav-back-btn" ${backDisabled} onclick=${onClickBack}>
          <span class="fa fa-arrow-left"></span>
        </button>
        <button class="toolbar-btn nav-forward-btn" ${forwardDisabled} onclick=${onClickForward}>
          <span class="fa fa-arrow-right"></span>
        </button>
        ${reloadBtn}
      </div>
      <div class="toolbar-input-group">
        ${siteInfoNavbarBtn.render()}
        ${locationPrettyView}
        ${locationInput}
        ${inpageFinder}
        ${zoomBtn}
        ${datBtns}
        <button class=${bookmarkBtnClass} onclick=${onClickBookmark} title="Bookmark this page">
          <span class=${(page && !!page.bookmark) ? 'fa fa-star' : 'fa fa-star-o'}></span>
        </button>
        ${pageMenuNavbarBtn.render()}
        ${autocompleteDropdown}
      </div>
      <div class="toolbar-group">
        ${datSidebarBtn.render(addrValue)}
        ${parallelBtn.render()}
        ${browserMenuNavbarBtn.render()}
        ${updatesNavbarBtn.render()}
      </div>
    </div>
  </div>`
}

function renderPrettyLocation (value, isHidden, gotInsecureResponse, siteLoadError) {
  var valueRendered = value;
  if (/^(dat|http|https):/.test(value)) {
    try {
      var { protocol, host, pathname, search, hash } = new URL(value);
      var hostVersion;
      if (protocol === 'dat:') {
        let match = /(.*)\+(.*)/.exec(host);
        if (match) {
          host = match[1];
          hostVersion = '+' + match[2];
        }
        if (isDatHashRegex.test(host)) {
          host = prettyHash(host);
        }
      }
      var cls = 'protocol';
      if (['beaker:'].includes(protocol)) cls += ' protocol-secure';
      if (['https:'].includes(protocol) && !siteLoadError && !gotInsecureResponse) cls += ' protocol-secure';
      if (['https:'].includes(protocol) && gotInsecureResponse) cls += ' protocol-insecure';
      if (['dat:'].includes(protocol)) cls += ' protocol-p2p';
      valueRendered = [
        yo`<span class=${cls}>${protocol.slice(0, -1)}</span>`,
        yo`<span class="syntax">://</span>`,
        yo`<span class="host">${host}</span>`,
        hostVersion ? yo`<span class="host-version">${hostVersion}</span>` : false,
        yo`<span class="path">${pathname}${search}${hash}</span>`
      ].filter(Boolean);
    } catch (e) {
      // invalid URL, just use value
    }
  }

  return yo`
    <div
      class="nav-location-pretty${(isHidden) ? ' hidden' : ''}"
      onclick=${onFocusLocation}
      onmousedown=${onFocusLocation}
    >
      ${valueRendered}
    </div>
  `
}

function handleAutocompleteSearch (results) {
  var v = autocompleteCurrentValue;
  if (!v) return

  // decorate result with bolded regions
  // explicitly replace special characters to match sqlite fts tokenization
  var searchTerms = v.replace(/[:^*-./]/g, ' ').split(' ').filter(Boolean);
  results.forEach(r => decorateResultMatches(searchTerms, r));

  // does the value look like a url?
  var isProbablyUrl = (!v.includes(' ') && (
    /\.[A-z]/.test(v) ||
    isDatHashRegex.test(v) ||
    v.startsWith('localhost') ||
    v.includes('://') ||
    v.startsWith('beaker:')
  ));
  var vWithProtocol = v;
  var isGuessingTheScheme = false;
  if (isProbablyUrl && !v.includes('://') && !(v.startsWith('beaker:'))) {
    if (isDatHashRegex.test(v)) {
      vWithProtocol = 'dat://' + v;
    } else if (v.startsWith('localhost')) {
      vWithProtocol = 'http://' + v;
    } else {
      vWithProtocol = 'https://' + v;
      isGuessingTheScheme = true; // note that we're guessing so that, if this fails, we can try http://
    }
  }

  // set the top results accordingly
  var gotoResult = { url: vWithProtocol, title: 'Go to ' + v, isGuessingTheScheme };
  var searchResult = {
    search: v,
    title: 'DuckDuckGo Search',
    url: 'https://duckduckgo.com/?q=' + v.split(' ').join('+')
  };
  if (isProbablyUrl) autocompleteResults = [gotoResult, searchResult];
  else autocompleteResults = [searchResult, gotoResult];

  // add search results
  if (results) { autocompleteResults = autocompleteResults.concat(results); }

  // render
  update$1();
}

function getAutocompleteSelection (i) {
  if (typeof i !== 'number') {
    i = autocompleteCurrentSelection;
  }
  if (autocompleteResults && autocompleteResults[i]) {
    return autocompleteResults[i]
  }

  // fallback to the current value in the navbar
  var addrEl = getActive().navbarEl.querySelector('.nav-location-input');
  var url = addrEl.value;

  // autocorrect urls of known forms
  if (isDatHashRegex.test(url)) {
    url = 'dat://' + url;
  }
  return { url }
}

function getAutocompleteSelectionUrl (i) {
  return getAutocompleteSelection(i).url
}

// helper for autocomplete
// - takes in the current search (tokenized) and a result object
// - mutates `result` so that matching text is bold
var offsetsRegex = /([\d]+ [\d]+ [\d]+ [\d]+)/g;
function decorateResultMatches (searchTerms, result) {
  // extract offsets
  var tuples = (result.offsets || '').match(offsetsRegex);
  if (!tuples) { return }

  // iterate all match tuples, and break the values into segments
  let lastTuple;
  let segments = { url: [], title: [] };
  let lastOffset = { url: 0, title: 0 };
  for (let tuple of tuples) {
    tuple = tuple.split(' ').map(i => +i); // the map() coerces to the proper type
    let [ columnIndex, termIndex, offset ] = tuple;
    let columnName = ['url', 'title'][columnIndex];

    // sometimes multiple terms can hit at the same point
    // that breaks the algorithm, so skip that condition
    if (lastTuple && lastTuple[0] === columnIndex && lastTuple[2] === offset) continue
    lastTuple = tuple;

    // use the length of the search term
    // (sqlite FTS gives the length of the full matching token, which isnt as helpful)
    let searchTerm = searchTerms[termIndex];
    if (!searchTerm) continue
    let len = searchTerm.length;

    // extract segments
    segments[columnName].push(result[columnName].slice(lastOffset[columnName], offset));
    segments[columnName].push(result[columnName].slice(offset, offset + len));
    lastOffset[columnName] = offset + len;
  }

  // add the remaining text
  segments.url.push(result.url.slice(lastOffset.url));
  segments.title.push(result.title.slice(lastOffset.title));

  // join the segments with <strong> tags
  result.urlDecorated = joinSegments(segments.url);
  result.titleDecorated = joinSegments(segments.title);
}

// helper for decorateResultMatches()
// - takes an array of string segments (extracted from the result columns)
// - outputs a single escaped string with every other element wrapped in <strong>
var ltRegex = /</g;
var gtRegex = />/g;
function joinSegments (segments) {
  var str = '';
  var isBold = false;
  for (var segment of segments) {
    // escape for safety
    segment = segment.replace(ltRegex, '&lt;').replace(gtRegex, '&gt;');

    // decorate with the strong tag
    if (isBold) str += '<strong>' + segment + '</strong>';
    else str += segment;
    isBold = !isBold;
  }
  return str
}

// ui event handlers
// =

function getEventPage (e) {
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].dataset.id) { return getById(e.path[i].dataset.id) }
  }
}

function onClickBack (e) {
  var page = getEventPage(e);
  if (page && page.canGoBack()) {
    page.goBackAsync();
  }
}

function onClickForward (e) {
  var page = getEventPage(e);
  if (page && page.canGoForward()) {
    page.goForwardAsync();
  }
}

function onClickReload (e) {
  var page = getEventPage(e);
  if (page) { page.reload(); }
}

function onClickCancel (e) {
  var page = getEventPage(e);
  if (page) {
    page.stopAsync();
  }
}

function onClickBookmark (e) {
  var page = getEventPage(e);
  if (page) {
    page.toggleBookmark();
  }
}

function onClickPeercount (e) {
  toggle();
}

function onClickLiveReload (e) {
  var page = getEventPage(e);
  if (!page || !page.siteInfo) return
  page.toggleLiveReloading();
  update$1();
}

function onClickGotoDatVersion (e) {
  const page = getEventPage(e);
  if (!page || !page.protocolInfo) return

  const url = `dat://${page.protocolInfo.hostname}${page.protocolInfo.pathname}`;
  if (e.metaKey || e.ctrlKey) { // popup
    setActive(create(url));
  } else {
    page.loadURL(url); // goto
  }
}

function onClickZoom (e) {
  const { Menu } = electron.remote;
  var menu = Menu.buildFromTemplate([
    { label: 'Reset Zoom', click: () => zoomReset(getActive()) },
    { label: 'Zoom In', click: () => zoomIn(getActive()) },
    { label: 'Zoom Out', click: () => zoomOut(getActive()) }
  ]);
  menu.popup(electron.remote.getCurrentWindow());
}

function onFocusLocation (e) {
  var page = getEventPage(e);
  if (page) {
    page.navbarEl.querySelector('.nav-location-pretty').classList.add('hidden');
    page.navbarEl.querySelector('.nav-location-input').classList.remove('hidden');
    // wait till next tick to avoid events messing with each other
    setTimeout(() => page.navbarEl.querySelector('.nav-location-input').select(), 0);
  }
}

function onBlurLocation (e) {
  // HACK
  // blur gets called right before the click event for onClickAutocompleteDropdown
  // so, wait a bit before clearing the autocomplete, so the click has a chance to fire
  // -prf
  setTimeout(clearAutocomplete, 150);
  var page = getEventPage(e);
  if (page) {
    page.navbarEl.querySelector('.nav-location-pretty').classList.remove('hidden');
    page.navbarEl.querySelector('.nav-location-input').classList.add('hidden');
  }
}

function onInputLocation (e) {
  var value = e.target.value;

  // run autocomplete
  // TODO debounce
  var autocompleteValue = value.trim();
  if (autocompleteValue && autocompleteCurrentValue != autocompleteValue) {
    autocompleteCurrentValue = autocompleteValue; // update the current value
    autocompleteCurrentSelection = 0; // reset the selection
    beaker.history.search(value).then(handleAutocompleteSearch); // update the suggetsions
  } else if (!autocompleteValue) { clearAutocomplete(); } // no value, cancel out
}

function onKeydownLocation (e) {
  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    e.preventDefault();

    let page = getEventPage(e);
    if (page) {
      let selection = getAutocompleteSelection();
      page.loadURL(selection.url, { isGuessingTheScheme: selection.isGuessingTheScheme });
      e.target.blur();
    }
    return
  }

  // on escape
  if (e.keyCode == KEYCODE_ESC) {
    let page = getEventPage(e);
    page.navbarEl.querySelector('.nav-location-input').value = page.getIntendedURL();
    e.target.blur();
    return
  }

  // on keycode navigations
  var up = (e.keyCode == KEYCODE_UP || (e.ctrlKey && e.keyCode == KEYCODE_P));
  var down = (e.keyCode == KEYCODE_DOWN || (e.ctrlKey && e.keyCode == KEYCODE_N));
  if (autocompleteResults && (up || down)) {
    e.preventDefault();
    if (up && autocompleteCurrentSelection > 0) { autocompleteCurrentSelection--; }
    if (down && autocompleteCurrentSelection < autocompleteResults.length - 1) { autocompleteCurrentSelection++; }

    // re-render and update the url
    let page = getEventPage(e);
    let newValue = getAutocompleteSelectionUrl(autocompleteCurrentSelection);
    page.navbarEl.querySelector('.nav-location-input').value = newValue;
    update$1(page);
  }
}

function onClickAutocompleteDropdown (e) {
  // get the result index
  for (var i = 0; i < e.path.length; i++) {
    if (e.path[i].dataset && e.path[i].classList.contains('result')) {
      // follow result url
      var resultIndex = +e.path[i].dataset.resultIndex;
      getActive().loadURL(getAutocompleteSelectionUrl(resultIndex));
      return
    }
  }
}

function onInputFind (e) {
  var str = e.target.value;
  var page = getEventPage(e);
  if (page) {
    if (str) page.findInPageAsync(str);
    else page.stopFindInPageAsync('clearSelection');
  }
}

function onKeydownFind (e) {
  // on escape
  if (e.keyCode == KEYCODE_ESC) {
    let page = getEventPage(e);
    if (page) { hideInpageFind(page); }
  }

  // on enter
  if (e.keyCode == KEYCODE_ENTER) {
    let str = e.target.value;
    let backwards = e.shiftKey; // search backwords on shift+enter
    let page = getEventPage(e);
    if (page) {
      if (str) page.findInPageAsync(str, { findNext: true, forward: !backwards });
      else page.stopFindInPageAsync('clearSelection');
    }
  }
}

/* globals beakerSitedata */

const ZOOM_STEP = 0.5;

function setZoomFromSitedata (page, origin) {
  // load zoom from sitedata
  origin = origin || page.getURLOrigin();
  if (!origin) { return }
  beakerSitedata.get(origin, 'zoom').then(v => {
    if (typeof v != 'undefined') {
      page.zoom = +v;
      update$1(page);
      page.setZoomLevelAsync(page.zoom);
    }
  });
}

function setZoom (page, z) {
  // clamp
  if (z > 4.5) z = 4.5;
  if (z < -3) z = -3;

  // update
  page.zoom = z;
  page.setZoomLevelAsync(page.zoom);
  update$1(page);

  // persist to sitedata
  var origin = page.getURLOrigin();
  if (!origin) { return }
  beakerSitedata.set(origin, 'zoom', page.zoom);

  // update all pages at the origin
  getAll().forEach(p => {
    if (p !== page && p.getURLOrigin() === origin) {
      p.zoom = z;
    }
  });
}

function zoomIn (page) {
  setZoom(page, page.zoom + ZOOM_STEP);
}

function zoomOut (page) {
  setZoom(page, page.zoom - ZOOM_STEP);
}

function zoomReset (page) {
  setZoom(page, 0);
}

// globals
// =

var promptBarsDiv = document.getElementById('promptbars');

// exported functions
// =



function createEl$1 (id) {
  // render
  var el = render$1(id, null);
  promptBarsDiv.appendChild(el);
  return el
}

function destroyEl$1 (id) {
  var el = document.querySelector(`#promptbars [data-id="${id}"]`);
  if (el) {
    promptBarsDiv.removeChild(el);
  }
}

function add (page, { type, render, duration, onForceClose }) {
  // if 'type' is set, only allow one of the type
  if (type) {
    for (var i = 0; i < page.prompts.length; i++) {
      if (page.prompts[i].type == type) { return false }
    }
  }

  // add the prompt
  var prompt = {
    type,
    render,
    onForceClose
  };
  page.prompts.push(prompt);
  update$2(page);

  // start the timeout if there's a duration
  if (duration) {
    setTimeout(() => remove$1(page, prompt), duration);
  }

  return true
}

function remove$1 (page, prompt) {
  if (!page.prompts) { return } // page no longer exists

  // find and remove
  var i = page.prompts.indexOf(prompt);
  if (i !== -1) {
    page.prompts.splice(i, 1);
    update$2(page);
  }
}

function forceRemoveAll (page) {
  if (!page.prompts) { return } // page no longer exists

  // find and remove
  page.prompts.forEach(p => {
    if (typeof p.onForceClose == 'function') { p.onForceClose(); }
  });
  page.prompts = [];
  update$2(page);
}

function update$2 (page) {
  // fetch current page, if not given
  page = page || getActive();
  if (!page.webviewEl) return

  // render
  yo.update(page.promptbarEl, render$1(page.id, page));
}

// internal methods
// =

function render$1 (id, page) {
  if (!page) { return yo`<div data-id=${id} class="hidden"></div>` }

  return yo`<div data-id=${id} class=${page.isActive ? '' : 'hidden'}>
    ${page.prompts.map(prompt => {
      return yo`<div class="promptbar">
        ${prompt.render({
          rerender: () => update$2(page),
          onClose: () => remove$1(page, prompt)
        })}
      </div>`
    })}
  </div>`
}

var isLoading = false;
var currentStr;



function set (str) {
  currentStr = str;
  render$2();
}

function setIsLoading (b) {
  isLoading = b;
  render$2();
}

function render$2 () {
  var el = document.getElementById('statusbar');
  var str = currentStr;
  if (!str && isLoading) { str = 'Loading...'; }

  if (str) {
    el.classList.remove('hidden');
    el.textContent = str;
  } else { el.classList.add('hidden'); }
}

/*!
 * Color Thief v2.0
 * by Lokesh Dhakar - http://www.lokeshdhakar.com
 *
 * Thanks
 * ------
 * Nick Rabinowitz - For creating quantize.js.
 * John Schulz - For clean up and optimization. @JFSIII
 * Nathan Spady - For adding drag and drop support to the demo page.
 *
 * License
 * -------
 * Copyright 2011, 2015 Lokesh Dhakar
 * Released under the MIT license
 * https://raw.githubusercontent.com/lokesh/color-thief/master/LICENSE
 *
 */

/*
  CanvasImage Class
  Class that wraps the html image element and canvas.
  It also simplifies some of the canvas context manipulation
  with a set of helper functions.
*/
var CanvasImage = function (image) {
  this.canvas = document.createElement('canvas');
  this.context = this.canvas.getContext('2d');

  document.body.appendChild(this.canvas);

  this.width = this.canvas.width = image.width;
  this.height = this.canvas.height = image.height;

  this.context.drawImage(image, 0, 0, this.width, this.height);
};

CanvasImage.prototype.clear = function () {
  this.context.clearRect(0, 0, this.width, this.height);
};

CanvasImage.prototype.update = function (imageData) {
  this.context.putImageData(imageData, 0, 0);
};

CanvasImage.prototype.getPixelCount = function () {
  return this.width * this.height
};

CanvasImage.prototype.getImageData = function () {
  return this.context.getImageData(0, 0, this.width, this.height)
};

CanvasImage.prototype.removeCanvas = function () {
  this.canvas.parentNode.removeChild(this.canvas);
};

var ColorThief = function () {};

/*
 * getColor(sourceImage[, quality])
 * returns {r: num, g: num, b: num}
 *
 * Use the median cut algorithm provided by quantize.js to cluster similar
 * colors and return the base color from the largest cluster.
 *
 * Quality is an optional argument. It needs to be an integer. 1 is the highest quality settings.
 * 10 is the default. There is a trade-off between quality and speed. The bigger the number, the
 * faster a color will be returned but the greater the likelihood that it will not be the visually
 * most dominant color.
 *
 * */
ColorThief.prototype.getColor = function (sourceImage, quality) {
  var palette = this.getPalette(sourceImage, 5, quality);
  var dominantColor = palette[0];
  return dominantColor
};

ColorThief.prototype.getPalette = function (sourceImage, quality) {
  return this.getPalette(sourceImage, 5, quality)
};

/*
 * getPalette(sourceImage[, colorCount, quality])
 * returns array[ {r: num, g: num, b: num}, {r: num, g: num, b: num}, ...]
 *
 * Use the median cut algorithm provided by quantize.js to cluster similar colors.
 *
 * colorCount determines the size of the palette; the number of colors returned. If not set, it
 * defaults to 10.
 *
 * BUGGY: Function does not always return the requested amount of colors. It can be +/- 2.
 *
 * quality is an optional argument. It needs to be an integer. 1 is the highest quality settings.
 * 10 is the default. There is a trade-off between quality and speed. The bigger the number, the
 * faster the palette generation but the greater the likelihood that colors will be missed.
 *
 *
 */
ColorThief.prototype.getPalette = function (sourceImage, colorCount, quality) {
  if (typeof colorCount === 'undefined') {
    colorCount = 10;
  }
  if (typeof quality === 'undefined' || quality < 1) {
    quality = 10;
  }

  // Create custom CanvasImage object
  var image = new CanvasImage(sourceImage);
  var imageData = image.getImageData();
  var pixels = imageData.data;
  var pixelCount = image.getPixelCount();

  // Store the RGB values in an array format suitable for quantize function
  var pixelArray = [];
  for (var i = 0, offset, r, g, b, a; i < pixelCount; i = i + quality) {
    offset = i * 4;
    r = pixels[offset + 0];
    g = pixels[offset + 1];
    b = pixels[offset + 2];
    a = pixels[offset + 3];
    // If pixel is mostly opaque and not white
    if (a >= 125) {
      if (!(r > 250 && g > 250 && b > 250)) {
        pixelArray.push([r, g, b]);
      }
    }
  }

  // Send array to quantize function which clusters values
  // using median cut algorithm
  var cmap = MMCQ.quantize(pixelArray, colorCount);
  var palette = cmap ? cmap.palette() : null;

  // Clean up
  image.removeCanvas();

  return palette
};

/*!
 * quantize.js Copyright 2008 Nick Rabinowitz.
 * Licensed under the MIT license: http://www.opensource.org/licenses/mit-license.php
 */

// fill out a couple protovis dependencies
/*!
 * Block below copied from Protovis: http://mbostock.github.com/protovis/
 * Copyright 2010 Stanford Visualization Group
 * Licensed under the BSD License: http://www.opensource.org/licenses/bsd-license.php
 */
if (!pv) {
  var pv = {
    map: function (array, f) {
      var o = {};
      return f ? array.map(function (d, i) { o.index = i; return f.call(o, d) }) : array.slice()
    },
    naturalOrder: function (a, b) {
      return (a < b) ? -1 : ((a > b) ? 1 : 0)
    },
    sum: function (array, f) {
      var o = {};
      return array.reduce(f ? function (p, d, i) { o.index = i; return p + f.call(o, d) } : function (p, d) { return p + d }, 0)
    },
    max: function (array, f) {
      return Math.max.apply(null, f ? pv.map(array, f) : array)
    }
  };
}

/**
 * Basic Javascript port of the MMCQ (modified median cut quantization)
 * algorithm from the Leptonica library (http://www.leptonica.com/).
 * Returns a color map you can use to map original pixels to the reduced
 * palette. Still a work in progress.
 *
 * @author Nick Rabinowitz
 * @example

// array of pixels as [R,G,B] arrays
var myPixels = [[190,197,190], [202,204,200], [207,214,210], [211,214,211], [205,207,207]
                // etc
                ];
var maxColors = 4;

var cmap = MMCQ.quantize(myPixels, maxColors);
var newPalette = cmap.palette();
var newPixels = myPixels.map(function(p) {
    return cmap.map(p);
});

 */
var MMCQ = (function () {
  // private constants
  var sigbits = 5,
    rshift = 8 - sigbits,
    maxIterations = 1000,
    fractByPopulations = 0.75;

    // get reduced-space color index for a pixel
  function getColorIndex (r, g, b) {
    return (r << (2 * sigbits)) + (g << sigbits) + b
  }

  // Simple priority queue
  function PQueue (comparator) {
    var contents = [],
      sorted = false;

    function sort () {
      contents.sort(comparator);
      sorted = true;
    }

    return {
      push: function (o) {
        contents.push(o);
        sorted = false;
      },
      peek: function (index) {
        if (!sorted) sort();
        if (index === undefined) index = contents.length - 1;
        return contents[index]
      },
      pop: function () {
        if (!sorted) sort();
        return contents.pop()
      },
      size: function () {
        return contents.length
      },
      map: function (f) {
        return contents.map(f)
      },
      debug: function () {
        if (!sorted) sort();
        return contents
      }
    }
  }

  // 3d color space box
  function VBox (r1, r2, g1, g2, b1, b2, histo) {
    var vbox = this;
    vbox.r1 = r1;
    vbox.r2 = r2;
    vbox.g1 = g1;
    vbox.g2 = g2;
    vbox.b1 = b1;
    vbox.b2 = b2;
    vbox.histo = histo;
  }
  VBox.prototype = {
    volume: function (force) {
      var vbox = this;
      if (!vbox._volume || force) {
        vbox._volume = ((vbox.r2 - vbox.r1 + 1) * (vbox.g2 - vbox.g1 + 1) * (vbox.b2 - vbox.b1 + 1));
      }
      return vbox._volume
    },
    count: function (force) {
      var vbox = this,
        histo = vbox.histo,
        index = 0;
      if (!vbox._count_set || force) {
        var npix = 0,
          i, j, k;
        for (i = vbox.r1; i <= vbox.r2; i++) {
          for (j = vbox.g1; j <= vbox.g2; j++) {
            for (k = vbox.b1; k <= vbox.b2; k++) {
              index = getColorIndex(i, j, k);
              npix += (histo[index] || 0);
            }
          }
        }
        vbox._count = npix;
        vbox._count_set = true;
      }
      return vbox._count
    },
    copy: function () {
      var vbox = this;
      return new VBox(vbox.r1, vbox.r2, vbox.g1, vbox.g2, vbox.b1, vbox.b2, vbox.histo)
    },
    avg: function (force) {
      var vbox = this,
        histo = vbox.histo;
      if (!vbox._avg || force) {
        var ntot = 0,
          mult = 1 << (8 - sigbits),
          rsum = 0,
          gsum = 0,
          bsum = 0,
          hval,
          i, j, k, histoindex;
        for (i = vbox.r1; i <= vbox.r2; i++) {
          for (j = vbox.g1; j <= vbox.g2; j++) {
            for (k = vbox.b1; k <= vbox.b2; k++) {
              histoindex = getColorIndex(i, j, k);
              hval = histo[histoindex] || 0;
              ntot += hval;
              rsum += (hval * (i + 0.5) * mult);
              gsum += (hval * (j + 0.5) * mult);
              bsum += (hval * (k + 0.5) * mult);
            }
          }
        }
        if (ntot) {
          vbox._avg = [~~(rsum / ntot), ~~(gsum / ntot), ~~(bsum / ntot)];
        } else {
          //                    console.log('empty box');
          vbox._avg = [
            ~~(mult * (vbox.r1 + vbox.r2 + 1) / 2),
            ~~(mult * (vbox.g1 + vbox.g2 + 1) / 2),
            ~~(mult * (vbox.b1 + vbox.b2 + 1) / 2)
          ];
        }
      }
      return vbox._avg
    },
    contains: function (pixel) {
      var vbox = this,
        rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      return (rval >= vbox.r1 && rval <= vbox.r2 &&
                    gval >= vbox.g1 && gval <= vbox.g2 &&
                    bval >= vbox.b1 && bval <= vbox.b2)
    }
  };

  // Color map
  function CMap () {
    this.vboxes = new PQueue(function (a, b) {
      return pv.naturalOrder(
        a.vbox.count() * a.vbox.volume(),
        b.vbox.count() * b.vbox.volume()
      )
    });
  }
  CMap.prototype = {
    push: function (vbox) {
      this.vboxes.push({
        vbox: vbox,
        color: vbox.avg()
      });
    },
    palette: function () {
      return this.vboxes.map(function (vb) { return vb.color })
    },
    size: function () {
      return this.vboxes.size()
    },
    map: function (color) {
      var vboxes = this.vboxes;
      for (var i = 0; i < vboxes.size(); i++) {
        if (vboxes.peek(i).vbox.contains(color)) {
          return vboxes.peek(i).color
        }
      }
      return this.nearest(color)
    },
    nearest: function (color) {
      var vboxes = this.vboxes,
        d1, d2, pColor;
      for (var i = 0; i < vboxes.size(); i++) {
        d2 = Math.sqrt(
          Math.pow(color[0] - vboxes.peek(i).color[0], 2) +
                    Math.pow(color[1] - vboxes.peek(i).color[1], 2) +
                    Math.pow(color[2] - vboxes.peek(i).color[2], 2)
        );
        if (d2 < d1 || d1 === undefined) {
          d1 = d2;
          pColor = vboxes.peek(i).color;
        }
      }
      return pColor
    },
    forcebw: function () {
      // XXX: won't  work yet
      var vboxes = this.vboxes;
      vboxes.sort(function (a, b) { return pv.naturalOrder(pv.sum(a.color), pv.sum(b.color)) });

      // force darkest color to black if everything < 5
      var lowest = vboxes[0].color;
      if (lowest[0] < 5 && lowest[1] < 5 && lowest[2] < 5) { vboxes[0].color = [0, 0, 0]; }

      // force lightest color to white if everything > 251
      var idx = vboxes.length - 1,
        highest = vboxes[idx].color;
      if (highest[0] > 251 && highest[1] > 251 && highest[2] > 251) { vboxes[idx].color = [255, 255, 255]; }
    }
  };

  // histo (1-d array, giving the number of pixels in
  // each quantized region of color space), or null on error
  function getHisto (pixels) {
    var histosize = 1 << (3 * sigbits),
      histo = new Array(histosize),
      index, rval, gval, bval;
    pixels.forEach(function (pixel) {
      rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      index = getColorIndex(rval, gval, bval);
      histo[index] = (histo[index] || 0) + 1;
    });
    return histo
  }

  function vboxFromPixels (pixels, histo) {
    var rmin = 1000000, rmax = 0,
      gmin = 1000000, gmax = 0,
      bmin = 1000000, bmax = 0,
      rval, gval, bval;
    // find min/max
    pixels.forEach(function (pixel) {
      rval = pixel[0] >> rshift;
      gval = pixel[1] >> rshift;
      bval = pixel[2] >> rshift;
      if (rval < rmin) rmin = rval;
      else if (rval > rmax) rmax = rval;
      if (gval < gmin) gmin = gval;
      else if (gval > gmax) gmax = gval;
      if (bval < bmin) bmin = bval;
      else if (bval > bmax) bmax = bval;
    });
    return new VBox(rmin, rmax, gmin, gmax, bmin, bmax, histo)
  }

  function medianCutApply (histo, vbox) {
    if (!vbox.count()) return

    var rw = vbox.r2 - vbox.r1 + 1,
      gw = vbox.g2 - vbox.g1 + 1,
      bw = vbox.b2 - vbox.b1 + 1,
      maxw = pv.max([rw, gw, bw]);
    // only one pixel, no split
    if (vbox.count() == 1) {
      return [vbox.copy()]
    }
    /* Find the partial sum arrays along the selected axis. */
    var total = 0,
      partialsum = [],
      lookaheadsum = [],
      i, j, k, sum, index;
    if (maxw == rw) {
      for (i = vbox.r1; i <= vbox.r2; i++) {
        sum = 0;
        for (j = vbox.g1; j <= vbox.g2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(i, j, k);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else if (maxw == gw) {
      for (i = vbox.g1; i <= vbox.g2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(j, i, k);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else { /* maxw == bw */
      for (i = vbox.b1; i <= vbox.b2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.g1; k <= vbox.g2; k++) {
            index = getColorIndex(j, k, i);
            sum += (histo[index] || 0);
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    }
    partialsum.forEach(function (d, i) {
      lookaheadsum[i] = total - d;
    });
    function doCut (color) {
      var dim1 = color + '1',
        dim2 = color + '2',
        left, right, vbox1, vbox2, d2, count2 = 0;
      for (i = vbox[dim1]; i <= vbox[dim2]; i++) {
        if (partialsum[i] > total / 2) {
          vbox1 = vbox.copy();
          vbox2 = vbox.copy();
          left = i - vbox[dim1];
          right = vbox[dim2] - i;
          if (left <= right) { d2 = Math.min(vbox[dim2] - 1, ~~(i + right / 2)); } else d2 = Math.max(vbox[dim1], ~~(i - 1 - left / 2));
          // avoid 0-count boxes
          while (!partialsum[d2]) d2++;
          count2 = lookaheadsum[d2];
          while (!count2 && partialsum[d2 - 1]) count2 = lookaheadsum[--d2];
          // set dimensions
          vbox1[dim2] = d2;
          vbox2[dim1] = vbox1[dim2] + 1;
          //                    console.log('vbox counts:', vbox.count(), vbox1.count(), vbox2.count());
          return [vbox1, vbox2]
        }
      }
    }
    // determine the cut planes
    return maxw == rw ? doCut('r')
      : maxw == gw ? doCut('g')
        : doCut('b')
  }

  function quantize (pixels, maxcolors) {
    // short-circuit
    if (!pixels.length || maxcolors < 2 || maxcolors > 256) {
      //            console.log('wrong number of maxcolors');
      return false
    }

    // XXX: check color content and convert to grayscale if insufficient

    var histo = getHisto(pixels),
      histosize = 1 << (3 * sigbits);

    // check that we aren't below maxcolors already
    var nColors = 0;
    histo.forEach(function () { nColors++; });
    if (nColors <= maxcolors) {
      // XXX: generate the new colors from the histo and return
    }

    // get the beginning vbox from the colors
    var vbox = vboxFromPixels(pixels, histo),
      pq = new PQueue(function (a, b) { return pv.naturalOrder(a.count(), b.count()) });
    pq.push(vbox);

    // inner function to do the iteration
    function iter (lh, target) {
      var ncolors = 1,
        niters = 0,
        vbox;
      while (niters < maxIterations) {
        vbox = lh.pop();
        if (!vbox.count()) { /* just put it back */
          lh.push(vbox);
          niters++;
          continue
        }
        // do the cut
        var vboxes = medianCutApply(histo, vbox),
          vbox1 = vboxes[0],
          vbox2 = vboxes[1];

        if (!vbox1) {
          //                    console.log("vbox1 not defined; shouldn't happen!");
          return
        }
        lh.push(vbox1);
        if (vbox2) { /* vbox2 can be null */
          lh.push(vbox2);
          ncolors++;
        }
        if (ncolors >= target) return
        if (niters++ > maxIterations) {
          //                    console.log("infinite loop; perhaps too few pixels!");
          return
        }
      }
    }

    // first set of colors, sorted by population
    iter(pq, fractByPopulations * maxcolors);

    // Re-sort by the product of pixel occupancy times the size in color space.
    var pq2 = new PQueue(function (a, b) {
      return pv.naturalOrder(a.count() * a.volume(), b.count() * b.volume())
    });
    while (pq.size()) {
      pq2.push(pq.pop());
    }

    // next set - generate the median cuts using the (npix * vol) sorting.
    iter(pq2, maxcolors - pq2.size());

    // calculate the actual colors
    var cmap = new CMap();
    while (pq2.size()) {
      cmap.push(pq2.pop());
    }

    return cmap
  }

  return {
    quantize: quantize
  }
})();

/* globals Image */

// convert and resize an image url to a data url


// like urlToData, but loads all images and takes the one that fits the target dimensions best
async function urlsToData (urls, width, height) {
  // load all images
  var imgs = await Promise.all(urls.map(url => {
    return new Promise(resolve => {
      var img = new Image();
      img.onload = e => resolve(img);
      img.onerror = () => resolve(false);
      img.src = url;
    })
  }));

  // filter out failures and abort if none loaded
  imgs = imgs.filter(Boolean);
  if (!imgs.length) {
    return false
  }

  // choose the image with the closest dimensions to our target
  var bestImg = imgs[0];
  var bestDist = dist(imgs[0].width, imgs[0].height, width, height);
  for (var i = 1; i < imgs.length; i++) {
    let imgDist = dist(imgs[i].width, imgs[i].height, width, height);
    if (imgDist < bestDist) {
      bestImg = imgs[i];
      bestDist = imgDist;
    }
  }
  return {
    url: bestImg.src,
    dataUrl: imgToData(bestImg, width, height)
  }
}

// convert and resize an <img> to a data url
function imgToData (img, width, height) {
  var ratio = img.width / img.height;
  if (width / height > ratio) { height = width / ratio; } else { width = height * ratio; }

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png')
}

function dist (x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
}

// helper to make node-style CBs into promises
// usage: cbPromise(cb => myNodeStyleMethod(cb)).then(...)


// Underscore.js
// Returns a function, that, when invoked, will only be triggered at most once
// during a given window of time. Normally, the throttled function will run
// as much as it can, without ever going more than once per `wait` duration;
// but if you'd like to disable the execution on the leading edge, pass
// `{leading: false}`. To disable execution on the trailing edge, ditto.
function throttle (func, wait, options) {
  var timeout, context, args, result;
  var previous = 0;
  if (!options) options = {};

  var later = function () {
    previous = options.leading === false ? 0 : Date.now();
    timeout = null;
    result = func.apply(context, args);
    if (!timeout) context = args = null;
  };

  var throttled = function () {
    var now = Date.now();
    if (!previous && options.leading === false) previous = now;
    var remaining = wait - (now - previous);
    context = this;
    args = arguments;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining);
    }
    return result
  };

  throttled.cancel = function () {
    clearTimeout(timeout);
    previous = 0;
    timeout = context = args = null;
  };

  return throttled
}

// Underscore.js
// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce$1 (func, wait, immediate) {
  var timeout, result;

  var later = function (context, args) {
    timeout = null;
    if (args) result = func.apply(context, args);
  };

  var debounced = function (...args) {
    if (timeout) clearTimeout(timeout);
    if (immediate) {
      var callNow = !timeout;
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(this, args);
    } else {
      timeout = setTimeout(() => later(this, args), wait);
    }

    return result
  };

  debounced.cancel = function () {
    clearTimeout(timeout);
    timeout = null;
  };

  return debounced
}

var errorPageCSS = `
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
a {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif;
}
.btn {
  display: inline-block;
  cursor: pointer;
  color: #5c5c5c;
  border-radius: 2px;
  background: #fafafa;
  border: 1px solid #d9d9d9;
  font-size: 12px;
  font-weight: 600;
  height: 25px;
  line-height: 25px;
  padding: 0 8px;
}
.btn * {
  cursor: pointer;
  line-height: 25px;
  vertical-align: baseline;
  display: inline-block;
}
.btn:focus {
  outline-color: #007aff;
}
.btn:hover {
  text-decoration: none;
  background: #f0f0f0;
}
.btn.disabled,
.btn:disabled {
  cursor: default;
  color: #999999;
  border: 1px solid #ddd;
  box-shadow: none;
}
.btn.disabled .spinner,
.btn:disabled .spinner {
  color: #aaa;
}
.btn.primary {
  -webkit-font-smoothing: antialiased;
  font-weight: 800;
  background: #007aff;
  color: #fff;
  border: none;
  transition: background .1s ease;
}
.btn.primary:hover {
  background: #0074f2;
}
a.btn span {
  vertical-align: baseline;
}
a.link {
  color: blue;
  text-decoration: underline;
}
div.error-page-content {
  max-width: 550px;
  margin: auto;
  margin-top: 30vh;
}
div.error-page-content .description {
  font-size: 14px;
  color: #707070;

  p {
    margin: 20px 0;
  }
}
div.error-page-content i {
  margin-right: 5px;
}
div.error-page-content .btn {
  float: right;
}
h1 {
  margin: 0;
  color: #333;
  font-weight: 400;
  font-size: 22px;
  padding-bottom: 10px;
  border-bottom: 1px solid #d9d9d9;
}
.icon {
  float: right;
}
.icon.warning {
  color: #e60b00;
}
li {
  margin-bottom: 0.5em;
}
li:last-child {
  margin: 0;
}
`;

var errorPage = function (e) {
  var title = 'This site can’t be reached';
  var info = '';
  var icon = 'fa-info-circle';
  var button = '<a class="btn" href="javascript:window.location.reload()">Try again</a>';
  var errorDescription;
  var moreHelp = '';

  if (typeof e === 'object') {
    errorDescription = e.errorDescription;
    // remove trailing slash
    var origin = e.validatedURL.slice(0, e.validatedURL.length - 1);

    // strip protocol
    if (origin.startsWith('https://')) {
      origin = origin.slice(8);
    } else if (origin.startsWith('http://')) {
      origin = origin.slice(7);
    }

    switch (e.errorCode) {
      case -106:
        title = 'No internet connection';
        info = '<p>Your computer is not connected to the internet.</p><p>Try:</p><ul><li>Resetting your Wi-Fi connection<li>Checking your router and modem.</li></ul>';
        break
      case -105:
        info = `<p>Couldn’t resolve the DNS address for <strong>${origin}</strong></p>`;
        break
      case -501:
        title = 'Your connection is not secure';
        info = `<p>Beaker cannot establish a secure connection to the server for <strong>${origin}</strong>.</p>`;
        icon = 'fa-warning warning';
        button = '<a class="btn" href="javascript:window.history.back()">Go back</a>';
        break
      case 'dat-timeout':
        title = 'Timed out';
        info = `<p>It took too long to find this ${e.resource} on the peer-to-peer network.</p>`;
        errorDescription = `Beaker will keep searching. Wait a few moments and try again.`;
        moreHelp = `
          <p><strong>Troubleshooting</strong></p>
          <ul>
            <li>There may not be any peers hosting this ${e.resource} right now.<br /><a class="link" href="beaker://swarm-debugger/${e.validatedURL.slice('dat://'.length)}">Try the swarm debugger</a>.</li>
            <li>Your firewall may be blocking peer-to-peer traffic.<br /><a class="link" href="https://beakerbrowser.com/docs/using-beaker/troubleshooting.html" target="_blank">How to configure your firewall.</a></li>
          </ul>
        `;
        break
    }
  } else {
    errorDescription = e;
  }

  return `
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      </head>
      <body>
        <style>${errorPageCSS}</style>
        <link rel="stylesheet" href="beaker://assets/font-awesome.css">
        <div class="error-page-content">
          <h1>${title} <i class="icon fa ${icon}"></i></h1>
          <div class="description">
            ${info}
            ${moreHelp}
            <p>${errorDescription}</p>
          </div>
          ${button}
        </div>
      </body>
    </html>`.replace(/\n/g, '')
};

/* globals beakerBrowser */

/*
The webview has a set of sync method calls to the main process
which will stall the renderer if called while the main is
handling a workload.

https://github.com/electron/electron/blob/master/lib/renderer/web-view/web-view.js#L319-L371

This adds a set of async alternatives
*/

const methods = [
  'getURL',
  'loadURL',
  'getTitle',
  'isLoading',
  'isLoadingMainFrame',
  'isWaitingForResponse',
  'stop',
  'reload',
  'reloadIgnoringCache',
  'canGoBack',
  'canGoForward',
  'canGoToOffset',
  'clearHistory',
  'goBack',
  'goForward',
  'goToIndex',
  'goToOffset',
  'isCrashed',
  'setUserAgent',
  'getUserAgent',
  'openDevTools',
  'closeDevTools',
  'isDevToolsOpened',
  'isDevToolsFocused',
  'inspectElement',
  'setAudioMuted',
  'isAudioMuted',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'pasteAndMatchStyle',
  'delete',
  'selectAll',
  'unselect',
  'replace',
  'replaceMisspelling',
  'findInPage',
  'stopFindInPage',
  'getId',
  'downloadURL',
  'inspectServiceWorker',
  'print',
  'printToPDF',
  'showDefinitionForSelection',
  'capturePage',
  'setZoomFactor',
  'setZoomLevel',
  'getZoomLevel',
  'getZoomFactor'
];

function addAsyncAlternatives (page) {
  methods.forEach(method => {
    page[method + 'Async'] = async (...args) => {
      if (!page.isWebviewReady) return false
      return beakerBrowser.doWebcontentsCmd(method, page.wcID, ...args)
    };
  });
}

/* globals beaker DatArchive beakerSitedata URL beakerBrowser */

// constants
// =

const ERR_ABORTED = -3;
const ERR_CONNECTION_REFUSED = -102;
const ERR_INSECURE_RESPONSE = -501;

const TRIGGER_LIVE_RELOAD_DEBOUNCE = 1e3; // throttle live-reload triggers by this amount

const FIRST_TAB_URL = 'beaker://start';
const DEFAULT_URL = 'beaker://start';

const APP_PATH = electron.remote.app.getAppPath(); // NOTE: this is a sync op

// globals
// =

var pages = [];
var activePage = null;
var events = new EventEmitter();
var webviewsDiv = document.getElementById('webviews');
var closedURLs = [];
var cachedMarkdownRendererScript;

// exported functions
// =

function on$$1 (...args) {
  events.on.apply(events, args);
}

function getAll () {
  return pages
}

function getPinned () {
  return pages.filter(p => p.isPinned)
}

function setup$2 () {
  beaker.archives.addEventListener('network-changed', ({details}) => {
    // check if any of the active pages matches this url
    pages.forEach(page => {
      if (page.siteInfo && page.siteInfo.url === details.url) {
        // update info
        page.siteInfo.peers = details.peerCount;
        update$1(page);
      }
    });
  });
}

function create (opts) {
  // TCW CHANGES -- this sends a synchronous test message to background-process/ui/windows.js
  console.log('something created');

  console.log(electron.ipcRenderer.sendSync('synchronous-message', 'ping')); // prints "pong"

  electron.ipcRenderer.on('asynchronous-reply', (event, arg) => {
    console.log(arg); // prints "pong"
  });

  electron.ipcRenderer.send('asynchronous-message', 'ping');

  // TCW -- END

  var url;
  if (opts && typeof opts == 'object') {
    url = opts.url;
  } else if (typeof opts == 'string') {
    url = opts;
    opts = {};
  } else { opts = {}; }

  url = url || DEFAULT_URL;

  // create page object
  var id = (Math.random() * 1000 | 0) + Date.now();
  var page = {
    id: id,
    wcID: null, // the id of the webcontents
    webviewEl: createWebviewEl(id, url),
    navbarEl: createEl(id),
    promptbarEl: createEl$1(id),

    // page state
    url, // what is the actual current URL?
    loadingURL: url, // what URL is being loaded, if any?
    title: '', // what is the current pages title?
    isGuessingTheURLScheme: false, // did beaker guess at the url scheme? if so, a bad load may deserve a second try
    manuallyTrackedIsLoading: true, // used because the webview may never be ready, so webview.isLoading() isnt enough
    isWebviewReady: false, // has the webview loaded its methods?
    isReceivingAssets: false, // has the webview started receiving assets, in the current load-cycle?
    isActive: false, // is the active page?
    isInpageFinding: false, // showing the inpage find ctrl?
    liveReloadEvents: false, // live-reload event stream
    zoom: 0, // what's the current zoom level?

    // current page's info
    contentType: null, // what is the content-type of the page?
    favicons: null, // what are the favicons of the page?
    bookmark: null, // this page's bookmark object, if it's bookmarked

    // current site's info
    protocolInfo: null, // info about the current page's delivery protocol
    siteLoadError: null, // info about the current page's last load's error (null if no error)
    siteInfo: null, // metadata about the current page, derived from protocol knowledge
    sitePerms: null, // saved permissions for the current page
    siteInfoOverride: null, // explicit overrides on the siteinfo, used by beaker: pages
    siteHasDatAlternative: false, // is there a dat:// version we can redirect to?

    // history
    lastVisitedAt: 0, // when is last time url updated?
    lastVisitedURL: null, // last URL added into history
    _canGoBack: false, // cached to avoid sync calls to the main process
    _canGoForward: false, // cached to avoid sync calls to the main process

    // prompts
    prompts: [], // list of active prompts (used with perms)

    // tab state
    isPinned: opts.isPinned, // is this page pinned?
    isTabDragging: false, // being dragged?
    tabDragOffset: 0, // if being dragged, this is the current offset

    // get the current URL
    getURL () {
      return this.url
    },

    // get the current title
    getTitle () {
      return this.title
    },

    // get the URL of the page we want to load (vs which is currently loaded)
    getIntendedURL () {
      var url = page.loadingURL || page.getURL();
      if (url.startsWith('beaker:') && page.siteInfoOverride && page.siteInfoOverride.url) {
        // override, only if on a builtin beaker site
        url = page.siteInfoOverride.url;
      }
      return url
    },

    // custom isLoading
    isLoading () {
      return page.manuallyTrackedIsLoading
    },

    // cache getters to avoid sync calls to the main process
    canGoBack () { return this._canGoBack },
    canGoForward () { return this._canGoForward },

    // wrap webview loadURL to set the `loadingURL`
    loadURL (url, opts) {
      // reset some state
      page.isReceivingAssets = false;
      page.siteInfoOverride = null;

      // HACK to fix electron#8505
      // dont allow visibility: hidden until set active
      page.webviewEl.classList.remove('can-hide');

      // set and go
      page.loadingURL = url;
      page.isGuessingTheURLScheme = opts && opts.isGuessingTheScheme;
      if (!page.isWebviewReady) {
        // just do a sync call, otherwise loadURLAsync will drop it on the floor
        page.webviewEl.loadURL(url); // NOTE sync call
      } else {
        page.loadURLAsync(url);
      }
    },

    // HACK wrap reload so we can remove can-hide class
    reload () {
      // HACK to fix electron#8505
      // dont allow visibility: hidden until set active
      page.webviewEl.classList.remove('can-hide');
      setTimeout(() => page.reloadAsync(), 100);
      // ^ needs a delay or it doesnt take effect in time, SMH at this code though
    },

    // add/remove bookmark
    toggleBookmark () {
      // update state
      if (page.bookmark) {
        beaker.bookmarks.remove(page.bookmark.url);
        page.bookmark = null;
      } else if (page.isActive) {
        page.bookmark = { url: page.getIntendedURL(), title: page.getTitle() };
        beaker.bookmarks.add(page.bookmark.url, page.bookmark.title);
      }
      // update nav
      update$1(page);
    },

    getURLOrigin () {
      return parseURL(this.getURL()).origin
    },

    isLiveReloading () {
      return !!page.liveReloadEvents
    },

    // start/stop live reloading
    toggleLiveReloading () {
      if (page.liveReloadEvents) {
        page.liveReloadEvents.close();
        page.liveReloadEvents = false;
      } else if (page.siteInfo) {
        var archive = new DatArchive(page.siteInfo.key);
        page.liveReloadEvents = archive.createFileActivityStream();
        let event = (page.siteInfo.isOwner) ? 'changed' : 'invalidated';
        page.liveReloadEvents.addEventListener(event, () => {
          page.triggerLiveReload();
        });
      }
      update$1(page);
    },

    stopLiveReloading () {
      if (page.liveReloadEvents) {
        page.liveReloadEvents.close();
        page.liveReloadEvents = false;
      }
    },

    // reload the page due to changes in the dat
    triggerLiveReload: throttle(() => {
      page.reload();
    }, TRIGGER_LIVE_RELOAD_DEBOUNCE),
    // ^ note this is run on the front edge.
    // That means snappier reloads (no delay) but possible double reloads if multiple files change

    // helper to load the perms
    fetchSitePerms () {
      beakerSitedata.getPermissions(this.getURL()).then(perms => {
        page.sitePerms = perms;
        update$1(page);
      });
    },

    // helper to check if there's a dat version of the site available
    checkForDatAlternative (name) {
      DatArchive.resolveName(name).then(res => {
        this.siteHasDatAlternative = !!res;
        update$1(page);
      }).catch(err => console.log('Name does not have a Dat alternative', name));
    },

    async toggleDevTools () {
      if (await this.isDevToolsOpenedAsync()) {
        this.closeDevToolsAsync();
      } else {
        this.openDevToolsAsync();
      }
    }
  };

  if (opts.isPinned) {
    pages.splice(indexOfLastPinnedTab(), 0, page);
  } else {
    pages.push(page);
  }

  // add *Async alternatives to all methods, *Sync really should never be used
  addAsyncAlternatives(page);

  // add but leave hidden
  hide(page);
  webviewsDiv.appendChild(page.webviewEl);

  // emit
  events.emit('update');
  events.emit('add', page);

  // register events
  page.webviewEl.addEventListener('dom-ready', onDomReady);
  page.webviewEl.addEventListener('new-window', onNewWindow);
  page.webviewEl.addEventListener('will-navigate', onWillNavigate);
  page.webviewEl.addEventListener('did-navigate-in-page', onDidNavigateInPage);
  page.webviewEl.addEventListener('did-start-loading', onDidStartLoading);
  page.webviewEl.addEventListener('did-stop-loading', onDidStopLoading);
  page.webviewEl.addEventListener('load-commit', onLoadCommit);
  page.webviewEl.addEventListener('did-get-redirect-request', onDidGetRedirectRequest);
  page.webviewEl.addEventListener('did-get-response-details', onDidGetResponseDetails);
  page.webviewEl.addEventListener('did-finish-load', onDidFinishLoad);
  page.webviewEl.addEventListener('did-fail-load', onDidFailLoad);
  page.webviewEl.addEventListener('page-favicon-updated', onPageFaviconUpdated);
  page.webviewEl.addEventListener('page-title-updated', onPageTitleUpdated);
  page.webviewEl.addEventListener('update-target-url', onUpdateTargetUrl);
  page.webviewEl.addEventListener('close', onClose);
  page.webviewEl.addEventListener('crashed', onCrashed);
  page.webviewEl.addEventListener('gpu-crashed', onCrashed);
  page.webviewEl.addEventListener('plugin-crashed', onCrashed);
  page.webviewEl.addEventListener('ipc-message', onIPCMessage);

  // rebroadcasts
  page.webviewEl.addEventListener('did-start-loading', rebroadcastEvent);
  page.webviewEl.addEventListener('did-stop-loading', rebroadcastEvent);
  page.webviewEl.addEventListener('page-title-updated', rebroadcastEvent);
  page.webviewEl.addEventListener('page-favicon-updated', rebroadcastEvent);

  // make active if none others are
  if (!activePage) { setActive(page); }

  return page
}

async function remove$$1 (page) {
  // find
  var i = pages.indexOf(page);
  if (i == -1) { return console.warn('pages.remove() called for missing page', page) }

  // save, in case the user wants to restore it
  closedURLs.push(page.getURL());

  // set new active if that was
  if (page.isActive) {
    if (pages.length == 1) { return window.close() }
    setActive(pages[i + 1] || pages[i - 1]);
  }

  // remove
  onPageClose(page);
  page.stopLiveReloading();
  pages.splice(i, 1);
  webviewsDiv.removeChild(page.webviewEl);
  destroyEl(page.id);
  destroyEl$1(page.id);

  // persist pins w/o this one, if that was
  if (page.isPinned) { savePinnedToDB(); }

  // emit
  events.emit('remove', page);
  events.emit('update');

  // remove all attributes, to clear circular references
  for (var k in page) {
    page[k] = null;
  }
}

function reopenLastRemoved () {
  var url = closedURLs.pop();
  if (url) {
    var page = create(url);
    setActive(page);
    return page
  }
}

function setActive (page) {
  if (activePage) {
    hide(activePage);
    activePage.isActive = false;
  }
  activePage = page;
  show(page);
  page.isActive = 1;
  page.webviewEl.focus();
  setIsLoading(page.isLoading());
  onPageSetActive(page);
  update$1();
  update$2();
  events.emit('set-active', page);

  // HACK to fix electron#8505
  // can now allow visibility: hidden
  page.webviewEl.classList.add('can-hide');
}

function togglePinned (page) {
  // move tab in/out of the pinned tabs
  var oldIndex = pages.indexOf(page);
  var newIndex = indexOfLastPinnedTab();
  if (oldIndex < newIndex) newIndex--;
  pages.splice(oldIndex, 1);
  pages.splice(newIndex, 0, page);

  // update page state
  page.isPinned = !page.isPinned;
  events.emit('pin-updated', page);

  // persist
  savePinnedToDB();
}

function indexOfLastPinnedTab () {
  var index = 0;
  for (index; index < pages.length; index++) {
    if (!pages[index].isPinned) { break }
  }
  return index
}

function reorderTab (page, offset) {
  // only allow increments of 1
  if (offset > 1 || offset < -1) { return console.warn('reorderTabBy isnt allowed to offset more than -1 or 1; this is a coding error') }

  // first check if reordering can happen
  var srcIndex = pages.indexOf(page);
  var dstIndex = srcIndex + offset;
  var swapPage = pages[dstIndex];
  // is there actually a destination?
  if (!swapPage) { return false }
  // can only swap if both are the same pinned state (pinned/unpinned cant mingle)
  if (page.isPinned != swapPage.isPinned) { return false }

  // ok, do the swap
  pages[srcIndex] = swapPage;
  pages[dstIndex] = page;
  return true
}

function changeActiveBy (offset) {
  if (pages.length > 1) {
    var i = pages.indexOf(activePage);
    if (i === -1) { return console.warn('Active page is not in the pages list! THIS SHOULD NOT HAPPEN!') }

    i += offset;
    if (i < 0) i = pages.length - 1;
    if (i >= pages.length) i = 0;

    setActive(pages[i]);
  }
}

function changeActiveTo (index) {
  if (index >= 0 && index < pages.length) { setActive(pages[index]); }
}

function getActive () {
  return activePage
}

function getAdjacentPage (page, offset) {
  if (pages.length > 1) {
    // lookup the index
    var i = pages.indexOf(page);
    if (i === -1) { return null }

    // add offset and return
    return pages[i + offset]
  }
}

function getByWebview (el) {
  return getById(el.dataset.id)
}

function getByWebContentsID (wcID) {
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].wcID === wcID) { return pages[i] }
  }
  return null
}

function getById (id) {
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].id == id) { return pages[i] }
  }
  return null
}

function loadPinnedFromDB () {
  return beakerBrowser.getSetting('pinned-tabs').then(json => {
    try { JSON.parse(json).forEach(url => create({ url, isPinned: true })); } catch (e) {}
  })
}

function savePinnedToDB () {
  return beakerBrowser.setSetting('pinned-tabs', JSON.stringify(getPinned().map(p => p.getURL())))
}

// event handlers
// =

function onDomReady (e) {
  var page = getByWebview(e.target);
  if (page) {
    page.isWebviewReady = true;
    if (!page.wcID) {
      page.wcID = e.target.getWebContents().id; // NOTE: this is a sync op
    }
    if (!isLocationFocused(page)) {
      page.webviewEl.shadowRoot.querySelector('object').focus();
    }
  }
}

function onNewWindow (e) {
  var page = getByWebview(e.target);
  if (page && page.isActive) { // only open if coming from the active tab
    var newPage = create(e.url);
    if (e.disposition === 'foreground-tab' || e.disposition === 'new-window') {
      setActive(newPage);
    }
  }
}

// will-navigate is the first event called when a link is clicked
// we can set the URL now, and update the navbar, to get quick response from the page
// (if entered by the user in the URL bar, this wont emit, but the loadURL() wrapper will set it)
function onWillNavigate (e) {
  var page = getByWebview(e.target);
  if (page) {
    // reset some state
    page.isReceivingAssets = false;
    // update target url
    page.loadingURL = e.url;

    page.siteInfoOverride = null;
    updateLocation(page);
  }
}

// did-navigate-in-page is triggered by hash/virtual-url changes
// we need to update the url bar but no load event occurs
function onDidNavigateInPage (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // update ui
    page.url = e.url;
    updateLocation(page);

    // update history
    updateHistory(page);
  }
}

function onLoadCommit (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // clear out the page's error
    page.siteLoadError = null;
    // turn off live reloading if we're leaving the domain
    if (isDifferentDomain(e.url, page.url)) {
      page.stopLiveReloading();
    }
    // check if this page bookmarked
    beaker.bookmarks.get(e.url).then(bookmark => {
      page.bookmark = bookmark;
      update$1(page);
    });
    setZoomFromSitedata(page, parseURL(page.getIntendedURL()).origin);
    // stop autocompleting
    clearAutocomplete();
    // close any prompts
    forceRemoveAll(page);
    // set title in tabs
    page.title = e.target.getTitle(); // NOTE sync operation
    update$1(page);
    events.emit('load-commit', e.url);
  }
}

function onDidStartLoading (e) {
  var page = getByWebview(e.target);
  if (page) {
    // update state
    page.manuallyTrackedIsLoading = true;
    update$1(page);
    hideInpageFind(page);
    if (page.isActive) {
      setIsLoading(true);
    }
  }
}

function onDidStopLoading (e) {
  var page = getByWebview(e.target);

  if (page) {
    // update url
    if (page.loadingURL) {
      page.url = page.loadingURL;
    }
    var url = page.url;

    // update history and UI
    onPageChangeLocation(page);
    updateHistory(page);

    // fetch protocol and page info
    var { protocol, hostname, pathname } = url.startsWith('dat://') ? parseDatURL(url) : parseURL(url);
    page.siteInfo = null;
    page.sitePerms = null;
    page.siteHasDatAlternative = false;
    page.protocolInfo = {url, hostname, pathname, scheme: protocol, label: protocol.slice(0, -1).toUpperCase()};
    if (protocol === 'https:') {
      page.checkForDatAlternative(hostname);
    }
    if (protocol === 'dat:') {
      DatArchive.resolveName(hostname).then(key => {
        beaker.archives.get(key).then(info => {
          page.siteInfo = info;
          update$1(page);

          // fallback the tab title to the site title, if needed
          if (isEqualURL(page.getTitle(), page.getURL()) && info.title) {
            page.title = info.title;
            events.emit('page-title-updated', page);
          }
        });
      });
    }
    if (protocol !== 'beaker:') {
      page.fetchSitePerms();
    }

    // update page
    page.loadingURL = false;
    page.manuallyTrackedIsLoading = false;
    if (page.isActive) {
      updateLocation(page);
      update$1(page);
      setIsLoading(false);
    }

    // markdown rendering
    // inject the renderer script if the page is markdown
    if (page.contentType.startsWith('text/markdown') || page.contentType.startsWith('text/x-markdown')) {
      // hide the unformatted text and provide some basic styles
      page.webviewEl.insertCSS(`
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, Cantarell, "Oxygen Sans", "Helvetica Neue", sans-serif; }
        body > pre { display: none; }
        main { display: flex; }
        nav { max-width: 200px; padding-right: 2em; }
        nav .link { white-space: pre; overflow: hidden; text-overflow: ellipsis; margin: 0.5em 0 }
        main > div { max-width: 800px; }
        hr { border: 0; border-top: 1px solid #ccc; margin: 1em 0; }
        blockquote { margin: 0; padding: 0 1em; border-left: 1em solid #eee; }
        .anchor-link { color: #aaa; margin-left: 5px; text-decoration: none; visibility: hidden; }
        h1:hover .anchor-link, h2:hover .anchor-link, h3:hover .anchor-link, h4:hover .anchor-link, h5:hover .anchor-link { visibility: visible; }
        table { border-collapse: collapse; }
        td, th { padding: 0.5em 1em; }
        tbody tr:nth-child(odd) { background: #fafafa; }
        tbody td { border-top: 1px solid #bbb; }
        .switcher { position: absolute; top: 5px; right: 5px; font-family: Consolas, 'Lucida Console', Monaco, monospace; cursor: pointer; font-size: 13px; background: #fafafa; padding: 2px 5px; }
        main code { font-size: 1.3em; background: #fafafa; }
        main pre { background: #fafafa; padding: 1em }
      `);
      if (!cachedMarkdownRendererScript) {
        cachedMarkdownRendererScript = fs.readFileSync(path.join(APP_PATH, 'markdown-renderer.build.js'), 'utf8');
      }
      page.webviewEl.executeJavaScript(cachedMarkdownRendererScript);
    }

    // HACK
    // inject some corrections to the user-agent styles
    // real solution is to update electron so we can change the user-agent styles
    // -prf
    page.webviewEl.insertCSS(
      // set the default background to white.
      // on some devices, if no bg is set, the buffer doesnt get cleared
      `body {
        background: #fff;
      }` +

      // style file listings
      `pre{font-family: Consolas, 'Lucida Console', Monaco, monospace; font-size: 13px;}` +

      // hide context menu definitions
      `menu[type="context"] { display: none; }` +

      // adjust the positioning of fullpage media players
      `body:-webkit-full-page-media {
        background: #ddd;
      }
      audio:-webkit-full-page-media, video:-webkit-full-page-media {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }`
    );
  }
}

function onDidGetRedirectRequest (e) {
  // HACK
  // electron has a problem handling redirects correctly, so we need to handle it for them
  // see https://github.com/electron/electron/issues/3471
  // thanks github.com/sokcuri and github.com/alexstrat for this fix
  // -prf
  if (e.isMainFrame) {
    var page = getByWebview(e.target);
    if (page) {
      e.preventDefault();
      setTimeout(() => {
        console.log('Using redirect workaround for electron #3471; redirecting to', e.newURL);
        e.target.getWebContents().send('redirect-hackfix', e.newURL);
      }, 100);
    }
  }
}

function onDidGetResponseDetails (e) {
  if (e.resourceType != 'mainFrame') {
    return
  }

  var page = getByWebview(e.target);
  if (page) {
    // we're goin
    page.isReceivingAssets = true;
    try {
      page.contentType = e.headers['content-type'][0] || null;
    } catch (e) {
      page.contentType = null;
    }
    // set URL in navbar
    page.loadingURL = e.newURL;
    page.siteInfoOverride = null;
    updateLocation(page);
  }
}

function onDidFinishLoad (e) {
  var page = getByWebview(e.target);

  if (page) {
    // update page object
    if (page.loadingURL) {
      page.url = page.loadingURL;
    }
    page.loadingURL = false;
    page.isGuessingTheURLScheme = false;
    page.favicons = null;
    update$1(page);
    updateLocation(page);
    onPageChangeLocation(page);
  }
}

function onDidFailLoad (e) {
  // ignore if this is a subresource
  if (!e.isMainFrame) { return }

  // ignore aborts. why:
  // - sometimes, aborts are caused by redirects. no biggy
  // - if the user cancels, then we dont want to give an error screen
  if (e.errorDescription == 'ERR_ABORTED' || e.errorCode == ERR_ABORTED) { return }

  // also ignore non-errors
  if (e.errorCode == 0) { return }

  var page = getByWebview(e.target);
  if (page) {
    var isInsecureResponse = [ERR_INSECURE_RESPONSE, ERR_CONNECTION_REFUSED].indexOf(e.errorCode) >= 0;
    page.siteLoadError = {isInsecureResponse, errorCode: e.errorCode, errorDescription: e.errorDescription};
    page.title = page.getIntendedURL();
    update$1(page);

    // if https fails for some specific reasons, and beaker *assumed* https, then fallback to http
    if (page.isGuessingTheURLScheme && isInsecureResponse) {
      console.log('Guessed the URL scheme was HTTPS, but got back', e.errorDescription, ' - trying HTTP');
      var url = page.getIntendedURL();
      page.isGuessingTheURLScheme = false; // no longer doing that!
      if (url.startsWith('https')) {
        url = url.replace(/^https/, 'http');
        page.loadURL(url);
        return
      }
    }

    // render failure page
    var errorPageHTML = errorPage(e);
    page.webviewEl.executeJavaScript('document.documentElement.innerHTML = \'' + errorPageHTML + '\'');
  }
}

async function onPageFaviconUpdated (e) {
  if (e.favicons && e.favicons[0]) {
    var page = getByWebview(e.target);
    page.favicons = e.favicons;
    events.emit('page-favicon-updated', getByWebview(e.target));

    // store favicon to db
    var res = await urlsToData(e.favicons, 64, 64);
    if (res) {
      beakerSitedata.set(page.getURL(), 'favicon', res.dataUrl);
    }
  }
}

function onUpdateTargetUrl ({ url }) {
  set(url);
}

function onClose (e) {
  var page = getByWebview(e.target);
  if (page) {
    remove$$1(page);
  }
}

function onPageTitleUpdated (e) {
  var page = getByWebview(e.target);
  page.title = e.title;

  // if page title changed within 15 seconds, update it again
  if (page.getIntendedURL() === page.lastVisitedURL && Date.now() - page.lastVisitedAt < 15 * 1000) {
    updateHistory(page);
  }
}

function onCrashed (e) {
  console.error('Webview crash', e);
}

function onIPCMessage (e) {
  var page = getByWebview(e.target);
  switch (e.channel) {
    case 'site-info-override:set':
      if (page) {
        page.siteInfoOverride = e.args[0];
        updateLocation(page);
        update$1(page);
      }
      break
    case 'site-info-override:clear':
      if (page) {
        page.siteInfoOverride = null;
        updateLocation(page);
        update$1(page);
      }
      break
    case 'open-url':
      var {url, newTab} = e.args[0];
      if (newTab) {
        create(url);
      } else {
        getActive().loadURL(url);
      }
      closeMenus();
      break
    case 'close-menus':
      closeMenus();
      break
    case 'reload-posts':
      var currentURL = e.args[0];
      events.emit('reload-posts', currentURL);
      break
    case 'toggle-live-reloading':
      if (activePage) {
        activePage.toggleLiveReloading();
      }
      break
  }
}

// internal helper functions
// =

function show (page) {
  page.webviewEl.classList.remove('hidden');
  page.navbarEl.classList.remove('hidden');
  page.promptbarEl.classList.remove('hidden');
  events.emit('show', page);
}

function hide (page) {
  page.webviewEl.classList.add('hidden');
  page.navbarEl.classList.add('hidden');
  page.promptbarEl.classList.add('hidden');
  events.emit('hide', page);
}

function createWebviewEl (id, url) {
  var el = document.createElement('webview');
  el.dataset.id = id;
  el.setAttribute('preload', 'file://' + path.join(APP_PATH, 'webview-preload.build.js'));
  el.setAttribute('webpreferences', 'allowDisplayingInsecureContent,contentIsolation');
  // TODO re-enable nativeWindowOpen when https://github.com/electron/electron/issues/9558 lands
  el.setAttribute('src', url || DEFAULT_URL);
  return el
}

function rebroadcastEvent (e) {
  events.emit(e.type, getByWebview(e.target), e);
}

function parseURL (str) {
  try { return new URL(str) } catch (e) { return {} }
}

function isEqualURL (a, b) {
  return parseURL(a).origin === parseURL(b).origin
}

function isDifferentDomain (a, b) {
  return parseURL(a).origin !== parseURL(b).origin
}

async function updateHistory (page) {
  var url = page.getURL();

  if (!url.startsWith('beaker://') || url.match(/beaker:\/\/library\/[0-9,a-f]{64}/g)) {
    beaker.history.addVisit({url: page.getIntendedURL(), title: page.getTitle() || page.getURL()});
    if (page.isPinned) {
      savePinnedToDB();
    }
    page.lastVisitedAt = Date.now();
    page.lastVisitedURL = url;
  }

  // read and cache current nav state
  var [b, f] = await Promise.all([page.canGoBackAsync(), page.canGoForwardAsync()]);
  page._canGoBack = b;
  page._canGoForward = f;
  update$1(page);
}


var pages$1 = Object.freeze({
	FIRST_TAB_URL: FIRST_TAB_URL,
	DEFAULT_URL: DEFAULT_URL,
	on: on$$1,
	getAll: getAll,
	getPinned: getPinned,
	setup: setup$2,
	create: create,
	remove: remove$$1,
	reopenLastRemoved: reopenLastRemoved,
	setActive: setActive,
	togglePinned: togglePinned,
	reorderTab: reorderTab,
	changeActiveBy: changeActiveBy,
	changeActiveTo: changeActiveTo,
	getActive: getActive,
	getAdjacentPage: getAdjacentPage,
	getByWebview: getByWebview,
	getByWebContentsID: getByWebContentsID,
	getById: getById,
	loadPinnedFromDB: loadPinnedFromDB,
	savePinnedToDB: savePinnedToDB,
	onIPCMessage: onIPCMessage,
	createWebviewEl: createWebviewEl
});

/* globals URL */

// constants
// =

const MAX_TAB_WIDTH = 235; // px
const MIN_TAB_WIDTH = 48; // px
const TAB_SPACING = -1; // px

// globals
// =

var tabsContainerEl;

// tab-width is adjusted based on window width and # of tabs
var currentTabWidth = MAX_TAB_WIDTH;

// exported methods
// ==

function setup$1 () {
  // render
  tabsContainerEl = yo`<div class="chrome-tabs">
    <div class="chrome-tab chrome-tab-add-btn" onclick=${onClickNew} title="Open new tab">
      <div class="chrome-tab-bg"></div>
      <div class="chrome-tab-favicon"><span class="fa fa-plus"></span></div>
    </div>
  </div>`;
  yo.update(document.getElementById('toolbar-tabs'), yo`<div id="toolbar-tabs" class="chrome-tabs-shell">
    ${tabsContainerEl}
  </div>`);

  // wire up listeners
  on$$1('add', onAddTab);
  on$$1('remove', onRemoveTab);
  on$$1('set-active', onSetActive);
  on$$1('pin-updated', onPinUpdated);
  on$$1('did-start-loading', onUpdateTab);
  on$$1('did-stop-loading', onUpdateTab);
  on$$1('page-title-updated', onUpdateTab);
  on$$1('page-favicon-updated', onUpdateTab);
  window.addEventListener('resize', debounce$1(onWindowResize, 500));
}

// render functions
// =

function drawTab (page) {
  const isActive = page.isActive;
  const isTabDragging = page.isTabDragging && (page.tabDragOffset !== 0);

  // pick a favicon
  var favicon;
  if (page.isLoading() && page.getIntendedURL() !== DEFAULT_URL) {
    // loading spinner
    favicon = yo`<div class="spinner"></div>`;
    if (!page.isReceivingAssets) { favicon.classList.add('reverse'); }
  } else {
    // page's explicit favicon
    if (page.favicons && page.favicons[0]) {
      favicon = yo`<img src=${page.favicons[0]}>`;
      favicon.onerror = onFaviconError(page);
    } else if (page.getURL().startsWith('beaker:')) {
      favicon = yo`<img src="beaker-favicon:beaker">`;
    } else {
      // (check for cached icon)
      favicon = yo`<img src="beaker-favicon:${page.getURL()}">`;
    }
  }

  // class
  var cls = '';
  if (isActive) cls += ' chrome-tab-current';
  if (isTabDragging) cls += ' chrome-tab-dragging';

  // styles
  var {pageIndex, style} = getPageStyle(page);
  if (pageIndex === 0) cls += ' leftmost';
  if (pageIndex === getAll().length - 1) cls += ' rightmost';

  // pinned rendering:
  if (page.isPinned) {
    return yo`<div class=${'chrome-tab chrome-tab-pinned' + cls}
                data-id=${page.id}
                style=${style}
                onclick=${onClickTab(page)}
                oncontextmenu=${onContextMenuTab(page)}
                onmousedown=${onMouseDown(page)}
                title=${getNiceTitle(page)}>
      <div class="chrome-tab-bg"></div>
      <div class="chrome-tab-favicon">${favicon}</div>
    </div>`
  }

  // normal rendering:

  return yo`
  <div class=${'chrome-tab' + cls}
      data-id=${page.id}
      style=${style}
      onclick=${onClickTab(page)}
      oncontextmenu=${onContextMenuTab(page)}
      onmousedown=${onMouseDown(page)}
      title=${getNiceTitle(page)}>
    <div class="chrome-tab-bg"></div>
    <div class="chrome-tab-favicon">${favicon}</div>
    <div class="chrome-tab-title">${getNiceTitle(page) || 'New Tab'}</div>
    <div class="chrome-tab-close" title="Close tab" onclick=${onClickTabClose(page)}></div>
  </div>`
}

// calculate and position all tabs
// - should be called any time the # of pages changes, or pin/unpin
function repositionTabs (e) {
  const allPages = getAll();

  // compute tab width for the space we have
  // - we need to distributed the space among unpinned tabs
  var numUnpinnedTabs = 0;
  var availableWidth = window.innerWidth;
  // correct for traffic lights on darwin
  if (window.process.platform == 'darwin' && !document.body.classList.contains('fullscreen')) { availableWidth -= 80; }
  // correct for new-tab btn
  availableWidth -= (MIN_TAB_WIDTH + TAB_SPACING);
  // count the unpinned-tabs, and correct for the spacing and pinned-tabs
  allPages.forEach(p => {
    availableWidth -= TAB_SPACING;
    if (p.isPinned) availableWidth -= MIN_TAB_WIDTH;
    else numUnpinnedTabs++;
  });
  // now calculate a (clamped) size
  currentTabWidth = Math.min(MAX_TAB_WIDTH, Math.max(MIN_TAB_WIDTH, availableWidth / numUnpinnedTabs)) | 0;

  // update tab positions
  allPages.forEach(page => getTabEl(page, tabEl => {
    var {style, pageIndex} = getPageStyle(page);
    if (pageIndex === 0) tabEl.classList.add('leftmost');
    if (pageIndex !== 0) tabEl.classList.remove('leftmost');
    if (pageIndex === allPages.length - 1) tabEl.classList.add('rightmost');
    if (pageIndex !== allPages.length - 1) tabEl.classList.remove('rightmost');
    tabEl.style = style;
  }));
  tabsContainerEl.querySelector('.chrome-tab-add-btn').style = getPageStyle(allPages.length).style;
}

// page event
// =

function onAddTab (page) {
  tabsContainerEl.insertBefore(drawTab(page), tabsContainerEl.querySelector('.chrome-tab-add-btn'));
  repositionTabs();
}

function onRemoveTab (page) {
  getTabEl(page, tabEl => tabEl.parentNode.removeChild(tabEl));
  repositionTabs();
}

function onUpdateTab (page) {
  getTabEl(page, tabEl => yo.update(tabEl, drawTab(page)));
}

function onPinUpdated (page) {
  getTabEl(page, tabEl => yo.update(tabEl, drawTab(page)));
  repositionTabs();
}

function onSetActive (page) {
  getTabEl(page, newTabEl => {
    // make old active tab inactive
    var oldTabEl = tabsContainerEl.querySelector('.chrome-tab-current');
    if (oldTabEl) {
      oldTabEl.classList.remove('chrome-tab-current');
    }

    // set new tab active
    newTabEl.classList.add('chrome-tab-current');

    // recalculate tab styles
    repositionTabs();
  });
}

// ui events
// =

function onClickNew () {
  var page = create();
  setActive(page);
  focusLocation(page);
}

function onClickDuplicate (page) {
  return () => create(page.getURL())
}

function onClickPin (page) {
  return () => togglePinned(page)
}

function onClickTab (page) {
  return e => {
    if (e.which !== 2) {
      setActive(page);
    }
  }
}

function onClickTabClose (page) {
  return e => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    remove$$1(page);
  }
}

function onClickCloseOtherTabs (page) {
  return async () => {
    setActive(page);
    var ps = getAll().slice();
    for (var i = 0; i < ps.length; i++) {
      if (ps[i] != page) {
        await remove$$1(ps[i]);
      }
    }
  }
}

function onClickCloseTabsToTheRight (page) {
  return async () => {
    var ps = getAll();
    var index = ps.indexOf(page);
    for (var i = ps.length - 1; i > index; i--) {
      await remove$$1(ps[i]);
    }
  }
}

function onClickReopenClosedTab () {
  reopenLastRemoved();
}

function onContextMenuTab (page) {
  return e => {
    const { Menu } = electron.remote;
    var menu = Menu.buildFromTemplate([
      { label: 'New Tab', click: onClickNew },
      { type: 'separator' },
      { label: 'Duplicate', click: onClickDuplicate(page) },
      { label: (page.isPinned) ? 'Unpin Tab' : 'Pin Tab', click: onClickPin(page) },
      { type: 'separator' },
      { label: 'Close Tab', click: onClickTabClose(page) },
      { label: 'Close Other Tabs', click: onClickCloseOtherTabs(page) },
      { label: 'Close Tabs to the Right', click: onClickCloseTabsToTheRight(page) },
      { type: 'separator' },
      { label: 'Reopen Closed Tab', click: onClickReopenClosedTab }
    ]);
    menu.popup(electron.remote.getCurrentWindow());
  }
}

function onMouseDown (page) {
  return e => {
    // middle click
    if (e.which === 2) {
      remove$$1(page);
      return
    }

    // left click
    if (e.which !== 1) {
      return
    }

    // FIXME when you move your cursor out of the tabs, dragging stops working -prf

    // start drag behaviors
    var startX = e.pageX;
    page.isTabDragging = true;
    e.preventDefault();
    e.stopPropagation();

    // register drag-relevant listeners
    document.addEventListener('mousemove', drag, true);
    document.addEventListener('mouseup', dragend, true);
    window.addEventListener('blur', dragend, true);

    // throttle so we only rerender as much as needed
    // - actually throttling seems to cause jank
    var rerender = /* throttle( */() => {
      repositionTabs();
    };/*, 30) */

    // drag handler
    var hasSetDragClass = false;
    function drag (e) {
      // calculate offset
      page.tabDragOffset = e.pageX - startX;

      // set drag class (wait till actually moved, it looks better that way)
      if (!hasSetDragClass && page.tabDragOffset !== 0) {
        getTabEl(page, tabEl => tabEl.classList.add('chrome-tab-dragging'));
        hasSetDragClass = true;
      }

      // do reorder?
      var reorderOffset = shouldReorderTab(page);
      if (reorderOffset) {
        // reorder, and recalc the offset
        if (reorderTab(page, reorderOffset)) {
          startX += (reorderOffset * (page.isPinned ? 40 : getTabWidth(page)));
          page.tabDragOffset = e.pageX - startX;
        }
      }

      // draw, partner
      rerender();
    }

    // done dragging handler
    function dragend (e) {
      // reset
      page.tabDragOffset = 0;
      page.isTabDragging = false;
      getTabEl(page, tabEl => tabEl.classList.remove('chrome-tab-dragging'));
      document.removeEventListener('mousemove', drag, true);
      document.removeEventListener('mouseup', dragend, true);
      rerender();
    }
  }
}

function onFaviconError (page) {
  return () => {
    // if the favicon 404s, just fallback to the icon
    page.favicons = null;
    onUpdateTab(page);
  }
}

function onWindowResize (e) {
  repositionTabs();
}

// internal helpers
// =

function getTabEl (page, cb) {
  var tabEl = tabsContainerEl.querySelector(`.chrome-tab[data-id="${page.id}"]`);
  if (cb && tabEl) cb(tabEl);
  return tabEl
}

function getTabX (pageIndex) {
  const allPages = getAll();

  // handle if given just a page object
  if (typeof pageIndex != 'number') {
    pageIndex = allPages.indexOf(pageIndex);
  }

  // calculate base X off of the widths of the pages before it
  var x = 0;
  for (var i = 0; i < pageIndex; i++) { x += getTabWidth(allPages[i]) + TAB_SPACING; }

  // add the page offset
  if (allPages[pageIndex]) { x += allPages[pageIndex].tabDragOffset; }

  // done
  return x
}

function getTabWidth (page) {
  if (page.isPinned) { return MIN_TAB_WIDTH }
  return currentTabWidth
}

function getPageStyle (page) {
  const allPages = getAll();

  // `page` is sometimes an index and sometimes a page object (gross, I know)
  // we need both
  var pageIndex, pageObject;
  if (typeof page === 'object') {
    pageObject = page;
    pageIndex = allPages.indexOf(page);
  } else {
    pageObject = allPages[page];
    pageIndex = page;
  }

  // z-index
  var zIndex = pageIndex + 1; // default to the order across
  if (!pageObject) {
    zIndex = 0; // the add btn
  } else if (pageObject.isActive) {
    zIndex = 999; // top
  } else if (pageObject.isTabDragging) {
    zIndex = 998; // almost top
  }

  var style = `
    transform: translateX(${getTabX(pageIndex)}px);
    z-index: ${zIndex};
  `;
  if (pageObject) {
    style += ` width: ${getTabWidth(pageObject)}px;`;
  }
  return {pageIndex, style}
}

// returns 0 for no, -1 or 1 for yes (the offset)
function shouldReorderTab (page) {
  // has the tab been dragged far enough to change order?
  if (!page.isTabDragging) { return 0 }

  var limit = (page.isPinned ? 40 : getTabWidth(page)) / 2;
  if (page.tabDragOffset < -1 * limit) { return -1 }
  if (page.tabDragOffset > limit) { return 1 }
  return 0
}

function getNiceTitle (page) {
  const title = page.getTitle();
  if (!title) return false

  // if the title is just the URL, give the path
  if (title !== page.getURL()) {
    return title
  }
  try {
    let { pathname, origin } = new URL(title);
    if (!pathname.endsWith('/')) {
      pathname = pathname.split('/').pop();
      return `${pathname} - ${origin}`
    }
    return origin
  } catch (e) {
    return title
  }
}

// exported api
// =

var permsPrompt = function (reqId, webContentsId, permission, opts = {}) {
  var page;
  const respond = decision => {
    electron.ipcRenderer.send('permission-response', reqId, decision);
    if (page) {
      // update page perms
      page.fetchSitePerms();
    }
  };

  // look up the page, deny if failed
  page = getByWebContentsID(webContentsId);
  if (!page) { return respond(false) }

  // lookup the perm description. auto-deny if it's not a known perm.
  const permId = getPermId(permission);
  const permParam = getPermParam(permission);
  const PERM = PERMS[permId];
  if (!PERM) return respond(false)
  const permIcon = PERM.icon;
  var permDesc = PERM.desc;

  // special case for openExternal
  if (permission == 'openExternal') {
    permDesc += page.getIntendedURL();
  }

  // run description functions
  if (typeof permDesc === 'function') {
    permDesc = permDesc(permParam, pages$1, opts);
  }

  // create the prompt
  add(page, {
    type: 'permission:' + permission,
    render: ({ rerender, onClose }) => {
      return yo`<div>
        <span class="icon icon-${permIcon || 'help-circled'}"></span>
        This site would like to ${permDesc}.
        <span class="promptbar-btns">
          <button class="btn primary prompt-accept" onclick=${() => { respond(true); onClose(); }}>Allow</button>
          <button class="btn prompt-reject" onclick=${() => { respond(false); onClose(); }}>Don't Allow</button>
        </span>
        <a class="promptbar-close icon icon-cancel-squared" onclick=${() => { respond(false); onClose(); }}></a>
      </div>`
    },
    onForceClose: () => {
      respond(false);
    }
  });
};

function setup$7 () {
  electron.ipcRenderer.on('command', function (event, type, arg1, arg2, arg3, arg4) {
    var page = getActive();
    switch (type) {
      case 'file:new-tab':
        page = create(arg1);
        setActive(page);
        focusLocation(page);
        return
      case 'file:open-location': return focusLocation(page)
      case 'file:close-tab': return remove$$1(page)
      case 'file:reopen-closed-tab': return reopenLastRemoved()
      case 'edit:find': return showInpageFind(page)
      case 'view:reload': return page.reload()
      case 'view:hard-reload': return page.reloadIgnoringCacheAsync()
      case 'view:zoom-in': return zoomIn(page)
      case 'view:zoom-out': return zoomOut(page)
      case 'view:zoom-reset': return zoomReset(page)
      case 'view:toggle-dev-tools': return page.toggleDevTools()
      case 'view:open-sidebar': return open()
      case 'view:toggle-sidebar': return toggle()
      case 'history:back': return page.goBackAsync()
      case 'history:forward': return page.goForwardAsync()
      case 'window:next-tab': return changeActiveBy(1)
      case 'window:prev-tab': return changeActiveBy(-1)
      case 'set-tab': return changeActiveTo(arg1)
      case 'load-pinned-tabs': return loadPinnedFromDB()
      case 'perms:prompt': return permsPrompt(arg1, arg2, arg3, arg4)
    }
  });
}

const isDarwin = window.process.platform === 'darwin';

var SWIPE_TRIGGER_DIST = 400; // how far do you need to travel to trigger the navigation
var ARROW_OFF_DIST = 80; // how far off-screen are the arrows

function setup$8 () {
  var horizontal = 0; // how much x traveled?
  var vertical = 0; // how much y traveled?
  var hnorm = 0; // normalized to a [-1,1] range
  var isTouching = false; // is touch event active?
  var leftSwipeArrowEl = document.getElementById('left-swipe-arrow');
  var rightSwipeArrowEl = document.getElementById('right-swipe-arrow');
  var toolbarSize = document.getElementById('toolbar').clientHeight;

  const canGoBack = () => {
    var page = getActive();
    if (page) return page.canGoBack()
  };
  const shouldGoBack = () => {
    return hnorm <= -1
  };
  const canGoForward = () => {
    var page = getActive();
    if (page) return page.canGoForward()
  };
  const shouldGoForward = () => {
    return hnorm >= 1
  };

  window.addEventListener('mousewheel', e => {
    if (!isDarwin && e.ctrlKey === true) {
      var page = getActive();
      if (e.deltaY > 0) zoomOut(page);
      if (e.deltaY < 0) zoomIn(page);
    }

    if (isTouching) {
      // track amount of x & y traveled
      horizontal += e.deltaX;
      vertical += e.deltaY;

      // calculate the normalized horizontal
      if (Math.abs(vertical) > Math.abs(horizontal)) {
        hnorm = 0; // ignore if there's more vertical motion than horizontal
      } else if ((horizontal < 0 && !canGoBack()) || (horizontal > 0 && !canGoForward())) {
        hnorm = horizontal = 0; // ignore if the navigation isnt possible in that direction
      } else {
        hnorm = horizontal / SWIPE_TRIGGER_DIST;
      }
      hnorm = Math.min(1.0, Math.max(-1.0, hnorm)); // clamp to [-1.0, 1.0]

      // calculate arrow positions
      if (horizontal < 0) {
        leftSwipeArrowEl.style.left = ((-1 * ARROW_OFF_DIST) - (hnorm * ARROW_OFF_DIST)) + 'px';
        rightSwipeArrowEl.style.right = (-1 * ARROW_OFF_DIST) + 'px';
      }
      if (horizontal > 0) {
        leftSwipeArrowEl.style.left = (-1 * ARROW_OFF_DIST) + 'px';
        rightSwipeArrowEl.style.right = ((-1 * ARROW_OFF_DIST) + (hnorm * ARROW_OFF_DIST)) + 'px';
      }

      // highlight 
      if (shouldGoBack()) leftSwipeArrowEl.classList.add('highlight');
      else leftSwipeArrowEl.classList.remove('highlight');
      if (shouldGoForward()) rightSwipeArrowEl.classList.add('highlight');
      else rightSwipeArrowEl.classList.remove('highlight');
    }
  });

  // for various humorous reasons, the 'scroll-touch-end' event is emitted in the background process
  // so, listen for it over ipc
  // https://github.com/electron/electron/pull/4181
  electron.ipcRenderer.on('window-event', async function (event, type, data) {
    if (type == 'scroll-touch-begin') {
      leftSwipeArrowEl.classList.remove('returning');
      rightSwipeArrowEl.classList.remove('returning');

      // check if the item under the cursor is scrolling
      let page = getActive();
      if (!page) return
      page.webviewEl.executeJavaScript(`
        (function() {
          var isScrolling = false
          // check if the element under the cursor, or any of its parents, are scrolling horizontally right now
          var el = document.elementFromPoint(${data.cursorX}, ${(data.cursorY - toolbarSize)})
          while (el) {
            if (el.scrollWidth > el.clientWidth) {
              isScrolling = true
              break
            }
            el = el.parentNode
          }
          return isScrolling
        })()
      `, true, (isScrollingEl) => {
        if (isScrollingEl) return // dont do anything
        isTouching = true;
      });
    }

    if (type == 'scroll-touch-end' && isTouching) {
      isTouching = false;

      // trigger navigation
      if (shouldGoBack()) {
        let page = getActive();
        if (page) page.goBackAsync();
      }
      if (shouldGoForward()) {
        let page = getActive();
        if (page) page.goForwardAsync();
      }

      // reset arrows
      horizontal = vertical = hnorm = 0;
      leftSwipeArrowEl.classList.add('returning');
      leftSwipeArrowEl.classList.remove('highlight');
      leftSwipeArrowEl.style.left = (-1 * ARROW_OFF_DIST) + 'px';
      rightSwipeArrowEl.classList.add('returning');
      rightSwipeArrowEl.classList.remove('highlight');
      rightSwipeArrowEl.style.right = (-1 * ARROW_OFF_DIST) + 'px';
    }
  });
}

function setup$$1 (cb) {
  if (window.process.platform == 'darwin') {
    document.body.classList.add('darwin');
  }

  // wire up event handlers
  electron.ipcRenderer.on('window-event', onWindowEvent);
  document.addEventListener('dragover', preventDragDrop, false);
  document.addEventListener('drop', preventDragDrop, false);
  function preventDragDrop (event) {
    // important - dont allow drag/drop in the shell window, only into the webview
    if (!event.target || event.target.tagName != 'WEBVIEW') {
      event.preventDefault();
      return false
    }
  }

  // disable zooming in the shell window
  electron.webFrame.setVisualZoomLevelLimits(1, 1);
  electron.webFrame.setLayoutZoomLevelLimits(0, 0);

  // setup subsystems
  setup$1();
  setup$3();
  setup$4();
  setup$7();
  setup$8();
  setup$2();
  setActive(create(FIRST_TAB_URL));
  cb();
}

function onWindowEvent (event, type) {
  if (type == 'blur') { document.body.classList.add('window-blurred'); }
  if (type == 'focus') {
    document.body.classList.remove('window-blurred');
    try { getActive().webviewEl.focus(); } catch (e) {}
  }
  if (type == 'enter-full-screen') { document.body.classList.add('fullscreen'); }
  if (type == 'leave-full-screen') { document.body.classList.remove('fullscreen'); }
}

// method which will populate window.beaker with the APIs deemed appropriate for the protocol
var importWebAPIs = function () {
  var webAPIs = electron.ipcRenderer.sendSync('get-web-api-manifests', window.location.protocol);
  for (var k in webAPIs) {
    window[k] = rpc.importAPI(k, webAPIs[k], { timeout: false, noEval: (window.location.protocol === 'beaker:') });
  }
};

var datArchiveManifest = {
  createArchive: 'promise',
  forkArchive: 'promise',
  loadArchive: 'promise',

  getInfo: 'promise',
  diff: 'promise',
  commit: 'promise',
  revert: 'promise',
  history: 'promise',

  stat: 'promise',
  readFile: 'promise',
  writeFile: 'promise',
  unlink: 'promise',
  // copy: 'promise', // TODO copy-disabled
  // rename: 'promise', // TODO rename-disabled
  download: 'promise',

  readdir: 'promise',
  mkdir: 'promise',
  rmdir: 'promise',

  createFileActivityStream: 'readable',
  createNetworkActivityStream: 'readable',

  importFromFilesystem: 'promise',
  exportToFilesystem: 'promise',
  exportToArchive: 'promise',

  resolveName: 'promise',

  selectArchive: 'promise'
};

// this emulates the implementation of event-targets by browsers

class EventTarget {
  constructor () {
    this.listeners = {};
  }

  addEventListener (type, callback) {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  removeEventListener (type, callback) {
    if (!(type in this.listeners)) {
      return
    }
    var stack = this.listeners[type];
    var i = stack.findIndex(cb => cb === callback);
    if (i !== -1) {
      stack.splice(i, 1);
    }
  }

  dispatchEvent (event) {
    if (!(event.type in this.listeners)) {
      return
    }
    event.target = this;
    var stack = this.listeners[event.type];
    stack.forEach(cb => cb.call(this, event));
  }
}

function bindEventStream (stream, target) {
  stream.on('data', data => {
    var event = data[1] || {};
    event.type = data[0];
    target.dispatchEvent(event);
  });
}

function fromEventStream (stream) {
  var target = new EventTarget();
  bindEventStream(stream, target);
  target.close = () => {
    target.listeners = {};
    stream.close();
  };
  return target
}

// http://man7.org/linux/man-pages/man2/stat.2.html
// mirrored from hyperdrive/lib/stat.js

function Stat (data) {
  if (!(this instanceof Stat)) return new Stat(data)

  this.dev = 0;
  this.nlink = 1;
  this.rdev = 0;
  this.blksize = 0;
  this.ino = 0;

  this.mode = data ? data.mode : 0;
  this.uid = data ? data.uid : 0;
  this.gid = data ? data.gid : 0;
  this.size = data ? data.size : 0;
  this.offset = data ? data.offset : 0;
  this.blocks = data ? data.blocks : 0;
  this.downloaded = data ? data.downloaded : 0;
  this.atime = new Date(data ? data.mtime : 0); // we just set this to mtime ...
  this.mtime = new Date(data ? data.mtime : 0);
  this.ctime = new Date(data ? data.ctime : 0);

  this.linkname = data ? data.linkname : null;
}

Stat.IFSOCK = 49152; // 0b1100...
Stat.IFLNK = 40960; // 0b1010...
Stat.IFREG = 32768; // 0b1000...
Stat.IFBLK = 24576; // 0b0110...
Stat.IFDIR = 16384; // 0b0100...
Stat.IFCHR = 8192; // 0b0010...
Stat.IFIFO = 4096; // 0b0001...

Stat.prototype.isSocket = check(Stat.IFSOCK);
Stat.prototype.isSymbolicLink = check(Stat.IFLNK);
Stat.prototype.isFile = check(Stat.IFREG);
Stat.prototype.isBlockDevice = check(Stat.IFBLK);
Stat.prototype.isDirectory = check(Stat.IFDIR);
Stat.prototype.isCharacterDevice = check(Stat.IFCHR);
Stat.prototype.isFIFO = check(Stat.IFIFO);

function check (mask) {
  return function () {
    return (mask & this.mode) === mask
  }
}

const URL_PROMISE = Symbol('URL_PROMISE');

// create the dat rpc api
const dat = rpc.importAPI('dat-archive', datArchiveManifest, { timeout: false, errors });

class DatArchive$1 extends EventTarget {
  constructor (url) {
    super();

    // simple case: new DatArchive(window.location)
    if (url === window.location) {
      url = window.location.toString();
    }

    // basic URL validation
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid dat:// URL')
    }

    // parse the URL
    const urlParsed = parseDatURL(url);
    if (!urlParsed || urlParsed.protocol !== 'dat:') {
      throw new Error('Invalid URL: must be a dat:// URL')
    }
    url = 'dat://' + urlParsed.hostname;

    // load into the 'active' (in-memory) cache
    dat.loadArchive(url);

    // resolve the URL (DNS)
    const urlPromise = DatArchive$1.resolveName(url).then(url => {
      if (urlParsed.version) {
        url += `+${urlParsed.version}`;
      }
      return 'dat://' + url
    });
    Object.defineProperty(this, URL_PROMISE, {
      enumerable: false,
      value: urlPromise
    });

    // define this.url as a frozen getter
    Object.defineProperty(this, 'url', {
      enumerable: true,
      value: url
    });
  }

  static create (opts = {}) {
    return dat.createArchive(opts)
      .then(newUrl => new DatArchive$1(newUrl))
  }

  static fork (url, opts = {}) {
    url = (typeof url.url === 'string') ? url.url : url;
    if (!isDatURL(url)) {
      return Promise.reject(new Error('Invalid URL: must be a dat:// URL'))
    }
    return dat.forkArchive(url, opts)
      .then(newUrl => new DatArchive$1(newUrl))
  }

  async getInfo (opts = {}) {
    var url = await this[URL_PROMISE];
    return dat.getInfo(url, opts)
  }

  async diff (opts = {}) {
    var url = await this[URL_PROMISE];
    return dat.diff(url, opts)
  }

  async commit (opts = {}) {
    var url = await this[URL_PROMISE];
    return dat.commit(url, opts)
  }

  async revert (opts = {}) {
    var url = await this[URL_PROMISE];
    return dat.revert(url, opts)
  }

  async history (opts = {}) {
    var url = await this[URL_PROMISE];
    return dat.history(url, opts)
  }

  async stat (path$$1, opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return new Stat(await dat.stat(url, opts))
  }

  async readFile (path$$1, opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.readFile(url, opts)
  }

  async writeFile (path$$1, data, opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.writeFile(url, data, opts)
  }

  async unlink (path$$1) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.unlink(url)
  }

  // TODO copy-disabled
  /* async copy(path, dstPath) {
    var url = await this[URL_PROMISE]
    url = joinPath(url, path)
    return dat.copy(url, dstPath)
  } */

  // TODO rename-disabled
  /* async rename(path, dstPath) {
    var url = await this[URL_PROMISE]
    url = joinPath(url, path)
    return dat.rename(url, dstPath)
  } */

  async download (path$$1 = '/', opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.download(url, opts)
  }

  async readdir (path$$1 = '/', opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    var names = await dat.readdir(url, opts);
    if (opts.stat) {
      names.forEach(name => { name.stat = new Stat(name.stat); });
    }
    return names
  }

  async mkdir (path$$1) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.mkdir(url)
  }

  async rmdir (path$$1, opts = {}) {
    var url = await this[URL_PROMISE];
    url = joinPath(url, path$$1);
    return dat.rmdir(url, opts)
  }

  createFileActivityStream (pathSpec = null) {
    return fromEventStream(dat.createFileActivityStream(this.url, pathSpec))
  }

  createNetworkActivityStream () {
    return fromEventStream(dat.createNetworkActivityStream(this.url))
  }

  static importFromFilesystem (opts = {}) {
    return dat.importFromFilesystem(opts)
  }

  static exportToFilesystem (opts = {}) {
    return dat.exportToFilesystem(opts)
  }

  static exportToArchive (opts = {}) {
    return dat.exportToArchive(opts)
  }

  static resolveName (name) {
    // simple case: DatArchive.resolveName(window.location)
    if (name === window.location) {
      name = window.location.toString();
    }
    return dat.resolveName(name)
  }

  static selectArchive (opts = {}) {
    return dat.selectArchive(opts)
      .then(url => new DatArchive$1(url))
  }
}

function isDatURL (url) {
  var urlp = parseDatURL(url);
  return urlp && urlp.protocol === 'dat:'
}

function joinPath (url, path$$1) {
  if (path$$1.charAt(0) === '/') return url + path$$1
  return url + '/' + path$$1
}

var archivesManifest = {
  status: 'promise',
  create: 'promise',
  fork: 'promise',
  add: 'promise',
  remove: 'promise',
  bulkRemove: 'promise',
  restore: 'promise',
  update: 'promise',
  list: 'promise',
  get: 'promise',
  clearFileCache: 'promise',
  clearDnsCache: 'promise',
  createEventStream: 'readable',
  createDebugStream: 'readable'
};

var bookmarksManifest = {
  add: 'promise',
  changeTitle: 'promise',
  changeUrl: 'promise',
  remove: 'promise',
  get: 'promise',
  list: 'promise',
  togglePinned: 'promise'
};

var historyManifest = {
  addVisit: 'promise',
  getVisitHistory: 'promise',
  getMostVisited: 'promise',
  search: 'promise',
  removeVisit: 'promise',
  removeAllVisits: 'promise',
  removeVisitsAfter: 'promise'
};

var profilesManifest = {
  list: 'promise',
  get: 'promise',
  add: 'promise',
  update: 'promise',
  remove: 'promise',
  getCurrent: 'promise',
  setCurrent: 'promise'
};

/* globals DatArchive */

var beaker$1 = {};
if (window.location.protocol === 'beaker:') {
  var opts = {timeout: false, errors};
  const archivesRPC = rpc.importAPI('archives', archivesManifest, opts);
  const bookmarksRPC = rpc.importAPI('bookmarks', bookmarksManifest, opts);
  const historyRPC = rpc.importAPI('history', historyManifest, opts);
  const profilesRPC = rpc.importAPI('profiles', profilesManifest, opts);

  // beaker.archives
  beaker$1.archives = new EventTarget();
  beaker$1.archives.create = function (manifest = {}, userSettings = {}) {
    return archivesRPC.create(manifest, userSettings).then(newUrl => new DatArchive(newUrl))
  };
  beaker$1.archives.fork = function (url, manifest = {}, userSettings = {}) {
    url = (typeof url.url === 'string') ? url.url : url;
    return archivesRPC.fork(url, manifest, userSettings).then(newUrl => new DatArchive(newUrl))
  };
  beaker$1.archives.status = archivesRPC.status;
  beaker$1.archives.add = archivesRPC.add;
  beaker$1.archives.remove = archivesRPC.remove;
  beaker$1.archives.bulkRemove = archivesRPC.bulkRemove;
  beaker$1.archives.restore = archivesRPC.restore;
  beaker$1.archives.update = archivesRPC.update;
  beaker$1.archives.list = archivesRPC.list;
  beaker$1.archives.get = archivesRPC.get;
  beaker$1.archives.clearFileCache = archivesRPC.clearFileCache;
  beaker$1.archives.clearDnsCache = archivesRPC.clearDnsCache;
  beaker$1.archives.createDebugStream = () => fromEventStream(archivesRPC.createDebugStream());
  bindEventStream(archivesRPC.createEventStream(), beaker$1.archives);

  // beaker.bookmarks
  beaker$1.bookmarks = new EventTarget();
  beaker$1.bookmarks.add = bookmarksRPC.add;
  beaker$1.bookmarks.changeTitle = bookmarksRPC.changeTitle;
  beaker$1.bookmarks.changeUrl = bookmarksRPC.changeUrl;
  beaker$1.bookmarks.remove = bookmarksRPC.remove;
  beaker$1.bookmarks.get = bookmarksRPC.get;
  beaker$1.bookmarks.list = bookmarksRPC.list;
  beaker$1.bookmarks.togglePinned = bookmarksRPC.togglePinned;
  // bindEventStream(bookmarksRPC.createEventStream(), beaker.bookmarks) TODO

  // beaker.history
  beaker$1.history = new EventTarget();
  beaker$1.history.addVisit = historyRPC.addVisit;
  beaker$1.history.getVisitHistory = historyRPC.getVisitHistory;
  beaker$1.history.getMostVisited = historyRPC.getMostVisited;
  beaker$1.history.search = historyRPC.search;
  beaker$1.history.removeVisit = historyRPC.removeVisit;
  beaker$1.history.removeAllVisits = historyRPC.removeAllVisits;
  beaker$1.history.removeVisitsAfter = historyRPC.removeVisitsAfter;
  // bindEventStream(historyRPC.createEventStream(), beaker.history) TODO

  // beaker.profiles
  beaker$1.profiles = {};
  beaker$1.profiles.list = profilesRPC.list;
  beaker$1.profiles.get = profilesRPC.get;
  beaker$1.profiles.add = profilesRPC.add;
  beaker$1.profiles.update = profilesRPC.update;
  beaker$1.profiles.remove = profilesRPC.remove;
  beaker$1.profiles.getCurrent = profilesRPC.getCurrent;
  beaker$1.profiles.setCurrent = profilesRPC.setCurrent;
  // bindEventStream(profilesRPC.createEventStream(), beaker.profiles) TODO
}

importWebAPIs();
window.DatArchive = DatArchive$1;
window.beaker = beaker$1;
setup$$1(() => {
  electron.ipcRenderer.send('shell-window-ready');
});

},{"beaker-error-constants":6,"debounce":9,"electron":undefined,"emit-stream":10,"events":undefined,"fs":undefined,"moment":42,"parallel-scratch-api":48,"parse-dat-url":50,"path":undefined,"pauls-electron-rpc":52,"pretty-bytes":57,"pretty-hash":58,"yo-yo":78}],2:[function(require,module,exports){
/*!
 * arr-diff <https://github.com/jonschlinkert/arr-diff>
 *
 * Copyright (c) 2014 Jon Schlinkert, contributors.
 * Licensed under the MIT License
 */

'use strict';

var flatten = require('arr-flatten');
var slice = [].slice;

/**
 * Return the difference between the first array and
 * additional arrays.
 *
 * ```js
 * var diff = require('{%= name %}');
 *
 * var a = ['a', 'b', 'c', 'd'];
 * var b = ['b', 'c'];
 *
 * console.log(diff(a, b))
 * //=> ['a', 'd']
 * ```
 *
 * @param  {Array} `a`
 * @param  {Array} `b`
 * @return {Array}
 * @api public
 */

function diff(arr, arrays) {
  var argsLen = arguments.length;
  var len = arr.length, i = -1;
  var res = [], arrays;

  if (argsLen === 1) {
    return arr;
  }

  if (argsLen > 2) {
    arrays = flatten(slice.call(arguments, 1));
  }

  while (++i < len) {
    if (!~arrays.indexOf(arr[i])) {
      res.push(arr[i]);
    }
  }
  return res;
}

/**
 * Expose `diff`
 */

module.exports = diff;

},{"arr-flatten":3}],3:[function(require,module,exports){
/*!
 * arr-flatten <https://github.com/jonschlinkert/arr-flatten>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

'use strict';

module.exports = function (arr) {
  return flat(arr, []);
};

function flat(arr, res) {
  var i = 0, cur;
  var len = arr.length;
  for (; i < len; i++) {
    cur = arr[i];
    Array.isArray(cur) ? flat(cur, res) : res.push(cur);
  }
  return res;
}

},{}],4:[function(require,module,exports){
/*!
 * array-unique <https://github.com/jonschlinkert/array-unique>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

module.exports = function unique(arr) {
  if (!Array.isArray(arr)) {
    throw new TypeError('array-unique expects an array.');
  }

  var len = arr.length;
  var i = -1;

  while (i++ < len) {
    var j = i + 1;

    for (; j < arr.length; ++j) {
      if (arr[i] === arr[j]) {
        arr.splice(j--, 1);
      }
    }
  }
  return arr;
};

},{}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AwaitLock = function () {
  function AwaitLock() {
    _classCallCheck(this, AwaitLock);

    this._acquired = false;
    this._waitingResolvers = [];
  }

  _createClass(AwaitLock, [{
    key: 'acquireAsync',
    value: function acquireAsync() {
      var _this = this;

      if (!this._acquired) {
        this._acquired = true;
        return Promise.resolve();
      }

      return new Promise(function (resolve) {
        _this._waitingResolvers.push(resolve);
      });
    }
  }, {
    key: 'release',
    value: function release() {
      (0, _assert2.default)(this._acquired, 'Trying to release an unacquired lock');
      if (this._waitingResolvers.length > 0) {
        var resolve = this._waitingResolvers.shift();
        resolve();
      } else {
        this._acquired = false;
      }
    }
  }]);

  return AwaitLock;
}();

exports.default = AwaitLock;
module.exports = exports['default'];
},{"assert":undefined}],6:[function(require,module,exports){
class ExtendableError extends Error {
  constructor(msg) {
    super(msg)
    this.name = this.constructor.name
    this.message = msg
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error(msg)).stack
    }
  }
}

exports.NotFoundError = class NotFoundError extends ExtendableError {
  constructor(msg) {
    super(msg || 'File not found')
    this.notFound = true
  }
}

exports.NotAFileError = class NotAFileError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Target must be a file')
    this.notAFile = true
  }
}

exports.NotAFolderError = class NotAFolderError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Target must be a folder')
    this.notAFolder = true
  }
}

exports.InvalidEncodingError = class InvalidEncodingError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid encoding')
    this.invalidEncoding = true
  }
}

exports.TimeoutError = class TimeoutError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Timed out')
    this.timedOut = true
  }
}

exports.ArchiveNotWritableError = class ArchiveNotWritableError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot write to this archive ; Not the owner')
    this.archiveNotWritable = true
  }
}

exports.EntryAlreadyExistsError = class EntryAlreadyExistsError extends ExtendableError {
  constructor(msg) {
    super(msg || 'A file or folder already exists at this path')
    this.entryAlreadyExists = true
  }
}

exports.ParentFolderDoesntExistError = class ParentFolderDoesntExistError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot write to this location ; No parent folder exists')
    this.parentFolderDoesntExist = true
  }
}

exports.InvalidPathError = class InvalidPathError extends ExtendableError {
  constructor(msg) {
    super(msg || 'The given path is not valid')
    this.invalidPath = true
  }
}

exports.SourceNotFoundError = class SourceNotFoundError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Cannot read a file or folder at the given source path')
    this.sourceNotFound = true
  }
}

exports.DestDirectoryNotEmpty = class DestDirectoryNotEmpty extends ExtendableError {
  constructor(msg) {
    super(msg || 'Destination path is not empty ; Aborting')
    this.destDirectoryNotEmpty = true
  }
}

exports.ProtocolSetupError = class ProtocolSetupError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Error setting up the URL protocol')
    this.protocolSetupError = true
  }
}

exports.UserDeniedError = class UserDeniedError extends ExtendableError {
  constructor(msg) {
    super(msg || 'User denied permission')
    this.permissionDenied = true
  }
}
exports.PermissionsError = class PermissionsError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Permissions denied')
    this.permissionDenied = true
  }
}
exports.QuotaExceededError = class QuotaExceededError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Disk space quota exciteed')
    this.quotaExceeded = true
  }
}

exports.InvalidURLError = class InvalidURLError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid URL')
    this.permissionDenied = true
  }
}

exports.InvalidArchiveKeyError = class InvalidArchiveKeyError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Invalid archive key')
    this.permissionDenied = true
  }
}

exports.ProtectedFileNotWritableError = class ProtectedFileNotWritableError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Protected file is not wrtable')
    this.protectedFileNotWritable = true
  }
}

exports.ModalActiveError = class ModalActiveError extends ExtendableError {
  constructor(msg) {
    super(msg || 'Modal already active')
    this.modalActive = true
  }
}

},{}],7:[function(require,module,exports){
var document = require('global/document')
var hyperx = require('hyperx')
var onload = require('on-load')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = {
  autofocus: 1,
  checked: 1,
  defaultchecked: 1,
  disabled: 1,
  formnovalidate: 1,
  indeterminate: 1,
  readonly: 1,
  required: 1,
  selected: 1,
  willvalidate: 1
}
var COMMENT_TAG = '!--'
var SVG_TAGS = [
  'svg',
  'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'font', 'font-face',
  'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
  'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph', 'mpath',
  'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else if (tag === COMMENT_TAG) {
    return document.createComment(props.comment)
  } else {
    el = document.createElement(tag)
  }

  // If adding onload events
  if (props.onload || props.onunload) {
    var load = props.onload || function () {}
    var unload = props.onunload || function () {}
    onload(el, function belOnload () {
      load(el)
    }, function belOnunload () {
      unload(el)
    },
    // We have to use non-standard `caller` to find who invokes `belCreateElement`
    belCreateElement.caller.caller.caller)
    delete props.onload
    delete props.onunload
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS[key]) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  function appendChild (childs) {
    if (!Array.isArray(childs)) return
    for (var i = 0; i < childs.length; i++) {
      var node = childs[i]
      if (Array.isArray(node)) {
        appendChild(node)
        continue
      }

      if (typeof node === 'number' ||
        typeof node === 'boolean' ||
        typeof node === 'function' ||
        node instanceof Date ||
        node instanceof RegExp) {
        node = node.toString()
      }

      if (typeof node === 'string') {
        if (el.lastChild && el.lastChild.nodeName === '#text') {
          el.lastChild.nodeValue += node
          continue
        }
        node = document.createTextNode(node)
      }

      if (node && node.nodeType) {
        el.appendChild(node)
      }
    }
  }
  appendChild(children)

  return el
}

module.exports = hyperx(belCreateElement, {comments: true})
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"global/document":20,"hyperx":23,"on-load":47}],8:[function(require,module,exports){
/*!
 * braces <https://github.com/jonschlinkert/braces>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

/**
 * Module dependencies
 */

var expand = require('expand-range');
var repeat = require('repeat-element');
var tokens = require('preserve');

/**
 * Expose `braces`
 */

module.exports = function(str, options) {
  if (typeof str !== 'string') {
    throw new Error('braces expects a string');
  }
  return braces(str, options);
};

/**
 * Expand `{foo,bar}` or `{1..5}` braces in the
 * given `string`.
 *
 * @param  {String} `str`
 * @param  {Array} `arr`
 * @param  {Object} `options`
 * @return {Array}
 */

function braces(str, arr, options) {
  if (str === '') {
    return [];
  }

  if (!Array.isArray(arr)) {
    options = arr;
    arr = [];
  }

  var opts = options || {};
  arr = arr || [];

  if (typeof opts.nodupes === 'undefined') {
    opts.nodupes = true;
  }

  var fn = opts.fn;
  var es6;

  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }

  if (!(patternRe instanceof RegExp)) {
    patternRe = patternRegex();
  }

  var matches = str.match(patternRe) || [];
  var m = matches[0];

  switch(m) {
    case '\\,':
      return escapeCommas(str, arr, opts);
    case '\\.':
      return escapeDots(str, arr, opts);
    case '\/.':
      return escapePaths(str, arr, opts);
    case ' ':
      return splitWhitespace(str);
    case '{,}':
      return exponential(str, opts, braces);
    case '{}':
      return emptyBraces(str, arr, opts);
    case '\\{':
    case '\\}':
      return escapeBraces(str, arr, opts);
    case '${':
      if (!/\{[^{]+\{/.test(str)) {
        return arr.concat(str);
      } else {
        es6 = true;
        str = tokens.before(str, es6Regex());
      }
  }

  if (!(braceRe instanceof RegExp)) {
    braceRe = braceRegex();
  }

  var match = braceRe.exec(str);
  if (match == null) {
    return [str];
  }

  var outter = match[1];
  var inner = match[2];
  if (inner === '') { return [str]; }

  var segs, segsLength;

  if (inner.indexOf('..') !== -1) {
    segs = expand(inner, opts, fn) || inner.split(',');
    segsLength = segs.length;

  } else if (inner[0] === '"' || inner[0] === '\'') {
    return arr.concat(str.split(/['"]/).join(''));

  } else {
    segs = inner.split(',');
    if (opts.makeRe) {
      return braces(str.replace(outter, wrap(segs, '|')), opts);
    }

    segsLength = segs.length;
    if (segsLength === 1 && opts.bash) {
      segs[0] = wrap(segs[0], '\\');
    }
  }

  var len = segs.length;
  var i = 0, val;

  while (len--) {
    var path = segs[i++];

    if (/(\.[^.\/])/.test(path)) {
      if (segsLength > 1) {
        return segs;
      } else {
        return [str];
      }
    }

    val = splice(str, outter, path);

    if (/\{[^{}]+?\}/.test(val)) {
      arr = braces(val, arr, opts);
    } else if (val !== '') {
      if (opts.nodupes && arr.indexOf(val) !== -1) { continue; }
      arr.push(es6 ? tokens.after(val) : val);
    }
  }

  if (opts.strict) { return filter(arr, filterEmpty); }
  return arr;
}

/**
 * Expand exponential ranges
 *
 *   `a{,}{,}` => ['a', 'a', 'a', 'a']
 */

function exponential(str, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = null;
  }

  var opts = options || {};
  var esc = '__ESC_EXP__';
  var exp = 0;
  var res;

  var parts = str.split('{,}');
  if (opts.nodupes) {
    return fn(parts.join(''), opts);
  }

  exp = parts.length - 1;
  res = fn(parts.join(esc), opts);
  var len = res.length;
  var arr = [];
  var i = 0;

  while (len--) {
    var ele = res[i++];
    var idx = ele.indexOf(esc);

    if (idx === -1) {
      arr.push(ele);

    } else {
      ele = ele.split('__ESC_EXP__').join('');
      if (!!ele && opts.nodupes !== false) {
        arr.push(ele);

      } else {
        var num = Math.pow(2, exp);
        arr.push.apply(arr, repeat(ele, num));
      }
    }
  }
  return arr;
}

/**
 * Wrap a value with parens, brackets or braces,
 * based on the given character/separator.
 *
 * @param  {String|Array} `val`
 * @param  {String} `ch`
 * @return {String}
 */

function wrap(val, ch) {
  if (ch === '|') {
    return '(' + val.join(ch) + ')';
  }
  if (ch === ',') {
    return '{' + val.join(ch) + '}';
  }
  if (ch === '-') {
    return '[' + val.join(ch) + ']';
  }
  if (ch === '\\') {
    return '\\{' + val + '\\}';
  }
}

/**
 * Handle empty braces: `{}`
 */

function emptyBraces(str, arr, opts) {
  return braces(str.split('{}').join('\\{\\}'), arr, opts);
}

/**
 * Filter out empty-ish values
 */

function filterEmpty(ele) {
  return !!ele && ele !== '\\';
}

/**
 * Handle patterns with whitespace
 */

function splitWhitespace(str) {
  var segs = str.split(' ');
  var len = segs.length;
  var res = [];
  var i = 0;

  while (len--) {
    res.push.apply(res, braces(segs[i++]));
  }
  return res;
}

/**
 * Handle escaped braces: `\\{foo,bar}`
 */

function escapeBraces(str, arr, opts) {
  if (!/\{[^{]+\{/.test(str)) {
    return arr.concat(str.split('\\').join(''));
  } else {
    str = str.split('\\{').join('__LT_BRACE__');
    str = str.split('\\}').join('__RT_BRACE__');
    return map(braces(str, arr, opts), function(ele) {
      ele = ele.split('__LT_BRACE__').join('{');
      return ele.split('__RT_BRACE__').join('}');
    });
  }
}

/**
 * Handle escaped dots: `{1\\.2}`
 */

function escapeDots(str, arr, opts) {
  if (!/[^\\]\..+\\\./.test(str)) {
    return arr.concat(str.split('\\').join(''));
  } else {
    str = str.split('\\.').join('__ESC_DOT__');
    return map(braces(str, arr, opts), function(ele) {
      return ele.split('__ESC_DOT__').join('.');
    });
  }
}

/**
 * Handle escaped dots: `{1\\.2}`
 */

function escapePaths(str, arr, opts) {
  str = str.split('\/.').join('__ESC_PATH__');
  return map(braces(str, arr, opts), function(ele) {
    return ele.split('__ESC_PATH__').join('\/.');
  });
}

/**
 * Handle escaped commas: `{a\\,b}`
 */

function escapeCommas(str, arr, opts) {
  if (!/\w,/.test(str)) {
    return arr.concat(str.split('\\').join(''));
  } else {
    str = str.split('\\,').join('__ESC_COMMA__');
    return map(braces(str, arr, opts), function(ele) {
      return ele.split('__ESC_COMMA__').join(',');
    });
  }
}

/**
 * Regex for common patterns
 */

function patternRegex() {
  return /\${|( (?=[{,}])|(?=[{,}]) )|{}|{,}|\\,(?=.*[{}])|\/\.(?=.*[{}])|\\\.(?={)|\\{|\\}/;
}

/**
 * Braces regex.
 */

function braceRegex() {
  return /.*(\\?\{([^}]+)\})/;
}

/**
 * es6 delimiter regex.
 */

function es6Regex() {
  return /\$\{([^}]+)\}/;
}

var braceRe;
var patternRe;

/**
 * Faster alternative to `String.replace()` when the
 * index of the token to be replaces can't be supplied
 */

function splice(str, token, replacement) {
  var i = str.indexOf(token);
  return str.substr(0, i) + replacement
    + str.substr(i + token.length);
}

/**
 * Fast array map
 */

function map(arr, fn) {
  if (arr == null) {
    return [];
  }

  var len = arr.length;
  var res = new Array(len);
  var i = -1;

  while (++i < len) {
    res[i] = fn(arr[i], i, arr);
  }

  return res;
}

/**
 * Fast array filter
 */

function filter(arr, cb) {
  if (arr == null) return [];
  if (typeof cb !== 'function') {
    throw new TypeError('braces: filter expects a callback function.');
  }

  var len = arr.length;
  var res = arr.slice();
  var i = 0;

  while (len--) {
    if (!cb(arr[len], i++)) {
      res.splice(len, 1);
    }
  }
  return res;
}

},{"expand-range":12,"preserve":56,"repeat-element":65}],9:[function(require,module,exports){
/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds. If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing. The function also has a property 'clear' 
 * that is a function which will clear the timer to prevent previously scheduled executions. 
 *
 * @source underscore.js
 * @see http://unscriptable.com/2009/03/20/debouncing-javascript-methods/
 * @param {Function} function to wrap
 * @param {Number} timeout in ms (`100`)
 * @param {Boolean} whether to execute at the beginning (`false`)
 * @api public
 */

module.exports = function debounce(func, wait, immediate){
  var timeout, args, context, timestamp, result;
  if (null == wait) wait = 100;

  function later() {
    var last = Date.now() - timestamp;

    if (last < wait && last >= 0) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
        context = args = null;
      }
    }
  };

  var debounced = function(){
    context = this;
    args = arguments;
    timestamp = Date.now();
    var callNow = immediate && !timeout;
    if (!timeout) timeout = setTimeout(later, wait);
    if (callNow) {
      result = func.apply(context, args);
      context = args = null;
    }

    return result;
  };

  debounced.clear = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
};

},{}],10:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var through = require('through');

exports = module.exports = function (ev) {
    if (typeof ev.pipe === 'function') {
        return exports.fromStream(ev);
    }
    else return exports.toStream(ev)
};

exports.toStream = function (ev) {
    var s = through(
        function write (args) {
            this.emit('data', args);
        },
        function end () {
            var ix = ev._emitStreams.indexOf(s);
            ev._emitStreams.splice(ix, 1);
        }
    );
    
    if (!ev._emitStreams) {
        ev._emitStreams = [];
        
        var emit = ev.emit;
        ev.emit = function () {
            var args = [].slice.call(arguments);
            ev._emitStreams.forEach(function (es) {
                es.writable && es.write(args);
            });
            emit.apply(ev, arguments);
        };
    }
    ev._emitStreams.push(s);
    
    return s;
};

exports.fromStream = function (s) {
    var ev = new EventEmitter;
    
    s.pipe(through(function (args) {
        ev.emit.apply(ev, args);
    }));
    
    return ev;
};

},{"events":undefined,"through":77}],11:[function(require,module,exports){
/*!
 * expand-brackets <https://github.com/jonschlinkert/expand-brackets>
 *
 * Copyright (c) 2015 Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

var isPosixBracket = require('is-posix-bracket');

/**
 * POSIX character classes
 */

var POSIX = {
  alnum: 'a-zA-Z0-9',
  alpha: 'a-zA-Z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1F\\x7F',
  digit: '0-9',
  graph: '\\x21-\\x7E',
  lower: 'a-z',
  print: '\\x20-\\x7E',
  punct: '-!"#$%&\'()\\*+,./:;<=>?@[\\]^_`{|}~',
  space: ' \\t\\r\\n\\v\\f',
  upper: 'A-Z',
  word:  'A-Za-z0-9_',
  xdigit: 'A-Fa-f0-9',
};

/**
 * Expose `brackets`
 */

module.exports = brackets;

function brackets(str) {
  if (!isPosixBracket(str)) {
    return str;
  }

  var negated = false;
  if (str.indexOf('[^') !== -1) {
    negated = true;
    str = str.split('[^').join('[');
  }
  if (str.indexOf('[!') !== -1) {
    negated = true;
    str = str.split('[!').join('[');
  }

  var a = str.split('[');
  var b = str.split(']');
  var imbalanced = a.length !== b.length;

  var parts = str.split(/(?::\]\[:|\[?\[:|:\]\]?)/);
  var len = parts.length, i = 0;
  var end = '', beg = '';
  var res = [];

  // start at the end (innermost) first
  while (len--) {
    var inner = parts[i++];
    if (inner === '^[!' || inner === '[!') {
      inner = '';
      negated = true;
    }

    var prefix = negated ? '^' : '';
    var ch = POSIX[inner];

    if (ch) {
      res.push('[' + prefix + ch + ']');
    } else if (inner) {
      if (/^\[?\w-\w\]?$/.test(inner)) {
        if (i === parts.length) {
          res.push('[' + prefix + inner);
        } else if (i === 1) {
          res.push(prefix + inner + ']');
        } else {
          res.push(prefix + inner);
        }
      } else {
        if (i === 1) {
          beg += inner;
        } else if (i === parts.length) {
          end += inner;
        } else {
          res.push('[' + prefix + inner + ']');
        }
      }
    }
  }

  var result = res.join('|');
  var rlen = res.length || 1;
  if (rlen > 1) {
    result = '(?:' + result + ')';
    rlen = 1;
  }
  if (beg) {
    rlen++;
    if (beg.charAt(0) === '[') {
      if (imbalanced) {
        beg = '\\[' + beg.slice(1);
      } else {
        beg += ']';
      }
    }
    result = beg + result;
  }
  if (end) {
    rlen++;
    if (end.slice(-1) === ']') {
      if (imbalanced) {
        end = end.slice(0, end.length - 1) + '\\]';
      } else {
        end = '[' + end;
      }
    }
    result += end;
  }

  if (rlen > 1) {
    result = result.split('][').join(']|[');
    if (result.indexOf('|') !== -1 && !/\(\?/.test(result)) {
      result = '(?:' + result + ')';
    }
  }

  result = result.replace(/\[+=|=\]+/g, '\\b');
  return result;
}

brackets.makeRe = function(pattern) {
  try {
    return new RegExp(brackets(pattern));
  } catch (err) {}
};

brackets.isMatch = function(str, pattern) {
  try {
    return brackets.makeRe(pattern).test(str);
  } catch (err) {
    return false;
  }
};

brackets.match = function(arr, pattern) {
  var len = arr.length, i = 0;
  var res = arr.slice();

  var re = brackets.makeRe(pattern);
  while (i < len) {
    var ele = arr[i++];
    if (!re.test(ele)) {
      continue;
    }
    res.splice(i, 1);
  }
  return res;
};

},{"is-posix-bracket":31}],12:[function(require,module,exports){
/*!
 * expand-range <https://github.com/jonschlinkert/expand-range>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

var fill = require('fill-range');

module.exports = function expandRange(str, options, fn) {
  if (typeof str !== 'string') {
    throw new TypeError('expand-range expects a string.');
  }

  if (typeof options === 'function') {
    fn = options;
    options = {};
  }

  if (typeof options === 'boolean') {
    options = {};
    options.makeRe = true;
  }

  // create arguments to pass to fill-range
  var opts = options || {};
  var args = str.split('..');
  var len = args.length;
  if (len > 3) { return str; }

  // if only one argument, it can't expand so return it
  if (len === 1) { return args; }

  // if `true`, tell fill-range to regexify the string
  if (typeof fn === 'boolean' && fn === true) {
    opts.makeRe = true;
  }

  args.push(opts);
  return fill.apply(null, args.concat(fn));
};

},{"fill-range":15}],13:[function(require,module,exports){
/*!
 * extglob <https://github.com/jonschlinkert/extglob>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

/**
 * Module dependencies
 */

var isExtglob = require('is-extglob');
var re, cache = {};

/**
 * Expose `extglob`
 */

module.exports = extglob;

/**
 * Convert the given extglob `string` to a regex-compatible
 * string.
 *
 * ```js
 * var extglob = require('extglob');
 * extglob('!(a?(b))');
 * //=> '(?!a(?:b)?)[^/]*?'
 * ```
 *
 * @param {String} `str` The string to convert.
 * @param {Object} `options`
 *   @option {Boolean} [options] `esc` If `false` special characters will not be escaped. Defaults to `true`.
 *   @option {Boolean} [options] `regex` If `true` a regular expression is returned instead of a string.
 * @return {String}
 * @api public
 */


function extglob(str, opts) {
  opts = opts || {};
  var o = {}, i = 0;

  // fix common character reversals
  // '*!(.js)' => '*.!(js)'
  str = str.replace(/!\(([^\w*()])/g, '$1!(');

  // support file extension negation
  str = str.replace(/([*\/])\.!\([*]\)/g, function (m, ch) {
    if (ch === '/') {
      return escape('\\/[^.]+');
    }
    return escape('[^.]+');
  });

  // create a unique key for caching by
  // combining the string and options
  var key = str
    + String(!!opts.regex)
    + String(!!opts.contains)
    + String(!!opts.escape);

  if (cache.hasOwnProperty(key)) {
    return cache[key];
  }

  if (!(re instanceof RegExp)) {
    re = regex();
  }

  opts.negate = false;
  var m;

  while (m = re.exec(str)) {
    var prefix = m[1];
    var inner = m[3];
    if (prefix === '!') {
      opts.negate = true;
    }

    var id = '__EXTGLOB_' + (i++) + '__';
    // use the prefix of the _last_ (outtermost) pattern
    o[id] = wrap(inner, prefix, opts.escape);
    str = str.split(m[0]).join(id);
  }

  var keys = Object.keys(o);
  var len = keys.length;

  // we have to loop again to allow us to convert
  // patterns in reverse order (starting with the
  // innermost/last pattern first)
  while (len--) {
    var prop = keys[len];
    str = str.split(prop).join(o[prop]);
  }

  var result = opts.regex
    ? toRegex(str, opts.contains, opts.negate)
    : str;

  result = result.split('.').join('\\.');

  // cache the result and return it
  return (cache[key] = result);
}

/**
 * Convert `string` to a regex string.
 *
 * @param  {String} `str`
 * @param  {String} `prefix` Character that determines how to wrap the string.
 * @param  {Boolean} `esc` If `false` special characters will not be escaped. Defaults to `true`.
 * @return {String}
 */

function wrap(inner, prefix, esc) {
  if (esc) inner = escape(inner);

  switch (prefix) {
    case '!':
      return '(?!' + inner + ')[^/]' + (esc ? '%%%~' : '*?');
    case '@':
      return '(?:' + inner + ')';
    case '+':
      return '(?:' + inner + ')+';
    case '*':
      return '(?:' + inner + ')' + (esc ? '%%' : '*')
    case '?':
      return '(?:' + inner + '|)';
    default:
      return inner;
  }
}

function escape(str) {
  str = str.split('*').join('[^/]%%%~');
  str = str.split('.').join('\\.');
  return str;
}

/**
 * extglob regex.
 */

function regex() {
  return /(\\?[@?!+*$]\\?)(\(([^()]*?)\))/;
}

/**
 * Negation regex
 */

function negate(str) {
  return '(?!^' + str + ').*$';
}

/**
 * Create the regex to do the matching. If
 * the leading character in the `pattern` is `!`
 * a negation regex is returned.
 *
 * @param {String} `pattern`
 * @param {Boolean} `contains` Allow loose matching.
 * @param {Boolean} `isNegated` True if the pattern is a negation pattern.
 */

function toRegex(pattern, contains, isNegated) {
  var prefix = contains ? '^' : '';
  var after = contains ? '$' : '';
  pattern = ('(?:' + pattern + ')' + after);
  if (isNegated) {
    pattern = prefix + negate(pattern);
  }
  return new RegExp(prefix + pattern);
}

},{"is-extglob":28}],14:[function(require,module,exports){
/*!
 * filename-regex <https://github.com/regexps/filename-regex>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert
 * Licensed under the MIT license.
 */

module.exports = function filenameRegex() {
  return /([^\\\/]+)$/;
};

},{}],15:[function(require,module,exports){
/*!
 * fill-range <https://github.com/jonschlinkert/fill-range>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isObject = require('isobject');
var isNumber = require('is-number');
var randomize = require('randomatic');
var repeatStr = require('repeat-string');
var repeat = require('repeat-element');

/**
 * Expose `fillRange`
 */

module.exports = fillRange;

/**
 * Return a range of numbers or letters.
 *
 * @param  {String} `a` Start of the range
 * @param  {String} `b` End of the range
 * @param  {String} `step` Increment or decrement to use.
 * @param  {Function} `fn` Custom function to modify each element in the range.
 * @return {Array}
 */

function fillRange(a, b, step, options, fn) {
  if (a == null || b == null) {
    throw new Error('fill-range expects the first and second args to be strings.');
  }

  if (typeof step === 'function') {
    fn = step; options = {}; step = null;
  }

  if (typeof options === 'function') {
    fn = options; options = {};
  }

  if (isObject(step)) {
    options = step; step = '';
  }

  var expand, regex = false, sep = '';
  var opts = options || {};

  if (typeof opts.silent === 'undefined') {
    opts.silent = true;
  }

  step = step || opts.step;

  // store a ref to unmodified arg
  var origA = a, origB = b;

  b = (b.toString() === '-0') ? 0 : b;

  if (opts.optimize || opts.makeRe) {
    step = step ? (step += '~') : step;
    expand = true;
    regex = true;
    sep = '~';
  }

  // handle special step characters
  if (typeof step === 'string') {
    var match = stepRe().exec(step);

    if (match) {
      var i = match.index;
      var m = match[0];

      // repeat string
      if (m === '+') {
        return repeat(a, b);

      // randomize a, `b` times
      } else if (m === '?') {
        return [randomize(a, b)];

      // expand right, no regex reduction
      } else if (m === '>') {
        step = step.substr(0, i) + step.substr(i + 1);
        expand = true;

      // expand to an array, or if valid create a reduced
      // string for a regex logic `or`
      } else if (m === '|') {
        step = step.substr(0, i) + step.substr(i + 1);
        expand = true;
        regex = true;
        sep = m;

      // expand to an array, or if valid create a reduced
      // string for a regex range
      } else if (m === '~') {
        step = step.substr(0, i) + step.substr(i + 1);
        expand = true;
        regex = true;
        sep = m;
      }
    } else if (!isNumber(step)) {
      if (!opts.silent) {
        throw new TypeError('fill-range: invalid step.');
      }
      return null;
    }
  }

  if (/[.&*()[\]^%$#@!]/.test(a) || /[.&*()[\]^%$#@!]/.test(b)) {
    if (!opts.silent) {
      throw new RangeError('fill-range: invalid range arguments.');
    }
    return null;
  }

  // has neither a letter nor number, or has both letters and numbers
  // this needs to be after the step logic
  if (!noAlphaNum(a) || !noAlphaNum(b) || hasBoth(a) || hasBoth(b)) {
    if (!opts.silent) {
      throw new RangeError('fill-range: invalid range arguments.');
    }
    return null;
  }

  // validate arguments
  var isNumA = isNumber(zeros(a));
  var isNumB = isNumber(zeros(b));

  if ((!isNumA && isNumB) || (isNumA && !isNumB)) {
    if (!opts.silent) {
      throw new TypeError('fill-range: first range argument is incompatible with second.');
    }
    return null;
  }

  // by this point both are the same, so we
  // can use A to check going forward.
  var isNum = isNumA;
  var num = formatStep(step);

  // is the range alphabetical? or numeric?
  if (isNum) {
    // if numeric, coerce to an integer
    a = +a; b = +b;
  } else {
    // otherwise, get the charCode to expand alpha ranges
    a = a.charCodeAt(0);
    b = b.charCodeAt(0);
  }

  // is the pattern descending?
  var isDescending = a > b;

  // don't create a character class if the args are < 0
  if (a < 0 || b < 0) {
    expand = false;
    regex = false;
  }

  // detect padding
  var padding = isPadded(origA, origB);
  var res, pad, arr = [];
  var ii = 0;

  // character classes, ranges and logical `or`
  if (regex) {
    if (shouldExpand(a, b, num, isNum, padding, opts)) {
      // make sure the correct separator is used
      if (sep === '|' || sep === '~') {
        sep = detectSeparator(a, b, num, isNum, isDescending);
      }
      return wrap([origA, origB], sep, opts);
    }
  }

  while (isDescending ? (a >= b) : (a <= b)) {
    if (padding && isNum) {
      pad = padding(a);
    }

    // custom function
    if (typeof fn === 'function') {
      res = fn(a, isNum, pad, ii++);

    // letters
    } else if (!isNum) {
      if (regex && isInvalidChar(a)) {
        res = null;
      } else {
        res = String.fromCharCode(a);
      }

    // numbers
    } else {
      res = formatPadding(a, pad);
    }

    // add result to the array, filtering any nulled values
    if (res !== null) arr.push(res);

    // increment or decrement
    if (isDescending) {
      a -= num;
    } else {
      a += num;
    }
  }

  // now that the array is expanded, we need to handle regex
  // character classes, ranges or logical `or` that wasn't
  // already handled before the loop
  if ((regex || expand) && !opts.noexpand) {
    // make sure the correct separator is used
    if (sep === '|' || sep === '~') {
      sep = detectSeparator(a, b, num, isNum, isDescending);
    }
    if (arr.length === 1 || a < 0 || b < 0) { return arr; }
    return wrap(arr, sep, opts);
  }

  return arr;
}

/**
 * Wrap the string with the correct regex
 * syntax.
 */

function wrap(arr, sep, opts) {
  if (sep === '~') { sep = '-'; }
  var str = arr.join(sep);
  var pre = opts && opts.regexPrefix;

  // regex logical `or`
  if (sep === '|') {
    str = pre ? pre + str : str;
    str = '(' + str + ')';
  }

  // regex character class
  if (sep === '-') {
    str = (pre && pre === '^')
      ? pre + str
      : str;
    str = '[' + str + ']';
  }
  return [str];
}

/**
 * Check for invalid characters
 */

function isCharClass(a, b, step, isNum, isDescending) {
  if (isDescending) { return false; }
  if (isNum) { return a <= 9 && b <= 9; }
  if (a < b) { return step === 1; }
  return false;
}

/**
 * Detect the correct separator to use
 */

function shouldExpand(a, b, num, isNum, padding, opts) {
  if (isNum && (a > 9 || b > 9)) { return false; }
  return !padding && num === 1 && a < b;
}

/**
 * Detect the correct separator to use
 */

function detectSeparator(a, b, step, isNum, isDescending) {
  var isChar = isCharClass(a, b, step, isNum, isDescending);
  if (!isChar) {
    return '|';
  }
  return '~';
}

/**
 * Correctly format the step based on type
 */

function formatStep(step) {
  return Math.abs(step >> 0) || 1;
}

/**
 * Format padding, taking leading `-` into account
 */

function formatPadding(ch, pad) {
  var res = pad ? pad + ch : ch;
  if (pad && ch.toString().charAt(0) === '-') {
    res = '-' + pad + ch.toString().substr(1);
  }
  return res.toString();
}

/**
 * Check for invalid characters
 */

function isInvalidChar(str) {
  var ch = toStr(str);
  return ch === '\\'
    || ch === '['
    || ch === ']'
    || ch === '^'
    || ch === '('
    || ch === ')'
    || ch === '`';
}

/**
 * Convert to a string from a charCode
 */

function toStr(ch) {
  return String.fromCharCode(ch);
}


/**
 * Step regex
 */

function stepRe() {
  return /\?|>|\||\+|\~/g;
}

/**
 * Return true if `val` has either a letter
 * or a number
 */

function noAlphaNum(val) {
  return /[a-z0-9]/i.test(val);
}

/**
 * Return true if `val` has both a letter and
 * a number (invalid)
 */

function hasBoth(val) {
  return /[a-z][0-9]|[0-9][a-z]/i.test(val);
}

/**
 * Normalize zeros for checks
 */

function zeros(val) {
  if (/^-*0+$/.test(val.toString())) {
    return '0';
  }
  return val;
}

/**
 * Return true if `val` has leading zeros,
 * or a similar valid pattern.
 */

function hasZeros(val) {
  return /[^.]\.|^-*0+[0-9]/.test(val);
}

/**
 * If the string is padded, returns a curried function with
 * the a cached padding string, or `false` if no padding.
 *
 * @param  {*} `origA` String or number.
 * @return {String|Boolean}
 */

function isPadded(origA, origB) {
  if (hasZeros(origA) || hasZeros(origB)) {
    var alen = length(origA);
    var blen = length(origB);

    var len = alen >= blen
      ? alen
      : blen;

    return function (a) {
      return repeatStr('0', len - length(a));
    };
  }
  return false;
}

/**
 * Get the string length of `val`
 */

function length(val) {
  return val.toString().length;
}

},{"is-number":30,"isobject":34,"randomatic":59,"repeat-element":65,"repeat-string":66}],16:[function(require,module,exports){
/*!
 * for-in <https://github.com/jonschlinkert/for-in>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

'use strict';

module.exports = function forIn(obj, fn, thisArg) {
  for (var key in obj) {
    if (fn.call(thisArg, obj[key], key, obj) === false) {
      break;
    }
  }
};

},{}],17:[function(require,module,exports){
/*!
 * for-own <https://github.com/jonschlinkert/for-own>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

'use strict';

var forIn = require('for-in');
var hasOwn = Object.prototype.hasOwnProperty;

module.exports = function forOwn(obj, fn, thisArg) {
  forIn(obj, function(val, key) {
    if (hasOwn.call(obj, key)) {
      return fn.call(thisArg, obj[key], key, obj);
    }
  });
};

},{"for-in":16}],18:[function(require,module,exports){
/*!
 * glob-base <https://github.com/jonschlinkert/glob-base>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var path = require('path');
var parent = require('glob-parent');
var isGlob = require('is-glob');

module.exports = function globBase(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError('glob-base expects a string.');
  }

  var res = {};
  res.base = parent(pattern);
  res.isGlob = isGlob(pattern);

  if (res.base !== '.') {
    res.glob = pattern.substr(res.base.length);
    if (res.glob.charAt(0) === '/') {
      res.glob = res.glob.substr(1);
    }
  } else {
    res.glob = pattern;
  }

  if (!res.isGlob) {
    res.base = dirname(pattern);
    res.glob = res.base !== '.'
      ? pattern.substr(res.base.length)
      : pattern;
  }

  if (res.glob.substr(0, 2) === './') {
    res.glob = res.glob.substr(2);
  }
  if (res.glob.charAt(0) === '/') {
    res.glob = res.glob.substr(1);
  }
  return res;
};

function dirname(glob) {
  if (glob.slice(-1) === '/') return glob;
  return path.dirname(glob);
}

},{"glob-parent":19,"is-glob":29,"path":undefined}],19:[function(require,module,exports){
'use strict';

var path = require('path');
var isglob = require('is-glob');

module.exports = function globParent(str) {
	str += 'a'; // preserves full path in case of trailing path separator
	do {str = path.dirname(str)} while (isglob(str));
	return str;
};

},{"is-glob":29,"path":undefined}],20:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"min-document":80}],21:[function(require,module,exports){
(function (global){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],22:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],23:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        p.push([ VAR, xstate, arg ])
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else cur[1][key] = concat(cur[1][key], parts[i][1])
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else cur[1][key] = concat(cur[1][key], parts[i][2])
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)],[CLOSE])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && /\s/.test(c)) {
          res.push([OPEN, reg])
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var hasOwn = Object.prototype.hasOwnProperty
function has (obj, key) { return hasOwn.call(obj, key) }

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":22}],24:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],25:[function(require,module,exports){
/*!
 * is-dotfile <https://github.com/jonschlinkert/is-dotfile>
 *
 * Copyright (c) 2015-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

module.exports = function(str) {
  if (str.charCodeAt(0) === 46 /* . */ && str.indexOf('/', 1) === -1) {
    return true;
  }
  var slash = str.lastIndexOf('/');
  return slash !== -1 ? str.charCodeAt(slash + 1) === 46  /* . */ : false;
};

},{}],26:[function(require,module,exports){
/*!
 * is-equal-shallow <https://github.com/jonschlinkert/is-equal-shallow>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isPrimitive = require('is-primitive');

module.exports = function isEqual(a, b) {
  if (!a && !b) { return true; }
  if (!a && b || a && !b) { return false; }

  var numKeysA = 0, numKeysB = 0, key;
  for (key in b) {
    numKeysB++;
    if (!isPrimitive(b[key]) || !a.hasOwnProperty(key) || (a[key] !== b[key])) {
      return false;
    }
  }
  for (key in a) {
    numKeysA++;
  }
  return numKeysA === numKeysB;
};

},{"is-primitive":32}],27:[function(require,module,exports){
/*!
 * is-extendable <https://github.com/jonschlinkert/is-extendable>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

module.exports = function isExtendable(val) {
  return typeof val !== 'undefined' && val !== null
    && (typeof val === 'object' || typeof val === 'function');
};

},{}],28:[function(require,module,exports){
/*!
 * is-extglob <https://github.com/jonschlinkert/is-extglob>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

module.exports = function isExtglob(str) {
  return typeof str === 'string'
    && /[@?!+*]\(/.test(str);
};

},{}],29:[function(require,module,exports){
/*!
 * is-glob <https://github.com/jonschlinkert/is-glob>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

var isExtglob = require('is-extglob');

module.exports = function isGlob(str) {
  return typeof str === 'string'
    && (/[*!?{}(|)[\]]/.test(str)
     || isExtglob(str));
};
},{"is-extglob":28}],30:[function(require,module,exports){
/*!
 * is-number <https://github.com/jonschlinkert/is-number>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var typeOf = require('kind-of');

module.exports = function isNumber(num) {
  var type = typeOf(num);
  if (type !== 'number' && type !== 'string') {
    return false;
  }
  var n = +num;
  return (n - n + 1) >= 0 && num !== '';
};

},{"kind-of":35}],31:[function(require,module,exports){
/*!
 * is-posix-bracket <https://github.com/jonschlinkert/is-posix-bracket>
 *
 * Copyright (c) 2015-2016, Jon Schlinkert.
 * Licensed under the MIT License.
 */

module.exports = function isPosixBracket(str) {
  return typeof str === 'string' && /\[([:.=+])(?:[^\[\]]|)+\1\]/.test(str);
};

},{}],32:[function(require,module,exports){
/*!
 * is-primitive <https://github.com/jonschlinkert/is-primitive>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

// see http://jsperf.com/testing-value-is-primitive/7
module.exports = function isPrimitive(value) {
  return value == null || (typeof value !== 'function' && typeof value !== 'object');
};

},{}],33:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],34:[function(require,module,exports){
/*!
 * isobject <https://github.com/jonschlinkert/isobject>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isArray = require('isarray');

module.exports = function isObject(val) {
  return val != null && typeof val === 'object' && isArray(val) === false;
};

},{"isarray":33}],35:[function(require,module,exports){
var isBuffer = require('is-buffer');
var toString = Object.prototype.toString;

/**
 * Get the native `typeof` a value.
 *
 * @param  {*} `val`
 * @return {*} Native javascript type
 */

module.exports = function kindOf(val) {
  // primitivies
  if (typeof val === 'undefined') {
    return 'undefined';
  }
  if (val === null) {
    return 'null';
  }
  if (val === true || val === false || val instanceof Boolean) {
    return 'boolean';
  }
  if (typeof val === 'string' || val instanceof String) {
    return 'string';
  }
  if (typeof val === 'number' || val instanceof Number) {
    return 'number';
  }

  // functions
  if (typeof val === 'function' || val instanceof Function) {
    return 'function';
  }

  // array
  if (typeof Array.isArray !== 'undefined' && Array.isArray(val)) {
    return 'array';
  }

  // check for instances of RegExp and Date before calling `toString`
  if (val instanceof RegExp) {
    return 'regexp';
  }
  if (val instanceof Date) {
    return 'date';
  }

  // other objects
  var type = toString.call(val);

  if (type === '[object RegExp]') {
    return 'regexp';
  }
  if (type === '[object Date]') {
    return 'date';
  }
  if (type === '[object Arguments]') {
    return 'arguments';
  }
  if (type === '[object Error]') {
    return 'error';
  }

  // buffer
  if (isBuffer(val)) {
    return 'buffer';
  }

  // es6: Map, WeakMap, Set, WeakSet
  if (type === '[object Set]') {
    return 'set';
  }
  if (type === '[object WeakSet]') {
    return 'weakset';
  }
  if (type === '[object Map]') {
    return 'map';
  }
  if (type === '[object WeakMap]') {
    return 'weakmap';
  }
  if (type === '[object Symbol]') {
    return 'symbol';
  }

  // typed arrays
  if (type === '[object Int8Array]') {
    return 'int8array';
  }
  if (type === '[object Uint8Array]') {
    return 'uint8array';
  }
  if (type === '[object Uint8ClampedArray]') {
    return 'uint8clampedarray';
  }
  if (type === '[object Int16Array]') {
    return 'int16array';
  }
  if (type === '[object Uint16Array]') {
    return 'uint16array';
  }
  if (type === '[object Int32Array]') {
    return 'int32array';
  }
  if (type === '[object Uint32Array]') {
    return 'uint32array';
  }
  if (type === '[object Float32Array]') {
    return 'float32array';
  }
  if (type === '[object Float64Array]') {
    return 'float64array';
  }

  // must be a plain object
  return 'object';
};

},{"is-buffer":24}],36:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var Symbol = root.Symbol,
    propertyIsEnumerable = objectProto.propertyIsEnumerable,
    spreadableSymbol = Symbol ? Symbol.isConcatSpreadable : undefined;

/**
 * The base implementation of `_.flatten` with support for restricting flattening.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {number} depth The maximum recursion depth.
 * @param {boolean} [predicate=isFlattenable] The function invoked per iteration.
 * @param {boolean} [isStrict] Restrict to values that pass `predicate` checks.
 * @param {Array} [result=[]] The initial result value.
 * @returns {Array} Returns the new flattened array.
 */
function baseFlatten(array, depth, predicate, isStrict, result) {
  var index = -1,
      length = array.length;

  predicate || (predicate = isFlattenable);
  result || (result = []);

  while (++index < length) {
    var value = array[index];
    if (depth > 0 && predicate(value)) {
      if (depth > 1) {
        // Recursively flatten arrays (susceptible to call stack limits).
        baseFlatten(value, depth - 1, predicate, isStrict, result);
      } else {
        arrayPush(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

/**
 * Checks if `value` is a flattenable `arguments` object or array.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is flattenable, else `false`.
 */
function isFlattenable(value) {
  return isArray(value) || isArguments(value) ||
    !!(spreadableSymbol && value && value[spreadableSymbol]);
}

/**
 * Flattens `array` a single level deep.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Array
 * @param {Array} array The array to flatten.
 * @returns {Array} Returns the new flattened array.
 * @example
 *
 * _.flatten([1, [2, [3, [4]], 5]]);
 * // => [1, 2, [3, [4]], 5]
 */
function flatten(array) {
  var length = array ? array.length : 0;
  return length ? baseFlatten(array, 1) : [];
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = flatten;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],37:[function(require,module,exports){
/*!
 * micromatch <https://github.com/jonschlinkert/micromatch>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var expand = require('./lib/expand');
var utils = require('./lib/utils');

/**
 * The main function. Pass an array of filepaths,
 * and a string or array of glob patterns
 *
 * @param  {Array|String} `files`
 * @param  {Array|String} `patterns`
 * @param  {Object} `opts`
 * @return {Array} Array of matches
 */

function micromatch(files, patterns, opts) {
  if (!files || !patterns) return [];
  opts = opts || {};

  if (typeof opts.cache === 'undefined') {
    opts.cache = true;
  }

  if (!Array.isArray(patterns)) {
    return match(files, patterns, opts);
  }

  var len = patterns.length, i = 0;
  var omit = [], keep = [];

  while (len--) {
    var glob = patterns[i++];
    if (typeof glob === 'string' && glob.charCodeAt(0) === 33 /* ! */) {
      omit.push.apply(omit, match(files, glob.slice(1), opts));
    } else {
      keep.push.apply(keep, match(files, glob, opts));
    }
  }
  return utils.diff(keep, omit);
}

/**
 * Return an array of files that match the given glob pattern.
 *
 * This function is called by the main `micromatch` function If you only
 * need to pass a single pattern you might get very minor speed improvements
 * using this function.
 *
 * @param  {Array} `files`
 * @param  {String} `pattern`
 * @param  {Object} `options`
 * @return {Array}
 */

function match(files, pattern, opts) {
  if (utils.typeOf(files) !== 'string' && !Array.isArray(files)) {
    throw new Error(msg('match', 'files', 'a string or array'));
  }

  files = utils.arrayify(files);
  opts = opts || {};

  var negate = opts.negate || false;
  var orig = pattern;

  if (typeof pattern === 'string') {
    negate = pattern.charAt(0) === '!';
    if (negate) {
      pattern = pattern.slice(1);
    }

    // we need to remove the character regardless,
    // so the above logic is still needed
    if (opts.nonegate === true) {
      negate = false;
    }
  }

  var _isMatch = matcher(pattern, opts);
  var len = files.length, i = 0;
  var res = [];

  while (i < len) {
    var file = files[i++];
    var fp = utils.unixify(file, opts);

    if (!_isMatch(fp)) { continue; }
    res.push(fp);
  }

  if (res.length === 0) {
    if (opts.failglob === true) {
      throw new Error('micromatch.match() found no matches for: "' + orig + '".');
    }

    if (opts.nonull || opts.nullglob) {
      res.push(utils.unescapeGlob(orig));
    }
  }

  // if `negate` was defined, diff negated files
  if (negate) { res = utils.diff(files, res); }

  // if `ignore` was defined, diff ignored filed
  if (opts.ignore && opts.ignore.length) {
    pattern = opts.ignore;
    opts = utils.omit(opts, ['ignore']);
    res = utils.diff(res, micromatch(res, pattern, opts));
  }

  if (opts.nodupes) {
    return utils.unique(res);
  }
  return res;
}

/**
 * Returns a function that takes a glob pattern or array of glob patterns
 * to be used with `Array#filter()`. (Internally this function generates
 * the matching function using the [matcher] method).
 *
 * ```js
 * var fn = mm.filter('[a-c]');
 * ['a', 'b', 'c', 'd', 'e'].filter(fn);
 * //=> ['a', 'b', 'c']
 * ```
 * @param  {String|Array} `patterns` Can be a glob or array of globs.
 * @param  {Options} `opts` Options to pass to the [matcher] method.
 * @return {Function} Filter function to be passed to `Array#filter()`.
 */

function filter(patterns, opts) {
  if (!Array.isArray(patterns) && typeof patterns !== 'string') {
    throw new TypeError(msg('filter', 'patterns', 'a string or array'));
  }

  patterns = utils.arrayify(patterns);
  var len = patterns.length, i = 0;
  var patternMatchers = Array(len);
  while (i < len) {
    patternMatchers[i] = matcher(patterns[i++], opts);
  }

  return function(fp) {
    if (fp == null) return [];
    var len = patternMatchers.length, i = 0;
    var res = true;

    fp = utils.unixify(fp, opts);
    while (i < len) {
      var fn = patternMatchers[i++];
      if (!fn(fp)) {
        res = false;
        break;
      }
    }
    return res;
  };
}

/**
 * Returns true if the filepath contains the given
 * pattern. Can also return a function for matching.
 *
 * ```js
 * isMatch('foo.md', '*.md', {});
 * //=> true
 *
 * isMatch('*.md', {})('foo.md')
 * //=> true
 * ```
 * @param  {String} `fp`
 * @param  {String} `pattern`
 * @param  {Object} `opts`
 * @return {Boolean}
 */

function isMatch(fp, pattern, opts) {
  if (typeof fp !== 'string') {
    throw new TypeError(msg('isMatch', 'filepath', 'a string'));
  }

  fp = utils.unixify(fp, opts);
  if (utils.typeOf(pattern) === 'object') {
    return matcher(fp, pattern);
  }
  return matcher(pattern, opts)(fp);
}

/**
 * Returns true if the filepath matches the
 * given pattern.
 */

function contains(fp, pattern, opts) {
  if (typeof fp !== 'string') {
    throw new TypeError(msg('contains', 'pattern', 'a string'));
  }

  opts = opts || {};
  opts.contains = (pattern !== '');
  fp = utils.unixify(fp, opts);

  if (opts.contains && !utils.isGlob(pattern)) {
    return fp.indexOf(pattern) !== -1;
  }
  return matcher(pattern, opts)(fp);
}

/**
 * Returns true if a file path matches any of the
 * given patterns.
 *
 * @param  {String} `fp` The filepath to test.
 * @param  {String|Array} `patterns` Glob patterns to use.
 * @param  {Object} `opts` Options to pass to the `matcher()` function.
 * @return {String}
 */

function any(fp, patterns, opts) {
  if (!Array.isArray(patterns) && typeof patterns !== 'string') {
    throw new TypeError(msg('any', 'patterns', 'a string or array'));
  }

  patterns = utils.arrayify(patterns);
  var len = patterns.length;

  fp = utils.unixify(fp, opts);
  while (len--) {
    var isMatch = matcher(patterns[len], opts);
    if (isMatch(fp)) {
      return true;
    }
  }
  return false;
}

/**
 * Filter the keys of an object with the given `glob` pattern
 * and `options`
 *
 * @param  {Object} `object`
 * @param  {Pattern} `object`
 * @return {Array}
 */

function matchKeys(obj, glob, options) {
  if (utils.typeOf(obj) !== 'object') {
    throw new TypeError(msg('matchKeys', 'first argument', 'an object'));
  }

  var fn = matcher(glob, options);
  var res = {};

  for (var key in obj) {
    if (obj.hasOwnProperty(key) && fn(key)) {
      res[key] = obj[key];
    }
  }
  return res;
}

/**
 * Return a function for matching based on the
 * given `pattern` and `options`.
 *
 * @param  {String} `pattern`
 * @param  {Object} `options`
 * @return {Function}
 */

function matcher(pattern, opts) {
  // pattern is a function
  if (typeof pattern === 'function') {
    return pattern;
  }
  // pattern is a regex
  if (pattern instanceof RegExp) {
    return function(fp) {
      return pattern.test(fp);
    };
  }

  if (typeof pattern !== 'string') {
    throw new TypeError(msg('matcher', 'pattern', 'a string, regex, or function'));
  }

  // strings, all the way down...
  pattern = utils.unixify(pattern, opts);

  // pattern is a non-glob string
  if (!utils.isGlob(pattern)) {
    return utils.matchPath(pattern, opts);
  }
  // pattern is a glob string
  var re = makeRe(pattern, opts);

  // `matchBase` is defined
  if (opts && opts.matchBase) {
    return utils.hasFilename(re, opts);
  }
  // `matchBase` is not defined
  return function(fp) {
    fp = utils.unixify(fp, opts);
    return re.test(fp);
  };
}

/**
 * Create and cache a regular expression for matching
 * file paths.
 *
 * If the leading character in the `glob` is `!`, a negation
 * regex is returned.
 *
 * @param  {String} `glob`
 * @param  {Object} `options`
 * @return {RegExp}
 */

function toRegex(glob, options) {
  // clone options to prevent  mutating the original object
  var opts = Object.create(options || {});
  var flags = opts.flags || '';
  if (opts.nocase && flags.indexOf('i') === -1) {
    flags += 'i';
  }

  var parsed = expand(glob, opts);

  // pass in tokens to avoid parsing more than once
  opts.negated = opts.negated || parsed.negated;
  opts.negate = opts.negated;
  glob = wrapGlob(parsed.pattern, opts);
  var re;

  try {
    re = new RegExp(glob, flags);
    return re;
  } catch (err) {
    err.reason = 'micromatch invalid regex: (' + re + ')';
    if (opts.strict) throw new SyntaxError(err);
  }

  // we're only here if a bad pattern was used and the user
  // passed `options.silent`, so match nothing
  return /$^/;
}

/**
 * Create the regex to do the matching. If the leading
 * character in the `glob` is `!` a negation regex is returned.
 *
 * @param {String} `glob`
 * @param {Boolean} `negate`
 */

function wrapGlob(glob, opts) {
  var prefix = (opts && !opts.contains) ? '^' : '';
  var after = (opts && !opts.contains) ? '$' : '';
  glob = ('(?:' + glob + ')' + after);
  if (opts && opts.negate) {
    return prefix + ('(?!^' + glob + ').*$');
  }
  return prefix + glob;
}

/**
 * Create and cache a regular expression for matching file paths.
 * If the leading character in the `glob` is `!`, a negation
 * regex is returned.
 *
 * @param  {String} `glob`
 * @param  {Object} `options`
 * @return {RegExp}
 */

function makeRe(glob, opts) {
  if (utils.typeOf(glob) !== 'string') {
    throw new Error(msg('makeRe', 'glob', 'a string'));
  }
  return utils.cache(toRegex, glob, opts);
}

/**
 * Make error messages consistent. Follows this format:
 *
 * ```js
 * msg(methodName, argNumber, nativeType);
 * // example:
 * msg('matchKeys', 'first', 'an object');
 * ```
 *
 * @param  {String} `method`
 * @param  {String} `num`
 * @param  {String} `type`
 * @return {String}
 */

function msg(method, what, type) {
  return 'micromatch.' + method + '(): ' + what + ' should be ' + type + '.';
}

/**
 * Public methods
 */

/* eslint no-multi-spaces: 0 */
micromatch.any       = any;
micromatch.braces    = micromatch.braceExpand = utils.braces;
micromatch.contains  = contains;
micromatch.expand    = expand;
micromatch.filter    = filter;
micromatch.isMatch   = isMatch;
micromatch.makeRe    = makeRe;
micromatch.match     = match;
micromatch.matcher   = matcher;
micromatch.matchKeys = matchKeys;

/**
 * Expose `micromatch`
 */

module.exports = micromatch;

},{"./lib/expand":39,"./lib/utils":41}],38:[function(require,module,exports){
'use strict';

var chars = {}, unesc, temp;

function reverse(object, prepender) {
  return Object.keys(object).reduce(function(reversed, key) {
    var newKey = prepender ? prepender + key : key; // Optionally prepend a string to key.
    reversed[object[key]] = newKey; // Swap key and value.
    return reversed; // Return the result.
  }, {});
}

/**
 * Regex for common characters
 */

chars.escapeRegex = {
  '?': /\?/g,
  '@': /\@/g,
  '!': /\!/g,
  '+': /\+/g,
  '*': /\*/g,
  '(': /\(/g,
  ')': /\)/g,
  '[': /\[/g,
  ']': /\]/g
};

/**
 * Escape characters
 */

chars.ESC = {
  '?': '__UNESC_QMRK__',
  '@': '__UNESC_AMPE__',
  '!': '__UNESC_EXCL__',
  '+': '__UNESC_PLUS__',
  '*': '__UNESC_STAR__',
  ',': '__UNESC_COMMA__',
  '(': '__UNESC_LTPAREN__',
  ')': '__UNESC_RTPAREN__',
  '[': '__UNESC_LTBRACK__',
  ']': '__UNESC_RTBRACK__'
};

/**
 * Unescape characters
 */

chars.UNESC = unesc || (unesc = reverse(chars.ESC, '\\'));

chars.ESC_TEMP = {
  '?': '__TEMP_QMRK__',
  '@': '__TEMP_AMPE__',
  '!': '__TEMP_EXCL__',
  '*': '__TEMP_STAR__',
  '+': '__TEMP_PLUS__',
  ',': '__TEMP_COMMA__',
  '(': '__TEMP_LTPAREN__',
  ')': '__TEMP_RTPAREN__',
  '[': '__TEMP_LTBRACK__',
  ']': '__TEMP_RTBRACK__'
};

chars.TEMP = temp || (temp = reverse(chars.ESC_TEMP));

module.exports = chars;

},{}],39:[function(require,module,exports){
/*!
 * micromatch <https://github.com/jonschlinkert/micromatch>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var utils = require('./utils');
var Glob = require('./glob');

/**
 * Expose `expand`
 */

module.exports = expand;

/**
 * Expand a glob pattern to resolve braces and
 * similar patterns before converting to regex.
 *
 * @param  {String|Array} `pattern`
 * @param  {Array} `files`
 * @param  {Options} `opts`
 * @return {Array}
 */

function expand(pattern, options) {
  if (typeof pattern !== 'string') {
    throw new TypeError('micromatch.expand(): argument should be a string.');
  }

  var glob = new Glob(pattern, options || {});
  var opts = glob.options;

  if (!utils.isGlob(pattern)) {
    glob.pattern = glob.pattern.replace(/([\/.])/g, '\\$1');
    return glob;
  }

  glob.pattern = glob.pattern.replace(/(\+)(?!\()/g, '\\$1');
  glob.pattern = glob.pattern.split('$').join('\\$');

  if (typeof opts.braces !== 'boolean' && typeof opts.nobraces !== 'boolean') {
    opts.braces = true;
  }

  if (glob.pattern === '.*') {
    return {
      pattern: '\\.' + star,
      tokens: tok,
      options: opts
    };
  }

  if (glob.pattern === '*') {
    return {
      pattern: oneStar(opts.dot),
      tokens: tok,
      options: opts
    };
  }

  // parse the glob pattern into tokens
  glob.parse();
  var tok = glob.tokens;
  tok.is.negated = opts.negated;

  // dotfile handling
  if ((opts.dotfiles === true || tok.is.dotfile) && opts.dot !== false) {
    opts.dotfiles = true;
    opts.dot = true;
  }

  if ((opts.dotdirs === true || tok.is.dotdir) && opts.dot !== false) {
    opts.dotdirs = true;
    opts.dot = true;
  }

  // check for braces with a dotfile pattern
  if (/[{,]\./.test(glob.pattern)) {
    opts.makeRe = false;
    opts.dot = true;
  }

  if (opts.nonegate !== true) {
    opts.negated = glob.negated;
  }

  // if the leading character is a dot or a slash, escape it
  if (glob.pattern.charAt(0) === '.' && glob.pattern.charAt(1) !== '/') {
    glob.pattern = '\\' + glob.pattern;
  }

  /**
   * Extended globs
   */

  // expand braces, e.g `{1..5}`
  glob.track('before braces');
  if (tok.is.braces) {
    glob.braces();
  }
  glob.track('after braces');

  // expand extglobs, e.g `foo/!(a|b)`
  glob.track('before extglob');
  if (tok.is.extglob) {
    glob.extglob();
  }
  glob.track('after extglob');

  // expand brackets, e.g `[[:alpha:]]`
  glob.track('before brackets');
  if (tok.is.brackets) {
    glob.brackets();
  }
  glob.track('after brackets');

  // special patterns
  glob._replace('[!', '[^');
  glob._replace('(?', '(%~');
  glob._replace(/\[\]/, '\\[\\]');
  glob._replace('/[', '/' + (opts.dot ? dotfiles : nodot) + '[', true);
  glob._replace('/?', '/' + (opts.dot ? dotfiles : nodot) + '[^/]', true);
  glob._replace('/.', '/(?=.)\\.', true);

  // windows drives
  glob._replace(/^(\w):([\\\/]+?)/gi, '(?=.)$1:$2', true);

  // negate slashes in exclusion ranges
  if (glob.pattern.indexOf('[^') !== -1) {
    glob.pattern = negateSlash(glob.pattern);
  }

  if (opts.globstar !== false && glob.pattern === '**') {
    glob.pattern = globstar(opts.dot);

  } else {
    glob.pattern = balance(glob.pattern, '[', ']');
    glob.escape(glob.pattern);

    // if the pattern has `**`
    if (tok.is.globstar) {
      glob.pattern = collapse(glob.pattern, '/**');
      glob.pattern = collapse(glob.pattern, '**/');
      glob._replace('/**/', '(?:/' + globstar(opts.dot) + '/|/)', true);
      glob._replace(/\*{2,}/g, '**');

      // 'foo/*'
      glob._replace(/(\w+)\*(?!\/)/g, '$1[^/]*?', true);
      glob._replace(/\*\*\/\*(\w)/g, globstar(opts.dot) + '\\/' + (opts.dot ? dotfiles : nodot) + '[^/]*?$1', true);

      if (opts.dot !== true) {
        glob._replace(/\*\*\/(.)/g, '(?:**\\/|)$1');
      }

      // 'foo/**' or '{**,*}', but not 'foo**'
      if (tok.path.dirname !== '' || /,\*\*|\*\*,/.test(glob.orig)) {
        glob._replace('**', globstar(opts.dot), true);
      }
    }

    // ends with /*
    glob._replace(/\/\*$/, '\\/' + oneStar(opts.dot), true);
    // ends with *, no slashes
    glob._replace(/(?!\/)\*$/, star, true);
    // has 'n*.' (partial wildcard w/ file extension)
    glob._replace(/([^\/]+)\*/, '$1' + oneStar(true), true);
    // has '*'
    glob._replace('*', oneStar(opts.dot), true);
    glob._replace('?.', '?\\.', true);
    glob._replace('?:', '?:', true);

    glob._replace(/\?+/g, function(match) {
      var len = match.length;
      if (len === 1) {
        return qmark;
      }
      return qmark + '{' + len + '}';
    });

    // escape '.abc' => '\\.abc'
    glob._replace(/\.([*\w]+)/g, '\\.$1');
    // fix '[^\\\\/]'
    glob._replace(/\[\^[\\\/]+\]/g, qmark);
    // '///' => '\/'
    glob._replace(/\/+/g, '\\/');
    // '\\\\\\' => '\\'
    glob._replace(/\\{2,}/g, '\\');
  }

  // unescape previously escaped patterns
  glob.unescape(glob.pattern);
  glob._replace('__UNESC_STAR__', '*');

  // escape dots that follow qmarks
  glob._replace('?.', '?\\.');

  // remove unnecessary slashes in character classes
  glob._replace('[^\\/]', qmark);

  if (glob.pattern.length > 1) {
    if (/^[\[?*]/.test(glob.pattern)) {
      // only prepend the string if we don't want to match dotfiles
      glob.pattern = (opts.dot ? dotfiles : nodot) + glob.pattern;
    }
  }

  return glob;
}

/**
 * Collapse repeated character sequences.
 *
 * ```js
 * collapse('a/../../../b', '../');
 * //=> 'a/../b'
 * ```
 *
 * @param  {String} `str`
 * @param  {String} `ch` Character sequence to collapse
 * @return {String}
 */

function collapse(str, ch) {
  var res = str.split(ch);
  var isFirst = res[0] === '';
  var isLast = res[res.length - 1] === '';
  res = res.filter(Boolean);
  if (isFirst) res.unshift('');
  if (isLast) res.push('');
  return res.join(ch);
}

/**
 * Negate slashes in exclusion ranges, per glob spec:
 *
 * ```js
 * negateSlash('[^foo]');
 * //=> '[^\\/foo]'
 * ```
 *
 * @param  {String} `str` glob pattern
 * @return {String}
 */

function negateSlash(str) {
  return str.replace(/\[\^([^\]]*?)\]/g, function(match, inner) {
    if (inner.indexOf('/') === -1) {
      inner = '\\/' + inner;
    }
    return '[^' + inner + ']';
  });
}

/**
 * Escape imbalanced braces/bracket. This is a very
 * basic, naive implementation that only does enough
 * to serve the purpose.
 */

function balance(str, a, b) {
  var aarr = str.split(a);
  var alen = aarr.join('').length;
  var blen = str.split(b).join('').length;

  if (alen !== blen) {
    str = aarr.join('\\' + a);
    return str.split(b).join('\\' + b);
  }
  return str;
}

/**
 * Special patterns to be converted to regex.
 * Heuristics are used to simplify patterns
 * and speed up processing.
 */

/* eslint no-multi-spaces: 0 */
var qmark       = '[^/]';
var star        = qmark + '*?';
var nodot       = '(?!\\.)(?=.)';
var dotfileGlob = '(?:\\/|^)\\.{1,2}($|\\/)';
var dotfiles    = '(?!' + dotfileGlob + ')(?=.)';
var twoStarDot  = '(?:(?!' + dotfileGlob + ').)*?';

/**
 * Create a regex for `*`.
 *
 * If `dot` is true, or the pattern does not begin with
 * a leading star, then return the simpler regex.
 */

function oneStar(dotfile) {
  return dotfile ? '(?!' + dotfileGlob + ')(?=.)' + star : (nodot + star);
}

function globstar(dotfile) {
  if (dotfile) { return twoStarDot; }
  return '(?:(?!(?:\\/|^)\\.).)*?';
}

},{"./glob":40,"./utils":41}],40:[function(require,module,exports){
'use strict';

var chars = require('./chars');
var utils = require('./utils');

/**
 * Expose `Glob`
 */

var Glob = module.exports = function Glob(pattern, options) {
  if (!(this instanceof Glob)) {
    return new Glob(pattern, options);
  }
  this.options = options || {};
  this.pattern = pattern;
  this.history = [];
  this.tokens = {};
  this.init(pattern);
};

/**
 * Initialize defaults
 */

Glob.prototype.init = function(pattern) {
  this.orig = pattern;
  this.negated = this.isNegated();
  this.options.track = this.options.track || false;
  this.options.makeRe = true;
};

/**
 * Push a change into `glob.history`. Useful
 * for debugging.
 */

Glob.prototype.track = function(msg) {
  if (this.options.track) {
    this.history.push({msg: msg, pattern: this.pattern});
  }
};

/**
 * Return true if `glob.pattern` was negated
 * with `!`, also remove the `!` from the pattern.
 *
 * @return {Boolean}
 */

Glob.prototype.isNegated = function() {
  if (this.pattern.charCodeAt(0) === 33 /* '!' */) {
    this.pattern = this.pattern.slice(1);
    return true;
  }
  return false;
};

/**
 * Expand braces in the given glob pattern.
 *
 * We only need to use the [braces] lib when
 * patterns are nested.
 */

Glob.prototype.braces = function() {
  if (this.options.nobraces !== true && this.options.nobrace !== true) {
    // naive/fast check for imbalanced characters
    var a = this.pattern.match(/[\{\(\[]/g);
    var b = this.pattern.match(/[\}\)\]]/g);

    // if imbalanced, don't optimize the pattern
    if (a && b && (a.length !== b.length)) {
      this.options.makeRe = false;
    }

    // expand brace patterns and join the resulting array
    var expanded = utils.braces(this.pattern, this.options);
    this.pattern = expanded.join('|');
  }
};

/**
 * Expand bracket expressions in `glob.pattern`
 */

Glob.prototype.brackets = function() {
  if (this.options.nobrackets !== true) {
    this.pattern = utils.brackets(this.pattern);
  }
};

/**
 * Expand bracket expressions in `glob.pattern`
 */

Glob.prototype.extglob = function() {
  if (this.options.noextglob === true) return;

  if (utils.isExtglob(this.pattern)) {
    this.pattern = utils.extglob(this.pattern, {escape: true});
  }
};

/**
 * Parse the given pattern
 */

Glob.prototype.parse = function(pattern) {
  this.tokens = utils.parseGlob(pattern || this.pattern, true);
  return this.tokens;
};

/**
 * Replace `a` with `b`. Also tracks the change before and
 * after each replacement. This is disabled by default, but
 * can be enabled by setting `options.track` to true.
 *
 * Also, when the pattern is a string, `.split()` is used,
 * because it's much faster than replace.
 *
 * @param  {RegExp|String} `a`
 * @param  {String} `b`
 * @param  {Boolean} `escape` When `true`, escapes `*` and `?` in the replacement.
 * @return {String}
 */

Glob.prototype._replace = function(a, b, escape) {
  this.track('before (find): "' + a + '" (replace with): "' + b + '"');
  if (escape) b = esc(b);
  if (a && b && typeof a === 'string') {
    this.pattern = this.pattern.split(a).join(b);
  } else {
    this.pattern = this.pattern.replace(a, b);
  }
  this.track('after');
};

/**
 * Escape special characters in the given string.
 *
 * @param  {String} `str` Glob pattern
 * @return {String}
 */

Glob.prototype.escape = function(str) {
  this.track('before escape: ');
  var re = /["\\](['"]?[^"'\\]['"]?)/g;

  this.pattern = str.replace(re, function($0, $1) {
    var o = chars.ESC;
    var ch = o && o[$1];
    if (ch) {
      return ch;
    }
    if (/[a-z]/i.test($0)) {
      return $0.split('\\').join('');
    }
    return $0;
  });

  this.track('after escape: ');
};

/**
 * Unescape special characters in the given string.
 *
 * @param  {String} `str`
 * @return {String}
 */

Glob.prototype.unescape = function(str) {
  var re = /__([A-Z]+)_([A-Z]+)__/g;
  this.pattern = str.replace(re, function($0, $1) {
    return chars[$1][$0];
  });
  this.pattern = unesc(this.pattern);
};

/**
 * Escape/unescape utils
 */

function esc(str) {
  str = str.split('?').join('%~');
  str = str.split('*').join('%%');
  return str;
}

function unesc(str) {
  str = str.split('%~').join('?');
  str = str.split('%%').join('*');
  return str;
}

},{"./chars":38,"./utils":41}],41:[function(require,module,exports){
(function (process){
'use strict';

var win32 = process && process.platform === 'win32';
var path = require('path');
var fileRe = require('filename-regex');
var utils = module.exports;

/**
 * Module dependencies
 */

utils.diff = require('arr-diff');
utils.unique = require('array-unique');
utils.braces = require('braces');
utils.brackets = require('expand-brackets');
utils.extglob = require('extglob');
utils.isExtglob = require('is-extglob');
utils.isGlob = require('is-glob');
utils.typeOf = require('kind-of');
utils.normalize = require('normalize-path');
utils.omit = require('object.omit');
utils.parseGlob = require('parse-glob');
utils.cache = require('regex-cache');

/**
 * Get the filename of a filepath
 *
 * @param {String} `string`
 * @return {String}
 */

utils.filename = function filename(fp) {
  var seg = fp.match(fileRe());
  return seg && seg[0];
};

/**
 * Returns a function that returns true if the given
 * pattern is the same as a given `filepath`
 *
 * @param {String} `pattern`
 * @return {Function}
 */

utils.isPath = function isPath(pattern, opts) {
  opts = opts || {};
  return function(fp) {
    var unixified = utils.unixify(fp, opts);
    if(opts.nocase){
      return pattern.toLowerCase() === unixified.toLowerCase();
    }
    return pattern === unixified;
  };
};

/**
 * Returns a function that returns true if the given
 * pattern contains a `filepath`
 *
 * @param {String} `pattern`
 * @return {Function}
 */

utils.hasPath = function hasPath(pattern, opts) {
  return function(fp) {
    return utils.unixify(pattern, opts).indexOf(fp) !== -1;
  };
};

/**
 * Returns a function that returns true if the given
 * pattern matches or contains a `filepath`
 *
 * @param {String} `pattern`
 * @return {Function}
 */

utils.matchPath = function matchPath(pattern, opts) {
  var fn = (opts && opts.contains)
    ? utils.hasPath(pattern, opts)
    : utils.isPath(pattern, opts);
  return fn;
};

/**
 * Returns a function that returns true if the given
 * regex matches the `filename` of a file path.
 *
 * @param {RegExp} `re`
 * @return {Boolean}
 */

utils.hasFilename = function hasFilename(re) {
  return function(fp) {
    var name = utils.filename(fp);
    return name && re.test(name);
  };
};

/**
 * Coerce `val` to an array
 *
 * @param  {*} val
 * @return {Array}
 */

utils.arrayify = function arrayify(val) {
  return !Array.isArray(val)
    ? [val]
    : val;
};

/**
 * Normalize all slashes in a file path or glob pattern to
 * forward slashes.
 */

utils.unixify = function unixify(fp, opts) {
  if (opts && opts.unixify === false) return fp;
  if (opts && opts.unixify === true || win32 || path.sep === '\\') {
    return utils.normalize(fp, false);
  }
  if (opts && opts.unescape === true) {
    return fp ? fp.toString().replace(/\\(\w)/g, '$1') : '';
  }
  return fp;
};

/**
 * Escape/unescape utils
 */

utils.escapePath = function escapePath(fp) {
  return fp.replace(/[\\.]/g, '\\$&');
};

utils.unescapeGlob = function unescapeGlob(fp) {
  return fp.replace(/[\\"']/g, '');
};

utils.escapeRe = function escapeRe(str) {
  return str.replace(/[-[\\$*+?.#^\s{}(|)\]]/g, '\\$&');
};

/**
 * Expose `utils`
 */

module.exports = utils;

}).call(this,require('_process'))
},{"_process":82,"arr-diff":2,"array-unique":4,"braces":8,"expand-brackets":11,"extglob":13,"filename-regex":14,"is-extglob":28,"is-glob":29,"kind-of":35,"normalize-path":44,"object.omit":46,"parse-glob":51,"path":undefined,"regex-cache":63}],42:[function(require,module,exports){
//! moment.js
//! version : 2.18.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, (function () { 'use strict';

var hookCallback;

function hooks () {
    return hookCallback.apply(null, arguments);
}

// This is done to register the method called with moment()
// without creating circular dependencies.
function setHookCallback (callback) {
    hookCallback = callback;
}

function isArray(input) {
    return input instanceof Array || Object.prototype.toString.call(input) === '[object Array]';
}

function isObject(input) {
    // IE8 will treat undefined and null as object if it wasn't for
    // input != null
    return input != null && Object.prototype.toString.call(input) === '[object Object]';
}

function isObjectEmpty(obj) {
    var k;
    for (k in obj) {
        // even if its not own property I'd still call it non-empty
        return false;
    }
    return true;
}

function isUndefined(input) {
    return input === void 0;
}

function isNumber(input) {
    return typeof input === 'number' || Object.prototype.toString.call(input) === '[object Number]';
}

function isDate(input) {
    return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
}

function map(arr, fn) {
    var res = [], i;
    for (i = 0; i < arr.length; ++i) {
        res.push(fn(arr[i], i));
    }
    return res;
}

function hasOwnProp(a, b) {
    return Object.prototype.hasOwnProperty.call(a, b);
}

function extend(a, b) {
    for (var i in b) {
        if (hasOwnProp(b, i)) {
            a[i] = b[i];
        }
    }

    if (hasOwnProp(b, 'toString')) {
        a.toString = b.toString;
    }

    if (hasOwnProp(b, 'valueOf')) {
        a.valueOf = b.valueOf;
    }

    return a;
}

function createUTC (input, format, locale, strict) {
    return createLocalOrUTC(input, format, locale, strict, true).utc();
}

function defaultParsingFlags() {
    // We need to deep clone this object.
    return {
        empty           : false,
        unusedTokens    : [],
        unusedInput     : [],
        overflow        : -2,
        charsLeftOver   : 0,
        nullInput       : false,
        invalidMonth    : null,
        invalidFormat   : false,
        userInvalidated : false,
        iso             : false,
        parsedDateParts : [],
        meridiem        : null,
        rfc2822         : false,
        weekdayMismatch : false
    };
}

function getParsingFlags(m) {
    if (m._pf == null) {
        m._pf = defaultParsingFlags();
    }
    return m._pf;
}

var some;
if (Array.prototype.some) {
    some = Array.prototype.some;
} else {
    some = function (fun) {
        var t = Object(this);
        var len = t.length >>> 0;

        for (var i = 0; i < len; i++) {
            if (i in t && fun.call(this, t[i], i, t)) {
                return true;
            }
        }

        return false;
    };
}

var some$1 = some;

function isValid(m) {
    if (m._isValid == null) {
        var flags = getParsingFlags(m);
        var parsedParts = some$1.call(flags.parsedDateParts, function (i) {
            return i != null;
        });
        var isNowValid = !isNaN(m._d.getTime()) &&
            flags.overflow < 0 &&
            !flags.empty &&
            !flags.invalidMonth &&
            !flags.invalidWeekday &&
            !flags.nullInput &&
            !flags.invalidFormat &&
            !flags.userInvalidated &&
            (!flags.meridiem || (flags.meridiem && parsedParts));

        if (m._strict) {
            isNowValid = isNowValid &&
                flags.charsLeftOver === 0 &&
                flags.unusedTokens.length === 0 &&
                flags.bigHour === undefined;
        }

        if (Object.isFrozen == null || !Object.isFrozen(m)) {
            m._isValid = isNowValid;
        }
        else {
            return isNowValid;
        }
    }
    return m._isValid;
}

function createInvalid (flags) {
    var m = createUTC(NaN);
    if (flags != null) {
        extend(getParsingFlags(m), flags);
    }
    else {
        getParsingFlags(m).userInvalidated = true;
    }

    return m;
}

// Plugins that add properties should also add the key here (null value),
// so we can properly clone ourselves.
var momentProperties = hooks.momentProperties = [];

function copyConfig(to, from) {
    var i, prop, val;

    if (!isUndefined(from._isAMomentObject)) {
        to._isAMomentObject = from._isAMomentObject;
    }
    if (!isUndefined(from._i)) {
        to._i = from._i;
    }
    if (!isUndefined(from._f)) {
        to._f = from._f;
    }
    if (!isUndefined(from._l)) {
        to._l = from._l;
    }
    if (!isUndefined(from._strict)) {
        to._strict = from._strict;
    }
    if (!isUndefined(from._tzm)) {
        to._tzm = from._tzm;
    }
    if (!isUndefined(from._isUTC)) {
        to._isUTC = from._isUTC;
    }
    if (!isUndefined(from._offset)) {
        to._offset = from._offset;
    }
    if (!isUndefined(from._pf)) {
        to._pf = getParsingFlags(from);
    }
    if (!isUndefined(from._locale)) {
        to._locale = from._locale;
    }

    if (momentProperties.length > 0) {
        for (i = 0; i < momentProperties.length; i++) {
            prop = momentProperties[i];
            val = from[prop];
            if (!isUndefined(val)) {
                to[prop] = val;
            }
        }
    }

    return to;
}

var updateInProgress = false;

// Moment prototype object
function Moment(config) {
    copyConfig(this, config);
    this._d = new Date(config._d != null ? config._d.getTime() : NaN);
    if (!this.isValid()) {
        this._d = new Date(NaN);
    }
    // Prevent infinite loop in case updateOffset creates new moment
    // objects.
    if (updateInProgress === false) {
        updateInProgress = true;
        hooks.updateOffset(this);
        updateInProgress = false;
    }
}

function isMoment (obj) {
    return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
}

function absFloor (number) {
    if (number < 0) {
        // -0 -> 0
        return Math.ceil(number) || 0;
    } else {
        return Math.floor(number);
    }
}

function toInt(argumentForCoercion) {
    var coercedNumber = +argumentForCoercion,
        value = 0;

    if (coercedNumber !== 0 && isFinite(coercedNumber)) {
        value = absFloor(coercedNumber);
    }

    return value;
}

// compare two arrays, return the number of differences
function compareArrays(array1, array2, dontConvert) {
    var len = Math.min(array1.length, array2.length),
        lengthDiff = Math.abs(array1.length - array2.length),
        diffs = 0,
        i;
    for (i = 0; i < len; i++) {
        if ((dontConvert && array1[i] !== array2[i]) ||
            (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
            diffs++;
        }
    }
    return diffs + lengthDiff;
}

function warn(msg) {
    if (hooks.suppressDeprecationWarnings === false &&
            (typeof console !==  'undefined') && console.warn) {
        console.warn('Deprecation warning: ' + msg);
    }
}

function deprecate(msg, fn) {
    var firstTime = true;

    return extend(function () {
        if (hooks.deprecationHandler != null) {
            hooks.deprecationHandler(null, msg);
        }
        if (firstTime) {
            var args = [];
            var arg;
            for (var i = 0; i < arguments.length; i++) {
                arg = '';
                if (typeof arguments[i] === 'object') {
                    arg += '\n[' + i + '] ';
                    for (var key in arguments[0]) {
                        arg += key + ': ' + arguments[0][key] + ', ';
                    }
                    arg = arg.slice(0, -2); // Remove trailing comma and space
                } else {
                    arg = arguments[i];
                }
                args.push(arg);
            }
            warn(msg + '\nArguments: ' + Array.prototype.slice.call(args).join('') + '\n' + (new Error()).stack);
            firstTime = false;
        }
        return fn.apply(this, arguments);
    }, fn);
}

var deprecations = {};

function deprecateSimple(name, msg) {
    if (hooks.deprecationHandler != null) {
        hooks.deprecationHandler(name, msg);
    }
    if (!deprecations[name]) {
        warn(msg);
        deprecations[name] = true;
    }
}

hooks.suppressDeprecationWarnings = false;
hooks.deprecationHandler = null;

function isFunction(input) {
    return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
}

function set (config) {
    var prop, i;
    for (i in config) {
        prop = config[i];
        if (isFunction(prop)) {
            this[i] = prop;
        } else {
            this['_' + i] = prop;
        }
    }
    this._config = config;
    // Lenient ordinal parsing accepts just a number in addition to
    // number + (possibly) stuff coming from _dayOfMonthOrdinalParse.
    // TODO: Remove "ordinalParse" fallback in next major release.
    this._dayOfMonthOrdinalParseLenient = new RegExp(
        (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
            '|' + (/\d{1,2}/).source);
}

function mergeConfigs(parentConfig, childConfig) {
    var res = extend({}, parentConfig), prop;
    for (prop in childConfig) {
        if (hasOwnProp(childConfig, prop)) {
            if (isObject(parentConfig[prop]) && isObject(childConfig[prop])) {
                res[prop] = {};
                extend(res[prop], parentConfig[prop]);
                extend(res[prop], childConfig[prop]);
            } else if (childConfig[prop] != null) {
                res[prop] = childConfig[prop];
            } else {
                delete res[prop];
            }
        }
    }
    for (prop in parentConfig) {
        if (hasOwnProp(parentConfig, prop) &&
                !hasOwnProp(childConfig, prop) &&
                isObject(parentConfig[prop])) {
            // make sure changes to properties don't modify parent config
            res[prop] = extend({}, res[prop]);
        }
    }
    return res;
}

function Locale(config) {
    if (config != null) {
        this.set(config);
    }
}

var keys;

if (Object.keys) {
    keys = Object.keys;
} else {
    keys = function (obj) {
        var i, res = [];
        for (i in obj) {
            if (hasOwnProp(obj, i)) {
                res.push(i);
            }
        }
        return res;
    };
}

var keys$1 = keys;

var defaultCalendar = {
    sameDay : '[Today at] LT',
    nextDay : '[Tomorrow at] LT',
    nextWeek : 'dddd [at] LT',
    lastDay : '[Yesterday at] LT',
    lastWeek : '[Last] dddd [at] LT',
    sameElse : 'L'
};

function calendar (key, mom, now) {
    var output = this._calendar[key] || this._calendar['sameElse'];
    return isFunction(output) ? output.call(mom, now) : output;
}

var defaultLongDateFormat = {
    LTS  : 'h:mm:ss A',
    LT   : 'h:mm A',
    L    : 'MM/DD/YYYY',
    LL   : 'MMMM D, YYYY',
    LLL  : 'MMMM D, YYYY h:mm A',
    LLLL : 'dddd, MMMM D, YYYY h:mm A'
};

function longDateFormat (key) {
    var format = this._longDateFormat[key],
        formatUpper = this._longDateFormat[key.toUpperCase()];

    if (format || !formatUpper) {
        return format;
    }

    this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
        return val.slice(1);
    });

    return this._longDateFormat[key];
}

var defaultInvalidDate = 'Invalid date';

function invalidDate () {
    return this._invalidDate;
}

var defaultOrdinal = '%d';
var defaultDayOfMonthOrdinalParse = /\d{1,2}/;

function ordinal (number) {
    return this._ordinal.replace('%d', number);
}

var defaultRelativeTime = {
    future : 'in %s',
    past   : '%s ago',
    s  : 'a few seconds',
    ss : '%d seconds',
    m  : 'a minute',
    mm : '%d minutes',
    h  : 'an hour',
    hh : '%d hours',
    d  : 'a day',
    dd : '%d days',
    M  : 'a month',
    MM : '%d months',
    y  : 'a year',
    yy : '%d years'
};

function relativeTime (number, withoutSuffix, string, isFuture) {
    var output = this._relativeTime[string];
    return (isFunction(output)) ?
        output(number, withoutSuffix, string, isFuture) :
        output.replace(/%d/i, number);
}

function pastFuture (diff, output) {
    var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
    return isFunction(format) ? format(output) : format.replace(/%s/i, output);
}

var aliases = {};

function addUnitAlias (unit, shorthand) {
    var lowerCase = unit.toLowerCase();
    aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
}

function normalizeUnits(units) {
    return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
}

function normalizeObjectUnits(inputObject) {
    var normalizedInput = {},
        normalizedProp,
        prop;

    for (prop in inputObject) {
        if (hasOwnProp(inputObject, prop)) {
            normalizedProp = normalizeUnits(prop);
            if (normalizedProp) {
                normalizedInput[normalizedProp] = inputObject[prop];
            }
        }
    }

    return normalizedInput;
}

var priorities = {};

function addUnitPriority(unit, priority) {
    priorities[unit] = priority;
}

function getPrioritizedUnits(unitsObj) {
    var units = [];
    for (var u in unitsObj) {
        units.push({unit: u, priority: priorities[u]});
    }
    units.sort(function (a, b) {
        return a.priority - b.priority;
    });
    return units;
}

function makeGetSet (unit, keepTime) {
    return function (value) {
        if (value != null) {
            set$1(this, unit, value);
            hooks.updateOffset(this, keepTime);
            return this;
        } else {
            return get(this, unit);
        }
    };
}

function get (mom, unit) {
    return mom.isValid() ?
        mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
}

function set$1 (mom, unit, value) {
    if (mom.isValid()) {
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
    }
}

// MOMENTS

function stringGet (units) {
    units = normalizeUnits(units);
    if (isFunction(this[units])) {
        return this[units]();
    }
    return this;
}


function stringSet (units, value) {
    if (typeof units === 'object') {
        units = normalizeObjectUnits(units);
        var prioritized = getPrioritizedUnits(units);
        for (var i = 0; i < prioritized.length; i++) {
            this[prioritized[i].unit](units[prioritized[i].unit]);
        }
    } else {
        units = normalizeUnits(units);
        if (isFunction(this[units])) {
            return this[units](value);
        }
    }
    return this;
}

function zeroFill(number, targetLength, forceSign) {
    var absNumber = '' + Math.abs(number),
        zerosToFill = targetLength - absNumber.length,
        sign = number >= 0;
    return (sign ? (forceSign ? '+' : '') : '-') +
        Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
}

var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

var formatFunctions = {};

var formatTokenFunctions = {};

// token:    'M'
// padded:   ['MM', 2]
// ordinal:  'Mo'
// callback: function () { this.month() + 1 }
function addFormatToken (token, padded, ordinal, callback) {
    var func = callback;
    if (typeof callback === 'string') {
        func = function () {
            return this[callback]();
        };
    }
    if (token) {
        formatTokenFunctions[token] = func;
    }
    if (padded) {
        formatTokenFunctions[padded[0]] = function () {
            return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
        };
    }
    if (ordinal) {
        formatTokenFunctions[ordinal] = function () {
            return this.localeData().ordinal(func.apply(this, arguments), token);
        };
    }
}

function removeFormattingTokens(input) {
    if (input.match(/\[[\s\S]/)) {
        return input.replace(/^\[|\]$/g, '');
    }
    return input.replace(/\\/g, '');
}

function makeFormatFunction(format) {
    var array = format.match(formattingTokens), i, length;

    for (i = 0, length = array.length; i < length; i++) {
        if (formatTokenFunctions[array[i]]) {
            array[i] = formatTokenFunctions[array[i]];
        } else {
            array[i] = removeFormattingTokens(array[i]);
        }
    }

    return function (mom) {
        var output = '', i;
        for (i = 0; i < length; i++) {
            output += isFunction(array[i]) ? array[i].call(mom, format) : array[i];
        }
        return output;
    };
}

// format date using native date object
function formatMoment(m, format) {
    if (!m.isValid()) {
        return m.localeData().invalidDate();
    }

    format = expandFormat(format, m.localeData());
    formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

    return formatFunctions[format](m);
}

function expandFormat(format, locale) {
    var i = 5;

    function replaceLongDateFormatTokens(input) {
        return locale.longDateFormat(input) || input;
    }

    localFormattingTokens.lastIndex = 0;
    while (i >= 0 && localFormattingTokens.test(format)) {
        format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
        localFormattingTokens.lastIndex = 0;
        i -= 1;
    }

    return format;
}

var match1         = /\d/;            //       0 - 9
var match2         = /\d\d/;          //      00 - 99
var match3         = /\d{3}/;         //     000 - 999
var match4         = /\d{4}/;         //    0000 - 9999
var match6         = /[+-]?\d{6}/;    // -999999 - 999999
var match1to2      = /\d\d?/;         //       0 - 99
var match3to4      = /\d\d\d\d?/;     //     999 - 9999
var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
var match1to3      = /\d{1,3}/;       //       0 - 999
var match1to4      = /\d{1,4}/;       //       0 - 9999
var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

var matchUnsigned  = /\d+/;           //       0 - inf
var matchSigned    = /[+-]?\d+/;      //    -inf - inf

var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

// any word (or two) characters or numbers including two/three word month in arabic.
// includes scottish gaelic two word and hyphenated months
var matchWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i;


var regexes = {};

function addRegexToken (token, regex, strictRegex) {
    regexes[token] = isFunction(regex) ? regex : function (isStrict, localeData) {
        return (isStrict && strictRegex) ? strictRegex : regex;
    };
}

function getParseRegexForToken (token, config) {
    if (!hasOwnProp(regexes, token)) {
        return new RegExp(unescapeFormat(token));
    }

    return regexes[token](config._strict, config._locale);
}

// Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
function unescapeFormat(s) {
    return regexEscape(s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
        return p1 || p2 || p3 || p4;
    }));
}

function regexEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

var tokens = {};

function addParseToken (token, callback) {
    var i, func = callback;
    if (typeof token === 'string') {
        token = [token];
    }
    if (isNumber(callback)) {
        func = function (input, array) {
            array[callback] = toInt(input);
        };
    }
    for (i = 0; i < token.length; i++) {
        tokens[token[i]] = func;
    }
}

function addWeekParseToken (token, callback) {
    addParseToken(token, function (input, array, config, token) {
        config._w = config._w || {};
        callback(input, config._w, config, token);
    });
}

function addTimeToArrayFromToken(token, input, config) {
    if (input != null && hasOwnProp(tokens, token)) {
        tokens[token](input, config._a, config, token);
    }
}

var YEAR = 0;
var MONTH = 1;
var DATE = 2;
var HOUR = 3;
var MINUTE = 4;
var SECOND = 5;
var MILLISECOND = 6;
var WEEK = 7;
var WEEKDAY = 8;

var indexOf;

if (Array.prototype.indexOf) {
    indexOf = Array.prototype.indexOf;
} else {
    indexOf = function (o) {
        // I know
        var i;
        for (i = 0; i < this.length; ++i) {
            if (this[i] === o) {
                return i;
            }
        }
        return -1;
    };
}

var indexOf$1 = indexOf;

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// FORMATTING

addFormatToken('M', ['MM', 2], 'Mo', function () {
    return this.month() + 1;
});

addFormatToken('MMM', 0, 0, function (format) {
    return this.localeData().monthsShort(this, format);
});

addFormatToken('MMMM', 0, 0, function (format) {
    return this.localeData().months(this, format);
});

// ALIASES

addUnitAlias('month', 'M');

// PRIORITY

addUnitPriority('month', 8);

// PARSING

addRegexToken('M',    match1to2);
addRegexToken('MM',   match1to2, match2);
addRegexToken('MMM',  function (isStrict, locale) {
    return locale.monthsShortRegex(isStrict);
});
addRegexToken('MMMM', function (isStrict, locale) {
    return locale.monthsRegex(isStrict);
});

addParseToken(['M', 'MM'], function (input, array) {
    array[MONTH] = toInt(input) - 1;
});

addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
    var month = config._locale.monthsParse(input, token, config._strict);
    // if we didn't find a month name, mark the date as invalid.
    if (month != null) {
        array[MONTH] = month;
    } else {
        getParsingFlags(config).invalidMonth = input;
    }
});

// LOCALES

var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/;
var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
function localeMonths (m, format) {
    if (!m) {
        return isArray(this._months) ? this._months :
            this._months['standalone'];
    }
    return isArray(this._months) ? this._months[m.month()] :
        this._months[(this._months.isFormat || MONTHS_IN_FORMAT).test(format) ? 'format' : 'standalone'][m.month()];
}

var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
function localeMonthsShort (m, format) {
    if (!m) {
        return isArray(this._monthsShort) ? this._monthsShort :
            this._monthsShort['standalone'];
    }
    return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
        this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
}

function handleStrictParse(monthName, format, strict) {
    var i, ii, mom, llc = monthName.toLocaleLowerCase();
    if (!this._monthsParse) {
        // this is not used
        this._monthsParse = [];
        this._longMonthsParse = [];
        this._shortMonthsParse = [];
        for (i = 0; i < 12; ++i) {
            mom = createUTC([2000, i]);
            this._shortMonthsParse[i] = this.monthsShort(mom, '').toLocaleLowerCase();
            this._longMonthsParse[i] = this.months(mom, '').toLocaleLowerCase();
        }
    }

    if (strict) {
        if (format === 'MMM') {
            ii = indexOf$1.call(this._shortMonthsParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf$1.call(this._longMonthsParse, llc);
            return ii !== -1 ? ii : null;
        }
    } else {
        if (format === 'MMM') {
            ii = indexOf$1.call(this._shortMonthsParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._longMonthsParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf$1.call(this._longMonthsParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._shortMonthsParse, llc);
            return ii !== -1 ? ii : null;
        }
    }
}

function localeMonthsParse (monthName, format, strict) {
    var i, mom, regex;

    if (this._monthsParseExact) {
        return handleStrictParse.call(this, monthName, format, strict);
    }

    if (!this._monthsParse) {
        this._monthsParse = [];
        this._longMonthsParse = [];
        this._shortMonthsParse = [];
    }

    // TODO: add sorting
    // Sorting makes sure if one month (or abbr) is a prefix of another
    // see sorting in computeMonthsParse
    for (i = 0; i < 12; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, i]);
        if (strict && !this._longMonthsParse[i]) {
            this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
            this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
        }
        if (!strict && !this._monthsParse[i]) {
            regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
            this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
        }
        // test the regex
        if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
            return i;
        } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
            return i;
        } else if (!strict && this._monthsParse[i].test(monthName)) {
            return i;
        }
    }
}

// MOMENTS

function setMonth (mom, value) {
    var dayOfMonth;

    if (!mom.isValid()) {
        // No op
        return mom;
    }

    if (typeof value === 'string') {
        if (/^\d+$/.test(value)) {
            value = toInt(value);
        } else {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (!isNumber(value)) {
                return mom;
            }
        }
    }

    dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
    mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
    return mom;
}

function getSetMonth (value) {
    if (value != null) {
        setMonth(this, value);
        hooks.updateOffset(this, true);
        return this;
    } else {
        return get(this, 'Month');
    }
}

function getDaysInMonth () {
    return daysInMonth(this.year(), this.month());
}

var defaultMonthsShortRegex = matchWord;
function monthsShortRegex (isStrict) {
    if (this._monthsParseExact) {
        if (!hasOwnProp(this, '_monthsRegex')) {
            computeMonthsParse.call(this);
        }
        if (isStrict) {
            return this._monthsShortStrictRegex;
        } else {
            return this._monthsShortRegex;
        }
    } else {
        if (!hasOwnProp(this, '_monthsShortRegex')) {
            this._monthsShortRegex = defaultMonthsShortRegex;
        }
        return this._monthsShortStrictRegex && isStrict ?
            this._monthsShortStrictRegex : this._monthsShortRegex;
    }
}

var defaultMonthsRegex = matchWord;
function monthsRegex (isStrict) {
    if (this._monthsParseExact) {
        if (!hasOwnProp(this, '_monthsRegex')) {
            computeMonthsParse.call(this);
        }
        if (isStrict) {
            return this._monthsStrictRegex;
        } else {
            return this._monthsRegex;
        }
    } else {
        if (!hasOwnProp(this, '_monthsRegex')) {
            this._monthsRegex = defaultMonthsRegex;
        }
        return this._monthsStrictRegex && isStrict ?
            this._monthsStrictRegex : this._monthsRegex;
    }
}

function computeMonthsParse () {
    function cmpLenRev(a, b) {
        return b.length - a.length;
    }

    var shortPieces = [], longPieces = [], mixedPieces = [],
        i, mom;
    for (i = 0; i < 12; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, i]);
        shortPieces.push(this.monthsShort(mom, ''));
        longPieces.push(this.months(mom, ''));
        mixedPieces.push(this.months(mom, ''));
        mixedPieces.push(this.monthsShort(mom, ''));
    }
    // Sorting makes sure if one month (or abbr) is a prefix of another it
    // will match the longer piece.
    shortPieces.sort(cmpLenRev);
    longPieces.sort(cmpLenRev);
    mixedPieces.sort(cmpLenRev);
    for (i = 0; i < 12; i++) {
        shortPieces[i] = regexEscape(shortPieces[i]);
        longPieces[i] = regexEscape(longPieces[i]);
    }
    for (i = 0; i < 24; i++) {
        mixedPieces[i] = regexEscape(mixedPieces[i]);
    }

    this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
    this._monthsShortRegex = this._monthsRegex;
    this._monthsStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
    this._monthsShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
}

// FORMATTING

addFormatToken('Y', 0, 0, function () {
    var y = this.year();
    return y <= 9999 ? '' + y : '+' + y;
});

addFormatToken(0, ['YY', 2], 0, function () {
    return this.year() % 100;
});

addFormatToken(0, ['YYYY',   4],       0, 'year');
addFormatToken(0, ['YYYYY',  5],       0, 'year');
addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

// ALIASES

addUnitAlias('year', 'y');

// PRIORITIES

addUnitPriority('year', 1);

// PARSING

addRegexToken('Y',      matchSigned);
addRegexToken('YY',     match1to2, match2);
addRegexToken('YYYY',   match1to4, match4);
addRegexToken('YYYYY',  match1to6, match6);
addRegexToken('YYYYYY', match1to6, match6);

addParseToken(['YYYYY', 'YYYYYY'], YEAR);
addParseToken('YYYY', function (input, array) {
    array[YEAR] = input.length === 2 ? hooks.parseTwoDigitYear(input) : toInt(input);
});
addParseToken('YY', function (input, array) {
    array[YEAR] = hooks.parseTwoDigitYear(input);
});
addParseToken('Y', function (input, array) {
    array[YEAR] = parseInt(input, 10);
});

// HELPERS

function daysInYear(year) {
    return isLeapYear(year) ? 366 : 365;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// HOOKS

hooks.parseTwoDigitYear = function (input) {
    return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
};

// MOMENTS

var getSetYear = makeGetSet('FullYear', true);

function getIsLeapYear () {
    return isLeapYear(this.year());
}

function createDate (y, m, d, h, M, s, ms) {
    // can't just apply() to create a date:
    // https://stackoverflow.com/q/181348
    var date = new Date(y, m, d, h, M, s, ms);

    // the date constructor remaps years 0-99 to 1900-1999
    if (y < 100 && y >= 0 && isFinite(date.getFullYear())) {
        date.setFullYear(y);
    }
    return date;
}

function createUTCDate (y) {
    var date = new Date(Date.UTC.apply(null, arguments));

    // the Date.UTC function remaps years 0-99 to 1900-1999
    if (y < 100 && y >= 0 && isFinite(date.getUTCFullYear())) {
        date.setUTCFullYear(y);
    }
    return date;
}

// start-of-first-week - start-of-year
function firstWeekOffset(year, dow, doy) {
    var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
        fwd = 7 + dow - doy,
        // first-week day local weekday -- which local weekday is fwd
        fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

    return -fwdlw + fwd - 1;
}

// https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
    var localWeekday = (7 + weekday - dow) % 7,
        weekOffset = firstWeekOffset(year, dow, doy),
        dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
        resYear, resDayOfYear;

    if (dayOfYear <= 0) {
        resYear = year - 1;
        resDayOfYear = daysInYear(resYear) + dayOfYear;
    } else if (dayOfYear > daysInYear(year)) {
        resYear = year + 1;
        resDayOfYear = dayOfYear - daysInYear(year);
    } else {
        resYear = year;
        resDayOfYear = dayOfYear;
    }

    return {
        year: resYear,
        dayOfYear: resDayOfYear
    };
}

function weekOfYear(mom, dow, doy) {
    var weekOffset = firstWeekOffset(mom.year(), dow, doy),
        week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
        resWeek, resYear;

    if (week < 1) {
        resYear = mom.year() - 1;
        resWeek = week + weeksInYear(resYear, dow, doy);
    } else if (week > weeksInYear(mom.year(), dow, doy)) {
        resWeek = week - weeksInYear(mom.year(), dow, doy);
        resYear = mom.year() + 1;
    } else {
        resYear = mom.year();
        resWeek = week;
    }

    return {
        week: resWeek,
        year: resYear
    };
}

function weeksInYear(year, dow, doy) {
    var weekOffset = firstWeekOffset(year, dow, doy),
        weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
    return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
}

// FORMATTING

addFormatToken('w', ['ww', 2], 'wo', 'week');
addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

// ALIASES

addUnitAlias('week', 'w');
addUnitAlias('isoWeek', 'W');

// PRIORITIES

addUnitPriority('week', 5);
addUnitPriority('isoWeek', 5);

// PARSING

addRegexToken('w',  match1to2);
addRegexToken('ww', match1to2, match2);
addRegexToken('W',  match1to2);
addRegexToken('WW', match1to2, match2);

addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
    week[token.substr(0, 1)] = toInt(input);
});

// HELPERS

// LOCALES

function localeWeek (mom) {
    return weekOfYear(mom, this._week.dow, this._week.doy).week;
}

var defaultLocaleWeek = {
    dow : 0, // Sunday is the first day of the week.
    doy : 6  // The week that contains Jan 1st is the first week of the year.
};

function localeFirstDayOfWeek () {
    return this._week.dow;
}

function localeFirstDayOfYear () {
    return this._week.doy;
}

// MOMENTS

function getSetWeek (input) {
    var week = this.localeData().week(this);
    return input == null ? week : this.add((input - week) * 7, 'd');
}

function getSetISOWeek (input) {
    var week = weekOfYear(this, 1, 4).week;
    return input == null ? week : this.add((input - week) * 7, 'd');
}

// FORMATTING

addFormatToken('d', 0, 'do', 'day');

addFormatToken('dd', 0, 0, function (format) {
    return this.localeData().weekdaysMin(this, format);
});

addFormatToken('ddd', 0, 0, function (format) {
    return this.localeData().weekdaysShort(this, format);
});

addFormatToken('dddd', 0, 0, function (format) {
    return this.localeData().weekdays(this, format);
});

addFormatToken('e', 0, 0, 'weekday');
addFormatToken('E', 0, 0, 'isoWeekday');

// ALIASES

addUnitAlias('day', 'd');
addUnitAlias('weekday', 'e');
addUnitAlias('isoWeekday', 'E');

// PRIORITY
addUnitPriority('day', 11);
addUnitPriority('weekday', 11);
addUnitPriority('isoWeekday', 11);

// PARSING

addRegexToken('d',    match1to2);
addRegexToken('e',    match1to2);
addRegexToken('E',    match1to2);
addRegexToken('dd',   function (isStrict, locale) {
    return locale.weekdaysMinRegex(isStrict);
});
addRegexToken('ddd',   function (isStrict, locale) {
    return locale.weekdaysShortRegex(isStrict);
});
addRegexToken('dddd',   function (isStrict, locale) {
    return locale.weekdaysRegex(isStrict);
});

addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
    var weekday = config._locale.weekdaysParse(input, token, config._strict);
    // if we didn't get a weekday name, mark the date as invalid
    if (weekday != null) {
        week.d = weekday;
    } else {
        getParsingFlags(config).invalidWeekday = input;
    }
});

addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
    week[token] = toInt(input);
});

// HELPERS

function parseWeekday(input, locale) {
    if (typeof input !== 'string') {
        return input;
    }

    if (!isNaN(input)) {
        return parseInt(input, 10);
    }

    input = locale.weekdaysParse(input);
    if (typeof input === 'number') {
        return input;
    }

    return null;
}

function parseIsoWeekday(input, locale) {
    if (typeof input === 'string') {
        return locale.weekdaysParse(input) % 7 || 7;
    }
    return isNaN(input) ? null : input;
}

// LOCALES

var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
function localeWeekdays (m, format) {
    if (!m) {
        return isArray(this._weekdays) ? this._weekdays :
            this._weekdays['standalone'];
    }
    return isArray(this._weekdays) ? this._weekdays[m.day()] :
        this._weekdays[this._weekdays.isFormat.test(format) ? 'format' : 'standalone'][m.day()];
}

var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
function localeWeekdaysShort (m) {
    return (m) ? this._weekdaysShort[m.day()] : this._weekdaysShort;
}

var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
function localeWeekdaysMin (m) {
    return (m) ? this._weekdaysMin[m.day()] : this._weekdaysMin;
}

function handleStrictParse$1(weekdayName, format, strict) {
    var i, ii, mom, llc = weekdayName.toLocaleLowerCase();
    if (!this._weekdaysParse) {
        this._weekdaysParse = [];
        this._shortWeekdaysParse = [];
        this._minWeekdaysParse = [];

        for (i = 0; i < 7; ++i) {
            mom = createUTC([2000, 1]).day(i);
            this._minWeekdaysParse[i] = this.weekdaysMin(mom, '').toLocaleLowerCase();
            this._shortWeekdaysParse[i] = this.weekdaysShort(mom, '').toLocaleLowerCase();
            this._weekdaysParse[i] = this.weekdays(mom, '').toLocaleLowerCase();
        }
    }

    if (strict) {
        if (format === 'dddd') {
            ii = indexOf$1.call(this._weekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else if (format === 'ddd') {
            ii = indexOf$1.call(this._shortWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf$1.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        }
    } else {
        if (format === 'dddd') {
            ii = indexOf$1.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._shortWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else if (format === 'ddd') {
            ii = indexOf$1.call(this._shortWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._minWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        } else {
            ii = indexOf$1.call(this._minWeekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._weekdaysParse, llc);
            if (ii !== -1) {
                return ii;
            }
            ii = indexOf$1.call(this._shortWeekdaysParse, llc);
            return ii !== -1 ? ii : null;
        }
    }
}

function localeWeekdaysParse (weekdayName, format, strict) {
    var i, mom, regex;

    if (this._weekdaysParseExact) {
        return handleStrictParse$1.call(this, weekdayName, format, strict);
    }

    if (!this._weekdaysParse) {
        this._weekdaysParse = [];
        this._minWeekdaysParse = [];
        this._shortWeekdaysParse = [];
        this._fullWeekdaysParse = [];
    }

    for (i = 0; i < 7; i++) {
        // make the regex if we don't have it already

        mom = createUTC([2000, 1]).day(i);
        if (strict && !this._fullWeekdaysParse[i]) {
            this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\.?') + '$', 'i');
            this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\.?') + '$', 'i');
            this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\.?') + '$', 'i');
        }
        if (!this._weekdaysParse[i]) {
            regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
            this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
        }
        // test the regex
        if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
            return i;
        } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
            return i;
        }
    }
}

// MOMENTS

function getSetDayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
    if (input != null) {
        input = parseWeekday(input, this.localeData());
        return this.add(input - day, 'd');
    } else {
        return day;
    }
}

function getSetLocaleDayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
    return input == null ? weekday : this.add(input - weekday, 'd');
}

function getSetISODayOfWeek (input) {
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }

    // behaves the same as moment#day except
    // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
    // as a setter, sunday should belong to the previous week.

    if (input != null) {
        var weekday = parseIsoWeekday(input, this.localeData());
        return this.day(this.day() % 7 ? weekday : weekday - 7);
    } else {
        return this.day() || 7;
    }
}

var defaultWeekdaysRegex = matchWord;
function weekdaysRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysStrictRegex;
        } else {
            return this._weekdaysRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            this._weekdaysRegex = defaultWeekdaysRegex;
        }
        return this._weekdaysStrictRegex && isStrict ?
            this._weekdaysStrictRegex : this._weekdaysRegex;
    }
}

var defaultWeekdaysShortRegex = matchWord;
function weekdaysShortRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysShortStrictRegex;
        } else {
            return this._weekdaysShortRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysShortRegex')) {
            this._weekdaysShortRegex = defaultWeekdaysShortRegex;
        }
        return this._weekdaysShortStrictRegex && isStrict ?
            this._weekdaysShortStrictRegex : this._weekdaysShortRegex;
    }
}

var defaultWeekdaysMinRegex = matchWord;
function weekdaysMinRegex (isStrict) {
    if (this._weekdaysParseExact) {
        if (!hasOwnProp(this, '_weekdaysRegex')) {
            computeWeekdaysParse.call(this);
        }
        if (isStrict) {
            return this._weekdaysMinStrictRegex;
        } else {
            return this._weekdaysMinRegex;
        }
    } else {
        if (!hasOwnProp(this, '_weekdaysMinRegex')) {
            this._weekdaysMinRegex = defaultWeekdaysMinRegex;
        }
        return this._weekdaysMinStrictRegex && isStrict ?
            this._weekdaysMinStrictRegex : this._weekdaysMinRegex;
    }
}


function computeWeekdaysParse () {
    function cmpLenRev(a, b) {
        return b.length - a.length;
    }

    var minPieces = [], shortPieces = [], longPieces = [], mixedPieces = [],
        i, mom, minp, shortp, longp;
    for (i = 0; i < 7; i++) {
        // make the regex if we don't have it already
        mom = createUTC([2000, 1]).day(i);
        minp = this.weekdaysMin(mom, '');
        shortp = this.weekdaysShort(mom, '');
        longp = this.weekdays(mom, '');
        minPieces.push(minp);
        shortPieces.push(shortp);
        longPieces.push(longp);
        mixedPieces.push(minp);
        mixedPieces.push(shortp);
        mixedPieces.push(longp);
    }
    // Sorting makes sure if one weekday (or abbr) is a prefix of another it
    // will match the longer piece.
    minPieces.sort(cmpLenRev);
    shortPieces.sort(cmpLenRev);
    longPieces.sort(cmpLenRev);
    mixedPieces.sort(cmpLenRev);
    for (i = 0; i < 7; i++) {
        shortPieces[i] = regexEscape(shortPieces[i]);
        longPieces[i] = regexEscape(longPieces[i]);
        mixedPieces[i] = regexEscape(mixedPieces[i]);
    }

    this._weekdaysRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
    this._weekdaysShortRegex = this._weekdaysRegex;
    this._weekdaysMinRegex = this._weekdaysRegex;

    this._weekdaysStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
    this._weekdaysShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
    this._weekdaysMinStrictRegex = new RegExp('^(' + minPieces.join('|') + ')', 'i');
}

// FORMATTING

function hFormat() {
    return this.hours() % 12 || 12;
}

function kFormat() {
    return this.hours() || 24;
}

addFormatToken('H', ['HH', 2], 0, 'hour');
addFormatToken('h', ['hh', 2], 0, hFormat);
addFormatToken('k', ['kk', 2], 0, kFormat);

addFormatToken('hmm', 0, 0, function () {
    return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
});

addFormatToken('hmmss', 0, 0, function () {
    return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
        zeroFill(this.seconds(), 2);
});

addFormatToken('Hmm', 0, 0, function () {
    return '' + this.hours() + zeroFill(this.minutes(), 2);
});

addFormatToken('Hmmss', 0, 0, function () {
    return '' + this.hours() + zeroFill(this.minutes(), 2) +
        zeroFill(this.seconds(), 2);
});

function meridiem (token, lowercase) {
    addFormatToken(token, 0, 0, function () {
        return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
    });
}

meridiem('a', true);
meridiem('A', false);

// ALIASES

addUnitAlias('hour', 'h');

// PRIORITY
addUnitPriority('hour', 13);

// PARSING

function matchMeridiem (isStrict, locale) {
    return locale._meridiemParse;
}

addRegexToken('a',  matchMeridiem);
addRegexToken('A',  matchMeridiem);
addRegexToken('H',  match1to2);
addRegexToken('h',  match1to2);
addRegexToken('k',  match1to2);
addRegexToken('HH', match1to2, match2);
addRegexToken('hh', match1to2, match2);
addRegexToken('kk', match1to2, match2);

addRegexToken('hmm', match3to4);
addRegexToken('hmmss', match5to6);
addRegexToken('Hmm', match3to4);
addRegexToken('Hmmss', match5to6);

addParseToken(['H', 'HH'], HOUR);
addParseToken(['k', 'kk'], function (input, array, config) {
    var kInput = toInt(input);
    array[HOUR] = kInput === 24 ? 0 : kInput;
});
addParseToken(['a', 'A'], function (input, array, config) {
    config._isPm = config._locale.isPM(input);
    config._meridiem = input;
});
addParseToken(['h', 'hh'], function (input, array, config) {
    array[HOUR] = toInt(input);
    getParsingFlags(config).bigHour = true;
});
addParseToken('hmm', function (input, array, config) {
    var pos = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos));
    array[MINUTE] = toInt(input.substr(pos));
    getParsingFlags(config).bigHour = true;
});
addParseToken('hmmss', function (input, array, config) {
    var pos1 = input.length - 4;
    var pos2 = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos1));
    array[MINUTE] = toInt(input.substr(pos1, 2));
    array[SECOND] = toInt(input.substr(pos2));
    getParsingFlags(config).bigHour = true;
});
addParseToken('Hmm', function (input, array, config) {
    var pos = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos));
    array[MINUTE] = toInt(input.substr(pos));
});
addParseToken('Hmmss', function (input, array, config) {
    var pos1 = input.length - 4;
    var pos2 = input.length - 2;
    array[HOUR] = toInt(input.substr(0, pos1));
    array[MINUTE] = toInt(input.substr(pos1, 2));
    array[SECOND] = toInt(input.substr(pos2));
});

// LOCALES

function localeIsPM (input) {
    // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
    // Using charAt should be more compatible.
    return ((input + '').toLowerCase().charAt(0) === 'p');
}

var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
function localeMeridiem (hours, minutes, isLower) {
    if (hours > 11) {
        return isLower ? 'pm' : 'PM';
    } else {
        return isLower ? 'am' : 'AM';
    }
}


// MOMENTS

// Setting the hour should keep the time, because the user explicitly
// specified which hour he wants. So trying to maintain the same hour (in
// a new timezone) makes sense. Adding/subtracting hours does not follow
// this rule.
var getSetHour = makeGetSet('Hours', true);

// months
// week
// weekdays
// meridiem
var baseConfig = {
    calendar: defaultCalendar,
    longDateFormat: defaultLongDateFormat,
    invalidDate: defaultInvalidDate,
    ordinal: defaultOrdinal,
    dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
    relativeTime: defaultRelativeTime,

    months: defaultLocaleMonths,
    monthsShort: defaultLocaleMonthsShort,

    week: defaultLocaleWeek,

    weekdays: defaultLocaleWeekdays,
    weekdaysMin: defaultLocaleWeekdaysMin,
    weekdaysShort: defaultLocaleWeekdaysShort,

    meridiemParse: defaultLocaleMeridiemParse
};

// internal storage for locale config files
var locales = {};
var localeFamilies = {};
var globalLocale;

function normalizeLocale(key) {
    return key ? key.toLowerCase().replace('_', '-') : key;
}

// pick the locale from the array
// try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
// substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
function chooseLocale(names) {
    var i = 0, j, next, locale, split;

    while (i < names.length) {
        split = normalizeLocale(names[i]).split('-');
        j = split.length;
        next = normalizeLocale(names[i + 1]);
        next = next ? next.split('-') : null;
        while (j > 0) {
            locale = loadLocale(split.slice(0, j).join('-'));
            if (locale) {
                return locale;
            }
            if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                //the next array item is better than a shallower substring of this one
                break;
            }
            j--;
        }
        i++;
    }
    return null;
}

function loadLocale(name) {
    var oldLocale = null;
    // TODO: Find a better way to register and load all the locales in Node
    if (!locales[name] && (typeof module !== 'undefined') &&
            module && module.exports) {
        try {
            oldLocale = globalLocale._abbr;
            require('./locale/' + name);
            // because defineLocale currently also sets the global locale, we
            // want to undo that for lazy loaded locales
            getSetGlobalLocale(oldLocale);
        } catch (e) { }
    }
    return locales[name];
}

// This function will load locale and then set the global locale.  If
// no arguments are passed in, it will simply return the current global
// locale key.
function getSetGlobalLocale (key, values) {
    var data;
    if (key) {
        if (isUndefined(values)) {
            data = getLocale(key);
        }
        else {
            data = defineLocale(key, values);
        }

        if (data) {
            // moment.duration._locale = moment._locale = data;
            globalLocale = data;
        }
    }

    return globalLocale._abbr;
}

function defineLocale (name, config) {
    if (config !== null) {
        var parentConfig = baseConfig;
        config.abbr = name;
        if (locales[name] != null) {
            deprecateSimple('defineLocaleOverride',
                    'use moment.updateLocale(localeName, config) to change ' +
                    'an existing locale. moment.defineLocale(localeName, ' +
                    'config) should only be used for creating a new locale ' +
                    'See http://momentjs.com/guides/#/warnings/define-locale/ for more info.');
            parentConfig = locales[name]._config;
        } else if (config.parentLocale != null) {
            if (locales[config.parentLocale] != null) {
                parentConfig = locales[config.parentLocale]._config;
            } else {
                if (!localeFamilies[config.parentLocale]) {
                    localeFamilies[config.parentLocale] = [];
                }
                localeFamilies[config.parentLocale].push({
                    name: name,
                    config: config
                });
                return null;
            }
        }
        locales[name] = new Locale(mergeConfigs(parentConfig, config));

        if (localeFamilies[name]) {
            localeFamilies[name].forEach(function (x) {
                defineLocale(x.name, x.config);
            });
        }

        // backwards compat for now: also set the locale
        // make sure we set the locale AFTER all child locales have been
        // created, so we won't end up with the child locale set.
        getSetGlobalLocale(name);


        return locales[name];
    } else {
        // useful for testing
        delete locales[name];
        return null;
    }
}

function updateLocale(name, config) {
    if (config != null) {
        var locale, parentConfig = baseConfig;
        // MERGE
        if (locales[name] != null) {
            parentConfig = locales[name]._config;
        }
        config = mergeConfigs(parentConfig, config);
        locale = new Locale(config);
        locale.parentLocale = locales[name];
        locales[name] = locale;

        // backwards compat for now: also set the locale
        getSetGlobalLocale(name);
    } else {
        // pass null for config to unupdate, useful for tests
        if (locales[name] != null) {
            if (locales[name].parentLocale != null) {
                locales[name] = locales[name].parentLocale;
            } else if (locales[name] != null) {
                delete locales[name];
            }
        }
    }
    return locales[name];
}

// returns locale data
function getLocale (key) {
    var locale;

    if (key && key._locale && key._locale._abbr) {
        key = key._locale._abbr;
    }

    if (!key) {
        return globalLocale;
    }

    if (!isArray(key)) {
        //short-circuit everything else
        locale = loadLocale(key);
        if (locale) {
            return locale;
        }
        key = [key];
    }

    return chooseLocale(key);
}

function listLocales() {
    return keys$1(locales);
}

function checkOverflow (m) {
    var overflow;
    var a = m._a;

    if (a && getParsingFlags(m).overflow === -2) {
        overflow =
            a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
            a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
            a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
            a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
            a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
            a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
            -1;

        if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
            overflow = DATE;
        }
        if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
            overflow = WEEK;
        }
        if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
            overflow = WEEKDAY;
        }

        getParsingFlags(m).overflow = overflow;
    }

    return m;
}

// iso 8601 regex
// 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;
var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;

var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

var isoDates = [
    ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
    ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
    ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
    ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
    ['YYYY-DDD', /\d{4}-\d{3}/],
    ['YYYY-MM', /\d{4}-\d\d/, false],
    ['YYYYYYMMDD', /[+-]\d{10}/],
    ['YYYYMMDD', /\d{8}/],
    // YYYYMM is NOT allowed by the standard
    ['GGGG[W]WWE', /\d{4}W\d{3}/],
    ['GGGG[W]WW', /\d{4}W\d{2}/, false],
    ['YYYYDDD', /\d{7}/]
];

// iso time formats and regexes
var isoTimes = [
    ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
    ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
    ['HH:mm:ss', /\d\d:\d\d:\d\d/],
    ['HH:mm', /\d\d:\d\d/],
    ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
    ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
    ['HHmmss', /\d\d\d\d\d\d/],
    ['HHmm', /\d\d\d\d/],
    ['HH', /\d\d/]
];

var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

// date from iso format
function configFromISO(config) {
    var i, l,
        string = config._i,
        match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
        allowTime, dateFormat, timeFormat, tzFormat;

    if (match) {
        getParsingFlags(config).iso = true;

        for (i = 0, l = isoDates.length; i < l; i++) {
            if (isoDates[i][1].exec(match[1])) {
                dateFormat = isoDates[i][0];
                allowTime = isoDates[i][2] !== false;
                break;
            }
        }
        if (dateFormat == null) {
            config._isValid = false;
            return;
        }
        if (match[3]) {
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(match[3])) {
                    // match[2] should be 'T' or space
                    timeFormat = (match[2] || ' ') + isoTimes[i][0];
                    break;
                }
            }
            if (timeFormat == null) {
                config._isValid = false;
                return;
            }
        }
        if (!allowTime && timeFormat != null) {
            config._isValid = false;
            return;
        }
        if (match[4]) {
            if (tzRegex.exec(match[4])) {
                tzFormat = 'Z';
            } else {
                config._isValid = false;
                return;
            }
        }
        config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
        configFromStringAndFormat(config);
    } else {
        config._isValid = false;
    }
}

// RFC 2822 regex: For details see https://tools.ietf.org/html/rfc2822#section-3.3
var basicRfcRegex = /^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d?\d\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(?:\d\d)?\d\d\s)(\d\d:\d\d)(\:\d\d)?(\s(?:UT|GMT|[ECMP][SD]T|[A-IK-Za-ik-z]|[+-]\d{4}))$/;

// date and time from ref 2822 format
function configFromRFC2822(config) {
    var string, match, dayFormat,
        dateFormat, timeFormat, tzFormat;
    var timezones = {
        ' GMT': ' +0000',
        ' EDT': ' -0400',
        ' EST': ' -0500',
        ' CDT': ' -0500',
        ' CST': ' -0600',
        ' MDT': ' -0600',
        ' MST': ' -0700',
        ' PDT': ' -0700',
        ' PST': ' -0800'
    };
    var military = 'YXWVUTSRQPONZABCDEFGHIKLM';
    var timezone, timezoneIndex;

    string = config._i
        .replace(/\([^\)]*\)|[\n\t]/g, ' ') // Remove comments and folding whitespace
        .replace(/(\s\s+)/g, ' ') // Replace multiple-spaces with a single space
        .replace(/^\s|\s$/g, ''); // Remove leading and trailing spaces
    match = basicRfcRegex.exec(string);

    if (match) {
        dayFormat = match[1] ? 'ddd' + ((match[1].length === 5) ? ', ' : ' ') : '';
        dateFormat = 'D MMM ' + ((match[2].length > 10) ? 'YYYY ' : 'YY ');
        timeFormat = 'HH:mm' + (match[4] ? ':ss' : '');

        // TODO: Replace the vanilla JS Date object with an indepentent day-of-week check.
        if (match[1]) { // day of week given
            var momentDate = new Date(match[2]);
            var momentDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][momentDate.getDay()];

            if (match[1].substr(0,3) !== momentDay) {
                getParsingFlags(config).weekdayMismatch = true;
                config._isValid = false;
                return;
            }
        }

        switch (match[5].length) {
            case 2: // military
                if (timezoneIndex === 0) {
                    timezone = ' +0000';
                } else {
                    timezoneIndex = military.indexOf(match[5][1].toUpperCase()) - 12;
                    timezone = ((timezoneIndex < 0) ? ' -' : ' +') +
                        (('' + timezoneIndex).replace(/^-?/, '0')).match(/..$/)[0] + '00';
                }
                break;
            case 4: // Zone
                timezone = timezones[match[5]];
                break;
            default: // UT or +/-9999
                timezone = timezones[' GMT'];
        }
        match[5] = timezone;
        config._i = match.splice(1).join('');
        tzFormat = ' ZZ';
        config._f = dayFormat + dateFormat + timeFormat + tzFormat;
        configFromStringAndFormat(config);
        getParsingFlags(config).rfc2822 = true;
    } else {
        config._isValid = false;
    }
}

// date from iso format or fallback
function configFromString(config) {
    var matched = aspNetJsonRegex.exec(config._i);

    if (matched !== null) {
        config._d = new Date(+matched[1]);
        return;
    }

    configFromISO(config);
    if (config._isValid === false) {
        delete config._isValid;
    } else {
        return;
    }

    configFromRFC2822(config);
    if (config._isValid === false) {
        delete config._isValid;
    } else {
        return;
    }

    // Final attempt, use Input Fallback
    hooks.createFromInputFallback(config);
}

hooks.createFromInputFallback = deprecate(
    'value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), ' +
    'which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are ' +
    'discouraged and will be removed in an upcoming major release. Please refer to ' +
    'http://momentjs.com/guides/#/warnings/js-date/ for more info.',
    function (config) {
        config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
    }
);

// Pick the first defined of two or three arguments.
function defaults(a, b, c) {
    if (a != null) {
        return a;
    }
    if (b != null) {
        return b;
    }
    return c;
}

function currentDateArray(config) {
    // hooks is actually the exported moment object
    var nowValue = new Date(hooks.now());
    if (config._useUTC) {
        return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
    }
    return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
}

// convert an array to a date.
// the array should mirror the parameters below
// note: all values past the year are optional and will default to the lowest possible value.
// [year, month, day , hour, minute, second, millisecond]
function configFromArray (config) {
    var i, date, input = [], currentDate, yearToUse;

    if (config._d) {
        return;
    }

    currentDate = currentDateArray(config);

    //compute day of the year from weeks and weekdays
    if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
        dayOfYearFromWeekInfo(config);
    }

    //if the day of the year is set, figure out what it is
    if (config._dayOfYear != null) {
        yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

        if (config._dayOfYear > daysInYear(yearToUse) || config._dayOfYear === 0) {
            getParsingFlags(config)._overflowDayOfYear = true;
        }

        date = createUTCDate(yearToUse, 0, config._dayOfYear);
        config._a[MONTH] = date.getUTCMonth();
        config._a[DATE] = date.getUTCDate();
    }

    // Default to current date.
    // * if no year, month, day of month are given, default to today
    // * if day of month is given, default month and year
    // * if month is given, default only year
    // * if year is given, don't default anything
    for (i = 0; i < 3 && config._a[i] == null; ++i) {
        config._a[i] = input[i] = currentDate[i];
    }

    // Zero out whatever was not defaulted, including time
    for (; i < 7; i++) {
        config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
    }

    // Check for 24:00:00.000
    if (config._a[HOUR] === 24 &&
            config._a[MINUTE] === 0 &&
            config._a[SECOND] === 0 &&
            config._a[MILLISECOND] === 0) {
        config._nextDay = true;
        config._a[HOUR] = 0;
    }

    config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
    // Apply timezone offset from input. The actual utcOffset can be changed
    // with parseZone.
    if (config._tzm != null) {
        config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
    }

    if (config._nextDay) {
        config._a[HOUR] = 24;
    }
}

function dayOfYearFromWeekInfo(config) {
    var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

    w = config._w;
    if (w.GG != null || w.W != null || w.E != null) {
        dow = 1;
        doy = 4;

        // TODO: We need to take the current isoWeekYear, but that depends on
        // how we interpret now (local, utc, fixed offset). So create
        // a now version of current config (take local/utc/offset flags, and
        // create now).
        weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(createLocal(), 1, 4).year);
        week = defaults(w.W, 1);
        weekday = defaults(w.E, 1);
        if (weekday < 1 || weekday > 7) {
            weekdayOverflow = true;
        }
    } else {
        dow = config._locale._week.dow;
        doy = config._locale._week.doy;

        var curWeek = weekOfYear(createLocal(), dow, doy);

        weekYear = defaults(w.gg, config._a[YEAR], curWeek.year);

        // Default to current week.
        week = defaults(w.w, curWeek.week);

        if (w.d != null) {
            // weekday -- low day numbers are considered next week
            weekday = w.d;
            if (weekday < 0 || weekday > 6) {
                weekdayOverflow = true;
            }
        } else if (w.e != null) {
            // local weekday -- counting starts from begining of week
            weekday = w.e + dow;
            if (w.e < 0 || w.e > 6) {
                weekdayOverflow = true;
            }
        } else {
            // default to begining of week
            weekday = dow;
        }
    }
    if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
        getParsingFlags(config)._overflowWeeks = true;
    } else if (weekdayOverflow != null) {
        getParsingFlags(config)._overflowWeekday = true;
    } else {
        temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }
}

// constant that refers to the ISO standard
hooks.ISO_8601 = function () {};

// constant that refers to the RFC 2822 form
hooks.RFC_2822 = function () {};

// date from string and format string
function configFromStringAndFormat(config) {
    // TODO: Move this to another part of the creation flow to prevent circular deps
    if (config._f === hooks.ISO_8601) {
        configFromISO(config);
        return;
    }
    if (config._f === hooks.RFC_2822) {
        configFromRFC2822(config);
        return;
    }
    config._a = [];
    getParsingFlags(config).empty = true;

    // This array is used to make a Date, either with `new Date` or `Date.UTC`
    var string = '' + config._i,
        i, parsedInput, tokens, token, skipped,
        stringLength = string.length,
        totalParsedInputLength = 0;

    tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

    for (i = 0; i < tokens.length; i++) {
        token = tokens[i];
        parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
        // console.log('token', token, 'parsedInput', parsedInput,
        //         'regex', getParseRegexForToken(token, config));
        if (parsedInput) {
            skipped = string.substr(0, string.indexOf(parsedInput));
            if (skipped.length > 0) {
                getParsingFlags(config).unusedInput.push(skipped);
            }
            string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
            totalParsedInputLength += parsedInput.length;
        }
        // don't parse if it's not a known token
        if (formatTokenFunctions[token]) {
            if (parsedInput) {
                getParsingFlags(config).empty = false;
            }
            else {
                getParsingFlags(config).unusedTokens.push(token);
            }
            addTimeToArrayFromToken(token, parsedInput, config);
        }
        else if (config._strict && !parsedInput) {
            getParsingFlags(config).unusedTokens.push(token);
        }
    }

    // add remaining unparsed input length to the string
    getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
    if (string.length > 0) {
        getParsingFlags(config).unusedInput.push(string);
    }

    // clear _12h flag if hour is <= 12
    if (config._a[HOUR] <= 12 &&
        getParsingFlags(config).bigHour === true &&
        config._a[HOUR] > 0) {
        getParsingFlags(config).bigHour = undefined;
    }

    getParsingFlags(config).parsedDateParts = config._a.slice(0);
    getParsingFlags(config).meridiem = config._meridiem;
    // handle meridiem
    config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

    configFromArray(config);
    checkOverflow(config);
}


function meridiemFixWrap (locale, hour, meridiem) {
    var isPm;

    if (meridiem == null) {
        // nothing to do
        return hour;
    }
    if (locale.meridiemHour != null) {
        return locale.meridiemHour(hour, meridiem);
    } else if (locale.isPM != null) {
        // Fallback
        isPm = locale.isPM(meridiem);
        if (isPm && hour < 12) {
            hour += 12;
        }
        if (!isPm && hour === 12) {
            hour = 0;
        }
        return hour;
    } else {
        // this is not supposed to happen
        return hour;
    }
}

// date from string and array of format strings
function configFromStringAndArray(config) {
    var tempConfig,
        bestMoment,

        scoreToBeat,
        i,
        currentScore;

    if (config._f.length === 0) {
        getParsingFlags(config).invalidFormat = true;
        config._d = new Date(NaN);
        return;
    }

    for (i = 0; i < config._f.length; i++) {
        currentScore = 0;
        tempConfig = copyConfig({}, config);
        if (config._useUTC != null) {
            tempConfig._useUTC = config._useUTC;
        }
        tempConfig._f = config._f[i];
        configFromStringAndFormat(tempConfig);

        if (!isValid(tempConfig)) {
            continue;
        }

        // if there is any input that was not parsed add a penalty for that format
        currentScore += getParsingFlags(tempConfig).charsLeftOver;

        //or tokens
        currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

        getParsingFlags(tempConfig).score = currentScore;

        if (scoreToBeat == null || currentScore < scoreToBeat) {
            scoreToBeat = currentScore;
            bestMoment = tempConfig;
        }
    }

    extend(config, bestMoment || tempConfig);
}

function configFromObject(config) {
    if (config._d) {
        return;
    }

    var i = normalizeObjectUnits(config._i);
    config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
        return obj && parseInt(obj, 10);
    });

    configFromArray(config);
}

function createFromConfig (config) {
    var res = new Moment(checkOverflow(prepareConfig(config)));
    if (res._nextDay) {
        // Adding is smart enough around DST
        res.add(1, 'd');
        res._nextDay = undefined;
    }

    return res;
}

function prepareConfig (config) {
    var input = config._i,
        format = config._f;

    config._locale = config._locale || getLocale(config._l);

    if (input === null || (format === undefined && input === '')) {
        return createInvalid({nullInput: true});
    }

    if (typeof input === 'string') {
        config._i = input = config._locale.preparse(input);
    }

    if (isMoment(input)) {
        return new Moment(checkOverflow(input));
    } else if (isDate(input)) {
        config._d = input;
    } else if (isArray(format)) {
        configFromStringAndArray(config);
    } else if (format) {
        configFromStringAndFormat(config);
    }  else {
        configFromInput(config);
    }

    if (!isValid(config)) {
        config._d = null;
    }

    return config;
}

function configFromInput(config) {
    var input = config._i;
    if (isUndefined(input)) {
        config._d = new Date(hooks.now());
    } else if (isDate(input)) {
        config._d = new Date(input.valueOf());
    } else if (typeof input === 'string') {
        configFromString(config);
    } else if (isArray(input)) {
        config._a = map(input.slice(0), function (obj) {
            return parseInt(obj, 10);
        });
        configFromArray(config);
    } else if (isObject(input)) {
        configFromObject(config);
    } else if (isNumber(input)) {
        // from milliseconds
        config._d = new Date(input);
    } else {
        hooks.createFromInputFallback(config);
    }
}

function createLocalOrUTC (input, format, locale, strict, isUTC) {
    var c = {};

    if (locale === true || locale === false) {
        strict = locale;
        locale = undefined;
    }

    if ((isObject(input) && isObjectEmpty(input)) ||
            (isArray(input) && input.length === 0)) {
        input = undefined;
    }
    // object construction must be done this way.
    // https://github.com/moment/moment/issues/1423
    c._isAMomentObject = true;
    c._useUTC = c._isUTC = isUTC;
    c._l = locale;
    c._i = input;
    c._f = format;
    c._strict = strict;

    return createFromConfig(c);
}

function createLocal (input, format, locale, strict) {
    return createLocalOrUTC(input, format, locale, strict, false);
}

var prototypeMin = deprecate(
    'moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/',
    function () {
        var other = createLocal.apply(null, arguments);
        if (this.isValid() && other.isValid()) {
            return other < this ? this : other;
        } else {
            return createInvalid();
        }
    }
);

var prototypeMax = deprecate(
    'moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/',
    function () {
        var other = createLocal.apply(null, arguments);
        if (this.isValid() && other.isValid()) {
            return other > this ? this : other;
        } else {
            return createInvalid();
        }
    }
);

// Pick a moment m from moments so that m[fn](other) is true for all
// other. This relies on the function fn to be transitive.
//
// moments should either be an array of moment objects or an array, whose
// first element is an array of moment objects.
function pickBy(fn, moments) {
    var res, i;
    if (moments.length === 1 && isArray(moments[0])) {
        moments = moments[0];
    }
    if (!moments.length) {
        return createLocal();
    }
    res = moments[0];
    for (i = 1; i < moments.length; ++i) {
        if (!moments[i].isValid() || moments[i][fn](res)) {
            res = moments[i];
        }
    }
    return res;
}

// TODO: Use [].sort instead?
function min () {
    var args = [].slice.call(arguments, 0);

    return pickBy('isBefore', args);
}

function max () {
    var args = [].slice.call(arguments, 0);

    return pickBy('isAfter', args);
}

var now = function () {
    return Date.now ? Date.now() : +(new Date());
};

var ordering = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

function isDurationValid(m) {
    for (var key in m) {
        if (!(ordering.indexOf(key) !== -1 && (m[key] == null || !isNaN(m[key])))) {
            return false;
        }
    }

    var unitHasDecimal = false;
    for (var i = 0; i < ordering.length; ++i) {
        if (m[ordering[i]]) {
            if (unitHasDecimal) {
                return false; // only allow non-integers for smallest unit
            }
            if (parseFloat(m[ordering[i]]) !== toInt(m[ordering[i]])) {
                unitHasDecimal = true;
            }
        }
    }

    return true;
}

function isValid$1() {
    return this._isValid;
}

function createInvalid$1() {
    return createDuration(NaN);
}

function Duration (duration) {
    var normalizedInput = normalizeObjectUnits(duration),
        years = normalizedInput.year || 0,
        quarters = normalizedInput.quarter || 0,
        months = normalizedInput.month || 0,
        weeks = normalizedInput.week || 0,
        days = normalizedInput.day || 0,
        hours = normalizedInput.hour || 0,
        minutes = normalizedInput.minute || 0,
        seconds = normalizedInput.second || 0,
        milliseconds = normalizedInput.millisecond || 0;

    this._isValid = isDurationValid(normalizedInput);

    // representation for dateAddRemove
    this._milliseconds = +milliseconds +
        seconds * 1e3 + // 1000
        minutes * 6e4 + // 1000 * 60
        hours * 1000 * 60 * 60; //using 1000 * 60 * 60 instead of 36e5 to avoid floating point rounding errors https://github.com/moment/moment/issues/2978
    // Because of dateAddRemove treats 24 hours as different from a
    // day when working around DST, we need to store them separately
    this._days = +days +
        weeks * 7;
    // It is impossible translate months into days without knowing
    // which months you are are talking about, so we have to store
    // it separately.
    this._months = +months +
        quarters * 3 +
        years * 12;

    this._data = {};

    this._locale = getLocale();

    this._bubble();
}

function isDuration (obj) {
    return obj instanceof Duration;
}

function absRound (number) {
    if (number < 0) {
        return Math.round(-1 * number) * -1;
    } else {
        return Math.round(number);
    }
}

// FORMATTING

function offset (token, separator) {
    addFormatToken(token, 0, 0, function () {
        var offset = this.utcOffset();
        var sign = '+';
        if (offset < 0) {
            offset = -offset;
            sign = '-';
        }
        return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
    });
}

offset('Z', ':');
offset('ZZ', '');

// PARSING

addRegexToken('Z',  matchShortOffset);
addRegexToken('ZZ', matchShortOffset);
addParseToken(['Z', 'ZZ'], function (input, array, config) {
    config._useUTC = true;
    config._tzm = offsetFromString(matchShortOffset, input);
});

// HELPERS

// timezone chunker
// '+10:00' > ['10',  '00']
// '-1530'  > ['-15', '30']
var chunkOffset = /([\+\-]|\d\d)/gi;

function offsetFromString(matcher, string) {
    var matches = (string || '').match(matcher);

    if (matches === null) {
        return null;
    }

    var chunk   = matches[matches.length - 1] || [];
    var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
    var minutes = +(parts[1] * 60) + toInt(parts[2]);

    return minutes === 0 ?
      0 :
      parts[0] === '+' ? minutes : -minutes;
}

// Return a moment from input, that is local/utc/zone equivalent to model.
function cloneWithOffset(input, model) {
    var res, diff;
    if (model._isUTC) {
        res = model.clone();
        diff = (isMoment(input) || isDate(input) ? input.valueOf() : createLocal(input).valueOf()) - res.valueOf();
        // Use low-level api, because this fn is low-level api.
        res._d.setTime(res._d.valueOf() + diff);
        hooks.updateOffset(res, false);
        return res;
    } else {
        return createLocal(input).local();
    }
}

function getDateOffset (m) {
    // On Firefox.24 Date#getTimezoneOffset returns a floating point.
    // https://github.com/moment/moment/pull/1871
    return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
}

// HOOKS

// This function will be called whenever a moment is mutated.
// It is intended to keep the offset in sync with the timezone.
hooks.updateOffset = function () {};

// MOMENTS

// keepLocalTime = true means only change the timezone, without
// affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
// 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
// +0200, so we adjust the time as needed, to be valid.
//
// Keeping the time actually adds/subtracts (one hour)
// from the actual represented time. That is why we call updateOffset
// a second time. In case it wants us to change the offset again
// _changeInProgress == true case, then we have to adjust, because
// there is no such time in the given timezone.
function getSetOffset (input, keepLocalTime, keepMinutes) {
    var offset = this._offset || 0,
        localAdjust;
    if (!this.isValid()) {
        return input != null ? this : NaN;
    }
    if (input != null) {
        if (typeof input === 'string') {
            input = offsetFromString(matchShortOffset, input);
            if (input === null) {
                return this;
            }
        } else if (Math.abs(input) < 16 && !keepMinutes) {
            input = input * 60;
        }
        if (!this._isUTC && keepLocalTime) {
            localAdjust = getDateOffset(this);
        }
        this._offset = input;
        this._isUTC = true;
        if (localAdjust != null) {
            this.add(localAdjust, 'm');
        }
        if (offset !== input) {
            if (!keepLocalTime || this._changeInProgress) {
                addSubtract(this, createDuration(input - offset, 'm'), 1, false);
            } else if (!this._changeInProgress) {
                this._changeInProgress = true;
                hooks.updateOffset(this, true);
                this._changeInProgress = null;
            }
        }
        return this;
    } else {
        return this._isUTC ? offset : getDateOffset(this);
    }
}

function getSetZone (input, keepLocalTime) {
    if (input != null) {
        if (typeof input !== 'string') {
            input = -input;
        }

        this.utcOffset(input, keepLocalTime);

        return this;
    } else {
        return -this.utcOffset();
    }
}

function setOffsetToUTC (keepLocalTime) {
    return this.utcOffset(0, keepLocalTime);
}

function setOffsetToLocal (keepLocalTime) {
    if (this._isUTC) {
        this.utcOffset(0, keepLocalTime);
        this._isUTC = false;

        if (keepLocalTime) {
            this.subtract(getDateOffset(this), 'm');
        }
    }
    return this;
}

function setOffsetToParsedOffset () {
    if (this._tzm != null) {
        this.utcOffset(this._tzm, false, true);
    } else if (typeof this._i === 'string') {
        var tZone = offsetFromString(matchOffset, this._i);
        if (tZone != null) {
            this.utcOffset(tZone);
        }
        else {
            this.utcOffset(0, true);
        }
    }
    return this;
}

function hasAlignedHourOffset (input) {
    if (!this.isValid()) {
        return false;
    }
    input = input ? createLocal(input).utcOffset() : 0;

    return (this.utcOffset() - input) % 60 === 0;
}

function isDaylightSavingTime () {
    return (
        this.utcOffset() > this.clone().month(0).utcOffset() ||
        this.utcOffset() > this.clone().month(5).utcOffset()
    );
}

function isDaylightSavingTimeShifted () {
    if (!isUndefined(this._isDSTShifted)) {
        return this._isDSTShifted;
    }

    var c = {};

    copyConfig(c, this);
    c = prepareConfig(c);

    if (c._a) {
        var other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
        this._isDSTShifted = this.isValid() &&
            compareArrays(c._a, other.toArray()) > 0;
    } else {
        this._isDSTShifted = false;
    }

    return this._isDSTShifted;
}

function isLocal () {
    return this.isValid() ? !this._isUTC : false;
}

function isUtcOffset () {
    return this.isValid() ? this._isUTC : false;
}

function isUtc () {
    return this.isValid() ? this._isUTC && this._offset === 0 : false;
}

// ASP.NET json date format regex
var aspNetRegex = /^(\-)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)(\.\d*)?)?$/;

// from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
// somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
// and further modified to allow for strings containing both week and day
var isoRegex = /^(-)?P(?:(-?[0-9,.]*)Y)?(?:(-?[0-9,.]*)M)?(?:(-?[0-9,.]*)W)?(?:(-?[0-9,.]*)D)?(?:T(?:(-?[0-9,.]*)H)?(?:(-?[0-9,.]*)M)?(?:(-?[0-9,.]*)S)?)?$/;

function createDuration (input, key) {
    var duration = input,
        // matching against regexp is expensive, do it on demand
        match = null,
        sign,
        ret,
        diffRes;

    if (isDuration(input)) {
        duration = {
            ms : input._milliseconds,
            d  : input._days,
            M  : input._months
        };
    } else if (isNumber(input)) {
        duration = {};
        if (key) {
            duration[key] = input;
        } else {
            duration.milliseconds = input;
        }
    } else if (!!(match = aspNetRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : 1;
        duration = {
            y  : 0,
            d  : toInt(match[DATE])                         * sign,
            h  : toInt(match[HOUR])                         * sign,
            m  : toInt(match[MINUTE])                       * sign,
            s  : toInt(match[SECOND])                       * sign,
            ms : toInt(absRound(match[MILLISECOND] * 1000)) * sign // the millisecond decimal point is included in the match
        };
    } else if (!!(match = isoRegex.exec(input))) {
        sign = (match[1] === '-') ? -1 : 1;
        duration = {
            y : parseIso(match[2], sign),
            M : parseIso(match[3], sign),
            w : parseIso(match[4], sign),
            d : parseIso(match[5], sign),
            h : parseIso(match[6], sign),
            m : parseIso(match[7], sign),
            s : parseIso(match[8], sign)
        };
    } else if (duration == null) {// checks for null or undefined
        duration = {};
    } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
        diffRes = momentsDifference(createLocal(duration.from), createLocal(duration.to));

        duration = {};
        duration.ms = diffRes.milliseconds;
        duration.M = diffRes.months;
    }

    ret = new Duration(duration);

    if (isDuration(input) && hasOwnProp(input, '_locale')) {
        ret._locale = input._locale;
    }

    return ret;
}

createDuration.fn = Duration.prototype;
createDuration.invalid = createInvalid$1;

function parseIso (inp, sign) {
    // We'd normally use ~~inp for this, but unfortunately it also
    // converts floats to ints.
    // inp may be undefined, so careful calling replace on it.
    var res = inp && parseFloat(inp.replace(',', '.'));
    // apply sign while we're at it
    return (isNaN(res) ? 0 : res) * sign;
}

function positiveMomentsDifference(base, other) {
    var res = {milliseconds: 0, months: 0};

    res.months = other.month() - base.month() +
        (other.year() - base.year()) * 12;
    if (base.clone().add(res.months, 'M').isAfter(other)) {
        --res.months;
    }

    res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

    return res;
}

function momentsDifference(base, other) {
    var res;
    if (!(base.isValid() && other.isValid())) {
        return {milliseconds: 0, months: 0};
    }

    other = cloneWithOffset(other, base);
    if (base.isBefore(other)) {
        res = positiveMomentsDifference(base, other);
    } else {
        res = positiveMomentsDifference(other, base);
        res.milliseconds = -res.milliseconds;
        res.months = -res.months;
    }

    return res;
}

// TODO: remove 'name' arg after deprecation is removed
function createAdder(direction, name) {
    return function (val, period) {
        var dur, tmp;
        //invert the arguments, but complain about it
        if (period !== null && !isNaN(+period)) {
            deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period). ' +
            'See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info.');
            tmp = val; val = period; period = tmp;
        }

        val = typeof val === 'string' ? +val : val;
        dur = createDuration(val, period);
        addSubtract(this, dur, direction);
        return this;
    };
}

function addSubtract (mom, duration, isAdding, updateOffset) {
    var milliseconds = duration._milliseconds,
        days = absRound(duration._days),
        months = absRound(duration._months);

    if (!mom.isValid()) {
        // No op
        return;
    }

    updateOffset = updateOffset == null ? true : updateOffset;

    if (milliseconds) {
        mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
    }
    if (days) {
        set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
    }
    if (months) {
        setMonth(mom, get(mom, 'Month') + months * isAdding);
    }
    if (updateOffset) {
        hooks.updateOffset(mom, days || months);
    }
}

var add      = createAdder(1, 'add');
var subtract = createAdder(-1, 'subtract');

function getCalendarFormat(myMoment, now) {
    var diff = myMoment.diff(now, 'days', true);
    return diff < -6 ? 'sameElse' :
            diff < -1 ? 'lastWeek' :
            diff < 0 ? 'lastDay' :
            diff < 1 ? 'sameDay' :
            diff < 2 ? 'nextDay' :
            diff < 7 ? 'nextWeek' : 'sameElse';
}

function calendar$1 (time, formats) {
    // We want to compare the start of today, vs this.
    // Getting start-of-today depends on whether we're local/utc/offset or not.
    var now = time || createLocal(),
        sod = cloneWithOffset(now, this).startOf('day'),
        format = hooks.calendarFormat(this, sod) || 'sameElse';

    var output = formats && (isFunction(formats[format]) ? formats[format].call(this, now) : formats[format]);

    return this.format(output || this.localeData().calendar(format, this, createLocal(now)));
}

function clone () {
    return new Moment(this);
}

function isAfter (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input);
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() > localInput.valueOf();
    } else {
        return localInput.valueOf() < this.clone().startOf(units).valueOf();
    }
}

function isBefore (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input);
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() < localInput.valueOf();
    } else {
        return this.clone().endOf(units).valueOf() < localInput.valueOf();
    }
}

function isBetween (from, to, units, inclusivity) {
    inclusivity = inclusivity || '()';
    return (inclusivity[0] === '(' ? this.isAfter(from, units) : !this.isBefore(from, units)) &&
        (inclusivity[1] === ')' ? this.isBefore(to, units) : !this.isAfter(to, units));
}

function isSame (input, units) {
    var localInput = isMoment(input) ? input : createLocal(input),
        inputMs;
    if (!(this.isValid() && localInput.isValid())) {
        return false;
    }
    units = normalizeUnits(units || 'millisecond');
    if (units === 'millisecond') {
        return this.valueOf() === localInput.valueOf();
    } else {
        inputMs = localInput.valueOf();
        return this.clone().startOf(units).valueOf() <= inputMs && inputMs <= this.clone().endOf(units).valueOf();
    }
}

function isSameOrAfter (input, units) {
    return this.isSame(input, units) || this.isAfter(input,units);
}

function isSameOrBefore (input, units) {
    return this.isSame(input, units) || this.isBefore(input,units);
}

function diff (input, units, asFloat) {
    var that,
        zoneDelta,
        delta, output;

    if (!this.isValid()) {
        return NaN;
    }

    that = cloneWithOffset(input, this);

    if (!that.isValid()) {
        return NaN;
    }

    zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

    units = normalizeUnits(units);

    if (units === 'year' || units === 'month' || units === 'quarter') {
        output = monthDiff(this, that);
        if (units === 'quarter') {
            output = output / 3;
        } else if (units === 'year') {
            output = output / 12;
        }
    } else {
        delta = this - that;
        output = units === 'second' ? delta / 1e3 : // 1000
            units === 'minute' ? delta / 6e4 : // 1000 * 60
            units === 'hour' ? delta / 36e5 : // 1000 * 60 * 60
            units === 'day' ? (delta - zoneDelta) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
            units === 'week' ? (delta - zoneDelta) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
            delta;
    }
    return asFloat ? output : absFloor(output);
}

function monthDiff (a, b) {
    // difference in months
    var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
        // b is in (anchor - 1 month, anchor + 1 month)
        anchor = a.clone().add(wholeMonthDiff, 'months'),
        anchor2, adjust;

    if (b - anchor < 0) {
        anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
        // linear across the month
        adjust = (b - anchor) / (anchor - anchor2);
    } else {
        anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
        // linear across the month
        adjust = (b - anchor) / (anchor2 - anchor);
    }

    //check for negative zero, return zero if negative zero
    return -(wholeMonthDiff + adjust) || 0;
}

hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';
hooks.defaultFormatUtc = 'YYYY-MM-DDTHH:mm:ss[Z]';

function toString () {
    return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
}

function toISOString() {
    if (!this.isValid()) {
        return null;
    }
    var m = this.clone().utc();
    if (m.year() < 0 || m.year() > 9999) {
        return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
    }
    if (isFunction(Date.prototype.toISOString)) {
        // native implementation is ~50x faster, use it when we can
        return this.toDate().toISOString();
    }
    return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
}

/**
 * Return a human readable representation of a moment that can
 * also be evaluated to get a new moment which is the same
 *
 * @link https://nodejs.org/dist/latest/docs/api/util.html#util_custom_inspect_function_on_objects
 */
function inspect () {
    if (!this.isValid()) {
        return 'moment.invalid(/* ' + this._i + ' */)';
    }
    var func = 'moment';
    var zone = '';
    if (!this.isLocal()) {
        func = this.utcOffset() === 0 ? 'moment.utc' : 'moment.parseZone';
        zone = 'Z';
    }
    var prefix = '[' + func + '("]';
    var year = (0 <= this.year() && this.year() <= 9999) ? 'YYYY' : 'YYYYYY';
    var datetime = '-MM-DD[T]HH:mm:ss.SSS';
    var suffix = zone + '[")]';

    return this.format(prefix + year + datetime + suffix);
}

function format (inputString) {
    if (!inputString) {
        inputString = this.isUtc() ? hooks.defaultFormatUtc : hooks.defaultFormat;
    }
    var output = formatMoment(this, inputString);
    return this.localeData().postformat(output);
}

function from (time, withoutSuffix) {
    if (this.isValid() &&
            ((isMoment(time) && time.isValid()) ||
             createLocal(time).isValid())) {
        return createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
    } else {
        return this.localeData().invalidDate();
    }
}

function fromNow (withoutSuffix) {
    return this.from(createLocal(), withoutSuffix);
}

function to (time, withoutSuffix) {
    if (this.isValid() &&
            ((isMoment(time) && time.isValid()) ||
             createLocal(time).isValid())) {
        return createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
    } else {
        return this.localeData().invalidDate();
    }
}

function toNow (withoutSuffix) {
    return this.to(createLocal(), withoutSuffix);
}

// If passed a locale key, it will set the locale for this
// instance.  Otherwise, it will return the locale configuration
// variables for this instance.
function locale (key) {
    var newLocaleData;

    if (key === undefined) {
        return this._locale._abbr;
    } else {
        newLocaleData = getLocale(key);
        if (newLocaleData != null) {
            this._locale = newLocaleData;
        }
        return this;
    }
}

var lang = deprecate(
    'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
    function (key) {
        if (key === undefined) {
            return this.localeData();
        } else {
            return this.locale(key);
        }
    }
);

function localeData () {
    return this._locale;
}

function startOf (units) {
    units = normalizeUnits(units);
    // the following switch intentionally omits break keywords
    // to utilize falling through the cases.
    switch (units) {
        case 'year':
            this.month(0);
            /* falls through */
        case 'quarter':
        case 'month':
            this.date(1);
            /* falls through */
        case 'week':
        case 'isoWeek':
        case 'day':
        case 'date':
            this.hours(0);
            /* falls through */
        case 'hour':
            this.minutes(0);
            /* falls through */
        case 'minute':
            this.seconds(0);
            /* falls through */
        case 'second':
            this.milliseconds(0);
    }

    // weeks are a special case
    if (units === 'week') {
        this.weekday(0);
    }
    if (units === 'isoWeek') {
        this.isoWeekday(1);
    }

    // quarters are also special
    if (units === 'quarter') {
        this.month(Math.floor(this.month() / 3) * 3);
    }

    return this;
}

function endOf (units) {
    units = normalizeUnits(units);
    if (units === undefined || units === 'millisecond') {
        return this;
    }

    // 'date' is an alias for 'day', so it should be considered as such.
    if (units === 'date') {
        units = 'day';
    }

    return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
}

function valueOf () {
    return this._d.valueOf() - ((this._offset || 0) * 60000);
}

function unix () {
    return Math.floor(this.valueOf() / 1000);
}

function toDate () {
    return new Date(this.valueOf());
}

function toArray () {
    var m = this;
    return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
}

function toObject () {
    var m = this;
    return {
        years: m.year(),
        months: m.month(),
        date: m.date(),
        hours: m.hours(),
        minutes: m.minutes(),
        seconds: m.seconds(),
        milliseconds: m.milliseconds()
    };
}

function toJSON () {
    // new Date(NaN).toJSON() === null
    return this.isValid() ? this.toISOString() : null;
}

function isValid$2 () {
    return isValid(this);
}

function parsingFlags () {
    return extend({}, getParsingFlags(this));
}

function invalidAt () {
    return getParsingFlags(this).overflow;
}

function creationData() {
    return {
        input: this._i,
        format: this._f,
        locale: this._locale,
        isUTC: this._isUTC,
        strict: this._strict
    };
}

// FORMATTING

addFormatToken(0, ['gg', 2], 0, function () {
    return this.weekYear() % 100;
});

addFormatToken(0, ['GG', 2], 0, function () {
    return this.isoWeekYear() % 100;
});

function addWeekYearFormatToken (token, getter) {
    addFormatToken(0, [token, token.length], 0, getter);
}

addWeekYearFormatToken('gggg',     'weekYear');
addWeekYearFormatToken('ggggg',    'weekYear');
addWeekYearFormatToken('GGGG',  'isoWeekYear');
addWeekYearFormatToken('GGGGG', 'isoWeekYear');

// ALIASES

addUnitAlias('weekYear', 'gg');
addUnitAlias('isoWeekYear', 'GG');

// PRIORITY

addUnitPriority('weekYear', 1);
addUnitPriority('isoWeekYear', 1);


// PARSING

addRegexToken('G',      matchSigned);
addRegexToken('g',      matchSigned);
addRegexToken('GG',     match1to2, match2);
addRegexToken('gg',     match1to2, match2);
addRegexToken('GGGG',   match1to4, match4);
addRegexToken('gggg',   match1to4, match4);
addRegexToken('GGGGG',  match1to6, match6);
addRegexToken('ggggg',  match1to6, match6);

addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
    week[token.substr(0, 2)] = toInt(input);
});

addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
    week[token] = hooks.parseTwoDigitYear(input);
});

// MOMENTS

function getSetWeekYear (input) {
    return getSetWeekYearHelper.call(this,
            input,
            this.week(),
            this.weekday(),
            this.localeData()._week.dow,
            this.localeData()._week.doy);
}

function getSetISOWeekYear (input) {
    return getSetWeekYearHelper.call(this,
            input, this.isoWeek(), this.isoWeekday(), 1, 4);
}

function getISOWeeksInYear () {
    return weeksInYear(this.year(), 1, 4);
}

function getWeeksInYear () {
    var weekInfo = this.localeData()._week;
    return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
}

function getSetWeekYearHelper(input, week, weekday, dow, doy) {
    var weeksTarget;
    if (input == null) {
        return weekOfYear(this, dow, doy).year;
    } else {
        weeksTarget = weeksInYear(input, dow, doy);
        if (week > weeksTarget) {
            week = weeksTarget;
        }
        return setWeekAll.call(this, input, week, weekday, dow, doy);
    }
}

function setWeekAll(weekYear, week, weekday, dow, doy) {
    var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
        date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

    this.year(date.getUTCFullYear());
    this.month(date.getUTCMonth());
    this.date(date.getUTCDate());
    return this;
}

// FORMATTING

addFormatToken('Q', 0, 'Qo', 'quarter');

// ALIASES

addUnitAlias('quarter', 'Q');

// PRIORITY

addUnitPriority('quarter', 7);

// PARSING

addRegexToken('Q', match1);
addParseToken('Q', function (input, array) {
    array[MONTH] = (toInt(input) - 1) * 3;
});

// MOMENTS

function getSetQuarter (input) {
    return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
}

// FORMATTING

addFormatToken('D', ['DD', 2], 'Do', 'date');

// ALIASES

addUnitAlias('date', 'D');

// PRIOROITY
addUnitPriority('date', 9);

// PARSING

addRegexToken('D',  match1to2);
addRegexToken('DD', match1to2, match2);
addRegexToken('Do', function (isStrict, locale) {
    // TODO: Remove "ordinalParse" fallback in next major release.
    return isStrict ?
      (locale._dayOfMonthOrdinalParse || locale._ordinalParse) :
      locale._dayOfMonthOrdinalParseLenient;
});

addParseToken(['D', 'DD'], DATE);
addParseToken('Do', function (input, array) {
    array[DATE] = toInt(input.match(match1to2)[0], 10);
});

// MOMENTS

var getSetDayOfMonth = makeGetSet('Date', true);

// FORMATTING

addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

// ALIASES

addUnitAlias('dayOfYear', 'DDD');

// PRIORITY
addUnitPriority('dayOfYear', 4);

// PARSING

addRegexToken('DDD',  match1to3);
addRegexToken('DDDD', match3);
addParseToken(['DDD', 'DDDD'], function (input, array, config) {
    config._dayOfYear = toInt(input);
});

// HELPERS

// MOMENTS

function getSetDayOfYear (input) {
    var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
    return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
}

// FORMATTING

addFormatToken('m', ['mm', 2], 0, 'minute');

// ALIASES

addUnitAlias('minute', 'm');

// PRIORITY

addUnitPriority('minute', 14);

// PARSING

addRegexToken('m',  match1to2);
addRegexToken('mm', match1to2, match2);
addParseToken(['m', 'mm'], MINUTE);

// MOMENTS

var getSetMinute = makeGetSet('Minutes', false);

// FORMATTING

addFormatToken('s', ['ss', 2], 0, 'second');

// ALIASES

addUnitAlias('second', 's');

// PRIORITY

addUnitPriority('second', 15);

// PARSING

addRegexToken('s',  match1to2);
addRegexToken('ss', match1to2, match2);
addParseToken(['s', 'ss'], SECOND);

// MOMENTS

var getSetSecond = makeGetSet('Seconds', false);

// FORMATTING

addFormatToken('S', 0, 0, function () {
    return ~~(this.millisecond() / 100);
});

addFormatToken(0, ['SS', 2], 0, function () {
    return ~~(this.millisecond() / 10);
});

addFormatToken(0, ['SSS', 3], 0, 'millisecond');
addFormatToken(0, ['SSSS', 4], 0, function () {
    return this.millisecond() * 10;
});
addFormatToken(0, ['SSSSS', 5], 0, function () {
    return this.millisecond() * 100;
});
addFormatToken(0, ['SSSSSS', 6], 0, function () {
    return this.millisecond() * 1000;
});
addFormatToken(0, ['SSSSSSS', 7], 0, function () {
    return this.millisecond() * 10000;
});
addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
    return this.millisecond() * 100000;
});
addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
    return this.millisecond() * 1000000;
});


// ALIASES

addUnitAlias('millisecond', 'ms');

// PRIORITY

addUnitPriority('millisecond', 16);

// PARSING

addRegexToken('S',    match1to3, match1);
addRegexToken('SS',   match1to3, match2);
addRegexToken('SSS',  match1to3, match3);

var token;
for (token = 'SSSS'; token.length <= 9; token += 'S') {
    addRegexToken(token, matchUnsigned);
}

function parseMs(input, array) {
    array[MILLISECOND] = toInt(('0.' + input) * 1000);
}

for (token = 'S'; token.length <= 9; token += 'S') {
    addParseToken(token, parseMs);
}
// MOMENTS

var getSetMillisecond = makeGetSet('Milliseconds', false);

// FORMATTING

addFormatToken('z',  0, 0, 'zoneAbbr');
addFormatToken('zz', 0, 0, 'zoneName');

// MOMENTS

function getZoneAbbr () {
    return this._isUTC ? 'UTC' : '';
}

function getZoneName () {
    return this._isUTC ? 'Coordinated Universal Time' : '';
}

var proto = Moment.prototype;

proto.add               = add;
proto.calendar          = calendar$1;
proto.clone             = clone;
proto.diff              = diff;
proto.endOf             = endOf;
proto.format            = format;
proto.from              = from;
proto.fromNow           = fromNow;
proto.to                = to;
proto.toNow             = toNow;
proto.get               = stringGet;
proto.invalidAt         = invalidAt;
proto.isAfter           = isAfter;
proto.isBefore          = isBefore;
proto.isBetween         = isBetween;
proto.isSame            = isSame;
proto.isSameOrAfter     = isSameOrAfter;
proto.isSameOrBefore    = isSameOrBefore;
proto.isValid           = isValid$2;
proto.lang              = lang;
proto.locale            = locale;
proto.localeData        = localeData;
proto.max               = prototypeMax;
proto.min               = prototypeMin;
proto.parsingFlags      = parsingFlags;
proto.set               = stringSet;
proto.startOf           = startOf;
proto.subtract          = subtract;
proto.toArray           = toArray;
proto.toObject          = toObject;
proto.toDate            = toDate;
proto.toISOString       = toISOString;
proto.inspect           = inspect;
proto.toJSON            = toJSON;
proto.toString          = toString;
proto.unix              = unix;
proto.valueOf           = valueOf;
proto.creationData      = creationData;

// Year
proto.year       = getSetYear;
proto.isLeapYear = getIsLeapYear;

// Week Year
proto.weekYear    = getSetWeekYear;
proto.isoWeekYear = getSetISOWeekYear;

// Quarter
proto.quarter = proto.quarters = getSetQuarter;

// Month
proto.month       = getSetMonth;
proto.daysInMonth = getDaysInMonth;

// Week
proto.week           = proto.weeks        = getSetWeek;
proto.isoWeek        = proto.isoWeeks     = getSetISOWeek;
proto.weeksInYear    = getWeeksInYear;
proto.isoWeeksInYear = getISOWeeksInYear;

// Day
proto.date       = getSetDayOfMonth;
proto.day        = proto.days             = getSetDayOfWeek;
proto.weekday    = getSetLocaleDayOfWeek;
proto.isoWeekday = getSetISODayOfWeek;
proto.dayOfYear  = getSetDayOfYear;

// Hour
proto.hour = proto.hours = getSetHour;

// Minute
proto.minute = proto.minutes = getSetMinute;

// Second
proto.second = proto.seconds = getSetSecond;

// Millisecond
proto.millisecond = proto.milliseconds = getSetMillisecond;

// Offset
proto.utcOffset            = getSetOffset;
proto.utc                  = setOffsetToUTC;
proto.local                = setOffsetToLocal;
proto.parseZone            = setOffsetToParsedOffset;
proto.hasAlignedHourOffset = hasAlignedHourOffset;
proto.isDST                = isDaylightSavingTime;
proto.isLocal              = isLocal;
proto.isUtcOffset          = isUtcOffset;
proto.isUtc                = isUtc;
proto.isUTC                = isUtc;

// Timezone
proto.zoneAbbr = getZoneAbbr;
proto.zoneName = getZoneName;

// Deprecations
proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/', getSetZone);
proto.isDSTShifted = deprecate('isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information', isDaylightSavingTimeShifted);

function createUnix (input) {
    return createLocal(input * 1000);
}

function createInZone () {
    return createLocal.apply(null, arguments).parseZone();
}

function preParsePostFormat (string) {
    return string;
}

var proto$1 = Locale.prototype;

proto$1.calendar        = calendar;
proto$1.longDateFormat  = longDateFormat;
proto$1.invalidDate     = invalidDate;
proto$1.ordinal         = ordinal;
proto$1.preparse        = preParsePostFormat;
proto$1.postformat      = preParsePostFormat;
proto$1.relativeTime    = relativeTime;
proto$1.pastFuture      = pastFuture;
proto$1.set             = set;

// Month
proto$1.months            =        localeMonths;
proto$1.monthsShort       =        localeMonthsShort;
proto$1.monthsParse       =        localeMonthsParse;
proto$1.monthsRegex       = monthsRegex;
proto$1.monthsShortRegex  = monthsShortRegex;

// Week
proto$1.week = localeWeek;
proto$1.firstDayOfYear = localeFirstDayOfYear;
proto$1.firstDayOfWeek = localeFirstDayOfWeek;

// Day of Week
proto$1.weekdays       =        localeWeekdays;
proto$1.weekdaysMin    =        localeWeekdaysMin;
proto$1.weekdaysShort  =        localeWeekdaysShort;
proto$1.weekdaysParse  =        localeWeekdaysParse;

proto$1.weekdaysRegex       =        weekdaysRegex;
proto$1.weekdaysShortRegex  =        weekdaysShortRegex;
proto$1.weekdaysMinRegex    =        weekdaysMinRegex;

// Hours
proto$1.isPM = localeIsPM;
proto$1.meridiem = localeMeridiem;

function get$1 (format, index, field, setter) {
    var locale = getLocale();
    var utc = createUTC().set(setter, index);
    return locale[field](utc, format);
}

function listMonthsImpl (format, index, field) {
    if (isNumber(format)) {
        index = format;
        format = undefined;
    }

    format = format || '';

    if (index != null) {
        return get$1(format, index, field, 'month');
    }

    var i;
    var out = [];
    for (i = 0; i < 12; i++) {
        out[i] = get$1(format, i, field, 'month');
    }
    return out;
}

// ()
// (5)
// (fmt, 5)
// (fmt)
// (true)
// (true, 5)
// (true, fmt, 5)
// (true, fmt)
function listWeekdaysImpl (localeSorted, format, index, field) {
    if (typeof localeSorted === 'boolean') {
        if (isNumber(format)) {
            index = format;
            format = undefined;
        }

        format = format || '';
    } else {
        format = localeSorted;
        index = format;
        localeSorted = false;

        if (isNumber(format)) {
            index = format;
            format = undefined;
        }

        format = format || '';
    }

    var locale = getLocale(),
        shift = localeSorted ? locale._week.dow : 0;

    if (index != null) {
        return get$1(format, (index + shift) % 7, field, 'day');
    }

    var i;
    var out = [];
    for (i = 0; i < 7; i++) {
        out[i] = get$1(format, (i + shift) % 7, field, 'day');
    }
    return out;
}

function listMonths (format, index) {
    return listMonthsImpl(format, index, 'months');
}

function listMonthsShort (format, index) {
    return listMonthsImpl(format, index, 'monthsShort');
}

function listWeekdays (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdays');
}

function listWeekdaysShort (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdaysShort');
}

function listWeekdaysMin (localeSorted, format, index) {
    return listWeekdaysImpl(localeSorted, format, index, 'weekdaysMin');
}

getSetGlobalLocale('en', {
    dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
    ordinal : function (number) {
        var b = number % 10,
            output = (toInt(number % 100 / 10) === 1) ? 'th' :
            (b === 1) ? 'st' :
            (b === 2) ? 'nd' :
            (b === 3) ? 'rd' : 'th';
        return number + output;
    }
});

// Side effect imports
hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', getSetGlobalLocale);
hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', getLocale);

var mathAbs = Math.abs;

function abs () {
    var data           = this._data;

    this._milliseconds = mathAbs(this._milliseconds);
    this._days         = mathAbs(this._days);
    this._months       = mathAbs(this._months);

    data.milliseconds  = mathAbs(data.milliseconds);
    data.seconds       = mathAbs(data.seconds);
    data.minutes       = mathAbs(data.minutes);
    data.hours         = mathAbs(data.hours);
    data.months        = mathAbs(data.months);
    data.years         = mathAbs(data.years);

    return this;
}

function addSubtract$1 (duration, input, value, direction) {
    var other = createDuration(input, value);

    duration._milliseconds += direction * other._milliseconds;
    duration._days         += direction * other._days;
    duration._months       += direction * other._months;

    return duration._bubble();
}

// supports only 2.0-style add(1, 's') or add(duration)
function add$1 (input, value) {
    return addSubtract$1(this, input, value, 1);
}

// supports only 2.0-style subtract(1, 's') or subtract(duration)
function subtract$1 (input, value) {
    return addSubtract$1(this, input, value, -1);
}

function absCeil (number) {
    if (number < 0) {
        return Math.floor(number);
    } else {
        return Math.ceil(number);
    }
}

function bubble () {
    var milliseconds = this._milliseconds;
    var days         = this._days;
    var months       = this._months;
    var data         = this._data;
    var seconds, minutes, hours, years, monthsFromDays;

    // if we have a mix of positive and negative values, bubble down first
    // check: https://github.com/moment/moment/issues/2166
    if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
            (milliseconds <= 0 && days <= 0 && months <= 0))) {
        milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
        days = 0;
        months = 0;
    }

    // The following code bubbles up values, see the tests for
    // examples of what that means.
    data.milliseconds = milliseconds % 1000;

    seconds           = absFloor(milliseconds / 1000);
    data.seconds      = seconds % 60;

    minutes           = absFloor(seconds / 60);
    data.minutes      = minutes % 60;

    hours             = absFloor(minutes / 60);
    data.hours        = hours % 24;

    days += absFloor(hours / 24);

    // convert days to months
    monthsFromDays = absFloor(daysToMonths(days));
    months += monthsFromDays;
    days -= absCeil(monthsToDays(monthsFromDays));

    // 12 months -> 1 year
    years = absFloor(months / 12);
    months %= 12;

    data.days   = days;
    data.months = months;
    data.years  = years;

    return this;
}

function daysToMonths (days) {
    // 400 years have 146097 days (taking into account leap year rules)
    // 400 years have 12 months === 4800
    return days * 4800 / 146097;
}

function monthsToDays (months) {
    // the reverse of daysToMonths
    return months * 146097 / 4800;
}

function as (units) {
    if (!this.isValid()) {
        return NaN;
    }
    var days;
    var months;
    var milliseconds = this._milliseconds;

    units = normalizeUnits(units);

    if (units === 'month' || units === 'year') {
        days   = this._days   + milliseconds / 864e5;
        months = this._months + daysToMonths(days);
        return units === 'month' ? months : months / 12;
    } else {
        // handle milliseconds separately because of floating point math errors (issue #1867)
        days = this._days + Math.round(monthsToDays(this._months));
        switch (units) {
            case 'week'   : return days / 7     + milliseconds / 6048e5;
            case 'day'    : return days         + milliseconds / 864e5;
            case 'hour'   : return days * 24    + milliseconds / 36e5;
            case 'minute' : return days * 1440  + milliseconds / 6e4;
            case 'second' : return days * 86400 + milliseconds / 1000;
            // Math.floor prevents floating point math errors here
            case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
            default: throw new Error('Unknown unit ' + units);
        }
    }
}

// TODO: Use this.as('ms')?
function valueOf$1 () {
    if (!this.isValid()) {
        return NaN;
    }
    return (
        this._milliseconds +
        this._days * 864e5 +
        (this._months % 12) * 2592e6 +
        toInt(this._months / 12) * 31536e6
    );
}

function makeAs (alias) {
    return function () {
        return this.as(alias);
    };
}

var asMilliseconds = makeAs('ms');
var asSeconds      = makeAs('s');
var asMinutes      = makeAs('m');
var asHours        = makeAs('h');
var asDays         = makeAs('d');
var asWeeks        = makeAs('w');
var asMonths       = makeAs('M');
var asYears        = makeAs('y');

function get$2 (units) {
    units = normalizeUnits(units);
    return this.isValid() ? this[units + 's']() : NaN;
}

function makeGetter(name) {
    return function () {
        return this.isValid() ? this._data[name] : NaN;
    };
}

var milliseconds = makeGetter('milliseconds');
var seconds      = makeGetter('seconds');
var minutes      = makeGetter('minutes');
var hours        = makeGetter('hours');
var days         = makeGetter('days');
var months       = makeGetter('months');
var years        = makeGetter('years');

function weeks () {
    return absFloor(this.days() / 7);
}

var round = Math.round;
var thresholds = {
    ss: 44,         // a few seconds to seconds
    s : 45,         // seconds to minute
    m : 45,         // minutes to hour
    h : 22,         // hours to day
    d : 26,         // days to month
    M : 11          // months to year
};

// helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
    return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
}

function relativeTime$1 (posNegDuration, withoutSuffix, locale) {
    var duration = createDuration(posNegDuration).abs();
    var seconds  = round(duration.as('s'));
    var minutes  = round(duration.as('m'));
    var hours    = round(duration.as('h'));
    var days     = round(duration.as('d'));
    var months   = round(duration.as('M'));
    var years    = round(duration.as('y'));

    var a = seconds <= thresholds.ss && ['s', seconds]  ||
            seconds < thresholds.s   && ['ss', seconds] ||
            minutes <= 1             && ['m']           ||
            minutes < thresholds.m   && ['mm', minutes] ||
            hours   <= 1             && ['h']           ||
            hours   < thresholds.h   && ['hh', hours]   ||
            days    <= 1             && ['d']           ||
            days    < thresholds.d   && ['dd', days]    ||
            months  <= 1             && ['M']           ||
            months  < thresholds.M   && ['MM', months]  ||
            years   <= 1             && ['y']           || ['yy', years];

    a[2] = withoutSuffix;
    a[3] = +posNegDuration > 0;
    a[4] = locale;
    return substituteTimeAgo.apply(null, a);
}

// This function allows you to set the rounding function for relative time strings
function getSetRelativeTimeRounding (roundingFunction) {
    if (roundingFunction === undefined) {
        return round;
    }
    if (typeof(roundingFunction) === 'function') {
        round = roundingFunction;
        return true;
    }
    return false;
}

// This function allows you to set a threshold for relative time strings
function getSetRelativeTimeThreshold (threshold, limit) {
    if (thresholds[threshold] === undefined) {
        return false;
    }
    if (limit === undefined) {
        return thresholds[threshold];
    }
    thresholds[threshold] = limit;
    if (threshold === 's') {
        thresholds.ss = limit - 1;
    }
    return true;
}

function humanize (withSuffix) {
    if (!this.isValid()) {
        return this.localeData().invalidDate();
    }

    var locale = this.localeData();
    var output = relativeTime$1(this, !withSuffix, locale);

    if (withSuffix) {
        output = locale.pastFuture(+this, output);
    }

    return locale.postformat(output);
}

var abs$1 = Math.abs;

function toISOString$1() {
    // for ISO strings we do not use the normal bubbling rules:
    //  * milliseconds bubble up until they become hours
    //  * days do not bubble at all
    //  * months bubble up until they become years
    // This is because there is no context-free conversion between hours and days
    // (think of clock changes)
    // and also not between days and months (28-31 days per month)
    if (!this.isValid()) {
        return this.localeData().invalidDate();
    }

    var seconds = abs$1(this._milliseconds) / 1000;
    var days         = abs$1(this._days);
    var months       = abs$1(this._months);
    var minutes, hours, years;

    // 3600 seconds -> 60 minutes -> 1 hour
    minutes           = absFloor(seconds / 60);
    hours             = absFloor(minutes / 60);
    seconds %= 60;
    minutes %= 60;

    // 12 months -> 1 year
    years  = absFloor(months / 12);
    months %= 12;


    // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
    var Y = years;
    var M = months;
    var D = days;
    var h = hours;
    var m = minutes;
    var s = seconds;
    var total = this.asSeconds();

    if (!total) {
        // this is the same as C#'s (Noda) and python (isodate)...
        // but not other JS (goog.date)
        return 'P0D';
    }

    return (total < 0 ? '-' : '') +
        'P' +
        (Y ? Y + 'Y' : '') +
        (M ? M + 'M' : '') +
        (D ? D + 'D' : '') +
        ((h || m || s) ? 'T' : '') +
        (h ? h + 'H' : '') +
        (m ? m + 'M' : '') +
        (s ? s + 'S' : '');
}

var proto$2 = Duration.prototype;

proto$2.isValid        = isValid$1;
proto$2.abs            = abs;
proto$2.add            = add$1;
proto$2.subtract       = subtract$1;
proto$2.as             = as;
proto$2.asMilliseconds = asMilliseconds;
proto$2.asSeconds      = asSeconds;
proto$2.asMinutes      = asMinutes;
proto$2.asHours        = asHours;
proto$2.asDays         = asDays;
proto$2.asWeeks        = asWeeks;
proto$2.asMonths       = asMonths;
proto$2.asYears        = asYears;
proto$2.valueOf        = valueOf$1;
proto$2._bubble        = bubble;
proto$2.get            = get$2;
proto$2.milliseconds   = milliseconds;
proto$2.seconds        = seconds;
proto$2.minutes        = minutes;
proto$2.hours          = hours;
proto$2.days           = days;
proto$2.weeks          = weeks;
proto$2.months         = months;
proto$2.years          = years;
proto$2.humanize       = humanize;
proto$2.toISOString    = toISOString$1;
proto$2.toString       = toISOString$1;
proto$2.toJSON         = toISOString$1;
proto$2.locale         = locale;
proto$2.localeData     = localeData;

// Deprecations
proto$2.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', toISOString$1);
proto$2.lang = lang;

// Side effect imports

// FORMATTING

addFormatToken('X', 0, 0, 'unix');
addFormatToken('x', 0, 0, 'valueOf');

// PARSING

addRegexToken('x', matchSigned);
addRegexToken('X', matchTimestamp);
addParseToken('X', function (input, array, config) {
    config._d = new Date(parseFloat(input, 10) * 1000);
});
addParseToken('x', function (input, array, config) {
    config._d = new Date(toInt(input));
});

// Side effect imports


hooks.version = '2.18.1';

setHookCallback(createLocal);

hooks.fn                    = proto;
hooks.min                   = min;
hooks.max                   = max;
hooks.now                   = now;
hooks.utc                   = createUTC;
hooks.unix                  = createUnix;
hooks.months                = listMonths;
hooks.isDate                = isDate;
hooks.locale                = getSetGlobalLocale;
hooks.invalid               = createInvalid;
hooks.duration              = createDuration;
hooks.isMoment              = isMoment;
hooks.weekdays              = listWeekdays;
hooks.parseZone             = createInZone;
hooks.localeData            = getLocale;
hooks.isDuration            = isDuration;
hooks.monthsShort           = listMonthsShort;
hooks.weekdaysMin           = listWeekdaysMin;
hooks.defineLocale          = defineLocale;
hooks.updateLocale          = updateLocale;
hooks.locales               = listLocales;
hooks.weekdaysShort         = listWeekdaysShort;
hooks.normalizeUnits        = normalizeUnits;
hooks.relativeTimeRounding = getSetRelativeTimeRounding;
hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
hooks.calendarFormat        = getCalendarFormat;
hooks.prototype             = proto;

return hooks;

})));

},{}],43:[function(require,module,exports){
'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function morphAttrs(fromNode, toNode) {
    var attrs = toNode.attributes;
    var i;
    var attr;
    var attrName;
    var attrNamespaceURI;
    var attrValue;
    var fromValue;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        attrName = attr.name;
        attrNamespaceURI = attr.namespaceURI;
        attrValue = attr.value;

        if (attrNamespaceURI) {
            attrName = attr.localName || attrName;
            fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
            }
        } else {
            fromValue = fromNode.getAttribute(attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttribute(attrName, attrValue);
            }
        }
    }

    // Remove any extra attributes found on the original DOM element that
    // weren't found on the target element.
    attrs = fromNode.attributes;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        if (attr.specified !== false) {
            attrName = attr.name;
            attrNamespaceURI = attr.namespaceURI;

            if (attrNamespaceURI) {
                attrName = attr.localName || attrName;

                if (!hasAttributeNS(toNode, attrNamespaceURI, attrName)) {
                    fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                }
            } else {
                if (!hasAttributeNS(toNode, null, attrName)) {
                    fromNode.removeAttribute(attrName);
                }
            }
        }
    }
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        var firstChild = fromEl.firstChild;
        if (firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            var oldValue = firstChild.nodeValue;

            if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                return;
            }

            firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
                        selectedIndex = i;
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

        // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
        var fromNodesLookup = {};
        var keyedRemovalList;

        function addKeyedRemoval(key) {
            if (keyedRemovalList) {
                keyedRemovalList.push(key);
            } else {
                keyedRemovalList = [key];
            }
        }

        function walkDiscardedChildNodes(node, skipKeyedNodes) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                        // If we are skipping keyed nodes then we add the key
                        // to a list so that it can be handled at the very end.
                        addKeyedRemoval(key);
                    } else {
                        // Only report the node as discarded if it is not keyed. We do this because
                        // at the end we loop through all keyed elements that were unmatched
                        // and then discard them in one final pass.
                        onNodeDiscarded(curChild);
                        if (curChild.firstChild) {
                            walkDiscardedChildNodes(curChild, skipKeyedNodes);
                        }
                    }

                    curChild = curChild.nextSibling;
                }
            }
        }

        /**
         * Removes a DOM node out of the original DOM
         *
         * @param  {Node} node The node to remove
         * @param  {Node} parentNode The nodes parent
         * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
         * @return {undefined}
         */
        function removeNode(node, parentNode, skipKeyedNodes) {
            if (onBeforeNodeDiscarded(node) === false) {
                return;
            }

            if (parentNode) {
                parentNode.removeChild(node);
            }

            onNodeDiscarded(node);
            walkDiscardedChildNodes(node, skipKeyedNodes);
        }

        // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
        // function indexTree(root) {
        //     var treeWalker = document.createTreeWalker(
        //         root,
        //         NodeFilter.SHOW_ELEMENT);
        //
        //     var el;
        //     while((el = treeWalker.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
        //
        // function indexTree(node) {
        //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
        //     var el;
        //     while((el = nodeIterator.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        function indexTree(node) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
                    if (key) {
                        fromNodesLookup[key] = curChild;
                    }

                    // Walk recursively
                    indexTree(curChild);

                    curChild = curChild.nextSibling;
                }
            }
        }

        indexTree(fromNode);

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
                                                // Special case for single element removals. To avoid removing the original
                                                // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                // we will instead discard the current node and wait until the next
                                                // iteration to properly match up the keyed target element with its matching
                                                // element in the original tree
                                                isCompatible = false;
                                            } else {
                                                // We found a matching keyed element somewhere in the original DOM tree.
                                                // Let's moving the original DOM node into the current position and morph
                                                // it.

                                                // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                // the `removeNode()` function for the node that is being discarded so that
                                                // all lifecycle hooks are correctly invoked
                                                fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                fromNextSibling = curFromNodeChild.nextSibling;

                                                if (curFromNodeKey) {
                                                    // Since the node is keyed it might be matched up later so we defer
                                                    // the actual removal to later
                                                    addKeyedRemoval(curFromNodeKey);
                                                } else {
                                                    // NOTE: we skip nested keyed nodes from being removed since there is
                                                    //       still a chance they will be matched up later
                                                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                }

                                                curFromNodeChild = matchingFromEl;
                                            }
                                        } else {
                                            // The nodes are not compatible since the "to" node has a key and there
                                            // is no matching keyed node in the source tree
                                            isCompatible = false;
                                        }
                                    }
                                } else if (curFromNodeKey) {
                                    // The original has a key
                                    isCompatible = false;
                                }

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                // Both nodes being compared are Text or Comment nodes
                                isCompatible = true;
                                // Simply update nodeValue on the original node to
                                // change the text value
                                if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) {
                                    curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                                }

                            }
                        }

                        if (isCompatible) {
                            // Advance both the "to" child and the "from" child since we found a match
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        // No compatible match so remove the old node from the DOM and continue trying to find a
                        // match in the original DOM. However, we only do this if the from node is not keyed
                        // since it is possible that a keyed node might match up with a node somewhere else in the
                        // target tree and we don't want to discard it just yet since it still might find a
                        // home in the final DOM tree. After everything is done we will remove any keyed nodes
                        // that didn't find a home
                        if (curFromNodeKey) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }

                        curFromNodeChild = fromNextSibling;
                    }

                    // If we got this far then we did not find a candidate match for
                    // our "to node" and we exhausted all of the children "from"
                    // nodes. Therefore, we will just append the current "to" node
                    // to the end
                    if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                        fromEl.appendChild(matchingFromEl);
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }
                    curFromNodeChild = fromNextSibling;
                }
            }

            var specialElHandler = specialElHandlers[fromEl.nodeName];
            if (specialElHandler) {
                specialElHandler(fromEl, toEl);
            }
        } // END: morphEl(...)

        var morphedNode = fromNode;
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    if (morphedNode.nodeValue !== toNode.nodeValue) {
                        morphedNode.nodeValue = toNode.nodeValue;
                    }

                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

var morphdom = morphdomFactory(morphAttrs);

module.exports = morphdom;

},{}],44:[function(require,module,exports){
/*!
 * normalize-path <https://github.com/jonschlinkert/normalize-path>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

var removeTrailingSeparator = require('remove-trailing-separator');

module.exports = function normalizePath(str, stripTrailing) {
  if (typeof str !== 'string') {
    throw new TypeError('expected a string');
  }
  str = str.replace(/[\\\/]+/g, '/');
  if (stripTrailing !== false) {
    str = removeTrailingSeparator(str);
  }
  return str;
};

},{"remove-trailing-separator":64}],45:[function(require,module,exports){
'use strict';
module.exports = Number.isNaN || function (x) {
	return x !== x;
};

},{}],46:[function(require,module,exports){
/*!
 * object.omit <https://github.com/jonschlinkert/object.omit>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isObject = require('is-extendable');
var forOwn = require('for-own');

module.exports = function omit(obj, keys) {
  if (!isObject(obj)) return {};

  keys = [].concat.apply([], [].slice.call(arguments, 1));
  var last = keys[keys.length - 1];
  var res = {}, fn;

  if (typeof last === 'function') {
    fn = keys.pop();
  }

  var isFunction = typeof fn === 'function';
  if (!keys.length && !isFunction) {
    return obj;
  }

  forOwn(obj, function(value, key) {
    if (keys.indexOf(key) === -1) {

      if (!isFunction) {
        res[key] = value;
      } else if (fn(value, key, obj)) {
        res[key] = value;
      }
    }
  });
  return res;
};

},{"for-own":17,"is-extendable":27}],47:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + (new Date() % 9e6).toString(36)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, turnoff)
      eachMutation(mutations[i].addedNodes, turnon)
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"global/document":20,"global/window":21}],48:[function(require,module,exports){
const InjestDB = require('scratch-db-test')
const coerce = require('./lib/coerce')

// exported api
// =

exports.open = async function (userArchive) {
  // setup the archive
  var db = new InjestDB('parallel:' + (userArchive ? userArchive.url : 'cache'))
  db.schema({
    version: 1,
    profile: {
      singular: true,
      index: ['*followUrls'],
      validator: record => ({
        name: coerce.string(record.name),
        bio: coerce.string(record.bio),
        avatar: coerce.path(record.avatar),
        follows: coerce.arrayOfFollows(record.follows),
        followUrls: coerce.arrayOfFollows(record.follows).map(f => f.url),
        subgizmos: coerce.arrayOfSubgizmos(record.subgizmos)
      })
    },

    broadcasts: {
      primaryKey: 'createdAt',
      index: ['createdAt', '_origin+createdAt', 'threadRoot', 'threadParent'],
      validator: record => ({
        text: coerce.string(record.text),
        threadRoot: coerce.datUrl(record.threadRoot),
        threadParent: coerce.datUrl(record.threadParent),
        createdAt: coerce.number(record.createdAt, {required: true}),
        receivedAt: Date.now()
      })
    },

    votes: {
      primaryKey: 'subject',
      index: ['subject'],
      validator: record => ({
        subject: coerce.voteSubject(coerce.datUrl(record.subject), {required: true}),
        vote: coerce.vote(record.vote),
        createdAt: coerce.number(record.createdAt, {required: true})
      })
    },

    gizmos: {
      primaryKey: 'createdAt',
      index: ['createdAt', '_origin+createdAt'],
      validator: record => ({
        gizmoName: coerce.string(record.gizmoName),
        gizmoDescription: coerce.string(record.gizmoDescription),
        gizmoDocs: coerce.string(record.gizmoDocs),
        gizmoDependencies: coerce.arrayOfDependencies(record.gizmoDependencies),
        postDependencies: coerce.arrayOfDependencies(record.postDependencies),
        gizmoJS: coerce.string(record.gizmoJS),
        createdAt: coerce.number(record.createdAt, {required: true}),
        receivedAt: Date.now()
      })
    },

    posts: {
      primaryKey: 'createdAt',
      index: ['createdAt', '_origin+createdAt'],
      validator: record => ({
        postJS: coerce.string(record.postJS),
        postHTTP: coerce.string(record.postHTTP),
        postText: coerce.string(record.postText),
        gizmoURL: coerce.string(record.gizmoURL),
        createdAt: coerce.number(record.createdAt, {required: true}),
        receivedAt: Date.now()
      })
    }
  })
  await db.open()

  if (userArchive) {
    // index the main user
    await db.addArchive(userArchive, {prepare: true})

    // index the followers
    db.profile.get(userArchive).then(async profile => {
      profile.followUrls.forEach(url => db.addArchive(url))
    })
  }

  return {
    db,

    async close ({destroy} = {}) {
      if (db) {
        var name = db.name
        await db.close()
        if (destroy) {
          await InjestDB.delete(name)
        }
        this.db = null
      }
    },

    addArchive (a) { return db.addArchive(a, {prepare: true}) },
    addArchives (as) { return db.addArchives(as, {prepare: true}) },
    removeArchive (a) { return db.removeArchive(a) },
    listArchives () { return db.listArchives() },

    async pruneUnfollowedArchives (userArchive) {
      var profile = await db.profile.get(userArchive)
      var archives = db.listArchives()
      await Promise.all(archives.map(a => {
        if (profile.followUrls.indexOf(a.url) === -1) {
          return db.removeArchive(a)
        }
      }))
    },

    // profiles api
    // =

    getProfile (archive) {
      var archiveUrl = coerce.archiveUrl(archive)
      return db.profile.get(archiveUrl)
    },

    setProfile (archive, profile) {
      var archiveUrl = coerce.archiveUrl(archive)
      return db.profile.upsert(archiveUrl, profile)
    },

    async setAvatar (archive, imgData, extension) {
      archive = coerce.archive(archive)
      const filename = `avatar.${extension}`

      if (archive) {
        await archive.writeFile(filename, imgData)
        await archive.commit()
      }
      return db.profile.upsert(archive, {avatar: filename})
    },

    async follow (archive, target, name) {
      // update the follow record
      var archiveUrl = coerce.archiveUrl(archive)
      var targetUrl = coerce.archiveUrl(target)
      var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
        record.follows = record.follows || []
        if (!record.follows.find(f => f.url === targetUrl)) {
          record.follows.push({url: targetUrl, name})
        }
        return record
      })
      if (changes === 0) {
        throw new Error('Failed to follow: no profile record exists. Run setProfile() before follow().')
      }
      // index the target
      await db.addArchive(target)
    },

    async unfollow (archive, target) {
      // update the follow record
      var archiveUrl = coerce.archiveUrl(archive)
      var targetUrl = coerce.archiveUrl(target)
      var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
        record.follows = record.follows || []
        record.follows = record.follows.filter(f => f.url !== targetUrl)
        return record
      })
      if (changes === 0) {
        throw new Error('Failed to unfollow: no profile record exists. Run setProfile() before unfollow().')
      }
      // unindex the target
      await db.removeArchive(target)
    },

    getFollowersQuery (archive) {
      var archiveUrl = coerce.archiveUrl(archive)
      return db.profile.where('followUrls').equals(archiveUrl)
    },

    listFollowers (archive) {
      return this.getFollowersQuery(archive).toArray()
    },

    countFollowers (archive) {
      return this.getFollowersQuery(archive).count()
    },

    async isFollowing (archiveA, archiveB) {
      var archiveBUrl = coerce.archiveUrl(archiveB)
      var profileA = await db.profile.get(archiveA)
      return profileA.followUrls.indexOf(archiveBUrl) !== -1
    },

    async listFriends (archive) {
      var followers = await this.listFollowers(archive)
      await Promise.all(followers.map(async follower => {
        follower.isFriend = await this.isFollowing(archive, follower.url)
      }))
      return followers.filter(f => f.isFriend)
    },

    async countFriends (archive) {
      var friends = await this.listFriends(archive)
      return friends.length
    },

    async isFriendsWith (archiveA, archiveB) {
      var [a, b] = await Promise.all([
        this.isFollowing(archiveA, archiveB),
        this.isFollowing(archiveB, archiveA)
      ])
      return a && b
    },

    // broadcasts api
    // =

    broadcast (archive, {text, threadRoot, threadParent}) {
      text = coerce.string(text)
      threadParent = threadParent ? coerce.recordUrl(threadParent) : undefined
      threadRoot = threadRoot ? coerce.recordUrl(threadRoot) : threadParent
      if (!text) throw new Error('Must provide text')
      const createdAt = Date.now()
      return db.broadcasts.add(archive, {text, threadRoot, threadParent, createdAt})
    },

    getBroadcastsQuery ({author, after, before, offset, limit, reverse} = {}) {
      var query = db.broadcasts
      if (author) {
        author = coerce.archiveUrl(author)
        after = after || 0
        before = before || Infinity
        query = query.where('_origin+createdAt').between([author, after], [author, before])
      } else if (after || before) {
        after = after || 0
        before = before || Infinity
        query = query.where('createdAt').between(after, before)
      } else {
        query = query.orderBy('createdAt')
      }
      if (offset) query = query.offset(offset)
      if (limit) query = query.limit(limit)
      if (reverse) query = query.reverse()
      return query
    },

    getRepliesQuery (threadRootUrl, {offset, limit, reverse} = {}) {
      var query = db.broadcasts.where('threadRoot').equals(threadRootUrl)
      if (offset) query = query.offset(offset)
      if (limit) query = query.limit(limit)
      if (reverse) query = query.reverse()
      return query
    },

    async listBroadcasts (opts = {}, query) {
      var promises = []
      query = query || this.getBroadcastsQuery(opts)
      var broadcasts = await query.toArray()

      // fetch author profile
      if (opts.fetchAuthor) {
        let profiles = {}
        promises = promises.concat(broadcasts.map(async b => {
          if (!profiles[b._origin]) {
            profiles[b._origin] = this.getProfile(b._origin)
          }
          b.author = await profiles[b._origin]
        }))
      }

      // tabulate votes
      if (opts.countVotes) {
        promises = promises.concat(broadcasts.map(async b => {
          b.votes = await this.countVotes(b._url)
        }))
      }

      // fetch replies
      if (opts.fetchReplies) {
        promises = promises.concat(broadcasts.map(async b => {
          b.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(b._url))
        }))
      }

      await Promise.all(promises)
      return broadcasts
    },

    countBroadcasts (opts, query) {
      query = query || this.getBroadcastsQuery(opts)
      return query.count()
    },

    async getBroadcast (record) {
      const recordUrl = coerce.recordUrl(record)
      record = await db.broadcasts.get(recordUrl)
      record.author = await this.getProfile(record._origin)
      record.votes = await this.countVotes(recordUrl)
      record.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(recordUrl))
      return record
    },

    // votes api
    // =

    vote (archive, {vote, subject}) {
      vote = coerce.vote(vote)
      if (!subject) throw new Error('Subject is required')
      if (subject._url) subject = subject._url
      if (subject.url) subject = subject.url
      subject = coerce.datUrl(subject)
      const createdAt = Date.now()
      return db.votes.add(archive, {vote, subject, createdAt})
    },

    getVotesQuery (subject) {
      return db.votes.where('subject').equals(coerce.voteSubject(subject))
    },

    listVotes (subject) {
      return this.getVotesQuery(subject).toArray()
    },

    async countVotes (subject) {
      var res = {up: 0, down: 0, value: 0, upVoters: [], currentUsersVote: 0}
      await this.getVotesQuery(subject).each(record => {
        res.value += record.vote
        if (record.vote === 1) {
          res.upVoters.push(record._origin)
          res.up++
        }
        if (record.vote === -1) {
          res.down--
        }
        if (userArchive && record._origin === userArchive.url) {
          res.currentUsersVote = record.vote
        }
      })
      return res
    },

    // TCW -- gizmo api

    async gizmo (archive, {
      gizmoName,
      gizmoDescription,
      gizmoDocs,
      gizmoDependencies,
      postDependencies,
      gizmoJS
    }) {
      gizmoName = coerce.string(gizmoName)
      gizmoDescription = coerce.string(gizmoDescription)
      gizmoDocs = coerce.string(gizmoDocs)
      gizmoDependencies = coerce.arrayOfDependencies(gizmoDependencies)
      console.log('gizmo deps after coerce', gizmoDependencies)
      gizmoDependencies = await Promise.all(gizmoDependencies.map(async d => await this.getGizmo(d.url)))
      console.log('gizmo deps after promises', gizmoDependencies)
      postDependencies = coerce.arrayOfDependencies(postDependencies)
      console.log('post deps after coerce', postDependencies)
      postDependencies = await Promise.all(postDependencies.map(async d => await this.getGizmo(d.url)))
      console.log('post deps after promises', postDependencies)
      gizmoJS = coerce.string(gizmoJS)
      const createdAt = Date.now()
      return db.gizmos.add(archive, {
        gizmoName,
        gizmoDescription,
        gizmoDocs,
        gizmoDependencies,
        postDependencies,
        gizmoJS,
        createdAt
      })
    },

    getGizmosQuery ({author, after, before, offset, limit, reverse} = {}) {
      var query = db.gizmos
      if (author) {
        author = coerce.archiveUrl(author)
        after = after || 0
        before = before || Infinity
        query = query.where('_origin+createdAt').between([author, after], [author, before])
      } else if (after || before) {
        after = after || 0
        before = before || Infinity
        query = query.where('createdAt').between(after, before)
      } else {
        query = query.orderBy('createdAt')
      }
      if (offset) query = query.offset(offset)
      if (limit) query = query.limit(limit)
      if (reverse) query = query.reverse()
      return query
    },

    async listGizmos (opts = {}, query) {
      var promises = []
      query = query || this.getGizmosQuery(opts)
      var gizmos = await query.toArray()

      if (opts.subscriber) {
        let subscriber = await this.getProfile(opts.subscriber)
        gizmos = gizmos.filter(g => {
          return !!subscriber.subgizmos.find(sg => sg.url === g._url)
        })
      }

      if (opts.loadShop) {
        if (!opts.author) {
          throw new Error('An author must be provided when loading the Shop.')
        } else {
          let author = coerce.archiveUrl(opts.author)
          gizmos = gizmos.filter(g => {
            return g._origin === author
          })
        }
      }

      if (opts.fetchAuthor) {
        let profiles = {}
        promises = promises.concat(gizmos.map(async g => {
          if (!profiles[g._origin]) {
            profiles[g._origin] = await this.getProfile(g._origin)
          }
          g.author = await profiles[g._origin]
        }))
      }

      if (opts.fetchReplies) {
        promises = promises.concat(gizmos.map(async g => {
          g.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(g._url))
        }))
      }

      if (opts.countVotes) {
        promises = promises.concat(gizmos.map(async g => {
          g.votes = await this.countVotes(g._url)
        }))
      }

      if (opts.checkIfSubscribed) {
        promises = promises.concat(gizmos.map(async g => {
          g.isSubscribed = await this.isSubscribed(opts.checkIfSubscribed, g)
        }))
      }

      if (opts.fetchGizmoDependencies) {
        promises = promises.concat(gizmos.map(async g => {
          g.fullDependencies = await this.getGizmoDependencies(g)
        }))
      }

      await Promise.all(promises)
      return gizmos
    },

    countGizmos (opts, query) {
      query = query || this.getGizmosQuery(opts)
      return query.count()
    },

    async getGizmo (gizmo, opts = {}) {
      console.log('gizmo in getGizmo', gizmo)
      const gizmoURL = coerce.recordUrl(gizmo)
      gizmo = await db.gizmos.get(gizmoURL)
      if (opts.fetchAuthor) {
        gizmo.author = await this.getProfile(gizmo._origin)
      }
      if (opts.countVotes) {
        gizmo.votes = await this.countVotes(gizmoURL)
      }
      if (opts.fetchReplies) {
        gizmo.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(gizmoURL))
      }
      if (opts.checkIfSubscribed) {
        if (!opts.requester) {
          throw new Error('The archive of the requester must be provided when checking if subscribed.')
        } else {
          const requesterURL = coerce.archiveUrl(opts.requester)
          gizmo.isSubscribed = await this.isSubscribed(requesterURL, gizmo)
        }
      }
      if (opts.fetchAllDependencies) {
        gizmo = await this.getAllDependencies(gizmo)
      }
      return gizmo
    },

    async getDependency (gizmo) {
      console.log('gizmo in getDependency', gizmo)
      const gizmoURL = coerce.recordUrl(gizmo)
      const dependency = await db.gizmos.get(gizmoURL)
      console.log('dependency after getDependency', dependency)
      return dependency
    },

    async getAllDependencies (gizmo) {
      if (gizmo.gizmoDependencies.length === 0) {
        return gizmo
      }
      let dependencies = await gizmo.gizmoDependencies.map(d => this.getDependency(d))
      await Promise.all(dependencies)
      let childDependencies = {}
      await Promise.all(dependencies.map(async (d, idx) => {
        childDependencies[idx] = await this.getAllDependencies(d)
      }))
      gizmo.childDependencies = childDependencies
      return gizmo
    },

    async getPostDependencies (gizmo) {
      console.log('gizmo in getPostDependencies', gizmo)
      let postDependencies = []
      postDependencies = await Promise.all(gizmo.postDependencies.map(async d => await this.getGizmo(d.url)))
      console.log('postDependencies', postDependencies)
      return postDependencies
    },

    async getGizmoDependencies (gizmo) {
      console.log('gizmo in getGizmoDependencies', gizmo)
      let fullDependencies = []
      fullDependencies = await Promise.all(gizmo.gizmoDependencies.map(async d => await this.getGizmo(d.url)))
      console.log('fullDependencies', fullDependencies)
      return fullDependencies
    },

    async subscribe (archive, gizmo) {
      var archiveUrl = coerce.archiveUrl(archive)
      var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
        record.subgizmos = record.subgizmos || []
        if (!record.subgizmos.find(sg => sg.url === gizmo._url)) {
          record.subgizmos.push({
            url: gizmo._url,
            origin: gizmo._origin,
            author: gizmo.author.name,
            name: gizmo.gizmoName
          })
        }
        return record
      })
      if (changes === 0) {
        throw new Error('Failed to subscribe: gizmo record already exists.')
      }
    },

    async unsubscribe (archive, gizmo) {
      var archiveUrl = coerce.archiveUrl(archive)
      var changes = await db.profile.where('_origin').equals(archiveUrl).update(record => {
        record.subgizmos = record.subgizmos || []
        record.subgizmos = record.subgizmos.filter(sg => sg.url !== gizmo._url)
        return record
      })
      if (changes === 0) {
        throw new Error('Failed to unsubscribe: no gizmo record exists.')
      }
    },

    async isSubscribed (archive, gizmo) {
      var archiveURL = coerce.archiveUrl(archive)
      var gizmoURL = coerce.recordUrl(gizmo._url)
      var profile = await db.profile.get(archiveURL)
      return !!profile.subgizmos.find(sg => sg.url === gizmoURL)
    },

    // TCW -- posts api

    post (archive, {
      postJS,
      postHTTP,
      postText,
      gizmoURL
    }) {
      postJS = coerce.string(postJS)
      postHTTP = coerce.string(postHTTP)
      postText = coerce.string(postText)
      gizmoURL = coerce.string(gizmoURL)
      const createdAt = Date.now()

      return db.posts.add(archive, {
        postJS,
        postHTTP,
        postText,
        gizmoURL,
        createdAt
      })
    },

    getPostsQuery ({author, after, before, offset, limit, reverse} = {}) {
      var query = db.posts
      if (author) {
        author = coerce.archiveUrl(author)
        after = after || 0
        before = before || Infinity
        query = query.where('_origin+createdAt').between([author, after], [author, before])
      } else if (after || before) {
        after = after || 0
        before = before || Infinity
        query = query.where('createdAt').between(after, before)
      } else {
        query = query.orderBy('createdAt')
      }
      if (offset) query = query.offset(offset)
      if (limit) query = query.limit(limit)
      if (reverse) query = query.reverse()
      return query
    },

    async listPosts (opts = {}, query) {
      var promises = []
      query = query || this.getPostsQuery(opts)
      var posts = await query.toArray()

      if (opts.currentURL) {
        posts = posts.filter(p => {
          return p.postHTTP === opts.currentURL
        })
      }

      // fetch author profile
      if (opts.fetchAuthor) {
        let profiles = {}
        promises = promises.concat(posts.map(async p => {
          if (!profiles[p._origin]) {
            profiles[p._origin] = await this.getProfile(p._origin)
          }
          p.author = await profiles[p._origin]
        }))
      }

      if (opts.fetchGizmo) {
        promises = promises.concat(posts.map(async p => {
          p.gizmo = await this.getGizmo(p.gizmoURL, {
            fetchAuthor: true,
            fetchReplies: true,
            countVotes: true,
            checkIfSubscribed: true,
            requester: opts.requester
          })
        }))
      }

      // tabulate votes
      if (opts.countVotes) {
        promises = promises.concat(posts.map(async p => {
          p.votes = await this.countVotes(p._url)
        }))
      }

      if (opts.fetchReplies) {
        promises = promises.concat(posts.map(async p => {
          p.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(p._url))
        }))
      }

      await Promise.all(promises)
      console.log('posts after first promise.all in listPosts', posts)

      promises = []
      if (opts.fetchPostDependencies) {
        promises = promises.concat(posts.map(async p => {
          p.postDependencies = await this.getPostDependencies(p.gizmo)
        }))
      }

      await Promise.all(promises)
      console.log('posts after second promise.all in listPosts', posts)

      return posts
    },

    countPosts (opts, query) {
      query = query || this.getPostsQuery(opts)
      return query.count()
    },

    async getPost (requester, post) {
      const requesterUrl = coerce.archiveUrl(requester)
      const postUrl = coerce.recordUrl(post)
      post = await db.posts.get(postUrl)
      const gizmoURL = coerce.recordUrl(post.gizmoURL)
      post.author = await this.getProfile(post._origin)
      post.votes = await this.countVotes(postUrl)
      post.gizmo = await this.getGizmo(gizmoURL, {
        fetchAuthor: true,
        fetchReplies: true,
        countVotes: true,
        checkIfSubscribed: true,
        requester: requesterUrl
      })
      post.replies = await this.listBroadcasts({fetchAuthor: true}, this.getRepliesQuery(postUrl))
      return post
    }
  }
}

},{"./lib/coerce":49,"scratch-db-test":67}],49:[function(require,module,exports){
exports.string = function (v) {
  if (typeof v === 'number') v = v.toString()
  if (typeof v === 'string') return v
  return null
}

exports.path = function (v) {
  v = exports.string(v)
  if (v && !v.startsWith('/')) v = '/' + v
  return v
}

exports.arrayOfFollows = function (arr) {
  arr = Array.isArray(arr) ? arr : [arr]
  return arr.map(v => {
    if (!v) return false
    if (typeof v === 'string') {
      return {url: exports.datUrl(v)}
    }
    if (v.url && typeof v.url === 'string') {
      return {url: exports.datUrl(v.url), name: exports.string(v.name)}
    }
  }).filter(Boolean)
}

exports.arrayOfSubgizmos = function (arr) {
  arr = Array.isArray(arr) ? arr : [arr]
  return arr.map(v => {
    if (!v) return false
    if (v.url && typeof v.url === 'string') {
      return {
        url: exports.recordUrl(v.url),
        origin: exports.datUrl(v.origin),
        author: exports.string(v.author),
        name: exports.string(v.name)
      }
    }
  }).filter(Boolean)
}

exports.arrayOfDependencies = function (arr) {
  arr = Array.isArray(arr) ? arr : [arr]
  return arr.map(v => {
    if (!v) return false
    if (typeof v === 'string') {
      return {url: exports.recordUrl(v)}
    }
    if (v.url && typeof v.url === 'string') {
      return {url: exports.recordUrl(v.url), name: exports.string(v.name)}
    }
    if (v._url && typeof v._url === 'string') {
      return {url: exports.recordUrl(v._url), name: exports.string(v.gizmoName)}
    }
  }).filter(Boolean)
}

exports.datUrl = function (v) {
  if (v && typeof v === 'string') {
    if (v.startsWith('http')) {
      return null
    }
    if (!v.startsWith('dat://')) {
      v = 'dat://' + v
    }
    return v
  }
  return null
}

exports.voteSubject = function (v) {
  v = exports.datUrl(v)
  if (!v) {
    throw new Error('Subject required on votes')
  }

  v = v.slice('dat://'.length).replace(/\//g, ':')
  return v
}

exports.number = function (v, opts) {
  v = +v
  if (opts && opts.required) {
    if (typeof v !== 'number') {
      throw new Error('Invalid field, must be a number')
    }
  }
  return v
}

exports.vote = function (v) {
  v = exports.number(v)
  if (v > 0) return 1
  if (v < 0) return 0
  return 0
}

exports.archive = function (v) {
  if (typeof v === 'string') {
    try {
      // return new DatArchive(v)
    } catch (e) {
      throw new Error('Not a valid archive')
    }
  }
  if (v.url) {
    return v
  }
  return null
}

exports.archiveUrl = function (v) {
  if (typeof v === 'string') {
    return v
  }
  if (typeof v.url === 'string') {
    return v.url
  }
  throw new Error('Not a valid archive')
}

exports.recordUrl = function (v) {
  if (typeof v === 'string') {
    return v
  }
  if (typeof v._url === 'string') {
    return v._url
  }
  throw new Error('Not a valid record')
}

},{}],50:[function(require,module,exports){
const isNode = typeof window === 'undefined'
const parse = isNode ? require('url').parse : browserParse

const SCHEME_REGEX = /[a-z]+:\/\//i
//                   1          2      3        4
const VERSION_REGEX = /^(dat:\/\/)?([^/]+)(\+[^/]+)(.*)$/i

module.exports = function parseDatURL (str, parseQS) {
  // prepend the scheme if it's missing
  if (!SCHEME_REGEX.test(str)) {
    str = 'dat://' + str
  }

  var parsed, version = null, match = VERSION_REGEX.exec(str)
  if (match) {
    // run typical parse with version segment removed
    parsed = parse((match[1] || '') + (match[2] || '') + (match[4] || ''), parseQS)
    version = match[3].slice(1)
  } else {
    parsed = parse(str, parseQS)
  }
  if (isNode) parsed.href = str // overwrite href to include actual original
  parsed.version = version // add version segment
  return parsed
}

function browserParse (str) {
  return new URL(str)
}
},{"url":undefined}],51:[function(require,module,exports){
/*!
 * parse-glob <https://github.com/jonschlinkert/parse-glob>
 *
 * Copyright (c) 2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isGlob = require('is-glob');
var findBase = require('glob-base');
var extglob = require('is-extglob');
var dotfile = require('is-dotfile');

/**
 * Expose `cache`
 */

var cache = module.exports.cache = {};

/**
 * Parse a glob pattern into tokens.
 *
 * When no paths or '**' are in the glob, we use a
 * different strategy for parsing the filename, since
 * file names can contain braces and other difficult
 * patterns. such as:
 *
 *  - `*.{a,b}`
 *  - `(**|*.js)`
 */

module.exports = function parseGlob(glob) {
  if (cache.hasOwnProperty(glob)) {
    return cache[glob];
  }

  var tok = {};
  tok.orig = glob;
  tok.is = {};

  // unescape dots and slashes in braces/brackets
  glob = escape(glob);

  var parsed = findBase(glob);
  tok.is.glob = parsed.isGlob;

  tok.glob = parsed.glob;
  tok.base = parsed.base;
  var segs = /([^\/]*)$/.exec(glob);

  tok.path = {};
  tok.path.dirname = '';
  tok.path.basename = segs[1] || '';
  tok.path.dirname = glob.split(tok.path.basename).join('') || '';
  var basename = (tok.path.basename || '').split('.') || '';
  tok.path.filename = basename[0] || '';
  tok.path.extname = basename.slice(1).join('.') || '';
  tok.path.ext = '';

  if (isGlob(tok.path.dirname) && !tok.path.basename) {
    if (!/\/$/.test(tok.glob)) {
      tok.path.basename = tok.glob;
    }
    tok.path.dirname = tok.base;
  }

  if (glob.indexOf('/') === -1 && !tok.is.globstar) {
    tok.path.dirname = '';
    tok.path.basename = tok.orig;
  }

  var dot = tok.path.basename.indexOf('.');
  if (dot !== -1) {
    tok.path.filename = tok.path.basename.slice(0, dot);
    tok.path.extname = tok.path.basename.slice(dot);
  }

  if (tok.path.extname.charAt(0) === '.') {
    var exts = tok.path.extname.split('.');
    tok.path.ext = exts[exts.length - 1];
  }

  // unescape dots and slashes in braces/brackets
  tok.glob = unescape(tok.glob);
  tok.path.dirname = unescape(tok.path.dirname);
  tok.path.basename = unescape(tok.path.basename);
  tok.path.filename = unescape(tok.path.filename);
  tok.path.extname = unescape(tok.path.extname);

  // Booleans
  var is = (glob && tok.is.glob);
  tok.is.negated  = glob && glob.charAt(0) === '!';
  tok.is.extglob  = glob && extglob(glob);
  tok.is.braces   = has(is, glob, '{');
  tok.is.brackets = has(is, glob, '[:');
  tok.is.globstar = has(is, glob, '**');
  tok.is.dotfile  = dotfile(tok.path.basename) || dotfile(tok.path.filename);
  tok.is.dotdir   = dotdir(tok.path.dirname);
  return (cache[glob] = tok);
}

/**
 * Returns true if the glob matches dot-directories.
 *
 * @param  {Object} `tok` The tokens object
 * @param  {Object} `path` The path object
 * @return {Object}
 */

function dotdir(base) {
  if (base.indexOf('/.') !== -1) {
    return true;
  }
  if (base.charAt(0) === '.' && base.charAt(1) !== '/') {
    return true;
  }
  return false;
}

/**
 * Returns true if the pattern has the given `ch`aracter(s)
 *
 * @param  {Object} `glob` The glob pattern.
 * @param  {Object} `ch` The character to test for
 * @return {Object}
 */

function has(is, glob, ch) {
  return is && glob.indexOf(ch) !== -1;
}

/**
 * Escape/unescape utils
 */

function escape(str) {
  var re = /\{([^{}]*?)}|\(([^()]*?)\)|\[([^\[\]]*?)\]/g;
  return str.replace(re, function (outter, braces, parens, brackets) {
    var inner = braces || parens || brackets;
    if (!inner) { return outter; }
    return outter.split(inner).join(esc(inner));
  });
}

function esc(str) {
  str = str.split('/').join('__SLASH__');
  str = str.split('.').join('__DOT__');
  return str;
}

function unescape(str) {
  str = str.split('__SLASH__').join('/');
  str = str.split('__DOT__').join('.');
  return str;
}

},{"glob-base":18,"is-dotfile":25,"is-extglob":28,"is-glob":29}],52:[function(require,module,exports){
module.exports.exportAPI = require('./lib/export-api')
module.exports.importAPI = require('./lib/import-api')
},{"./lib/export-api":53,"./lib/import-api":54}],53:[function(require,module,exports){
(function (Buffer){
const EventEmitter = require('events')
const { Writable } = require('stream')
const { ipcMain } = require('electron')
const {valueToIPCValue} = require('./util')


module.exports = function (channelName, manifest, methods, globalPermissionCheck) {
  var api = new EventEmitter()
  var streams = {}
  var webcontentsStreams = {}

  // wire up handler
  ipcMain.on(channelName, async function (event, methodName, requestId, ...args) {
    // handle special methods
    if (methodName == 'stream-request-write') {
      event.returnValue = true
      return streamRequestWrite(requestId, args)
    }
    if (methodName == 'stream-request-end') {
      event.returnValue = true
      return streamRequestEnd(requestId, args)
    }
    if (methodName == 'stream-request-close') {
      event.returnValue = true
      return streamRequestClose(requestId, args)
    }

    // look up the method called
    var type = manifest[methodName]
    var method = methods[methodName]
    if (!type || !method) {
      api.emit('error', new Error(`Method not found: "${methodName}"`), arguments)
      return
    }

    // global permission check
    if (globalPermissionCheck && !globalPermissionCheck(event, methodName, args)) {
      // repond according to method type
      if (type == 'async' || type == 'promise') {
        event.sender.send(channelName, 'async-reply', requestId, 'Denied')
      } else {
        event.returnValue = { error: 'Denied' }
      }
      return
    }

    // run method by type
    if (type == 'sync') {
      // call sync
      try {
        event.returnValue = { success: valueToIPCValue(method.apply(event, args)) }
      } catch (e) {
        event.returnValue = { error: e.message }        
      }
      return
    }
    if (type == 'async') {
      // create a reply cb
      const replyCb = (err, value) => {
        if (err) err = err.message || err
        event.sender.send(channelName, 'async-reply', requestId, err, valueToIPCValue(value))
      }
      args.push(replyCb)

      // call async
      method.apply(event, args)
      return
    }
    if (type == 'promise') {
      // call promise
      let p
      try {
        p = method.apply(event, args)
        if (!p)
          p = Promise.resolve()
      } catch (e) {
        p = Promise.reject(errorObject(e))
      }

      // handle response
      p.then(
        value => event.sender.send(channelName, 'async-reply', requestId, null, valueToIPCValue(value)),
        error => event.sender.send(channelName, 'async-reply', requestId, errorObject(error))
      )
      return
    }
    if (type == 'readable') {
      // call readable
      let stream
      try {
        stream = method.apply(event, args)
        if (!stream) {
          event.returnValue = { success: false }
          return
        }
      } catch (e) {
        event.returnValue = { error: e.message }
        return
      }

      // handle promises
      if (stream && stream.then) {
        event.returnValue = { success: true }
        try {
          stream = await stream // wait for it
        } catch (e) {
          event.sender.send(channelName, 'stream-error', requestId, '' + e)
          return
        }
      }

      streams[requestId] = stream

      // hook up events
      let onData     = chunk => event.sender.send(channelName, 'stream-data', requestId, valueToIPCValue(chunk))
      let onReadable = () => event.sender.send(channelName, 'stream-readable', requestId)
      let onClose    = () => event.sender.send(channelName, 'stream-close', requestId)
      let onError    = err => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-error', requestId, (err) ? err.message : '')
      }
      let onEnd      = () => {
        stream.unregisterEvents() // TODO does calling this in 'end' mean that 'close' will never be sent?
        event.sender.send(channelName, 'stream-end', requestId)
        streams[requestId] = null
        webcontentsStreams[event.sender.id][requestId] = null
      }
      stream.unregisterEvents = () => {
        stream.removeListener('data', onData)
        stream.removeListener('error', onError)
        stream.removeListener('readable', onReadable)
        stream.removeListener('close', onClose)
        stream.removeListener('end', onEnd)
      }
      trackWebcontentsStreams(event.sender, requestId, stream)
      stream.on('data', onData)
      stream.on('error', onError)
      stream.on('readable', onReadable)
      stream.on('close', onClose)
      stream.on('end', onEnd)

      // done
      event.returnValue = { success: true }
      return
    }
    if (type == 'writable') {
      // call writable
      let stream
      try {
        stream = method.apply(event, args)
        if (!stream) {
          event.returnValue = { success: false }
          return
        }
      } catch (e) {
        event.returnValue = { error: e.message }
        return
      }
      streams[requestId] = stream

      // hook up events
      let onDrain    = () => event.sender.send(channelName, 'stream-drain', requestId)
      let onClose    = () => event.sender.send(channelName, 'stream-close', requestId)
      let onError    = err => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-error', requestId, (err) ? err.message : '')
      }
      let onFinish    = () => {
        stream.unregisterEvents()
        event.sender.send(channelName, 'stream-finish', requestId)
        streams[requestId] = null
        webcontentsStreams[event.sender.id][requestId] = null
      }
      stream.unregisterEvents = () => {
        stream.removeListener('drain', onDrain)
        stream.removeListener('error', onError)
        stream.removeListener('finish', onFinish)
        stream.removeListener('close', onClose)
      }
      trackWebcontentsStreams(event.sender, requestId, stream)
      stream.on('drain', onDrain)
      stream.on('error', onError)
      stream.on('finish', onFinish)
      stream.on('close', onClose)

      // done
      event.returnValue = { success: true }
      return
    }

    api.emit('error', new Error(`Invalid method type "${type}" for "${methodName}"`), arguments)
  })

  // special methods
  function trackWebcontentsStreams (webcontents, requestId, stream) {
    // track vs. sender's lifecycle
    if (!webcontentsStreams[webcontents.id]) {
      webcontentsStreams[webcontents.id] = {}
      // listen for webcontent close event
      webcontents.once('did-navigate', closeAllWebcontentsStreams(webcontents.id))
      webcontents.once('destroyed', closeAllWebcontentsStreams(webcontents.id))
    }
    webcontentsStreams[webcontents.id][requestId] = stream
  }
  function streamRequestWrite (requestId, args) {
    var stream = streams[requestId]

    if (stream && typeof stream.write == 'function') {
      // massage data
      if (!stream._writableState.objectMode && !Buffer.isBuffer(args[0]))
        args[0] = ''+args[0]

      // write
      stream.write(...args)
    }
  }
  function streamRequestEnd (requestId, args) {
    var stream = streams[requestId]
    if (stream && typeof stream.end == 'function')
      stream.end(...args)
  }
  function streamRequestClose (requestId, args) {
    var stream = streams[requestId]
    if (!stream)
      return
    // try .close
    if (typeof stream.close == 'function')
      stream.close(...args)
    // hmm, try .destroy
    else if (typeof stream.destroy == 'function')
      stream.destroy(...args)
    // oye, last shot: end()
    else if (typeof stream.end == 'function')
      stream.end(...args)
  }

  // helpers
  function closeAllWebcontentsStreams (webcontentsId) {
    return e => {
      if (!webcontentsStreams[webcontentsId])
        return

      // close all of the open streams
      for (var requestId in webcontentsStreams[webcontentsId]) {
        if (webcontentsStreams[webcontentsId][requestId]) {
          webcontentsStreams[webcontentsId][requestId].unregisterEvents()
          streamRequestClose(requestId, [])
        }
      }

      // stop tracking
      delete webcontentsStreams[webcontentsId]
    }
  }

  return api
}

function errorObject (err) {
  if (err.name || err.message) {
    return { name: err.name, message: err.message }
  }
  return err.toString()
}

}).call(this,{"isBuffer":require("../../../../node_modules/is-buffer/index.js")})
},{"../../../../node_modules/is-buffer/index.js":81,"./util":55,"electron":undefined,"events":undefined,"stream":undefined}],54:[function(require,module,exports){
const EventEmitter = require('events')
const { Readable, Writable } = require('stream')
const { ipcRenderer } = require('electron')
const {valueToIPCValue, IPCValueToValue} = require('./util')

module.exports = function (channelName, manifest, opts) {
  var api = new EventEmitter()
  var asyncCbs = [] // active asyncs' cbs, waiting for a response
  var asyncCbTimeouts = {} // timers for async call timeouts
  var streams = [] // active streams
  opts = opts || {}
  if (typeof opts.timeout == 'undefined')
    opts.timeout = 30e3

  // api method generators
  var createAPIMethod = {
    sync: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, 0, ...args)

        // handle response
        if (success)
          return IPCValueToValue(success)
        if (error)
          throw createError(error)
      }
    },
    async: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the cb
        var requestId = asyncCbs.length
        var cb = (typeof args[args.length - 1] == 'function') ? args.pop() : (()=>{})
        asyncCbs.push(cb)
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)
      }
    },
    promise: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // track the promise
        var requestId = asyncCbs.length
        var p = new Promise((resolve, reject) => {
          asyncCbs.push((err, value) => {
            if (err) reject(err)
            else     resolve(value)
          })
        })
        if (opts.timeout)
          asyncCbTimeouts[requestId] = setTimeout(onTimeout, opts.timeout, requestId)

        // send message
        ipcRenderer.send(channelName, methodName, requestId, ...args)

        return p
      }
    },
    readable: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          // hook up the readable
          let r = new Readable({
            objectMode: true,
            read() {}
          })
          r.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
          streams.push(r)
          return r
        }
        if (error)
          throw createError(error)
      }
    },
    writable: methodName => {
      return (...args) => {
        args = args.map(valueToIPCValue)

        // send message
        var requestId = streams.length
        var { success, error } = ipcRenderer.sendSync(channelName, methodName, requestId, ...args)

        // handle response
        if (success) {
          // hook up the writable
          let w = new Writable({
            objectMode: true,
            write (chunk, enc, next) {
              ipcRenderer.sendSync(channelName, 'stream-request-write', requestId, chunk, enc)
              next()
            }
          })
          w.end   = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-end', requestId, ...args)
          w.close = (...args) => ipcRenderer.sendSync(channelName, 'stream-request-close', requestId, ...args)
          streams.push(w)
          return w
        }
        if (error)
          throw createError(error)
      }
    },
  }

  // create api
  for (let name in manifest) {
    let type = manifest[name]
    api[name] = createAPIMethod[type](name)
  } 

  // wire up the message-handler
  ipcRenderer.on(channelName, function onIPCMessage (event, msgType, requestId, ...args) {
    // handle async replies
    if (msgType == 'async-reply')
      return onCbReply(requestId, args.map(IPCValueToValue))

    // handle stream messages
    if (msgType.startsWith('stream-')) {
      var stream = streams[requestId]
      if (!stream)
        return api.emit('error', new Error('Stream message came from main process for a nonexistant stream'), arguments)

      // Event: 'data'
      if (msgType == 'stream-data')
        return stream.push(IPCValueToValue(args[0]))

      // Event: 'readable'
      if (msgType == 'stream-readable')
        return stream.emit('readable')

      // Event: 'drain'
      if (msgType == 'stream-drain')
        return stream.emit('drain')

      // Event: 'close'
      if (msgType == 'stream-close')
        return stream.emit('close')

      // Event: 'end' or 'error'
      if (['stream-error', 'stream-end', 'stream-finish'].includes(msgType)) {
        // emit
        if (msgType == 'stream-error')
          stream.emit('error', createError(args[0]))
        if (msgType == 'stream-end')
          stream.emit('end')
        if (msgType == 'stream-finish')
          stream.emit('finish')

        // stop tracking the stream
        streams[requestId] = null
        for (let eventName of stream.eventNames())
          stream.removeAllListeners(eventName)

        return
      }
    }

    // TODO: writable

    api.emit('error', new Error('Unknown message type'), arguments)
  })

  function onCbReply (requestId, args) {
    // find the cb
    var cb = asyncCbs[requestId]
    if (!cb)
      return api.emit('error', new Error('Async reply came from main process for a nonwaiting request'), requestId, args)

    // stop tracking the cb
    asyncCbs[requestId] = null
    if (asyncCbTimeouts[requestId])
      clearTimeout(asyncCbTimeouts[requestId])

    // turn the error into an Error object
    if (args[0]) {
      args[0] = createError(args[0])
    }

    // call and done
    cb(...args)
    return
  }

  function onTimeout (requestId) {
    onCbReply(requestId, ['Timed out'])
  }

  function createError (error) {
    if (opts.errors) {
      var name = error.name || error
      if (typeof name === 'string' && name in opts.errors) {
        var ErrCons = opts.errors[name]
        return new ErrCons(error.message || error)
      }
    }
    return new Error(error.message || error)
  }

  return api
}

},{"./util":55,"electron":undefined,"events":undefined,"stream":undefined}],55:[function(require,module,exports){
(function (Buffer){

module.exports.valueToIPCValue = function (v) {
  if (v && (ArrayBuffer.isView(v) || v instanceof ArrayBuffer)) {
    return Buffer.from(v)
  }
  return v
}

module.exports.IPCValueToValue = function (v) {
  if (v && v instanceof Uint8Array && v.buffer) {
    return v.buffer
  }
  return v
}
}).call(this,require("buffer").Buffer)
},{"buffer":undefined}],56:[function(require,module,exports){
/*!
 * preserve <https://github.com/jonschlinkert/preserve>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

/**
 * Replace tokens in `str` with a temporary, heuristic placeholder.
 *
 * ```js
 * tokens.before('{a\\,b}');
 * //=> '{__ID1__}'
 * ```
 *
 * @param  {String} `str`
 * @return {String} String with placeholders.
 * @api public
 */

exports.before = function before(str, re) {
  return str.replace(re, function (match) {
    var id = randomize();
    cache[id] = match;
    return '__ID' + id + '__';
  });
};

/**
 * Replace placeholders in `str` with original tokens.
 *
 * ```js
 * tokens.after('{__ID1__}');
 * //=> '{a\\,b}'
 * ```
 *
 * @param  {String} `str` String with placeholders
 * @return {String} `str` String with original tokens.
 * @api public
 */

exports.after = function after(str) {
  return str.replace(/__ID(.{5})__/g, function (_, id) {
    return cache[id];
  });
};

function randomize() {
  return Math.random().toString().slice(2, 7);
}

var cache = {};
},{}],57:[function(require,module,exports){
'use strict';
var numberIsNan = require('number-is-nan');

module.exports = function (num) {
	if (typeof num !== 'number' || numberIsNan(num)) {
		throw new TypeError('Expected a number, got ' + typeof num);
	}

	var exponent;
	var unit;
	var neg = num < 0;
	var units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	if (neg) {
		num = -num;
	}

	if (num < 1) {
		return (neg ? '-' : '') + num + ' B';
	}

	exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1);
	num = Number((num / Math.pow(1000, exponent)).toFixed(2));
	unit = units[exponent];

	return (neg ? '-' : '') + num + ' ' + unit;
};

},{"number-is-nan":45}],58:[function(require,module,exports){
(function (Buffer){

module.exports = function prettyHash (buf) {
  if (Buffer.isBuffer(buf)) buf = buf.toString('hex')
  if (typeof buf === 'string' && buf.length > 8) {
    return buf.slice(0, 6) + '..' + buf.slice(-2)
  }
  return buf
}
}).call(this,{"isBuffer":require("../../../node_modules/is-buffer/index.js")})
},{"../../../node_modules/is-buffer/index.js":81}],59:[function(require,module,exports){
/*!
 * randomatic <https://github.com/jonschlinkert/randomatic>
 *
 * Copyright (c) 2014-2017, Jon Schlinkert.
 * Released under the MIT License.
 */

'use strict';

var isNumber = require('is-number');
var typeOf = require('kind-of');

/**
 * Expose `randomatic`
 */

module.exports = randomatic;

/**
 * Available mask characters
 */

var type = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  number: '0123456789',
  special: '~!@#$%^&()_+-={}[];\',.'
};

type.all = type.lower + type.upper + type.number + type.special;

/**
 * Generate random character sequences of a specified `length`,
 * based on the given `pattern`.
 *
 * @param {String} `pattern` The pattern to use for generating the random string.
 * @param {String} `length` The length of the string to generate.
 * @param {String} `options`
 * @return {String}
 * @api public
 */

function randomatic(pattern, length, options) {
  if (typeof pattern === 'undefined') {
    throw new Error('randomatic expects a string or number.');
  }

  var custom = false;
  if (arguments.length === 1) {
    if (typeof pattern === 'string') {
      length = pattern.length;

    } else if (isNumber(pattern)) {
      options = {}; length = pattern; pattern = '*';
    }
  }

  if (typeOf(length) === 'object' && length.hasOwnProperty('chars')) {
    options = length;
    pattern = options.chars;
    length = pattern.length;
    custom = true;
  }

  var opts = options || {};
  var mask = '';
  var res = '';

  // Characters to be used
  if (pattern.indexOf('?') !== -1) mask += opts.chars;
  if (pattern.indexOf('a') !== -1) mask += type.lower;
  if (pattern.indexOf('A') !== -1) mask += type.upper;
  if (pattern.indexOf('0') !== -1) mask += type.number;
  if (pattern.indexOf('!') !== -1) mask += type.special;
  if (pattern.indexOf('*') !== -1) mask += type.all;
  if (custom) mask += pattern;

  while (length--) {
    res += mask.charAt(parseInt(Math.random() * mask.length, 10));
  }
  return res;
};

},{"is-number":60,"kind-of":62}],60:[function(require,module,exports){
/*!
 * is-number <https://github.com/jonschlinkert/is-number>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var typeOf = require('kind-of');

module.exports = function isNumber(num) {
  var type = typeOf(num);

  if (type === 'string') {
    if (!num.trim()) return false;
  } else if (type !== 'number') {
    return false;
  }

  return (num - num + 1) >= 0;
};

},{"kind-of":61}],61:[function(require,module,exports){
arguments[4][35][0].apply(exports,arguments)
},{"dup":35,"is-buffer":24}],62:[function(require,module,exports){
var isBuffer = require('is-buffer');
var toString = Object.prototype.toString;

/**
 * Get the native `typeof` a value.
 *
 * @param  {*} `val`
 * @return {*} Native javascript type
 */

module.exports = function kindOf(val) {
  // primitivies
  if (typeof val === 'undefined') {
    return 'undefined';
  }
  if (val === null) {
    return 'null';
  }
  if (val === true || val === false || val instanceof Boolean) {
    return 'boolean';
  }
  if (typeof val === 'string' || val instanceof String) {
    return 'string';
  }
  if (typeof val === 'number' || val instanceof Number) {
    return 'number';
  }

  // functions
  if (typeof val === 'function' || val instanceof Function) {
    return 'function';
  }

  // array
  if (typeof Array.isArray !== 'undefined' && Array.isArray(val)) {
    return 'array';
  }

  // check for instances of RegExp and Date before calling `toString`
  if (val instanceof RegExp) {
    return 'regexp';
  }
  if (val instanceof Date) {
    return 'date';
  }

  // other objects
  var type = toString.call(val);

  if (type === '[object RegExp]') {
    return 'regexp';
  }
  if (type === '[object Date]') {
    return 'date';
  }
  if (type === '[object Arguments]') {
    return 'arguments';
  }
  if (type === '[object Error]') {
    return 'error';
  }
  if (type === '[object Promise]') {
    return 'promise';
  }

  // buffer
  if (isBuffer(val)) {
    return 'buffer';
  }

  // es6: Map, WeakMap, Set, WeakSet
  if (type === '[object Set]') {
    return 'set';
  }
  if (type === '[object WeakSet]') {
    return 'weakset';
  }
  if (type === '[object Map]') {
    return 'map';
  }
  if (type === '[object WeakMap]') {
    return 'weakmap';
  }
  if (type === '[object Symbol]') {
    return 'symbol';
  }

  // typed arrays
  if (type === '[object Int8Array]') {
    return 'int8array';
  }
  if (type === '[object Uint8Array]') {
    return 'uint8array';
  }
  if (type === '[object Uint8ClampedArray]') {
    return 'uint8clampedarray';
  }
  if (type === '[object Int16Array]') {
    return 'int16array';
  }
  if (type === '[object Uint16Array]') {
    return 'uint16array';
  }
  if (type === '[object Int32Array]') {
    return 'int32array';
  }
  if (type === '[object Uint32Array]') {
    return 'uint32array';
  }
  if (type === '[object Float32Array]') {
    return 'float32array';
  }
  if (type === '[object Float64Array]') {
    return 'float64array';
  }

  // must be a plain object
  return 'object';
};

},{"is-buffer":24}],63:[function(require,module,exports){
/*!
 * regex-cache <https://github.com/jonschlinkert/regex-cache>
 *
 * Copyright (c) 2015 Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

var isPrimitive = require('is-primitive');
var equal = require('is-equal-shallow');
var basic = {};
var cache = {};

/**
 * Expose `regexCache`
 */

module.exports = regexCache;

/**
 * Memoize the results of a call to the new RegExp constructor.
 *
 * @param  {Function} fn [description]
 * @param  {String} str [description]
 * @param  {Options} options [description]
 * @param  {Boolean} nocompare [description]
 * @return {RegExp}
 */

function regexCache(fn, str, opts) {
  var key = '_default_', regex, cached;

  if (!str && !opts) {
    if (typeof fn !== 'function') {
      return fn;
    }
    return basic[key] || (basic[key] = fn(str));
  }

  var isString = typeof str === 'string';
  if (isString) {
    if (!opts) {
      return basic[str] || (basic[str] = fn(str));
    }
    key = str;
  } else {
    opts = str;
  }

  cached = cache[key];
  if (cached && equal(cached.opts, opts)) {
    return cached.regex;
  }

  memo(key, opts, (regex = fn(str, opts)));
  return regex;
}

function memo(key, opts, regex) {
  cache[key] = {regex: regex, opts: opts};
}

/**
 * Expose `cache`
 */

module.exports.cache = cache;
module.exports.basic = basic;

},{"is-equal-shallow":26,"is-primitive":32}],64:[function(require,module,exports){
(function (process){
var isWin = process.platform === 'win32';

module.exports = function (str) {
	while (endsInSeparator(str)) {
		str = str.slice(0, -1);
	}
	return str;
};

function endsInSeparator(str) {
	var last = str[str.length - 1];
	return str.length > 1 && (last === '/' || (isWin && last === '\\'));
}

}).call(this,require('_process'))
},{"_process":82}],65:[function(require,module,exports){
/*!
 * repeat-element <https://github.com/jonschlinkert/repeat-element>
 *
 * Copyright (c) 2015 Jon Schlinkert.
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function repeat(ele, num) {
  var arr = new Array(num);

  for (var i = 0; i < num; i++) {
    arr[i] = ele;
  }

  return arr;
};

},{}],66:[function(require,module,exports){
/*!
 * repeat-string <https://github.com/jonschlinkert/repeat-string>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

/**
 * Results cache
 */

var res = '';
var cache;

/**
 * Expose `repeat`
 */

module.exports = repeat;

/**
 * Repeat the given `string` the specified `number`
 * of times.
 *
 * **Example:**
 *
 * ```js
 * var repeat = require('repeat-string');
 * repeat('A', 5);
 * //=> AAAAA
 * ```
 *
 * @param {String} `string` The string to repeat
 * @param {Number} `number` The number of times to repeat the string
 * @return {String} Repeated string
 * @api public
 */

function repeat(str, num) {
  if (typeof str !== 'string') {
    throw new TypeError('expected a string');
  }

  // cover common, quick use cases
  if (num === 1) return str;
  if (num === 2) return str + str;

  var max = str.length * num;
  if (cache !== str || typeof cache === 'undefined') {
    cache = str;
    res = '';
  } else if (res.length >= max) {
    return res.substr(0, max);
  }

  while (max > res.length && num > 1) {
    if (num & 1) {
      res += str;
    }

    num >>= 1;
    str += str;
  }

  res += str;
  res = res.substr(0, max);
  return res;
}

},{}],67:[function(require,module,exports){
/* globals window DatArchive */
const DatArchive = window.DatArchive
const EventEmitter = require('events')
const {debug, veryDebug, assert, eventHandler, errorHandler, eventRebroadcaster} = require('./lib/util')
const {DatabaseClosedError, SchemaError} = require('./lib/errors')
const Schemas = require('./lib/schemas')
const Indexer = require('./lib/indexer')
const InjestTable = require('./lib/table')
const indexedDB = window.indexedDB

class InjestDB extends EventEmitter {
  constructor (name) {
    super()
    this.idx = false
    this.name = name
    this.version = 0
    this.isBeingOpened = false
    this.isOpen = false
    this.isClosed = false
    this._schemas = []
    this._archives = {}
    this._tablesToRebuild = []
    this._activeTableNames = []
    this._activeSchema = null
    this._tablePathPatterns = []
    this._dbReadyPromise = new Promise((resolve, reject) => {
      this.once('open', () => resolve(this))
      this.once('open-failed', reject)
    })

    // Default subscribers to 'versionchange' and 'blocked'.
    // Can be overridden by custom handlers. If custom handlers return false, these default
    // behaviours will be prevented.
    this.on('versionchange', e => {
      // Default behavior for versionchange event is to close database connection.
      // Caller can override this behavior by doing this.on('versionchange', function(){ return false; });
      // Let's not block the other window from making it's delete() or open() call.
      // NOTE! This event is never fired in IE,Edge or Safari.
      if (e.newVersion > 0) {
        console.warn(`Another connection wants to upgrade database '${this.name}'. Closing db now to resume the upgrade.`)
      } else {
        console.warn(`Another connection wants to delete database '${this.name}'. Closing db now to resume the delete request.`)
      }
      this.close()
      // In many web applications, it would be recommended to force window.reload()
      // when this event occurs. To do that, subscribe to the versionchange event
      // and call window.location.reload(true) if e.newVersion > 0 (not a deletion)
      // The reason for this is that your current web app obviously has old schema code that needs
      // to be updated. Another window got a newer version of the app and needs to upgrade DB but
      // your window is blocking it unless we close it here.
    })
    this.on('blocked', e => {
      if (!e.newVersion || e.newVersion < e.oldVersion) {
        console.warn(`InjestDB.delete('${this.name}') was blocked`)
      } else {
        console.warn(`Upgrade '${this.name}' blocked by other connection holding version ${e.oldVersion}`)
      }
    })
  }

  async open () {
    // guard against duplicate opens
    if (this.isBeingOpened || this.idx) {
      veryDebug('duplicate open, returning ready promise')
      return this._dbReadyPromise
    }
    if (this.isOpen) {
      return
    }
    // if (this.isClosed) {
    //   veryDebug('open after close')
    //   throw new DatabaseClosedError()
    // }
    this.isBeingOpened = true
    Schemas.addBuiltinTableSchemas(this)

    debug('opening')

    var upgradeTransaction
    try {
      // start the opendb request
      await new Promise((resolve, reject) => {
        var req = indexedDB.open(this.name, this.version)
        req.onerror = errorHandler(reject)
        req.onblocked = eventRebroadcaster(this, 'blocked')

        // run the upgrades
        req.onupgradeneeded = eventHandler(async e => {
          debug('upgrade needed', {oldVersion: e.oldVersion, newVersion: e.newVersion})
          upgradeTransaction = req.transaction
          upgradeTransaction.onerror = errorHandler(reject) // if upgrade fails, open() fails
          await runUpgrades({db: this, oldVersion: e.oldVersion, upgradeTransaction})
        }, reject)

        // open suceeded
        req.onsuccess = eventHandler(async () => {
          // construct the final injestdb object
          this._activeSchema = this._schemas.reduce(Schemas.merge, {})
          this.isBeingOpened = false
          this.isOpen = true
          this.idx = req.result
          Schemas.addTables(this)
          var needsRebuild = await Indexer.resetOutdatedIndexes(this)
          await Indexer.loadArchives(this, needsRebuild)

          // events
          debug('opened')
          this.idx.onversionchange = eventRebroadcaster(this, 'versionchange')
          this.emit('open')
          resolve()
        }, reject)
      })
    } catch (e) {
      // Did we fail within onupgradeneeded? Make sure to abort the upgrade transaction so it doesnt commit.
      console.error('Upgrade has failed', e)
      if (upgradeTransaction) {
        upgradeTransaction.abort()
      }
      this.isBeingOpened = false
      this.emit('open-failed', e)
    }
  }

  close () {
    debug('closing')
    if (this.idx) {
      Schemas.removeTables(this)
      this.listArchives().forEach(archive => Indexer.unwatchArchive(this, archive))
      this.idx.close()
      this.idx = null
      veryDebug('db .idx closed')
    } else {
      veryDebug('db .idx didnt yet exist')
    }
    this.isOpen = false
    this.isClosed = true
  }

  schema (desc) {
    assert(!this.idx && !this.isBeingOpened, SchemaError, 'Cannot add version when database is open')
    Schemas.validateAndSanitize(desc)

    // update current version
    this.version = Math.max(this.version, desc.version)
    this._schemas.push(desc)
    this._schemas.sort(lowestVersionFirst)
  }

  get tables () {
    return this._activeTableNames
      .filter(name => !name.startsWith('_'))
      .map(name => this[name])
  }

  async prepareArchive (archive) {
    archive = typeof archive === 'string' ? new window.DatArchive(archive) : archive
    await Promise.all(this.tables.map(table => {
      if (!table.schema.singular) {
        return archive.mkdir(`/${table.name}`).catch(() => {})
      }
    }))
  }

  async addArchive (archive, {prepare} = {}) {
    // create our own new DatArchive instance
    archive = typeof archive === 'string' ? new window.DatArchive(archive) : archive
    if (!(archive.url in this._archives)) {
      // store and process
      debug('Injest.addArchive', archive.url)
      this._archives[archive.url] = archive
      if (prepare) await this.prepareArchive(archive)
      await Indexer.addArchive(this, archive)
    }
  }

  async addArchives (archives, opts) {
    archives = Array.isArray(archives) ? archives : [archives]
    return Promise.all(archives.map(a => this.addArchive(a, opts)))
  }

  async removeArchive (archive) {
    archive = typeof archive === 'string' ? new window.DatArchive(archive) : archive
    if (archive.url in this._archives) {
      debug('Injest.removeArchive', archive.url)
      delete this._archives[archive.url]
      await Indexer.removeArchive(this, archive)
    }
  }

  listArchives (archive) {
    return Object.keys(this._archives).map(url => this._archives[url])
  }

  static list () {
    // TODO
  }

  static delete (name) {
    // delete the database from indexeddb
    return new Promise((resolve, reject) => {
      var req = indexedDB.deleteDatabase(name)
      req.onsuccess = resolve
      req.onerror = errorHandler(reject)
      req.onblocked = eventRebroadcaster(this, 'blocked')
    })
  }
}
module.exports = InjestDB

// run the database's queued upgrades
async function runUpgrades ({db, oldVersion, upgradeTransaction}) {
  // get the ones that haven't been run
  var upgrades = db._schemas.filter(s => s.version > oldVersion)
  db._activeSchema = db._schemas.filter(s => s.version <= oldVersion).reduce(Schemas.merge, {})
  if (oldVersion > 0 && !db._activeSchema) {
    throw new SchemaError(`Missing schema for previous version (${oldVersion}), unable to run upgrade.`)
  }
  debug(`running upgrade from ${oldVersion}, ${upgrades.length} upgrade(s) found`)

  // diff and apply changes
  var tablesToRebuild = []
  for (let schema of upgrades) {
    // compute diff
    debug(`applying upgrade for version ${schema.version}`)
    var diff = Schemas.diff(db._activeSchema, schema)

    // apply diff
    await Schemas.applyDiff(db, upgradeTransaction, diff)
    tablesToRebuild.push(diff.tablesToRebuild)

    // update current schema
    db._activeSchema = Schemas.merge(db._activeSchema, schema)
    debug(`version ${schema.version} applied`)
  }

  // track the tables that need rebuilding
  db._tablesToRebuild = Array.from(new Set(...tablesToRebuild))
  debug('Injest.runUpgrades complete', (db._tablesToRebuild.length === 0) ? '- no rebuilds needed' : 'REBUILD REQUIRED')
}

function lowestVersionFirst (a, b) {
  return a.version - b.version
}

},{"./lib/errors":68,"./lib/indexer":70,"./lib/schemas":72,"./lib/table":73,"./lib/util":74,"events":undefined}],68:[function(require,module,exports){
class ExtendableError extends Error {
  constructor (msg) {
    super(msg)
    this.name = this.constructor.name
    this.message = msg
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error(msg)).stack
    }
  }
}

exports.DatabaseClosedError = class DatabaseClosedError extends ExtendableError {
  constructor (msg) {
    super(msg || 'Database has been closed')
    this.databaseClosedError = true
  }
}

exports.SchemaError = class SchemaError extends ExtendableError {
  constructor (msg) {
    super(msg || 'Schema error')
    this.schemaError = true
  }
}

exports.ParameterError = class ParameterError extends ExtendableError {
  constructor (msg) {
    super(msg || 'Invalid parameter')
    this.parameterError = true
  }
}

exports.QueryError = class QueryError extends ExtendableError {
  constructor (msg) {
    super(msg || 'Query is malformed')
    this.queryError = true
  }
}

},{}],69:[function(require,module,exports){
const IDBKeyRange = window.IDBKeyRange
const {assert, eventHandler, errorHandler, debug, veryDebug} = require('./util')

// exported api
// =

exports.get = async function (table, key) {
  assert(key && typeof key === 'string')
  return transact(table, store => store.get(key))
}

exports.put = async function (table, record) {
  assert(record && typeof record === 'object')
  return transact(table, store => store.put(record), 'readwrite')
}

exports.update = async function (table, key, updates) {
  assert(updates && typeof updates === 'object')
  var record = await exports.get(table, key)
  record = record || {}
  for (var k in updates) {
    record[k] = updates[k]
  }
  await exports.put(table, record)
}

exports.delete = async function (table, key) {
  assert(key && typeof key === 'string')
  return transact(table, store => store.delete(key), 'readwrite')
}

exports.clear = async function (table) {
  return transact(table, store => store.clear(), 'readwrite')
}

exports.iterate = async function (recordSet, fn) {
  return new Promise((resolve, reject) => {
    debug('IDB.iterate', recordSet._table.name)
    var tx = getTransaction(recordSet._table)
    var store = getStore(recordSet._table, tx)
    var request = createCursor(store, recordSet)
    // veryDebug('iterating', recordSet)

    var resultIndex = 0
    var numEmitted = 0
    var {_offset, _limit} = recordSet
    _offset = _offset || 0
    _limit = _limit || false
    veryDebug('offset', _offset, 'limit', _limit)
    veryDebug('where', recordSet._where)
    request.onsuccess = (e) => {
      var cursor = e.target.result
      if (cursor) {
        veryDebug('onsuccess', cursor.value)
        if (resultIndex >= _offset && applyFilters(recordSet, cursor.value)) {
          // iter call
          fn(cursor.value)
          numEmitted++
        }
        resultIndex++
        if (_limit && numEmitted >= _limit || applyUntil(recordSet, cursor.value)) {
          // hit limit/until, stop here
          cursor.advance(1e9) // let's assume there wont ever be a billion records
        } else {
          cursor.continue()
        }
      } else {
        // no result signals we're finished
        resolve()
      }
    }
    request.onerror = errorHandler(reject)
  })
}

// internal methods
// =

async function transact (table, fn, type) {
  return new Promise((resolve, reject) => {
    var tx = getTransaction(table, type)
    var store = getStore(table, tx)
    var req = fn(store)
    tx.onerror = errorHandler(reject)
    tx.oncomplete = eventHandler(e => resolve(req.result), reject)
  })
}

function getTransaction (table, type) {
  return table.db.idx.transaction([table.name], type)
}

function getStore (table, tx) {
  return tx.objectStore(table.name)
}

function createCursor (store, recordSet) {
  const {_direction, _distinct, _where} = recordSet

  // use an index if reading from the non-primary key
  var cursorFactory = store
  if (_where && _where._index !== '_url') {
    veryDebug('IDB.createCursor setting cursor factory to index', _where._index)
    cursorFactory = store.index(_where._index)
  } else {
    veryDebug('IDB.createCursor using default cursor factory')
  }

  // build params and start read
  const keyRange = createKeyRange(_where)
  return cursorFactory.openCursor(keyRange, _direction + (_distinct ? 'unique' : ''))
}

function createKeyRange (whereClause) {
  if (!whereClause) return
  if (whereClause._only) {
    return IDBKeyRange.only(whereClause._only)
  }
  if (whereClause._lowerBound && whereClause._upperBound) {
    return IDBKeyRange.bound(
      whereClause._lowerBound,
      whereClause._upperBound,
      !whereClause._lowerBoundInclusive,
      !whereClause._upperBoundInclusive
    )
  }
  if (whereClause._lowerBound) {
    return IDBKeyRange.lowerBound(
      whereClause._lowerBound,
      !whereClause._lowerBoundInclusive
    )
  }
  if (whereClause._upperBound) {
    return IDBKeyRange.upperBound(
      whereClause._upperBound,
      !whereClause._upperBoundInclusive
    )
  }
}

function applyFilters (recordSet, value) {
  for (let i = 0; i < recordSet._filters.length; i++) {
    if (!recordSet._filters[i](value)) {
      return false
    }
  }
  return true
}

function applyUntil (recordSet, value) {
  return (recordSet._until && recordSet._until(value))
}

},{"./util":74}],70:[function(require,module,exports){
/* globals window */

const flatten = require('lodash.flatten')
const anymatch = require('anymatch')
const DatArchive = window.DatArchive
const IDB = require('./idb-wrapper')
const {debug, veryDebug, lock} = require('./util')

// exported api
// =

exports.loadArchives = async function (db, needsRebuild) {
  debug('Indexer.loadArchives, needsRebuild=' + needsRebuild)
  var promises = []
  await db._indexMeta.each(indexMeta => {
    debug('loading archive', indexMeta._url)
    // load the archive
    const archive = newDatArchive(indexMeta._url)
    archive.isWritable = indexMeta.isWritable
    db._archives[archive.url] = archive

    // process the archive
    promises.push(indexArchive(db, archive, needsRebuild))
    exports.watchArchive(db, archive)
  })
  debug('Indexer.loadArchives done')
  return Promise.all(promises)
}

exports.addArchive = async function (db, archive) {
  veryDebug('Indexer.addArchive', archive.url)
  // store entry in the meta db
  var info = await archive.getInfo()
  archive.isWritable = info.isOwner
  await IDB.put(db._indexMeta, {
    _url: archive.url,
    version: 0,
    isWritable: archive.isWritable
  })
  // process the archive
  await indexArchive(db, archive)
  exports.watchArchive(db, archive)
}

exports.removeArchive = async function (db, archive) {
  veryDebug('Indexer.removeArchive', archive.url)
  await unindexArchive(db, archive)
  exports.unwatchArchive(db, archive)
}

exports.watchArchive = async function (db, archive) {
  veryDebug('Indexer.watchArchive', archive.url)
  if (archive.fileEvents) {
    console.error('watchArchive() called on archive that already is being watched', archive.url)
    return
  }
  if (archive._loadPromise) {
    // HACK node-dat-archive fix
    // Because of a weird API difference btwn node-dat-archive and beaker's DatArchive...
    // ...the event-stream methods need await _loadPromise
    // -prf
    await archive._loadPromise
  }
  archive.fileEvents = archive.createFileActivityStream(db.tablePathPatterns)
  // autodownload all changes to the watched files
  archive.fileEvents.addEventListener('invalidated', ({path}) => archive.download(path))
  // autoindex on changes
  // TODO debounce!!!!
  archive.fileEvents.addEventListener('changed', ({path}) => indexArchive(db, archive))
}

exports.unwatchArchive = function (db, archive) {
  veryDebug('unwatching', archive.url)
  if (archive.fileEvents) {
    archive.fileEvents.close()
    archive.fileEvents = null
  }
}

exports.waitTillIndexed = async function (db, archive) {
  debug('Indexer.waitTillIndexed', archive.url)
  // fetch the current state of the archive's index
  var [indexMeta, archiveMeta] = await Promise.all([
    IDB.get(db._indexMeta, archive.url),
    archive.getInfo()
  ])
  indexMeta = indexMeta || {version: 0}

  // done?
  if (indexMeta.version >= archiveMeta.version) {
    debug('Indexer.waitTillIndexed already indexed')
    return
  }

  return new Promise(resolve => {
    db.on('indexes-updated', onIndex)
    function onIndex (indexedArchive, version) {
      if (indexedArchive.url === archive.url && version >= archiveMeta.version) {
        db.removeListener('indexes-updated', onIndex)
        resolve()
      }
    }
  })
}

exports.resetOutdatedIndexes = async function (db) {
  if (db._tablesToRebuild.length === 0) {
    return false
  }
  debug(`Indexer.resetOutdatedIndexes need to rebuid ${db._tablesToRebuild.length} tables`)
  veryDebug('Indexer.resetOutdatedIndexes tablesToRebuild', db._tablesToRebuild)

  // clear tables
  // TODO
  // for simplicity, we just clear all data and re-index everything
  // a better future design would only clear the tables that changed
  // unfortunately our indexer isn't smart enough for that yet
  // -prf
  const tables = db.tables
  for (let i = 0; i < tables.length; i++) {
    let table = tables[i]
    veryDebug('clearing', table.name)
    // clear indexed data
    await IDB.clear(table)
  }

  // reset meta records
  var promises = []
  await db._indexMeta.each(indexMeta => {
    indexMeta.version = 0
    promises.push(IDB.put(db._indexMeta, indexMeta))
  })
  await Promise.all(promises)

  return true
}

// figure how what changes need to be processed
// then update the indexes
async function indexArchive (db, archive, needsRebuild) {
  debug('Indexer.indexArchive', archive.url, {needsRebuild})
  var release = await lock(`index:${archive.url}`)
  try {
    // sanity check
    if (!db.isOpen) {
      return console.log('indexArchive called on closed db')
    }
    if (!db.idx) {
      return console.log('indexArchive called on corrupted db')
    }

    // fetch the current state of the archive's index
    var [indexMeta, archiveMeta] = await Promise.all([
      IDB.get(db._indexMeta, archive.url),
      archive.getInfo()
    ])
    indexMeta = indexMeta || {version: 0}

    // has this version of the archive been processed?
    if (indexMeta && indexMeta.version >= archiveMeta.version) {
      debug('Indexer.indexArchive no index needed for', archive.url)
      return // yes, stop
    }
    debug('Indexer.indexArchive ', archive.url, 'start', indexMeta.version, 'end', archiveMeta.version)

    // find and apply all changes which haven't yet been processed
    var updates = await scanArchiveHistoryForUpdates(db, archive, {
      start: indexMeta.version + 1,
      end: archiveMeta.version + 1
    })
    var results = await applyUpdates(db, archive, updates)
    debug('Indexer.indexArchive applied', results.length, 'updates from', archive.url)

    // update meta
    await IDB.update(db._indexMeta, archive.url, {
      _url: archive.url,
      version: archiveMeta.version // record the version we've indexed
    })

    // emit
    var updatedTables = new Set(results)
    for (let tableName of updatedTables) {
      if (!tableName) continue
      db[tableName].emit('index-updated', archive, archiveMeta.version)
    }
    db.emit('indexes-updated', archive, archiveMeta.version)
  } finally {
    release()
  }
}
exports.indexArchive = indexArchive

// delete all records generated from the archive
async function unindexArchive (db, archive) {
  var release = await lock(`index:${archive.url}`)
  try {
    // find any relevant records and delete them from the indexes
    var recordMatches = await scanArchiveForRecords(db, archive)
    await Promise.all(recordMatches.map(match => IDB.delete(match.table, match.recordUrl)))
    await IDB.delete(db._indexMeta, archive.url)
  } finally {
    release()
  }
}
exports.unindexArchive = unindexArchive

// internal methods
// =

// look through the given history slice
// match against the tables' path patterns
// return back the *latest* change to each matching changed record
async function scanArchiveHistoryForUpdates (db, archive, {start, end}) {
  var history = await archive.history({start, end})
  var updates = {}
  history.forEach(update => {
    if (anymatch(db._tablePathPatterns, update.path)) {
      updates[update.path] = update
    }
  })
  return updates
}

// look through the archive for any files that generate records
async function scanArchiveForRecords (db, archive) {
  var recordFiles = await Promise.all(db.tables.map(table => {
    return table.listRecordFiles(archive)
  }))
  return flatten(recordFiles)
}

// iterate the updates and apply them to the indexes
async function applyUpdates (db, archive, updates) {
  return Promise.all(Object.keys(updates).map(async path => {
    var update = updates[path]
    if (update.type === 'del') {
      return unindexFile(db, archive, update.path)
    } else {
      return readAndIndexFile(db, archive, update.path)
    }
  }))
}

// read the file, find the matching table, validate, then store
async function readAndIndexFile (db, archive, filepath) {
  const tables = db.tables
  const fileUrl = archive.url + filepath
  try {
    // read file
    var record = JSON.parse(await archive.readFile(filepath))

    // index on the first matching table
    for (var i = 0; i < tables.length; i++) {
      let table = tables[i]
      if (table.isRecordFile(filepath)) {
        // validate if needed
        if (table.schema.validator) {
          record = table.schema.validator(record)
        }
        // add standard attributes
        record._url = fileUrl
        record._origin = archive.url
        // save
        await IDB.put(table, record)
        return table.name
      }
    }
  } catch (e) {
    console.log('Failed to index', fileUrl, e)
  }
  return false
}

async function unindexFile (db, archive, filepath) {
  const tables = db.tables
  const fileUrl = archive.url + filepath
  try {
    // unindex on the first matching table
    for (var i = 0; i < tables.length; i++) {
      let table = tables[i]
      if (table.isRecordFile(filepath)) {
        await IDB.delete(table, fileUrl)
        return table.name
      }
    }
  } catch (e) {
    console.log('Failed to unindex', fileUrl, e)
  }
  return false
}

function newDatArchive (url) {
  console.log('dat archive in injest', DatArchive)
  console.log('window', window)
  console.log('dat class', window.DatArchive)
  if (!DatArchive) {
    return new window.DatArchive(url)
  }
  return new DatArchive(url)
}

},{"./idb-wrapper":69,"./util":74,"anymatch":76,"lodash.flatten":36}],71:[function(require,module,exports){
const IDB = require('./idb-wrapper')
const InjestWhereClause = require('./where-clause')
const Indexer = require('./indexer')
const {assert, debug} = require('./util')
const {QueryError, ParameterError} = require('./errors')

class InjestRecordSet {
  constructor (table) {
    this._table = table
    this._filters = []
    this._direction = 'next'
    this._offset = 0
    this._limit = false
    this._until = null
    this._distinct = false
    this._where = null
  }

  // () => InjestRecordSet
  clone () {
    var clone = new InjestRecordSet()
    for (var k in this) {
      if (k.startsWith('_')) {
        clone[k] = this[k]
      }
    }
    return clone
  }

  // () => Promise<Number>
  async count () {
    var count = 0
    await this.each(() => { count++ })
    return count
  }

  // () => Promise<Number>
  async delete () {
    var deletes = []
    await this.each(record => {
      const archive = this._table.db._archives[record._origin]
      debug('RecordSet.delete', record)
      if (archive && archive.isWritable) {
        const filepath = record._url.slice(record._origin.length)
        deletes.push(
          archive.unlink(filepath)
            .then(() => Indexer.indexArchive(this._table.db, archive))
        )
      } else {
        debug('RecordSet.delete not enacted:', !archive ? 'Archive not found' : 'Archive not writable')
      }
    })
    await Promise.all(deletes)
    return deletes.length
  }

  // () => InjestRecordSet
  distinct () {
    this._distinct = true
    return this
  }

  // (Function) => Promise<Void>
  async each (fn) {
    return IDB.iterate(this, fn)
  }

  // (Function) => Promise<Void>
  async eachKey (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .eachKey() must be a function, got ${fn}`)
    return this.each(cursor => { fn(cursor[this._table.schema.primaryKey || '_url']) })
  }

  // (Function) => Promise<Void>
  async eachUrl (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .eachUrl() must be a function, got ${fn}`)
    return this.each(cursor => { fn(cursor._url) })
  }

  // (Function) => InjestRecordSet
  filter (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .filter() must be a function, got ${fn}`)
    this._filters.push(fn)
    return this
  }

  // () => Promise<Object>
  async first () {
    var arr = await this.limit(1).toArray()
    return arr[0]
  }

  // () => Promise<Array<String>>
  async keys () {
    var keys = []
    await this.eachKey(key => keys.push(key))
    return keys
  }

  // () => Promise<Object>
  async last () {
    return this.reverse().first()
  }

  // (Number) => InjestRecordSet
  limit (n) {
    assert(typeof n === 'number', ParameterError, `The first parameter to .limit() must be a number, got ${n}`)
    this._limit = n
    return this
  }

  // (Number) => InjestRecordSet
  offset (n) {
    assert(typeof n === 'number', ParameterError, `The first parameter to .offset() must be a number, got ${n}`)
    this._offset = n
    return this
  }

  // (index) => InjestWhereClause
  or (index) {
    assert(this._where, QueryError, 'Can not have a .or() before a .where()')
    // TODO
  }

  // (index) => InjestRecordset
  orderBy (index) {
    assert(typeof index === 'string', ParameterError, `The first parameter to .orderBy() must be a string, got ${index}`)
    assert(!this._where, QueryError, 'Can not have an .orderBy() and a .where() - where() implicitly sets the orderBy() to its key')
    this._where = new InjestWhereClause(this, index)
    return this
  }

  // () => Promise<Array<String>>
  async urls () {
    var urls = []
    await this.eachUrl(url => urls.push(url))
    return urls
  }

  // () => InjestRecordSet
  reverse () {
    this._direction = this._direction === 'prev' ? 'next' : 'prev'
    return this
  }

  // () => Promise<Array<Object>>
  async toArray () {
    var records = []
    await this.each(record => records.push(record))
    return records
  }

  // () => Promise<Array<String>>
  async uniqueKeys () {
    return Array.from(new Set(await this.keys()))
  }

  // (Function) => InjestRecordSet
  until (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .until() must be a function, got ${fn}`)
    this._until = fn
    return this
  }

  // (Object|Function) => Promise<Number>
  async update (objOrFn) {
    var fn
    if (objOrFn && typeof objOrFn === 'object') {
      // create a function which applies the object updates
      const obj = objOrFn
      fn = record => {
        for (var k in obj) {
          if (k === '_url' || k === '_origin') {
            continue // skip special attrs
          }
          record[k] = obj[k]
        }
      }
    } else if (typeof objOrFn === 'function') {
      fn = objOrFn
    } else {
      throw new ParameterError(`First parameter of .update() must be a function or object, got ${objOrFn}`)
    }

    // apply updates
    var updates = []
    await this.each(record => {
      const archive = this._table.db._archives[record._origin]
      debug('RecordSet.update', record)
      if (archive && archive.isWritable) {
        // run update
        fn(record)

        // run validation
        if (this._table.schema.validator) {
          let _url = record._url
          let _origin = record._origin
          record = this._table.schema.validator(record)
          record._url = _url
          record._origin = _origin
        }

        // write to archvie
        const filepath = record._url.slice(record._origin.length)
        updates.push(
          archive.writeFile(filepath, JSON.stringify(record))
            .then(() => archive.commit())
            .then(() => Indexer.indexArchive(this._table.db, archive))
        )
      } else {
        debug('RecordSet.delete not enacted:', !archive ? 'Archive not found' : 'Archive not writable')
      }
    })
    await Promise.all(updates)
    return updates.length
  }

  // (index|query) => InjestWhereClause|InjestRecordSet
  where (indexOrQuery) {
    assert(!this._where, QueryError, 'Can not have two .where()s unless they are separated by a .or()')
    this._where = new InjestWhereClause(this, indexOrQuery)
    return this._where
  }
}

module.exports = InjestRecordSet

},{"./errors":68,"./idb-wrapper":69,"./indexer":70,"./util":74,"./where-clause":75}],72:[function(require,module,exports){
const InjestTable = require('./table')
const {diffArrays, assert, debug, veryDebug, deepClone} = require('./util')
const {SchemaError} = require('./errors')

exports.validateAndSanitize = function (schema) {
  // validate and sanitize
  assert(schema && typeof schema === 'object', SchemaError, `Must pass a schema object to db.schema(), got ${schema}`)
  assert(schema.version > 0 && typeof schema.version === 'number', SchemaError, `The .version field is required and must be a number, got ${schema.version}`)
  getTableNames(schema).forEach(tableName => {
    var table = schema[tableName]
    if (table === null) {
      return // done, this is a deleted table
    }
    assert(!('singular' in table) || typeof table.singular === 'boolean', SchemaError, `The .singular field must be a bool, got ${table.singular}`)
    assert(!table.index || typeof table.index === 'string' || isArrayOfStrings(table.index), SchemaError, `The .index field must be a string or an array of strings, got ${schema.index}`)
    table.index = arrayify(table.index)
  })
}

// returns {add:[], change: [], remove: [], tablesToRebuild: []}
// - `add` is an array of [name, tableDef]s
// - `change` is an array of [name, tableChanges]s
// - `remove` is an array of names
// - `tablesToRebuild` is an array of names- tables that will need to be cleared and re-ingested
// - applied using `applyDiff()`, below
exports.diff = function (oldSchema, newSchema) {
  if (!oldSchema) {
    debug(`Schemas.diff creating diff for first version`)
  } else {
    debug(`Schemas.diff diffing ${oldSchema.version} against ${newSchema.version}`)
  }
  veryDebug('diff old', oldSchema)
  veryDebug('diff new', newSchema)
  // compare tables in both schemas
  // and produce a set of changes which will modify the db
  // to match `newSchema`
  var diff = {add: [], change: [], remove: [], tablesToRebuild: []}
  var allTableNames = new Set(getTableNames(oldSchema).concat(getTableNames(newSchema)))
  for (let tableName of allTableNames) {
    var oldSchemaHasTable = oldSchema ? (tableName in oldSchema) : false
    var newSchemaHasTable = (newSchema[tableName] !== null)
    if (oldSchemaHasTable && !newSchemaHasTable) {
      // remove
      diff.remove.push(tableName)
    } else if (!oldSchemaHasTable && newSchemaHasTable) {
      // add
      diff.add.push([tableName, newSchema[tableName]])
      diff.tablesToRebuild.push(tableName)
    } else if (newSchema[tableName]) {
      // different?
      var tableChanges = diffTables(oldSchema[tableName], newSchema[tableName])
      veryDebug('Schemas.diff diffTables', tableName, tableChanges)
      if (tableChanges.indexDiff) {
        diff.change.push([tableName, tableChanges])
      }
      if (tableChanges.needsRebuild) {
        diff.tablesToRebuild.push(tableName)
      }
    }
  }
  veryDebug('diff result, add', diff.add, 'change', diff.change, 'remove', diff.remove, 'rebuilds', diff.tablesToRebuild)
  return diff
}

// takes the return value of .diff()
// updates `db`
exports.applyDiff = function (db, upgradeTransaction, diff) {
  debug('Schemas.applyDiff')
  veryDebug('diff', diff)
  const tx = upgradeTransaction
  diff.remove.forEach(tableName => {
    // deleted tables
    tx.db.deleteObjectStore(tableName)
  })
  diff.add.forEach(([tableName, tableDef]) => {
    // added tables
    const tableStore = tx.db.createObjectStore(tableName, {keyPath: '_url'})
    addIndex(tableStore, '_origin')
    tableDef.index.forEach(index => addIndex(tableStore, index))
  })
  diff.change.forEach(([tableName, tableChanges]) => {
    // updated tables
    const tableStore = tx.objectStore(tableName)
    tableChanges.indexDiff.remove.forEach(index => removeIndex(tableStore, index))
    tableChanges.indexDiff.add.forEach(index => addIndex(tableStore, index))
  })
}

// add builtin table defs to the db object
exports.addBuiltinTableSchemas = function (db) {
  // metadata on each indexed record
  db._schemas[0]._indexMeta = {index: []}
}

// add table defs to the db object
exports.addTables = function (db) {
  const tableNames = getActiveTableNames(db)
  debug('Schemas.addTables', tableNames)
  db._activeTableNames = tableNames
  tableNames.forEach(tableName => {
    db[tableName] = new InjestTable(db, tableName, db._activeSchema[tableName])
    db._tablePathPatterns.push(db[tableName]._pathPattern)
  })
}

// remove table defs from the db object
exports.removeTables = function (db) {
  const tableNames = getActiveTableNames(db)
  debug('Schemas.removeTables', tableNames)
  tableNames.forEach(tableName => {
    delete db[tableName]
  })
}

// helper to compute the current schema
exports.merge = function (currentSchema, newSchema) {
  var result = currentSchema ? deepClone(currentSchema) : {}
  // apply updates
  for (let k in newSchema) {
    if (newSchema[k] === null) {
      delete result[k]
    } else if (typeof newSchema[k] === 'object' && !Array.isArray(newSchema[k])) {
      result[k] = exports.merge(currentSchema[k], newSchema[k])
    } else {
      result[k] = newSchema[k]
    }
  }
  return result
}

// helpers
// =

function diffTables (oldTableDef, newTableDef) {
  const indexDiff = newTableDef.index ? diffArrays(oldTableDef.index, newTableDef.index) : false
  return {
    indexDiff,
    needsRebuild: !!indexDiff
      || (oldTableDef.primaryKey !== newTableDef.primaryKey)
      || (oldTableDef.singular !== newTableDef.singular)
  }
}

function addIndex (tableStore, index) {
  if (!index) {
    return
  }
  const multiEntry = index.startsWith('*')
  if (multiEntry) index = index.slice(1)
  var keyPath = index.split('+')
  if (keyPath.length === 1) {
    // simple index
    keyPath = keyPath[0]
  }
  tableStore.createIndex(index, keyPath, {multiEntry})
}

function removeIndex (tableStore, index) {
  tableStore.deleteIndex(index)
}

function getTableNames (schema, fn) {
  if (!schema) {
    return []
  }
  // all keys except 'version'
  return Object.keys(schema).filter(k => k !== 'version')
}

function getActiveTableNames (db) {
  var tableNames = new Set()
  db._schemas.forEach(schema => {
    getTableNames(schema).forEach(tableName => {
      if (schema[tableName] === null) {
        tableNames.delete(tableName)
      } else {
        tableNames.add(tableName)
      }
    })
  })
  return Array.from(tableNames)
}

function arrayify (v) {
  return Array.isArray(v) ? v : [v]
}

function isArrayOfStrings (v) {
  return Array.isArray(v) && v.reduce((acc, v) => acc && typeof v === 'string', true)
}

},{"./errors":68,"./table":73,"./util":74}],73:[function(require,module,exports){
const anymatch = require('anymatch')
const EventEmitter = require('events')
const Indexer = require('./indexer')
const InjestRecordSet = require('./record-set')
const {assert, debug, veryDebug} = require('./util')
const {ParameterError, QueryError} = require('./errors')

// exported api
// =

class InjestTable extends EventEmitter {
  constructor (db, name, schema) {
    super()
    this.db = db
    this.name = name
    this.schema = schema
    veryDebug('InjestTable', this.name, this.schema)
    this._pathPattern = schema.singular ? `/${name}.json` : `/${name}${'/*'}.json`
    // ^ HACKERY: the ${'/*'} is to fool sublime's syntax highlighting -prf
  }

  // queries
  // =

  // () => InjestRecordset
  getRecordSet () {
    return new InjestRecordSet(this)
  }

  // (DatArchive, record) => Promise<url>
  async add (archive, record) {
    assert(archive && (typeof archive === 'string' || typeof archive.url === 'string'), ParameterError, 'The first parameter of .add() must be an archive or url')
    assert(record && typeof record === 'object', 'The second parameter of .add() must be a record object')

    // run validation
    if (this.schema.validator) {
      record = this.schema.validator(record)
    }

    // lookup the archive
    archive = this.db._archives[typeof archive === 'string' ? archive : archive.url]
    if (!archive) {
      throw new QueryError('Unable to add(): the given archive is not part of the index')
    }
    if (!archive.isWritable) {
      throw new QueryError('Unable to add(): the given archive is not owned by this user')
    }

    // build the path
    var filepath
    if (this.schema.singular) {
      filepath = `/${this.name}.json`
    } else {
      let key = record[this.schema.primaryKey]
      if (!key) throw new QueryError(`Unable to add(): the given archive is missing the primary key attribute, ${this.schema.primaryKey}`)
      filepath = `/${this.name}/${key}.json`
    }
    debug('Table.add', filepath)
    veryDebug('Table.add archive', archive.url)
    veryDebug('Table.add record', record)
    await archive.writeFile(filepath, JSON.stringify(record))
    await archive.commit()
    await Indexer.indexArchive(this.db, archive)
    return archive.url + filepath
  }

  // () => Promise<Number>
  async count () {
    return this.getRecordSet().count()
  }

  // (url|DatArchive, key?) => Promise<url>
  async delete (urlOrArchive, key) {
    if (typeof urlOrArchive === 'string') {
      return this.where('_url').equals(urlOrArchive).delete()
    }
    const filepath = (this.schema.singular)
      ? `/${this.name}.json`
      : `/${this.name}/${key}.json`
    const url = urlOrArchive.url + filepath
    return this.where('_url').equals(url).delete()
  }

  // (Function) => Promise<Void>
  async each (fn) {
    return this.getRecordSet().each(fn)
  }

  // (Function) => InjestRecordset
  filter (fn) {
    return this.getRecordSet().filter(fn)
  }

  // (url) => Promise<Object>
  // (archive) => Promise<Object>
  // (archive, key) => Promise<Object>
  // (index, value) => Promise<Object>
  async get (...args) {
    if (args.length === 2) {
      if (typeof args[0] === 'string' && args[0].indexOf('://') === -1) {
        return getByKeyValue(this, ...args)
      }
      return getMultiByKey(this, ...args)
    }
    if (typeof args[0] === 'string' && args[0].endsWith('.json')) {
      return getByRecordUrl(this, ...args)
    }
    return getSingle(this, args[0])
  }

  // (Number) => InjestRecordset
  limit (n) {
    return this.getRecordSet().limit(n)
  }

  // (Number) => InjestRecordset
  offset (n) {
    return this.getRecordSet().offset(n)
  }

  // (index) => InjestRecordset
  orderBy (index) {
    return this.getRecordSet().orderBy(index)
  }

  // () => InjestRecordset
  reverse () {
    return this.getRecordSet().reverse()
  }

  // () => Promise<Array>
  async toArray () {
    return this.getRecordSet().toArray()
  }

  // (record) => Promise<Number>
  // (url, updates) => Promise<Number>
  // (archive, updates) => Promise<Number>
  // (archive, key, updates) => Promise<Number>
  async update (...args) {
    if (args.length === 3) {
      return updateByKey(this, ...args)
    }
    if (args.length === 2) {
      if (this.schema.singular && typeof args[0] === 'object') {
        return updateSingular(this, ...args)
      }
      return updateByUrl(this, ...args)
    }
    return updateRecord(this, ...args)
  }

  // (url, updates) => Promise<Void | url>
  // (archive, updates) => Promise<Void | url>
  async upsert (archive, record) {
    assert(archive && (typeof archive === 'string' || typeof archive.url === 'string'), ParameterError, 'The first parameter of .upsert() must be an archive or url')
    assert(record && typeof record === 'object', 'The second parameter of .upsert() must be a record object')
    var changes = await this.update(archive, record)
    if (changes === 0) {
      return this.add(archive, record)
    }
    return changes
  }

  // (index|query) => InjestWhereClause|InjestRecordset
  where (indexOrQuery) {
    return this.getRecordSet().where(indexOrQuery)
  }

  // record helpers
  // =

  // (String) => Boolean
  isRecordFile (filepath) {
    return anymatch(this._pathPattern, filepath)
  }

  // (DatArchive) => Array<Object>
  async listRecordFiles (archive) {
    try {
      if (this.schema.singular) {
        // check if the record exists on this archive
        let filepath = `/${this.name}.json`
        await archive.stat(filepath)
        return [{recordUrl: archive.url + filepath, table: this}]
      } else {
        // scan for matching records
        let records = await archive.readdir(this.name)
        return records.filter(name => name.endsWith('.json')).map(name => {
          return {
            recordUrl: archive.url + '/' + this.name + '/' + name,
            table: this
          }
        })
      }
    } catch (e) {
      return []
    }
  }
}

function getByKeyValue (table, key, value) {
  debug('getByKeyValue')
  veryDebug('getByKeyValue table', table)
  veryDebug('getByKeyValue key', key)
  veryDebug('getByKeyValue value', value)
  return table.where(key).equals(value).first()
}

function getMultiByKey (table, archive, key) {
  debug('getMultiByKey')
  veryDebug('getMultiByKey table', table)
  veryDebug('getMultiByKey archive', archive)
  veryDebug('getMultiByKey key', key)
  var url = typeof archive === 'string' ? archive : archive.url
  return table.where('_url').equals(`${url}/${table.name}/${key}.json`).first()
}

function getSingle (table, archive) {
  debug('getSingle')
  veryDebug('getSingle table', table)
  veryDebug('getSingle archive', archive)
  var url = typeof archive === 'string' ? archive : archive.url
  return table.where('_url').equals(`${url}/${table.name}.json`).first()
}

function getByRecordUrl (table, url) {
  debug('getByRecordUrl')
  veryDebug('getByRecordUrl table', table)
  veryDebug('getByRecordUrl url', url)
  return table.where('_url').equals(url).first()
}

function updateByKey (table, archive, key, updates) {
  debug('updateByKey')
  veryDebug('updateByKey table', table)
  veryDebug('updateByKey archive', archive.url)
  veryDebug('updateByKey key', key)
  veryDebug('updateByKey updates', updates)
  assert(archive && typeof archive.url === 'string', ParameterError, 'Invalid parameters given to update()')
  assert(typeof key === 'string', ParameterError, 'Invalid parameters given to update()')
  assert(updates && typeof updates === 'object', ParameterError, 'Invalid parameters given to update()')
  const url = archive.url + `/${table.name}/${key}.json`
  return table.where(table.schema.primaryKey).equals(key).update(updates)
}

function updateSingular (table, archive, updates) {
  debug('updateSingular')
  veryDebug('updateSingular table', table)
  veryDebug('updateSingular archive', archive.url)
  veryDebug('updateSingular updates', updates)
  assert(archive && typeof archive.url === 'string', ParameterError, 'Invalid parameters given to update()')
  assert(updates && typeof updates === 'object', ParameterError, 'Invalid parameters given to update()')
  const url = archive.url + `/${table.name}.json`
  return table.where('_url').equals(url).update(updates)
}

function updateByUrl (table, url, updates) {
  debug('updateByUrl')
  veryDebug('updateByUrl table', table)
  veryDebug('updateByUrl url', url)
  veryDebug('updateByUrl updates', updates)
  url = url && url.url ? url.url : url
  assert(typeof url === 'string', ParameterError, 'Invalid parameters given to update()')
  assert(updates && typeof updates === 'object', ParameterError, 'Invalid parameters given to update()')
  if (url.endsWith('.json') === false) {
    // this is probably the url of an archive - add the path
    url += (url.endsWith('/') ? '' : '/') + table.name + '/' + updates[table.schema.primaryKey] + '.json'
  }
  return table.where('_url').equals(url).update(updates)
}

function updateRecord (table, record) {
  debug('updateRecord')
  veryDebug('updateRecord table', table)
  veryDebug('updateRecord record', record)
  assert(record && typeof record._url === 'string', ParameterError, 'Invalid parameters given to update()')
  return table.where('_url').equals(record._url).update(record)
}

module.exports = InjestTable

},{"./errors":68,"./indexer":70,"./record-set":71,"./util":74,"anymatch":76,"events":undefined}],74:[function(require,module,exports){
/* globals window process console */
const AwaitLock = require('await-lock')

// read log level from the environment
const LOG_LEVEL = +window.localStorage.LOG_LEVEL || 0
const LOG_LEVEL_DEBUG = 1
const LOG_LEVEL_VERYDEBUG = 2

// debug logging
function noop () {}
exports.debug = (LOG_LEVEL >= LOG_LEVEL_DEBUG) ? console.log : noop
exports.veryDebug = (LOG_LEVEL >= LOG_LEVEL_VERYDEBUG) ? console.log : noop

// assert helper
exports.assert = function (cond, ErrorConstructor = Error, msg) {
  if (!cond) {
    throw new ErrorConstructor(msg)
  }
}

// helper to handle events within a promise
// - pass the normal handler
// - and pass the reject method from the parent promise
exports.eventHandler = function (handler, reject) {
  return async e => {
    try {
      await handler(e)
    } catch (e) {
      reject(e)
    }
  }
}

// helper to handle events within a promise
// - if the event fires, rejects
exports.errorHandler = function (reject) {
  return e => {
    e.preventDefault()
    reject(e.target.error)
  }
}

// helper to rebroadcast an event
exports.eventRebroadcaster = function (emitter, name) {
  return e => {
    emitter.emit(name, e)
  }
}

// provide a diff of 2 arrays
// eg diffArrays([1,2], [2,3]) => {add: [3], remove: [1]}
// if no difference, returns false
exports.diffArrays = function (left, right) {
  var diff = {add: [], remove: []}

  // iterate all values in the arrays
  var union = new Set(left.concat(right))
  for (let index of union) {
    // push to add/remove based on left/right membership
    var leftHas = left.indexOf(index) !== -1
    var rightHas = right.indexOf(index) !== -1
    if (leftHas && !rightHas) {
      diff.remove.push(index)
    } else if (!leftHas && rightHas) {
      diff.add.push(index)
    }
  }

  if (diff.add.length === 0 && diff.remove.add === 0) {
    return false
  }
  return diff
}

exports.deepClone = function (v) {
  return JSON.parse(JSON.stringify(v))
}

// wraps await-lock in a simpler interface, with many possible locks
// usage:
/*
async function foo () {
  var release = await lock('bar')
  // ...
  release()
}
*/
var locks = {}
exports.lock = async function (key) {
  if (!(key in locks)) locks[key] = new AwaitLock()

  var lock = locks[key]
  await lock.acquireAsync()
  return lock.release.bind(lock)
}

},{"await-lock":5}],75:[function(require,module,exports){
const {assert} = require('./util')
const {ParameterError, QueryError} = require('./errors')
const MAX_STRING = String.fromCharCode(65535)

// exported api
// =

class InjestWhereClause {
  constructor (recordSet, index) {
    this._recordSet = recordSet
    this._index = index
    this._only = null
    this._lowerBound = null
    this._lowerBoundInclusive = false
    this._upperBound = null
    this._upperBoundInclusive = false
  }

  // (lowerBound) => InjestRecordset
  above (lowerBound) {
    this._lowerBound = lowerBound
    this._lowerBoundInclusive = false
    return this._recordSet
  }

  // (lowerBound) => InjestRecordset
  aboveOrEqual (lowerBound) {
    this._lowerBound = lowerBound
    this._lowerBoundInclusive = true
    return this._recordSet
  }

  // (Array|...args) => InjestRecordset
  anyOf (...args) {
    // do a between() of the min and max values
    // then filter down to matches
    args.sort()
    var [lo, hi] = [args[0], args[args.length - 1]]
    try {
      args = toArrayOfStrings(args)
    } catch (e) {
      throw new QueryError('The parameters to .anyOf() must be strings or numbers')
    }
    return this.between(lo, hi, {includeLower: true, includeUpper: true})
      .filter(record => {
        return testValues(record[this._index], v => {
          v = (v || '').toString()
          return args.indexOf(v) !== -1
        })
      })
  }

  // (Array|...args) => InjestRecordset
  anyOfIgnoreCase (...args) {
    // just filter down to matches
    try {
      args = toArrayOfStrings(args, {toLowerCase: true})
    } catch (e) {
      throw new QueryError('The parameters to .anyOfIgnoreCase() must be strings or numbers')
    }
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        v = (v || '').toString().toLowerCase()
        return args.indexOf(v) !== -1
      })
    })
  }

  // (upperBound) => InjestRecordset
  below (upperBound) {
    this._upperBound = upperBound
    this._upperBoundInclusive = false
    return this._recordSet
  }

  // (upperBound) => InjestRecordset
  belowOrEqual (upperBound) {
    this._upperBound = upperBound
    this._upperBoundInclusive = true
    return this._recordSet
  }

  // (lowerBound, upperBound, opts) => InjestRecordset
  between (lowerBound, upperBound, {includeLower, includeUpper} = {}) {
    this._lowerBound = lowerBound
    this._upperBound = upperBound
    this._lowerBoundInclusive = !!includeLower
    this._upperBoundInclusive = !!includeUpper
    return this._recordSet
  }

  // (value) => InjestRecordset
  equals (value) {
    this._only = value
    return this._recordSet
  }

  // (value) => InjestRecordset
  equalsIgnoreCase (value) {
    // just filter down to matches
    assert(typeof value !== 'object', QueryError, 'The parameter to .equalsIgnoreCase() must be a string or number')
    value = (value || '').toString().toLowerCase()
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        var v = (v || '').toString().toLowerCase()
        return v === value
      })
    })
  }

  // (Array|...args) => InjestRecordset
  noneOf (...args) {
    // just filter down to matches
    try {
      args = toArrayOfStrings(args)
    } catch (e) {
      throw new QueryError('The parameters to .noneOf() must be strings or numbers')
    }
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        var v = (v || '').toString()
        return args.indexOf(v) === -1
      })
    })
  }

  // (value) => InjestRecordset
  notEqual (value) {
    // just filter down to matches
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        return v !== value
      })
    })
  }

  // (value) => InjestRecordset
  startsWith (value) {
    assert(typeof value === 'string', ParameterError, `First parameter or .startsWith() must be a string, got ${value}`)
    return this.between(value, value + MAX_STRING)
  }

  // (Array|...args) => InjestRecordset
  startsWithAnyOf (...args) {
    // just filter down to matches
    try {
      args = toArrayOfStrings(args)
    } catch (e) {
      throw new QueryError('The parameters to .startsWithAnyOf() must be strings or numbers')
    }
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        v = (v || '').toString()
        for (let i = 0; i < args.length; i++) {
          if (v.startsWith(args[i])) {
            return true
          }
        }
        return false
      })
    })
  }

  // (Array|...args) => InjestRecordset
  startsWithAnyOfIgnoreCase (...args) {
    // just filter down to matches
    try {
      args = toArrayOfStrings(args, {toLowerCase: true})
    } catch (e) {
      throw new QueryError('The parameters to .startsWithAnyOfIgnoreCase() must be strings or numbers')
    }
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        v = (v || '').toString().toLowerCase()
        for (let i = 0; i < args.length; i++) {
          if (v.startsWith(args[i])) {
            return true
          }
        }
        return false
      })
    })
  }

  // (value) => InjestRecordset
  startsWithIgnoreCase (value) {
    assert(typeof value === 'string', ParameterError, `First parameter or .startsWith() must be a string, got ${value}`)
    value = value.toLowerCase()
    // just filter down to matches
    return this._recordSet.filter(record => {
      return testValues(record[this._index], v => {
        return (v || '').toString().toLowerCase().startsWith(value)
      })
    })
  }
}

module.exports = InjestWhereClause

// internal methods
// =

function testValues (v, fn) {
  if (Array.isArray(v)) {
    return v.reduce((agg, v) => agg || fn(v), false)
  }
  return fn(v)
}

function toArrayOfStrings (arr, {toLowerCase} = {}) {
  return arr.map(v => {
    if (typeof v === 'object') {
      throw new ParameterError()
    }
    v = v ? v.toString() : ''
    if (toLowerCase) v = v.toLowerCase()
    return v
  })
}

},{"./errors":68,"./util":74}],76:[function(require,module,exports){
'use strict';

var micromatch = require('micromatch');
var normalize = require('normalize-path');
var path = require('path'); // required for tests.
var arrify = function(a) { return a == null ? [] : (Array.isArray(a) ? a : [a]); };

var anymatch = function(criteria, value, returnIndex, startIndex, endIndex) {
  criteria = arrify(criteria);
  value = arrify(value);
  if (arguments.length === 1) {
    return anymatch.bind(null, criteria.map(function(criterion) {
      return typeof criterion === 'string' && criterion[0] !== '!' ?
        micromatch.matcher(criterion) : criterion;
    }));
  }
  startIndex = startIndex || 0;
  var string = value[0];
  var altString, altValue;
  var matched = false;
  var matchIndex = -1;
  function testCriteria(criterion, index) {
    var result;
    switch (Object.prototype.toString.call(criterion)) {
    case '[object String]':
      result = string === criterion || altString && altString === criterion;
      result = result || micromatch.isMatch(string, criterion);
      break;
    case '[object RegExp]':
      result = criterion.test(string) || altString && criterion.test(altString);
      break;
    case '[object Function]':
      result = criterion.apply(null, value);
      result = result || altValue && criterion.apply(null, altValue);
      break;
    default:
      result = false;
    }
    if (result) {
      matchIndex = index + startIndex;
    }
    return result;
  }
  var crit = criteria;
  var negGlobs = crit.reduce(function(arr, criterion, index) {
    if (typeof criterion === 'string' && criterion[0] === '!') {
      if (crit === criteria) {
        // make a copy before modifying
        crit = crit.slice();
      }
      crit[index] = null;
      arr.push(criterion.substr(1));
    }
    return arr;
  }, []);
  if (!negGlobs.length || !micromatch.any(string, negGlobs)) {
    if (path.sep === '\\' && typeof string === 'string') {
      altString = normalize(string);
      altString = altString === string ? null : altString;
      if (altString) altValue = [altString].concat(value.slice(1));
    }
    matched = crit.slice(startIndex, endIndex).some(testCriteria);
  }
  return returnIndex === true ? matchIndex : matched;
};

module.exports = anymatch;

},{"micromatch":37,"normalize-path":44,"path":undefined}],77:[function(require,module,exports){
(function (process){
var Stream = require('stream')

// through
//
// a stream that does nothing but re-emit the input.
// useful for aggregating a series of changing but not ending streams into one stream)

exports = module.exports = through
through.through = through

//create a readable writable stream.

function through (write, end, opts) {
  write = write || function (data) { this.queue(data) }
  end = end || function () { this.queue(null) }

  var ended = false, destroyed = false, buffer = [], _ended = false
  var stream = new Stream()
  stream.readable = stream.writable = true
  stream.paused = false

//  stream.autoPause   = !(opts && opts.autoPause   === false)
  stream.autoDestroy = !(opts && opts.autoDestroy === false)

  stream.write = function (data) {
    write.call(this, data)
    return !stream.paused
  }

  function drain() {
    while(buffer.length && !stream.paused) {
      var data = buffer.shift()
      if(null === data)
        return stream.emit('end')
      else
        stream.emit('data', data)
    }
  }

  stream.queue = stream.push = function (data) {
//    console.error(ended)
    if(_ended) return stream
    if(data === null) _ended = true
    buffer.push(data)
    drain()
    return stream
  }

  //this will be registered as the first 'end' listener
  //must call destroy next tick, to make sure we're after any
  //stream piped from here.
  //this is only a problem if end is not emitted synchronously.
  //a nicer way to do this is to make sure this is the last listener for 'end'

  stream.on('end', function () {
    stream.readable = false
    if(!stream.writable && stream.autoDestroy)
      process.nextTick(function () {
        stream.destroy()
      })
  })

  function _end () {
    stream.writable = false
    end.call(stream)
    if(!stream.readable && stream.autoDestroy)
      stream.destroy()
  }

  stream.end = function (data) {
    if(ended) return
    ended = true
    if(arguments.length) stream.write(data)
    _end() // will emit or queue
    return stream
  }

  stream.destroy = function () {
    if(destroyed) return
    destroyed = true
    ended = true
    buffer.length = 0
    stream.writable = stream.readable = false
    stream.emit('close')
    return stream
  }

  stream.pause = function () {
    if(stream.paused) return
    stream.paused = true
    return stream
  }

  stream.resume = function () {
    if(stream.paused) {
      stream.paused = false
      stream.emit('resume')
    }
    drain()
    //may have become paused again,
    //as drain emits 'data'.
    if(!stream.paused)
      stream.emit('drain')
    return stream
  }
  return stream
}


}).call(this,require('_process'))
},{"_process":82,"stream":undefined}],78:[function(require,module,exports){
var bel = require('bel') // turns template tag into DOM elements
var morphdom = require('morphdom') // efficiently diffs + morphs two DOM elements
var defaultEvents = require('./update-events.js') // default events to be copied when dom elements update

module.exports = bel

// TODO move this + defaultEvents to a new module once we receive more feedback
module.exports.update = function (fromNode, toNode, opts) {
  if (!opts) opts = {}
  if (opts.events !== false) {
    if (!opts.onBeforeElUpdated) opts.onBeforeElUpdated = copier
  }

  return morphdom(fromNode, toNode, opts)

  // morphdom only copies attributes. we decided we also wanted to copy events
  // that can be set via attributes
  function copier (f, t) {
    // copy events:
    var events = opts.events || defaultEvents
    for (var i = 0; i < events.length; i++) {
      var ev = events[i]
      if (t[ev]) { // if new element has a whitelisted attribute
        f[ev] = t[ev] // update existing element
      } else if (f[ev]) { // if existing element has it and new one doesnt
        f[ev] = undefined // remove it from existing element
      }
    }
    var oldValue = f.value
    var newValue = t.value
    // copy values for form elements
    if ((f.nodeName === 'INPUT' && f.type !== 'file') || f.nodeName === 'SELECT') {
      if (!newValue && !t.hasAttribute('value')) {
        t.value = f.value
      } else if (newValue !== oldValue) {
        f.value = newValue
      }
    } else if (f.nodeName === 'TEXTAREA') {
      if (t.getAttribute('value') === null) f.value = t.value
    }
  }
}

},{"./update-events.js":79,"bel":7,"morphdom":43}],79:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],80:[function(require,module,exports){

},{}],81:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"dup":24}],82:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1]);
