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

/* globals beakerDownloads DatArchive */

// there can be many drop menu btns rendered at once, but they are all showing the same information
// the BrowserMenuNavbarBtn manages all instances, and you should only create one

class BrowserScriptNavbarBtn {
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
    // render the dropdown if open
    var dropdownEl = '';
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
        </div>`;
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
    Array.from(document.querySelectorAll('.browser-dropdown-script')).forEach(el => yo.update(el, this.render()));
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
var browserScriptNavbarBtn = null;
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
  browserScriptNavbarBtn = new BrowserScriptNavbarBtn();
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

  browserScriptNavbarBtn.isDropdownOpen = false;

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
        ${browserMenuNavbarBtn.render()}
        ${browserScriptNavbarBtn.render()}
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
function debounce (func, wait, immediate) {
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

    // TCW CHANGES -- messages webview-preload/inject-scripts.js that the
    // DOM is ready to recieve injected scripts from DAT

    console.log('Dom ready, fetching scripts!');
    e.target.getWebContents().send('inject-scripts', 'this is a test');

    // TCW -- END

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
  console.log('the page is closed');
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
  window.addEventListener('resize', debounce(onWindowResize, 500));
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

},{"beaker-error-constants":2,"electron":undefined,"emit-stream":4,"events":undefined,"fs":undefined,"parse-dat-url":12,"path":undefined,"pauls-electron-rpc":13,"pretty-bytes":17,"pretty-hash":18,"yo-yo":20}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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

},{"global/document":5,"hyperx":8,"on-load":11}],4:[function(require,module,exports){
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

},{"events":undefined,"through":19}],5:[function(require,module,exports){
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
},{"min-document":22}],6:[function(require,module,exports){
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
},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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

},{"hyperscript-attribute-to-property":7}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
'use strict';
module.exports = Number.isNaN || function (x) {
	return x !== x;
};

},{}],11:[function(require,module,exports){
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

},{"global/document":5,"global/window":6}],12:[function(require,module,exports){
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
},{"url":undefined}],13:[function(require,module,exports){
module.exports.exportAPI = require('./lib/export-api')
module.exports.importAPI = require('./lib/import-api')
},{"./lib/export-api":14,"./lib/import-api":15}],14:[function(require,module,exports){
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
},{"../../../../node_modules/is-buffer/index.js":23,"./util":16,"electron":undefined,"events":undefined,"stream":undefined}],15:[function(require,module,exports){
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

},{"./util":16,"electron":undefined,"events":undefined,"stream":undefined}],16:[function(require,module,exports){
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
},{"buffer":undefined}],17:[function(require,module,exports){
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

},{"number-is-nan":10}],18:[function(require,module,exports){
(function (Buffer){

module.exports = function prettyHash (buf) {
  if (Buffer.isBuffer(buf)) buf = buf.toString('hex')
  if (typeof buf === 'string' && buf.length > 8) {
    return buf.slice(0, 6) + '..' + buf.slice(-2)
  }
  return buf
}
}).call(this,{"isBuffer":require("../../../node_modules/is-buffer/index.js")})
},{"../../../node_modules/is-buffer/index.js":23}],19:[function(require,module,exports){
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
},{"_process":24,"stream":undefined}],20:[function(require,module,exports){
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

},{"./update-events.js":21,"bel":3,"morphdom":9}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){

},{}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
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
