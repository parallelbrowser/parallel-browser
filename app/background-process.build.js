(function () {'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var electron = require('electron');
var os = _interopDefault(require('os'));
var path = require('path');
var path__default = _interopDefault(path);
var fs = _interopDefault(require('fs'));
var jetpack = _interopDefault(require('fs-jetpack'));
var rpc = _interopDefault(require('pauls-electron-rpc'));
var emitStream = _interopDefault(require('emit-stream'));
var EventEmitter = _interopDefault(require('events'));
var bytes = _interopDefault(require('bytes'));
var ms = _interopDefault(require('ms'));
var sqlite3 = _interopDefault(require('sqlite3'));
var FnQueue = _interopDefault(require('function-queue'));
var beakerErrorConstants = require('beaker-error-constants');
var url = require('url');
var url__default = _interopDefault(url);
var pda = require('pauls-dat-api');
var pda__default = _interopDefault(pda);
var crypto = _interopDefault(require('crypto'));
var datEncoding = _interopDefault(require('dat-encoding'));
var pify = _interopDefault(require('pify'));
var signatures = _interopDefault(require('sodium-signatures'));
var slugify = _interopDefault(require('slugify'));
var mkdirp = _interopDefault(require('mkdirp'));
var hypercoreProtocol = _interopDefault(require('hypercore-protocol'));
var hyperdrive = _interopDefault(require('hyperdrive'));
var hyperstaging = _interopDefault(require('hyperdrive-staging-area'));
var swarmDefaults = _interopDefault(require('datland-swarm-defaults'));
var discoverySwarm = _interopDefault(require('discovery-swarm'));
var moment = _interopDefault(require('moment'));
var zerr = _interopDefault(require('zerr'));
var parseDatURL = _interopDefault(require('parse-dat-url'));
var concat = _interopDefault(require('concat-stream'));
var prettyHash = _interopDefault(require('pretty-hash'));
var electronLocalshortcut = require('electron-localshortcut');
var unusedFilename = _interopDefault(require('unused-filename'));
var speedometer = _interopDefault(require('speedometer'));
var once = _interopDefault(require('once'));
var http = _interopDefault(require('http'));
var listenRandomPort = _interopDefault(require('listen-random-port'));
var parseRange = _interopDefault(require('range-parser'));
var toZipStream = _interopDefault(require('hyperdrive-to-zip-stream'));
var through2 = _interopDefault(require('through2'));
var identifyFiletype = _interopDefault(require('identify-filetype'));
var mime = _interopDefault(require('mime'));

// 64 char hex
const DAT_HASH_REGEX = /^[0-9a-f]{64}$/i;
const DAT_URL_REGEX = /^(?:dat:\/\/)?([0-9a-f]{64})/i;

// url file paths
const DAT_VALID_PATH_REGEX = /^[a-z0-9\-._~!$&'()*+,;=:@\/\s]+$/i;

// dat settings
const DAT_SWARM_PORT = 3282;
const DAT_MANIFEST_FILENAME = 'dat.json';
const DAT_QUOTA_DEFAULT_BYTES_ALLOWED = bytes.parse(process.env.beaker_dat_quota_default_bytes_allowed || '500mb');
const DEFAULT_DAT_DNS_TTL = ms('1h');
const MAX_DAT_DNS_TTL = ms('7d');
const DEFAULT_DAT_API_TIMEOUT = ms('5s');
const DAT_GC_EXPIRATION_AGE = ms('5d'); // how old do archives need to be before deleting them from the cache?
const DAT_GC_FIRST_COLLECT_WAIT = ms('5m'); // how long after process start to do first collect?
const DAT_GC_REGULAR_COLLECT_WAIT = ms('2h'); // how long between GCs to collect?
const DAT_GC_DEFAULT_MINIMUM_SIZE = bytes('2mb'); // how big do dats need to be, to be subject to GC?

// dat staging paths
const INVALID_SAVE_FOLDER_CHAR_REGEX = /[^0-9a-zA-Z-_ ]/g;
const DISALLOWED_SAVE_PATH_NAMES = [
  'home',
  'desktop',
  'documents',
  'downloads',
  'music',
  'pictures',
  'videos'
];

var beakerBrowser = {
  eventsStream: 'readable',
  getInfo: 'promise',
  checkForUpdates: 'promise',
  restartBrowser: 'sync',

  getSettings: 'promise',
  getSetting: 'promise',
  setSetting: 'promise',

  getUserSetupStatus: 'promise',
  setUserSetupStatus: 'promise',

  getDefaultProtocolSettings: 'promise',
  setAsDefaultProtocolClient: 'promise',
  removeAsDefaultProtocolClient: 'promise',

  fetchBody: 'promise',
  downloadURL: 'promise',

  setStartPageBackgroundImage: 'promise',

  showOpenDialog: 'promise',
  showLocalPathDialog: 'promise',
  openUrl: 'promise',
  openFolder: 'promise',
  doWebcontentsCmd: 'promise',

  closeModal: 'sync'
};

// helper to make node-style CBs into promises
// usage: cbPromise(cb => myNodeStyleMethod(cb)).then(...)
function cbPromise (method, b) {
  return new Promise((resolve, reject) => {
    method((err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  })
}

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

var debug$1 = require('debug')('beaker');
// transaction lock
// - returns a function which enforces FIFO execution on async behaviors, via a queue
// - call sig: txLock(cb => { ...; cb() })
// - MUST call given cb to release the lock


// sqlite transactor, handles common needs for sqlite queries:
// 1. waits for the setupPromise
// 2. provides a cb handler that returns a promise
// 3. creates a transaction lock, and wraps the cb with it
// NOTE:
//   Using the transactor does mean that the DB is locked into sequential operation.
//   This is slower, but necessary if the SQLite instance has any transactions that
//   do async work within them; eg, SELECT then UPDATE.
//   Why: without the tx lock around all SQLite statements, you can end up injecting
//   new commands into the active async transaction.
//   If the DB doesn't do async transactions, you don't need the transactor. At time of
//   writing this, only the history DB needed it.
//   -prf


// runs needed migrations, returns a promise
function setupSqliteDB (db, migrations, logTag) {
  return new Promise((resolve, reject) => {
    // run migrations
    db.get('PRAGMA user_version;', (err, res) => {
      if (err) return reject(err)

      var version = (res && res.user_version) ? +res.user_version : 0;
      var neededMigrations = migrations.slice(version);
      if (neededMigrations.length == 0) { return resolve() }

      debug$1(logTag, 'Database at version', version, '; Running', neededMigrations.length, 'migrations');
      runNeededMigrations();
      function runNeededMigrations (err) {
        if (err) return reject(err)

        var migration = neededMigrations.shift();
        if (!migration) {
          // done
          resolve();
          return debug$1(logTag, 'Database migrations completed without error')
        }

        migration(runNeededMigrations);
      }
    });
  })
}

// globals
// =
var db;
var migrations;
var setupPromise;

// exported methods
// =

function setup$1 () {
  // open database
  var dbPath = path__default.join(electron.app.getPath('userData'), 'Settings');
  db = new sqlite3.Database(dbPath);
  setupPromise = setupSqliteDB(db, migrations, '[SETTINGS]');
}

function set (key, value) {
  return setupPromise.then(v => cbPromise(cb => {
    db.run(`
      INSERT OR REPLACE
        INTO settings (key, value, ts)
        VALUES (?, ?, ?)
    `, [key, value, Date.now()], cb);
  }))
}

function get (key) {
  // env variables
  if (key === 'noWelcomeTab') {
    return (process.env.beaker_no_welcome_tab == 1)
  }
  // stored values
  return setupPromise.then(v => cbPromise(cb => {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
      if (row) { row = row.value; }
      cb(err, row);
    });
  }))
}

function getAll () {
  return setupPromise.then(v => cbPromise(cb => {
    db.all(`SELECT key, value FROM settings`, (err, rows) => {
      if (err) { return cb(err) }

      var obj = {};
      rows.forEach(row => { obj[row.key] = row.value; });
      obj.noWelcomeTab = (process.env.beaker_no_welcome_tab == 1);
      cb(null, obj);
    });
  }))
}

// internal methods
// =

migrations = [
  // version 1
  function (cb) {
    db.exec(`
      CREATE TABLE settings(
        key PRIMARY KEY,
        value,
        ts
      );
      INSERT INTO settings (key, value) VALUES ('auto_update_enabled', 1);
      PRAGMA user_version = 1;
    `, cb);
  },
  // version 2
  function (cb) {
    db.exec(`
      INSERT INTO settings (key, value) VALUES ('start_page_background_image', '');
      PRAGMA user_version = 2
    `, cb);
  }
];

const SECURE_ORIGIN_REGEX = /^(beaker:|dat:|https:|http:\/\/localhost(\/|:))/i;

function internalOnly (event, methodName, args) {
  return (event && event.sender && event.sender.getURL().startsWith('beaker:'))
}

function secureOnly (event, methodName, args) {
  if (!(event && event.sender)) {
    return false
  }
  var url$$1 = event.sender.getURL();
  return SECURE_ORIGIN_REGEX.test(url$$1)
}

// handle OSX open-url event
var queue = [];
var commandReceiver;

function setup$2 () {
  electron.ipcMain.once('shell-window-ready', function (e) {
    commandReceiver = e.sender;
    queue.forEach(url$$1 => commandReceiver.send('command', 'file:new-tab', url$$1));
    queue.length = 0;
  });
}

function open (url$$1) {
  if (commandReceiver) {
    commandReceiver.send('command', 'file:new-tab', url$$1);
  } else {
    queue.push(url$$1);
  }
  return commandReceiver
}

const SIZES = {
  'create-archive': {width: 500, height: 340},
  'fork-archive': {width: 500, height: 390},
  'basic-auth': {width: 500, height: 320},
  'select-archive': {width: 500, height: 375},
  prompt: {width: 500, height: 170}
};

// state
// =

var modalWindow;

// exported apis
// =

function showModal (parentWindow, modalName, opts = {}) {
  if (modalWindow) {
    return Promise.reject(new beakerErrorConstants.ModalActiveError())
  }

  // create the modal window
  parentWindow = parentWindow || electron.BrowserWindow.getFocusedWindow();
  modalWindow = new electron.BrowserWindow({
    width: SIZES[modalName].width,
    height: SIZES[modalName].height,
    parent: parentWindow,
    modal: true,
    show: false,
    webPreferences: {
      preload: path__default.join(electron.app.getAppPath(), 'webview-preload.build.js')
    }
  });
  modalWindow.loadURL('beaker://' + modalName + '-modal');
  modalWindow.once('ready-to-show', () => {
    // inject config
    modalWindow.webContents.executeJavaScript(`
      setup(${JSON.stringify(opts)})
    `);
    modalWindow.show();
  });

  // register behaviors
  modalWindow.on('close', () => closeModal);

  // create and return the end-state promise
  modalWindow.promise = new Promise((resolve, reject) => {
    modalWindow.resolve = resolve;
    modalWindow.reject = reject;
  });
  return modalWindow.promise
}

function closeModal (err, res) {
  if (!modalWindow) return true
  var w = modalWindow;
  modalWindow = null;

  // resolve/reject the promise
  if (err) w.reject(err);
  else w.resolve(res);
  w.promise = null;

  // destroy
  w.close();
  return true
}

var debug = require('debug')('beaker');
// constants
// =

// how long between scheduled auto updates?
const SCHEDULED_AUTO_UPDATE_DELAY = 24 * 60 * 60 * 1e3; // once a day

// possible updater states
const UPDATER_STATUS_IDLE = 'idle';
const UPDATER_STATUS_CHECKING = 'checking';
const UPDATER_STATUS_DOWNLOADING = 'downloading';
const UPDATER_STATUS_DOWNLOADED = 'downloaded';

// globals
// =

// what's the updater doing?
var updaterState = UPDATER_STATUS_IDLE;
var updaterError = false; // has there been an error?

// is the updater available? must be on certain platform, and may be disabled if there's an error
var isBrowserUpdatesSupported = (os.platform() == 'darwin' || os.platform() == 'win32');

// where is the user in the setup flow?
var userSetupStatus = false;
var userSetupStatusLookupPromise;

// events emitted to rpc clients
var browserEvents = new EventEmitter();

// exported methods
// =

function setup$$1 () {
  // setup auto-updater
  try {
    if (!isBrowserUpdatesSupported) { throw new Error('Disabled. Only available on macOS and Windows.') }
    electron.autoUpdater.setFeedURL(getAutoUpdaterFeedURL());
    electron.autoUpdater.once('update-available', onUpdateAvailable);
    electron.autoUpdater.on('error', onUpdateError);
  } catch (e) {
    debug('[AUTO-UPDATE] error', e.toString());
    isBrowserUpdatesSupported = false;
  }
  setTimeout(scheduledAutoUpdate, 15e3); // wait 15s for first run

  // fetch user setup status
  userSetupStatusLookupPromise = get('user-setup-status');

  // wire up RPC
  rpc.exportAPI('beakerBrowser', beakerBrowser, {
    eventsStream,
    getInfo,
    checkForUpdates,
    restartBrowser,

    getSetting,
    getSettings,
    setSetting,

    getUserSetupStatus,
    setUserSetupStatus,

    fetchBody,
    downloadURL,

    setStartPageBackgroundImage,

    getDefaultProtocolSettings,
    setAsDefaultProtocolClient,
    removeAsDefaultProtocolClient,

    showOpenDialog,
    showLocalPathDialog,
    openUrl: url$$1 => { open(url$$1); }, // dont return anything
    openFolder,
    doWebcontentsCmd,

    closeModal
  }, internalOnly);

  // wire up events
  electron.app.on('web-contents-created', onWebContentsCreated);

  // window.prompt handling
  //  - we have use ipc directly instead of using rpc, because we need custom
  //    response-lifecycle management in the main thread
  electron.ipcMain.on('page-prompt-dialog', async (e, message, def) => {
    var win = electron.BrowserWindow.fromWebContents(e.sender.hostWebContents);
    try {
      var res = await showModal(win, 'prompt', {message, default: def});
      e.returnValue = res && res.value ? res.value : false;
    } catch (e) {
      e.returnValue = false;
    }
  });
}

function fetchBody (url$$1) {
  return new Promise((resolve) => {
    var http$$1 = url$$1.startsWith('https') ? require('https') : require('http');

    http$$1.get(url$$1, (res) => {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', (data) => { body += data; });
      res.on('end', () => resolve(body));
    });
  })
}

async function downloadURL (url$$1) {
  this.sender.downloadURL(url$$1);
}

function setStartPageBackgroundImage (srcPath) {
  var destPath = path__default.join(electron.app.getPath('userData'), 'start-background-image');

  return new Promise((resolve) => {
    if (srcPath) {
      fs.readFile(srcPath, (_, data) => {
        fs.writeFile(destPath, data, () => resolve());
      });
    } else {
      fs.unlink(destPath, () => resolve());
    }
  })
}

function getDefaultProtocolSettings () {
  return Promise.resolve(['http', 'dat'].reduce((res, x) => {
    res[x] = electron.app.isDefaultProtocolClient(x);
    return res
  }, {}))
}

function setAsDefaultProtocolClient (protocol$$1) {
  return Promise.resolve(electron.app.setAsDefaultProtocolClient(protocol$$1))
}

function removeAsDefaultProtocolClient (protocol$$1) {
  return Promise.resolve(electron.app.removeAsDefaultProtocolClient(protocol$$1))
}

function getInfo () {
  return Promise.resolve({
    version: electron.app.getVersion(),
    platform: os.platform(),
    updater: {
      isBrowserUpdatesSupported,
      error: updaterError,
      state: updaterState
    },
    paths: {
      userData: electron.app.getPath('userData')
    }
  })
}

// this method was written, as it is, when there was an in-app plugins installer
// since it works well enough, and the in-app installer may return, Im leaving it this way
// ... but, that would explain the somewhat odd design
// -prf
function checkForUpdates () {
  // dont overlap
  if (updaterState != UPDATER_STATUS_IDLE) { return }

  // track result states for this run
  var isBrowserChecking = false; // still checking?
  var isBrowserUpdated = false; // got an update?

  // update global state
  debug('[AUTO-UPDATE] Checking for a new version.');
  updaterError = false;
  setUpdaterState(UPDATER_STATUS_CHECKING);

  if (isBrowserUpdatesSupported) {
    // check the browser auto-updater
    // - because we need to merge the electron auto-updater, and the npm plugin flow...
    //   ... it's best to set the result events here
    //   (see note above -- back when there WAS a plugin updater, this made since -prf)
    isBrowserChecking = true;
    electron.autoUpdater.checkForUpdates();
    electron.autoUpdater.once('update-not-available', () => {
      debug('[AUTO-UPDATE] No browser update available.');
      isBrowserChecking = false;
      checkDone();
    });
    electron.autoUpdater.once('update-downloaded', () => {
      debug('[AUTO-UPDATE] New browser version downloaded. Ready to install.');
      isBrowserChecking = false;
      isBrowserUpdated = true;
      checkDone();
    });

    // cleanup
    electron.autoUpdater.once('update-not-available', removeAutoUpdaterListeners);
    electron.autoUpdater.once('update-downloaded', removeAutoUpdaterListeners);
    function removeAutoUpdaterListeners () {
      electron.autoUpdater.removeAllListeners('update-not-available');
      electron.autoUpdater.removeAllListeners('update-downloaded');
    }
  }

  // check the result states and emit accordingly
  function checkDone () {
    if (isBrowserChecking) { return } // still checking

    // done, emit based on result
    if (isBrowserUpdated) {
      setUpdaterState(UPDATER_STATUS_DOWNLOADED);
    } else {
      setUpdaterState(UPDATER_STATUS_IDLE);
    }
  }

  // just return a resolve; results will be emitted
  return Promise.resolve()
}

function restartBrowser () {
  if (updaterState == UPDATER_STATUS_DOWNLOADED) {
    // run the update installer
    electron.autoUpdater.quitAndInstall();
    debug('[AUTO-UPDATE] Quitting and installing.');
  } else {
    debug('Restarting Beaker by restartBrowser()');
    // do a simple restart
    electron.app.relaunch();
    setTimeout(() => electron.app.exit(0), 1e3);
  }
}

function getSetting (key) {
  return get(key)
}

function getSettings () {
  return getAll()
}

function setSetting (key, value) {
  return set(key, value)
}

async function getUserSetupStatus () {
  // if not cached, defer to the lookup promise
  return (userSetupStatus) || userSetupStatusLookupPromise
}

function setUserSetupStatus (status) {
  userSetupStatus = status; // cache
  return set('user-setup-status', status)
}

// rpc methods
// =

function eventsStream () {
  return emitStream(browserEvents)
}

function showOpenDialog (opts = {}) {
  var wc = this.sender.webContents;
  if (wc.hostWebContents) {
    wc = wc.hostWebContents;
  }
  return new Promise((resolve) => {
    electron.dialog.showOpenDialog({
      title: opts.title,
      buttonLabel: opts.buttonLabel,
      filters: opts.filters,
      properties: opts.properties
    }, filenames => {
      // return focus back to the the webview
      wc.executeJavaScript(`
        var wv = document.querySelector('webview:not(.hidden)')
        if (wv) wv.focus()
      `);
      resolve(filenames);
    });
  })
}

function validateLocalPath (localPath) {
  for (let i = 0; i < DISALLOWED_SAVE_PATH_NAMES.length; i++) {
    let disallowedSavePathName = DISALLOWED_SAVE_PATH_NAMES[i];
    let disallowedSavePath = electron.app.getPath(disallowedSavePathName);
    if (path__default.normalize(localPath) === path__default.normalize(disallowedSavePath)) {
      return {valid: false, name: disallowedSavePathName}
    }
  }
  return {valid: true}
}

async function showLocalPathDialog ({folderName, defaultPath, warnIfNotEmpty} = {}) {
  while (true) {
    // prompt for destination
    var localPath = await new Promise((resolve) => {
      electron.dialog.showOpenDialog({
        defaultPath,
        title: (folderName)
          ? 'Choose where to put the site folder'
          : 'Choose the site folder',
        buttonLabel: 'Save',
        properties: ['openDirectory', 'createDirectory']
      }, filenames => {
        resolve(filenames && filenames[0]);
      });
    });
    if (!localPath) {
      return
    }

    // make sure it's a valid destination
    let validation = validateLocalPath(localPath);
    if (!validation.valid) {
      await new Promise(resolve => {
        electron.dialog.showMessageBox({
          type: 'error',
          message: 'This folder is protected. Please pick another folder or subfolder.',
          detail:
            `This is the OS ${validation.name} folder. ` +
          `We${"'"}re not comfortable letting you use an important folder, ` +
          `because Beaker has tools and APIs that can delete files. ` +
          `Instead, you should pick a child folder, or some other location entirely.`,
          buttons: ['OK']
        }, resolve);
      });
      continue
    }

    // check if the target is empty
    if (warnIfNotEmpty) {
      try {
        var files = await jetpack.listAsync(localPath);
        if (files && files.length > 0) {
          // ask the user if they're sure
          var res = await new Promise(resolve => {
            electron.dialog.showMessageBox({
              type: 'question',
              message: 'This folder is not empty. Files that are not a part of this site will be deleted or overwritten. Save to this folder?',
              buttons: ['Yes', 'Cancel']
            }, resolve);
          });
          if (res != 0) {
            continue
          }
        }
      } catch (e) {
        // no files
      }
    }

    return localPath
  }
}

async function showDeleteArchivePrompt (sitename, oldpath, {bulk} = {}) {
  return new Promise(resolve => {
    electron.dialog.showMessageBox({
      type: 'question',
      message: `Delete '${sitename}'?`,
      detail: 'Deleting this site will remove it from your library and delete the keys. You may undo this action for a short period.',
      checkboxLabel: oldpath ? `Delete the files at ${oldpath}` : undefined,
      checkboxChecked: true,
      buttons: bulk
        ? ['Yes to all', 'Yes', 'No']
        : ['Yes', 'No']
    }, (choice, checkboxChecked) => {
      resolve({
        shouldDelete: (bulk && choice != 2) || (!bulk && choice == 0),
        bulkYesToAll: bulk && choice == 0,
        preserveStagingFolder: !checkboxChecked
      });
    });
  })
}

function openFolder (folderPath) {
  electron.shell.openExternal('file://' + folderPath);
}

async function doWebcontentsCmd (method, wcId, ...args) {
  var wc = electron.webContents.fromId(+wcId);
  if (!wc) throw new Error(`WebContents not found (${wcId})`)
  return wc[method](...args)
}

// internal methods
// =

function setUpdaterState (state) {
  updaterState = state;
  browserEvents.emit('updater-state-changed', state);
}

function getAutoUpdaterFeedURL () {
  if (os.platform() == 'darwin') {
    return 'https://download.beakerbrowser.net/update/osx/' + electron.app.getVersion()
  } else if (os.platform() == 'win32') {
    let bits = (os.arch().indexOf('64') === -1) ? 32 : 64;
    return 'https://download.beakerbrowser.net/update/win' + bits + '/' + electron.app.getVersion()
  }
}

// run a daily check for new updates
function scheduledAutoUpdate () {
  get('auto_update_enabled').then(v => {
    // if auto updates are enabled, run the check
    if (+v === 1) { checkForUpdates(); }

    // schedule next check
    setTimeout(scheduledAutoUpdate, SCHEDULED_AUTO_UPDATE_DELAY);
  });
}

// event handlers
// =

function onUpdateAvailable () {
  // update status and emit, so the frontend can update
  debug('[AUTO-UPDATE] New version available. Downloading...');
  setUpdaterState(UPDATER_STATUS_DOWNLOADING);
}

function onUpdateError (e) {
  debug('[AUTO-UPDATE] error', e.toString());
  setUpdaterState(UPDATER_STATUS_IDLE);
  updaterError = e.toString();
  browserEvents.emit('updater-error', e.toString());
}

function onWebContentsCreated (e, webContents$$1) {
  webContents$$1.on('will-prevent-unload', onWillPreventUnload);
}

function onWillPreventUnload (e) {
  var choice = electron.dialog.showMessageBox({
    type: 'question',
    buttons: ['Leave', 'Stay'],
    title: 'Do you want to leave this site?',
    message: 'Changes you made may not be saved.',
    defaultId: 0,
    cancelId: 1
  });
  var leave = (choice === 0);
  if (leave) {
    e.preventDefault();
  }
}

var manifest = {
  eventsStream: 'readable',
  getDownloads: 'promise',
  pause: 'promise',
  resume: 'promise',
  cancel: 'promise',
  remove: 'promise',
  open: 'promise',
  showInFolder: 'promise'
};

var manifest$1 = {
  get: 'promise',
  set: 'promise',
  getPermissions: 'promise',
  getPermission: 'promise',
  setPermission: 'promise'
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

var keysManifest = {
  add: 'promise',
  changeAppURL: 'promise',
  changeProfileURL: 'promise',
  remove: 'promise',
  get: 'promise'
};

// globals
// =

var db$1;
var migrations$1;
var setupPromise$1;

// exported methods
// =

function setup$4 () {
  // open database
  var dbPath = path__default.join(electron.app.getPath('userData'), 'Profiles');
  db$1 = new sqlite3.Database(dbPath);
  setupPromise$1 = setupSqliteDB(db$1, migrations$1, '[PROFILES]');
}

async function get$2 (...args) {
  await setupPromise$1;
  return cbPromise(cb => db$1.get(...args, cb))
}

async function all (...args) {
  await setupPromise$1;
  return cbPromise(cb => db$1.all(...args, cb))
}

async function run (...args) {
  await setupPromise$1;
  return cbPromise(cb => db$1.run(...args, cb))
}

function serialize () {
  return db$1.serialize()
}

function parallelize () {
  return db$1.parallelize()
}

// internal methods
// =

migrations$1 = [
  migration('profile-data.v1.sql'),
  migration('profile-data.v2.sql'),
  migration('profile-data.v3.sql'),
  migration('profile-data.v4.sql'),
  migration('profile-data.v5.sql')
];
function migration (file) {
  return cb => db$1.exec(fs.readFileSync(path__default.join(__dirname, 'background-process', 'dbs', 'schemas', file), 'utf8'), cb)
}

// exported api
// =

function list () {
  return all(`SELECT id, url, createdAt FROM profiles`)
}

function get$1 (id) {
  return get$2(`SELECT id, url, createdAt FROM profiles WHERE id = ?`, [id])
}

function add (values) {
  values = values || {};
  return run(`
    INSERT
      INTO profiles (url)
      VALUES (?)
  `, [values.url || ''])
}

function update (id, values) {
  return run(`
    UPDATE profiles
      SET url = ?
      WHERE id = ?
  `, [values.url, id])
}

function remove (id) {
  return run(`DELETE FROM profiles WHERE id = ?`, [id])
}

// exported api
// =

var profilesAPI = {
  async list (...args) {
    return list(...args)
  },

  async get (...args) {
    return get$1(...args)
  },

  async add (...args) {
    return add(...args)
  },

  async update (...args) {
    return update(...args)
  },

  async remove (...args) {
    return remove(...args)
  },

  async getCurrent (...args) {
    throw new Error('Not yet implemented')
    // return profilesDb.getCurrent(...args)
  },

  async setCurrent (...args) {
    throw new Error('Not yet implemented')
    // return profilesDb.setCurrent(...args)
  }

};

// instantate a dns cache and export it
const datDns = require('dat-dns')();

var AwaitLock = require('await-lock');

// wraps await-lock in a simpler interface, with many possible locks
// usage:
/*
var lock = require('./lock')
async function foo () {
  var release = await lock('bar')
  // ...
  release()
}
*/

var locks = {};
var lock = async function (key) {
  if (!(key in locks)) locks[key] = new AwaitLock();

  var lock = locks[key];
  await lock.acquireAsync();
  return lock.release.bind(lock)
};

// globals
// =

var datPath; // path to the dat folder
var events = new EventEmitter();

// exported methods
// =

function setup$6 () {
  // make sure the folders exist
  datPath = path__default.join(electron.app.getPath('userData'), 'Dat');
  mkdirp.sync(path__default.join(datPath, 'Archives'));
}

// get the path to an archive's files
function getArchiveMetaPath (archiveOrKey) {
  var key = datEncoding.toStr(archiveOrKey.key || archiveOrKey);
  return path__default.join(datPath, 'Archives', 'Meta', key.slice(0, 2), key.slice(2))
}

// delete all db entries and files for an archive
async function deleteArchive (key) {
  await Promise.all([
    run(`DELETE FROM archives WHERE key=?`, key),
    run(`DELETE FROM archives_meta WHERE key=?`, key),
    jetpack.removeAsync(getArchiveMetaPath(key))
  ]);
}

const on = events.on.bind(events);
const addListener = events.addListener.bind(events);
const removeListener = events.removeListener.bind(events);

// exported methods: archive user settings
// =

// get an array of saved archives
// - optional `query` keys:
//   - `isSaved`: bool
//   - `isOwner`: bool, does beaker have the secret key?
async function query (profileId, query) {
  query = query || {};

  // fetch archive meta
  var values = [];
  var WHERE = [];
  if (query.isOwner === true) WHERE.push('archives_meta.isOwner = 1');
  if (query.isOwner === false) WHERE.push('archives_meta.isOwner = 0');
  if ('isSaved' in query) {
    WHERE.push('archives.profileId = ?');
    values.push(profileId);
    if (query.isSaved) WHERE.push('archives.isSaved = 1');
    if (!query.isSaved) WHERE.push('archives.isSaved = 0');
  }
  if (WHERE.length) WHERE = `WHERE ${WHERE.join(' AND ')}`;
  else WHERE = '';
  var archives = await all(`
    SELECT archives_meta.*, archives.isSaved, archives.autoDownload, archives.autoUpload, archives.localPath
      FROM archives_meta
      LEFT JOIN archives ON archives_meta.key = archives.key
      ${WHERE}
  `, values);

  // massage the output
  archives.forEach(archive => {
    archive.url = `dat://${archive.key}`;
    archive.isOwner = archive.isOwner != 0;
    archive.userSettings = {
      isSaved: archive.isSaved != 0,
      autoDownload: archive.autoDownload != 0,
      autoUpload: archive.autoUpload != 0,
      localPath: archive.localPath
    };

    delete archive.isSaved;
    delete archive.autoDownload;
    delete archive.autoUpload;
    delete archive.localPath;
  });
  return archives
}

// get all archives that are ready for garbage collection
async function listExpiredArchives ({olderThan, biggerThan} = {}) {
  olderThan = olderThan || DAT_GC_EXPIRATION_AGE;
  biggerThan = biggerThan || DAT_GC_DEFAULT_MINIMUM_SIZE;
  return all(`
    SELECT archives_meta.key
      FROM archives_meta
      LEFT JOIN archives ON archives_meta.key = archives.key
      WHERE
        (archives.isSaved != 1 OR archives.isSaved IS NULL)
        AND archives_meta.lastAccessTime < ?
        AND archives_meta.metaSize > ?
  `, [Date.now() - olderThan, biggerThan])
}

// upsert the last-access time
async function touch (key) {
  var now = Date.now();
  key = datEncoding.toStr(key);
  await run(`UPDATE archives_meta SET lastAccessTime=? WHERE key=?`, [now, key]);
  await run(`INSERT OR IGNORE INTO archives_meta (key, lastAccessTime) VALUES (?, ?)`, [key, now]);
}

// get a single archive's user settings
// - supresses a not-found with an empty object
async function getUserSettings (profileId, key) {
  // massage inputs
  key = datEncoding.toStr(key);

  // validate inputs
  if (!DAT_HASH_REGEX.test(key)) {
    throw new beakerErrorConstants.InvalidArchiveKeyError()
  }

  // fetch
  try {
    var settings = await get$2(`
      SELECT * FROM archives WHERE profileId = ? AND key = ?
    `, [profileId, key]);
    settings.isSaved = !!settings.isSaved;
    settings.autoDownload = !!settings.autoDownload;
    settings.autoUpload = !!settings.autoUpload;
    return settings
  } catch (e) {
    return {}
  }
}

// write an archive's user setting
async function setUserSettings (profileId, key, newValues = {}) {
  // massage inputs
  key = datEncoding.toStr(key);

  // validate inputs
  if (!DAT_HASH_REGEX.test(key)) {
    throw new beakerErrorConstants.InvalidArchiveKeyError()
  }

  var release = await lock('archives-db');
  try {
    // fetch current
    var value = await getUserSettings(profileId, key);

    if (typeof value.key === 'undefined') {
      // create
      value = {
        profileId,
        key,
        isSaved: newValues.isSaved,
        autoDownload: ('autoDownload' in newValues) ? newValues.autoDownload : newValues.isSaved,
        autoUpload: ('autoUpload' in newValues) ? newValues.autoUpload : newValues.isSaved,
        localPath: newValues.localPath
      };
      await run(`
        INSERT INTO archives (profileId, key, isSaved, autoDownload, autoUpload, localPath) VALUES (?, ?, ?, ?, ?, ?)
      `, [profileId, key, flag(value.isSaved), flag(value.autoDownload), flag(value.autoUpload), value.localPath]);
    } else {
      // update
      var { isSaved, autoDownload, autoUpload, localPath } = newValues;
      if (typeof isSaved === 'boolean') value.isSaved = isSaved;
      if (typeof autoDownload === 'boolean') value.autoDownload = autoDownload;
      if (typeof autoUpload === 'boolean') value.autoUpload = autoUpload;
      if (typeof localPath === 'string') value.localPath = localPath;
      await run(`
        UPDATE archives SET isSaved = ?, autoDownload = ?, autoUpload = ?, localPath = ? WHERE profileId = ? AND key = ?
      `, [flag(value.isSaved), flag(value.autoDownload), flag(value.autoUpload), value.localPath, profileId, key]);
    }

    events.emit('update:archive-user-settings', key, value);
    return value
  } finally {
    release();
  }
}

// exported methods: archive meta
// =

// get a single archive's metadata
// - supresses a not-found with an empty object
async function getMeta (key) {
  // massage inputs
  key = datEncoding.toStr(key);

  // validate inputs
  if (!DAT_HASH_REGEX.test(key)) {
    throw new beakerErrorConstants.InvalidArchiveKeyError()
  }

  try {
    // fetch
    var meta = await get$2(`
      SELECT * FROM archives_meta WHERE key = ?
    `, [key]);

    // massage some values
    meta.isOwner = !!meta.isOwner;
    return meta
  } catch (e) {
    return {}
  }
}

// write an archive's metadata
async function setMeta (key, value = {}) {
  // massage inputs
  key = datEncoding.toStr(key);

  // validate inputs
  if (!DAT_HASH_REGEX.test(key)) {
    throw new beakerErrorConstants.InvalidArchiveKeyError()
  }

  // extract the desired values
  var {title, description, mtime, metaSize, stagingSize, stagingSizeLessIgnored, isOwner} = value;
  isOwner = isOwner ? 1 : 0;

  // write
  await run(`
    INSERT OR REPLACE INTO
      archives_meta (key, title, description, mtime, metaSize, stagingSize, stagingSizeLessIgnored, isOwner)
      VALUES        (?,   ?,     ?,           ?,     ?,        ?,           ?,                      ?)
  `, [key, title, description, mtime, metaSize, stagingSize, stagingSizeLessIgnored, isOwner]);
  events.emit('update:archive-meta', key, value);
}

// internal methods
// =

function flag (b) {
  return b ? 1 : 0
}

function extractOrigin (originURL) {
  var urlp = url__default.parse(originURL);
  if (!urlp || !urlp.host || !urlp.protocol) return
  return (urlp.protocol + (urlp.slashes ? '//' : '') + urlp.host)
}

const debug$3 = require('debug')('dat');

// exported API
// =

function setup$7 () {
  schedule(DAT_GC_FIRST_COLLECT_WAIT);
}

async function collect ({olderThan, biggerThan} = {}) {
  var startTime = Date.now();
  var expiredArchives = await listExpiredArchives({olderThan, biggerThan});
  debug$3('GC cleaning out %d expired archives', expiredArchives.length);
  for (let i = 0; i < expiredArchives.length; i++) {
    await deleteArchive(expiredArchives[i].key);
  }
  debug$3('GC completed in %d ms', Date.now() - startTime);
  schedule(DAT_GC_REGULAR_COLLECT_WAIT);
}

// helpers
// =

function schedule (time) {
  var t = setTimeout(collect, time);
  t.unref();
}

var debug$2 = require('debug')('dat');
// dat modules
// network modules
// file modules
const du = pify(require('du'));

// constants
// =

const DEFAULT_DATS_FOLDER = process.env.beaker_sites_path
  ? process.env.beaker_sites_path
  : path__default.join(electron.app.getPath('home'), 'Sites');

// globals
// =

var networkId = crypto.randomBytes(32);
var archives = {}; // in-memory cache of archive objects. key -> archive
var archivesByDKey = {}; // same, but discoveryKey -> archive
var archiveLoadPromises = {}; // key -> promise
var archivesEvents = new EventEmitter();
var debugEvents = new EventEmitter();
var archiveSwarm;

// exported API
// =

function setup$5 () {
  // make sure the default dats folder exists
  mkdirp.sync(DEFAULT_DATS_FOLDER);

  // wire up event handlers
  on('update:archive-user-settings', async (key, settings) => {
    // emit event
    var details = {
      url: 'dat://' + key,
      isSaved: settings.isSaved,
      autoDownload: settings.autoDownload,
      autoUpload: settings.autoUpload
    };
    archivesEvents.emit(settings.isSaved ? 'added' : 'removed', {details});

    // update the staging based on these settings
    var archive = getArchive(key);
    if (archive) {
      configureStaging(archive, settings);
      configureAutoDownload(archive, settings);
    }
  });

  // setup the archive swarm
  setup$7();
  archiveSwarm = discoverySwarm(swarmDefaults({
    id: networkId,
    hash: false,
    utp: true,
    tcp: true,
    stream: createReplicationStream
  }));
  archiveSwarm.once('error', () => archiveSwarm.listen(0));
  archiveSwarm.listen(DAT_SWARM_PORT);

  // load and configure all saved archives
  query(0, {isSaved: true}).then(
    archives => archives.forEach(a => loadArchive(a.key, a.userSettings)),
    err => console.error('Failed to load networked archives', err)
  );
}

function createEventStream () {
  return emitStream(archivesEvents)
}

function createDebugStream () {
  return emitStream(debugEvents)
}

// read metadata for the archive, and store it in the meta db
async function pullLatestArchiveMeta (archive, {updateMTime} = {}) {
  try {
    var key = archive.key.toString('hex');

    // ready() just in case (we need .blocks)
    await pify(archive.ready.bind(archive))();

    // read the archive meta and size on disk
    var [manifest, oldMeta] = await Promise.all([
      pda__default.readManifest(archive).catch(_ => {}),
      getMeta(key),
      updateSizeTracking(archive)
    ]);
    manifest = manifest || {};
    var {title, description} = manifest;
    var isOwner = archive.writable;
    var metaSize = archive.metaSize || 0;
    var stagingSize = archive.stagingSize || 0;
    var stagingSizeLessIgnored = archive.stagingSizeLessIgnored || 0;
    var mtime = updateMTime ? Date.now() : oldMeta.mtime;

    // write the record
    var details = {title, description, mtime, metaSize, stagingSize, stagingSizeLessIgnored, isOwner};
    debug$2('Writing meta', details);
    await setMeta(key, details);

    // emit the updated event
    details.url = 'dat://' + key;
    archivesEvents.emit('updated', {details});
    return details
  } catch (e) {
    console.error('Error pulling meta', e);
  }
}

// archive creation
// =

async function createNewArchive (manifest = {}) {
  var userSettings = {
    localPath: await selectDefaultLocalPath(manifest.title),
    isSaved: true
  };

  // create the archive
  var archive = await loadArchive(null, userSettings);
  var key = datEncoding.toStr(archive.key);
  manifest.url = `dat://${key}/`;

  // write the manifest
  await pda__default.writeManifest(archive, manifest);
  await pda__default.writeManifest(archive.stagingFS, manifest);

  // write the user settings
  await setUserSettings(0, key, userSettings);

  // write the metadata
  await pullLatestArchiveMeta(archive);

  return manifest.url
}

async function forkArchive (srcArchiveUrl, manifest = {}) {
  srcArchiveUrl = fromKeyToURL(srcArchiveUrl);

  // get the old archive
  var srcArchive = getArchive(srcArchiveUrl);
  if (!srcArchive) {
    throw new Error('Invalid archive key')
  }

  // fetch old archive meta
  var srcManifest = await pda__default.readManifest(srcArchive).catch(_ => {});
  srcManifest = srcManifest || {};

  // fetch old archive ignore rules
  var ignore = ['/.dat', '/.git', '/dat.json'];
  try {
    let ignoreRaw = await pda__default.readFile(srcArchive.stagingFS, '/.datignore', 'utf8');
    let ignoreCustomRules = hyperstaging.parseIgnoreRules(ignoreRaw);
    ignore = ignore.concat(ignoreCustomRules);
  } catch (e) {
    // ignore
  }

  // override any manifest data
  var dstManifest = {
    title: (manifest.title) ? manifest.title : srcManifest.title,
    description: (manifest.description) ? manifest.description : srcManifest.description
  };

  // create the new archive
  var dstArchiveUrl = await createNewArchive(dstManifest);
  var dstArchive = getArchive(dstArchiveUrl);

  // copy files
  await pda__default.exportArchiveToArchive({
    srcArchive: srcArchive.stagingFS,
    dstArchive: dstArchive.stagingFS,
    skipUndownloadedFiles: true,
    ignore
  });
  await pda__default.commit(dstArchive.staging);

  return dstArchiveUrl
}

// archive management
// =

async function loadArchive (key, userSettings = null) {
  // validate key
  var secretKey;
  if (key) {
    if (!Buffer.isBuffer(key)) {
      // existing dat
      key = fromURLToKey(key);
      if (!DAT_HASH_REGEX.test(key)) {
        throw new beakerErrorConstants.InvalidURLError()
      }
      key = datEncoding.toBuf(key);
    }
  } else {
    // new dat, generate keys
    var kp = signatures.keyPair();
    key = kp.publicKey;
    secretKey = kp.secretKey;
  }

  // fallback to the promise, if possible
  var keyStr = datEncoding.toStr(key);
  if (keyStr in archiveLoadPromises) {
    return archiveLoadPromises[keyStr]
  }

  // run and cache the promise
  var p = loadArchiveInner(key, secretKey, userSettings);
  archiveLoadPromises[keyStr] = p;
  p.catch(err => {
    console.error('Failed to load archive', err);
  });

  // when done, clear the promise
  const clear = () => delete archiveLoadPromises[keyStr];
  p.then(clear, clear);

  return p
}

// main logic, separated out so we can capture the promise
async function loadArchiveInner (key, secretKey, userSettings = null) {
  // load the user settings as needed
  if (!userSettings) {
    try {
      userSettings = await getUserSettings(0, key);
    } catch (e) {
      userSettings = {};
    }
  }

  // ensure the folders exist
  var metaPath = getArchiveMetaPath(key);
  mkdirp.sync(metaPath);

  // create the archive instance
  var archive = hyperdrive(metaPath, key, {sparse: true, secretKey});
  archive.replicationStreams = []; // list of all active replication streams
  archive.peerHistory = []; // samples of the peer count
  Object.defineProperty(archive, 'stagingFS', {
    get: () => archive.writable ? archive.staging : archive
  });

  // wait for ready
  await new Promise((resolve, reject) => {
    archive.ready(err => {
      if (err) reject(err);
      else resolve();
    });
  });
  await configureStaging(archive, userSettings, !!secretKey);
  await updateSizeTracking(archive);
  configureAutoDownload(archive, userSettings);
  touch(key).catch(err => console.error('Failed to update lastAccessTime for archive', key, err));

  // store in the discovery listing, so the swarmer can find it
  // but not yet in the regular archives listing, because it's not fully loaded
  archivesByDKey[datEncoding.toStr(archive.discoveryKey)] = archive;

  // join the swarm
  joinSwarm(archive);

  // await initial metadata sync if not the owner
  if (!archive.writable && !archive.metadata.length) {
    // wait to receive a first update
    await new Promise((resolve, reject) => {
      archive.metadata.update(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // pull meta
  await pullLatestArchiveMeta(archive);

  // wire up events
  archive.pullLatestArchiveMeta = debounce(opts => pullLatestArchiveMeta(archive, opts), 1e3);
  archive.fileActStream = pda__default.createFileActivityStream(archive);
  archive.fileActStream.on('data', ([event]) => {
    if (event === 'changed') {
      archive.pullLatestArchiveMeta({updateMTime: true});
    }
  });

  // now store in main archives listing, as loaded
  archives[datEncoding.toStr(archive.key)] = archive;
  return archive
}

function getArchive (key) {
  key = fromURLToKey(key);
  return archives[key]
}

function getActiveArchives () {
  return archives
}

async function getOrLoadArchive (key, opts) {
  var archive = getArchive(key);
  if (archive) {
    return archive
  }
  return loadArchive(key, opts)
}

async function updateSizeTracking (archive) {
  // read the datignore
  var filter;
  if (archive.staging) {
    var ignoreFilter = await new Promise(resolve => {
      archive.staging.readIgnore({}, resolve);
    });
    // wrap the filter to work correctly with du
    var pathlen = archive.staging.path.length;
    filter = (filepath) => {
      filepath = filepath.slice(pathlen);
      return ignoreFilter(filepath)
    };
  }

  // fetch sizes
  var [metaSize, stagingSize, stagingSizeLessIgnored] = await Promise.all([
    du(getArchiveMetaPath(archive), {disk: true}).catch(_ => 0),
    archive.staging ? du(archive.staging.path, {disk: true}).catch(_ => 0) : 0,
    archive.staging ? du(archive.staging.path, {disk: true, filter}).catch(_ => 0) : 0
  ]);
  archive.metaSize = metaSize;
  archive.stagingSize = stagingSize;
  archive.stagingSizeLessIgnored = stagingSizeLessIgnored;
}

// archive fetch/query
// =

async function queryArchives (query$$1) {
  // run the query
  var archiveInfos = await query(0, query$$1);

  // attach some live data
  archiveInfos.forEach(archiveInfo => {
    var archive = getArchive(archiveInfo.key);
    if (archive) {
      archiveInfo.peers = archive.metadata.peers.length;
      archiveInfo.peerHistory = archive.peerHistory;
    }
  });
  return archiveInfos
}

async function getArchiveInfo (key) {
  // get the archive
  key = fromURLToKey(key);
  var archive = await getOrLoadArchive(key);

  // fetch archive data
  var [meta, userSettings] = await Promise.all([
    getMeta(key),
    getUserSettings(0, key)
  ]);
  meta.key = key;
  meta.url = `dat://${key}`;
  meta.version = archive.version;
  meta.metaSize = archive.metaSize;
  meta.stagingSize = archive.stagingSize;
  meta.stagingSizeLessIgnored = archive.stagingSizeLessIgnored;
  meta.userSettings = {
    localPath: userSettings.localPath,
    isSaved: userSettings.isSaved,
    autoDownload: userSettings.autoDownload,
    autoUpload: userSettings.autoUpload
  };
  meta.peers = archive.metadata.peers.length;
  meta.peerInfo = archive.replicationStreams.map(s => ({
    host: s.peerInfo.host,
    port: s.peerInfo.port
  }));
  meta.peerHistory = archive.peerHistory;
  if (userSettings.localPath) {
    meta.localPathExists = ((await jetpack.existsAsync(userSettings.localPath)) === 'dir');
  }

  return meta
}

async function configureStaging (archive, userSettings, isWritableOverride) {
  var isWritable = (archive.writable || isWritableOverride);
  if (archive.staging && archive.staging.path === userSettings.localPath) {
    // no further changes needed
    return
  }

  // recreate staging
  if (isWritable && !!userSettings.localPath) {
    archive.staging = hyperstaging(archive, userSettings.localPath, {
      ignore: ['/.dat', '/.git']
    });
    if ((await jetpack.existsAsync(userSettings.localPath)) !== 'dir') {
      return // abort here, the folder is AWOL
    }

    // restore dat.json if needed
    const datJsonOnly = path$$1 => path$$1 !== '/dat.json';
    var diff = await pda__default.diff(archive.staging, {filter: datJsonOnly});
    if (diff.length === 1 && diff[0].change === 'del') {
      await pda__default.revert(archive.staging, {filter: datJsonOnly});
    }
  } else {
    archive.staging = null;
  }
}

async function selectDefaultLocalPath (title) {
  // massage the title
  title = typeof title === 'string' ? title : '';
  title = title.replace(INVALID_SAVE_FOLDER_CHAR_REGEX, '');
  if (!title.trim()) {
    title = 'Untitled';
  }
  title = slugify(title).toLowerCase();

  // find an available variant of title
  var tryNum = 1;
  var titleVariant = title;
  while (await jetpack.existsAsync(path__default.join(DEFAULT_DATS_FOLDER, titleVariant))) {
    titleVariant = `${title}-${++tryNum}`;
  }
  var localPath = path__default.join(DEFAULT_DATS_FOLDER, titleVariant);

  // create the folder
  mkdirp.sync(localPath);
  return localPath
}

async function restoreStagingFolder (key, oldpath) {
  // TODO prompt the user if the folder is non empty?

  // make sure the folder exists
  await jetpack.dirAsync(oldpath);

  // restore files
  var archive = await getOrLoadArchive(key);
  if (archive.staging) {
    await pda__default.revert(archive.staging);
  }
}

async function deleteOldStagingFolder (oldpath, {alwaysDelete} = {}) {
  // check if the old path still exists
  var info = await jetpack.inspectAsync(oldpath);
  if (!info || info.type !== 'dir') {
    return
  }

  // delete if its empty
  var contents = (!alwaysDelete) ? (await jetpack.listAsync(oldpath)) : [];
  if (contents.length === 0 || alwaysDelete) {
    await jetpack.removeAsync(oldpath);
  }
}

async function clearFileCache (key) {
  var archive = await getOrLoadArchive(key);
  if (archive.writable) {
    return // abort, only clear the content cache of downloaded archives
  }

  // clear the cache
  await new Promise((resolve, reject) => {
    archive.content.clear(0, archive.content.length, err => {
      if (err) reject(err);
      else resolve();
    });
  });

  // force a reconfig of the autodownloader
  var userSettings = await getUserSettings(0, key);
  stopAutodownload(archive);
  configureAutoDownload(archive, userSettings);
}

// archive networking
// =

// put the archive into the network, for upload and download
function joinSwarm (key, opts) {
  var archive = (typeof key === 'object' && key.key) ? key : getArchive(key);
  if (!archive || archive.isSwarming) return
  archiveSwarm.join(archive.discoveryKey);
  var keyStr = datEncoding.toStr(archive.key);
  log(keyStr, `Swarming archive, discovery key: ${datEncoding.toStr(archive.discoveryKey)}`);
  archive.isSwarming = true;
}

// take the archive out of the network


// internal methods
// =

function fromURLToKey (url$$1) {
  if (Buffer.isBuffer(url$$1)) {
    return url$$1
  }
  if (url$$1.startsWith('dat://')) {
    var match = DAT_URL_REGEX.exec(url$$1);
    if (match) return match[1]
  }
  return url$$1
}

function fromKeyToURL (key) {
  if (typeof key !== 'string') {
    key = datEncoding.toStr(key);
  }
  if (!key.startsWith('dat://')) {
    return `dat://${key}/`
  }
  return key
}

function configureAutoDownload (archive, userSettings) {
  if (archive.writable) {
    return // abort, only used for unwritable
  }
  // HACK
  // mafintosh is planning to put APIs for this inside of hyperdrive
  // till then, we'll do our own inefficient downloader
  // -prf
  const isAutoDownloading = userSettings.isSaved && userSettings.autoDownload;
  if (!archive._autodownloader && isAutoDownloading) {
    // setup the autodownload
    archive._autodownloader = {
      undownloadAll: () => {
        archive.content._selections.forEach(range => archive.content.undownload(range));
      },
      onUpdate: throttle(() => {
        // cancel ALL previous, then prioritize ALL current
        archive._autodownloader.undownloadAll();
        pda__default.download(archive, '/').catch(e => { /* ignore cancels */ });
      }, 5e3)
    };
    archive.metadata.on('download', archive._autodownloader.onUpdate);
    pda__default.download(archive, '/').catch(e => { /* ignore cancels */ });
  } else if (archive._autodownloader && !isAutoDownloading) {
    stopAutodownload(archive);
  }
}

function stopAutodownload (archive) {
  if (archive._autodownloader) {
    archive._autodownloader.undownloadAll();
    archive.metadata.removeListener('download', archive._autodownloader.onUpdate);
    archive._autodownloader = null;
  }
}

var connIdCounter = 0; // for debugging
function createReplicationStream (info) {
  // create the protocol stream
  var connId = ++connIdCounter;
  var start = Date.now();
  var stream = hypercoreProtocol({
    id: networkId,
    live: true,
    encrypt: true
  });
  stream.peerInfo = info;

  // add the archive if the discovery network gave us any info
  if (info.channel) {
    add(info.channel);
  }

  // add any requested archives
  stream.on('feed', add);

  function add (dkey) {
    // lookup the archive
    var dkeyStr = datEncoding.toStr(dkey);
    var chan = dkeyStr.slice(0, 6) + '..' + dkeyStr.slice(-2);
    var archive = archivesByDKey[dkeyStr];
    if (!archive) {
      return
    }

    // ditch if we already have this stream
    if (archive.replicationStreams.indexOf(stream) !== -1) {
      return
    }

    // do some logging
    var keyStr = datEncoding.toStr(archive.key);
    log(keyStr, `new connection id=${connId} dkey=${chan} type=${info.type} host=${info.host}:${info.port}`);

    // create the replication stream
    archive.replicate({stream, live: true});
    archive.replicationStreams.push(stream);
    onNetworkChanged(archive);
    function onend () {
      var rs = archive.replicationStreams;
      var i = rs.indexOf(stream);
      if (i !== -1) {
        rs.splice(i, 1);
      }
      onNetworkChanged(archive);
    }
    stream.once('error', onend);
    stream.once('close', onend);
  }

  // debugging
  stream.once('handshake', () => {
    log(false, `got handshake (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port}`);
  });
  stream.on('error', err => {
    log(false, `error (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port} error=${err.toString()}`);
  });
  stream.on('close', () => {
    log(false, `closing connection (${Date.now() - start}ms) id=${connId} type=${info.type} host=${info.host}:${info.port}`);
  });
  return stream
}

function onNetworkChanged (archive) {
  var now = Date.now();
  var lastHistory = archive.peerHistory.slice(-1)[0];
  if (lastHistory && (now - lastHistory.ts) < 10e3) {
    // if the last datapoint was < 10s ago, just update it
    lastHistory.peers = archive.metadata.peers.length;
  } else {
    archive.peerHistory.push({
      ts: Date.now(),
      peers: archive.metadata.peers.length
    });
  }

  // keep peerHistory from getting too long
  if (archive.peerHistory.length >= 500) {
    // downsize to 360 points, which at 10s intervals covers one hour
    archive.peerHistory = archive.peerHistory.slice(archive.peerHistory.length - 360);
  }

  // count # of peers
  var totalPeerCount = 0;
  for (var k in archives) {
    totalPeerCount += archives[k].metadata.peers.length;
  }
  archivesEvents.emit('network-changed', {
    details: {
      url: `dat://${datEncoding.toStr(archive.key)}`,
      peers: archive.replicationStreams.map(s => ({host: s.peerInfo.host, port: s.peerInfo.port})),
      peerCount: archive.metadata.peers.length,
      totalPeerCount
    }
  });
}

function log (...args) {
  // pull out the key
  var key = args[0];
  args = args.slice(1);
  debug$2(...args, `key=${key}`);
  debugEvents.emit(key || 'all', {args});
}

function timer (ms$$1, fn) {
  var currentAction;
  var isTimedOut = false;

  // no timeout?
  if (!ms$$1) return fn(() => false)

  return new Promise((resolve, reject) => {
    // start the timer
    const timer = setTimeout(() => {
      isTimedOut = true;
      reject(new beakerErrorConstants.TimeoutError(currentAction ? `Timed out while ${currentAction}` : undefined));
    }, ms$$1);

    // call the fn to get the promise
    var promise = fn(action => {
      if (action) currentAction = action;
      return isTimedOut
    });

    // wrap the promise
    promise.then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  })
}

// exported api
// =

const to = (opts) =>
  (opts && typeof opts.timeout !== 'undefined')
    ? opts.timeout
    : DEFAULT_DAT_API_TIMEOUT;

var archivesAPI = {
  async status () {
    var status = {archives: 0, peers: 0};
    var archives = getActiveArchives();
    for (var k in archives) {
      status.archives++;
      status.peers += archives[k].metadata.peers.length;
    }
    return status
  },

  async create ({title, description} = {}) {
    return createNewArchive({title, description})
  },

  async fork (url$$1, {title, description} = {}) {
    return forkArchive(url$$1, {title, description})
  },

  async update (url$$1, manifestInfo, userSettings) {
    var key = toKey(url$$1);
    var archive = await getOrLoadArchive(key);

    // no info provided: open modal
    if (!manifestInfo && !userSettings) {
      if (!archive.writable) {
        throw new beakerErrorConstants.ArchiveNotWritableError()
      }
      // show the update-info the modal
      let win = electron.BrowserWindow.fromWebContents(this.sender);
      await assertSenderIsFocused(this.sender);
      return showModal(win, 'create-archive', {url: url$$1})
    }

    // validate path
    if (userSettings && userSettings.localPath && !validateLocalPath(userSettings.localPath).valid) {
      throw new beakerErrorConstants.InvalidPathError('Cannot save the site to that folder')
    }

    // update manifest file
    if (manifestInfo) {
      var archiveInfo = await getMeta(key);
      var {title, description} = manifestInfo;
      title = typeof title !== 'undefined' ? title : archiveInfo.title;
      description = typeof description !== 'undefined' ? description : archiveInfo.description;
      if (title !== archiveInfo.title || description !== archiveInfo.description) {
        await Promise.all([
          pda__default.updateManifest(archive, {title, description}),
          pda__default.updateManifest(archive.staging, {title, description})
        ]);
        pullLatestArchiveMeta(archive);
      }
    }

    // update settings
    if (userSettings) {
      var oldLocalPath = archive.staging ? archive.staging.path : false;
      userSettings = await setUserSettings(0, key, userSettings);
      await configureStaging(archive, userSettings);
      if (userSettings.localPath && userSettings.localPath !== oldLocalPath) {
        deleteOldStagingFolder(oldLocalPath);
      }
    }
  },

  async add (url$$1) {
    var key = toKey(url$$1);

    // pull metadata
    var archive = await getOrLoadArchive(key);
    var meta = await pullLatestArchiveMeta(archive);

    // select a default local path, if needed
    var localPath;
    if (archive.writable) {
      try {
        let userSettings = await getUserSettings(0, key);
        localPath = userSettings.localPath;
      } catch (e) {}
      localPath = localPath || await selectDefaultLocalPath(meta.title);
    }

    // update settings
    return setUserSettings(0, key, {isSaved: true, localPath})
  },

  async remove (url$$1, {noPrompt} = {}) {
    var key = toKey(url$$1);

    // check with the user if they're the owner
    var meta = await getMeta(key);
    if (meta.isOwner && !noPrompt) {
      var settings = await getUserSettings(0, key);
      var {shouldDelete, preserveStagingFolder} = await showDeleteArchivePrompt(meta.title || key, settings.localPath);
      if (!shouldDelete) {
        return settings
      }
    }

    // delete
    settings = await setUserSettings(0, key, {isSaved: false});
    if (settings.localPath && !preserveStagingFolder) {
      deleteOldStagingFolder(settings.localPath, {alwaysDelete: true});
    }
    return settings
  },

  async bulkRemove (urls) {
    var bulkShouldDelete = false;
    var preserveStagingFolder = false;
    // if user chooses yes-to-all, then preserveStagingFolder will be the last given value
    var results = [];

    // sanity check
    if (!urls || !Array.isArray(urls)) {
      return []
    }

    for (var i = 0; i < urls.length; i++) {
      let key = toKey(urls[i]);

      if (!bulkShouldDelete) {
        // check with the user if they're the owner
        let meta = await getMeta(key);
        if (meta.isOwner) {
          let settings = await getUserSettings(0, key);
          let res = await showDeleteArchivePrompt(meta.title || key, settings.localPath, {bulk: true});
          preserveStagingFolder = res.preserveStagingFolder;

          if (res.bulkYesToAll) {
            // 'yes to all' chosen
            bulkShouldDelete = true;
          } else if (!res.shouldDelete) {
            // 'no' chosen
            results.push(settings); // give settings unchanged
            continue
          }
        }
      }

      // delete
      let settings = await setUserSettings(0, key, {isSaved: false});
      if (settings.localPath && !preserveStagingFolder) {
        deleteOldStagingFolder(settings.localPath, {alwaysDelete: true});
      }
      results.push(settings);
    }
    return results
  },

  async restore (url$$1) {
    var key = toKey(url$$1);
    var settings = await getUserSettings(0, key);
    if (settings.localPath) {
      await restoreStagingFolder(key, settings.localPath);
      return true
    }
    return false
  },

  async list (query$$1 = {}) {
    return queryArchives(query$$1)
  },

  async get (url$$1, opts) {
    return timer(to(opts), async (checkin) => {
      return getArchiveInfo(toKey(url$$1))
    })
  },

  async clearFileCache (url$$1) {
    return clearFileCache(toKey(url$$1))
  },

  clearDnsCache () {
    datDns.flushCache();
  },

  createEventStream () {
    return createEventStream()
  },

  createDebugStream () {
    return createDebugStream()
  }
};

async function assertSenderIsFocused (sender) {
  if (!sender.isFocused()) {
    throw new beakerErrorConstants.UserDeniedError('Application must be focused to spawn a prompt')
  }
}

// helper to convert the given URL to a dat key
function toKey (url$$1) {
  if (DAT_HASH_REGEX.test(url$$1)) {
    // simple case: given the key
    return url$$1
  }

  var urlp = url.parse(url$$1);

  // validate
  if (urlp.protocol !== 'dat:') {
    throw new beakerErrorConstants.InvalidURLError('URL must be a dat: scheme')
  }
  if (!DAT_HASH_REGEX.test(urlp.host)) {
    // TODO- support dns lookup?
    throw new beakerErrorConstants.InvalidURLError('Hostname is not a valid hash')
  }

  return urlp.host
}

// exported methods
// =

function add$1 (profileId, url$$1, title, pinned) {
  return run(`
    INSERT OR REPLACE
      INTO bookmarks (profileId, url, title, pinned)
      VALUES (?, ?, ?, ?)
  `, [profileId, url$$1, title, pinned])
}

function changeTitle (profileId, url$$1, title) {
  return run(`UPDATE bookmarks SET title = ? WHERE profileId = ? AND url = ?`, [title, profileId, url$$1])
}

function changeUrl (profileId, oldUrl, newUrl) {
  return run(`UPDATE bookmarks SET url = ? WHERE profileId = ? AND url = ?`, [newUrl, profileId, oldUrl])
}

function togglePinned (profileId, url$$1, pinned) {
  return run(`UPDATE bookmarks SET pinned = ? WHERE profileId = ? AND url = ?`, [pinned ? 1 : 0, profileId, url$$1])
}

function remove$1 (profileId, url$$1) {
  return run(`DELETE FROM bookmarks WHERE profileId = ? AND url = ?`, [profileId, url$$1])
}

function get$3 (profileId, url$$1) {
  return get$2(`SELECT url, title FROM bookmarks WHERE profileId = ? AND url = ?`, [profileId, url$$1])
}

function list$1 (profileId, opts) {
  var extra = (opts && opts.pinned) ? 'AND pinned = 1' : '';
  return all(`SELECT url, title, pinned FROM bookmarks WHERE profileId = ? ${extra} ORDER BY createdAt DESC`, [profileId])
}

// exported api
// =

var bookmarksAPI = {
  async add (...args) {
    return add$1(0, ...args)
  },

  async changeTitle (...args) {
    return changeTitle(0, ...args)
  },

  async changeUrl (...args) {
    return changeUrl(0, ...args)
  },

  async remove (...args) {
    return remove$1(0, ...args)
  },

  async get (...args) {
    return get$3(0, ...args)
  },

  async list (...args) {
    return list$1(0, ...args)
  },

  async togglePinned (...args) {
    return togglePinned(0, ...args)
  }
};

const BadParam = zerr('BadParam', '% must be a %');

// exported methods
// =

async function addVisit (profileId, {url: url$$1, title}) {
  // validate parameters
  if (!url$$1 || typeof url$$1 !== 'string') {
    throw new BadParam('url', 'string')
  }
  if (!title || typeof title !== 'string') {
    throw new BadParam('title', 'string')
  }

  var release = await lock('history-db');
  try {
    await run('BEGIN TRANSACTION;');

    // get current stats
    var stats = await get$2('SELECT * FROM visit_stats WHERE url = ?;', [url$$1]);
    var ts = Date.now();

    // create or update stats
    if (!stats) {
      await run('INSERT INTO visit_stats (url, num_visits, last_visit_ts) VALUES (?, ?, ?);', [url$$1, 1, ts]);
      await run('INSERT INTO visit_fts (url, title) VALUES (?, ?);', [url$$1, title]);
    } else {
      let num_visits = (+stats.num_visits || 1) + 1;
      await run('UPDATE visit_stats SET num_visits = ?, last_visit_ts = ? WHERE url = ?;', [num_visits, ts, url$$1]);
    }

    // visited within 1 hour?
    var visit = await get$2('SELECT rowid, * from visits WHERE profileId = ? AND url = ? AND ts > ? ORDER BY ts DESC LIMIT 1', [profileId, url$$1, ts - 1000 * 60 * 60]);
    if (visit) {
      // update visit ts and title
      await run('UPDATE visits SET ts = ?, title = ? WHERE rowid = ?', [ts, title, visit.rowid]);
    } else {
      // log visit
      await run('INSERT INTO visits (profileId, url, title, ts) VALUES (?, ?, ?, ?);', [profileId, url$$1, title, ts]);
    }

    await run('COMMIT;');
  } finally {
    release();
  }
}

async function getVisitHistory (profileId, { offset, limit }) {
  var release = await lock('history-db');
  try {
    offset = offset || 0;
    limit = limit || 50;
    return await all('SELECT * FROM visits WHERE profileId = ? ORDER BY ts DESC LIMIT ? OFFSET ?', [profileId, limit, offset])
  } finally {
    release();
  }
}

async function getMostVisited (profileId, { offset, limit }) {
  var release = await lock('history-db');
  try {
    offset = offset || 0;
    limit = limit || 50;
    return await all(`
      SELECT visit_stats.*, visits.title AS title
        FROM visit_stats
          LEFT JOIN visits ON visits.url = visit_stats.url
        WHERE profileId = ? AND visit_stats.num_visits > 5
        GROUP BY visit_stats.url
        ORDER BY num_visits DESC, last_visit_ts DESC
        LIMIT ? OFFSET ?
    `, [profileId, limit, offset])
  } finally {
    release();
  }
}

async function search (q) {
  if (!q || typeof q !== 'string') {
    throw new BadParam('q', 'string')
  }

  var release = await lock('history-db');
  try {
    // prep search terms
    q = q
      .toLowerCase() // all lowercase. (uppercase is interpretted as a directive by sqlite.)
      .replace(/[:^*]/g, '') + // strip symbols that sqlite interprets.
      '*'; // allow partial matches

    // run query
    return await all(`
      SELECT offsets(visit_fts) as offsets, visit_fts.url, visit_fts.title, visit_stats.num_visits
        FROM visit_fts
        LEFT JOIN visit_stats ON visit_stats.url = visit_fts.url
        WHERE visit_fts MATCH ?
        ORDER BY visit_stats.num_visits DESC
        LIMIT 10;
    `, [q])
  } finally {
    release();
  }
}

async function removeVisit (url$$1) {
  // validate parameters
  if (!url$$1 || typeof url$$1 !== 'string') {
    throw new BadParam('url', 'string')
  }

  var release = await lock('history-db');
  try {
    serialize();
    run('BEGIN TRANSACTION;');
    run('DELETE FROM visits WHERE url = ?;', url$$1);
    run('DELETE FROM visit_stats WHERE url = ?;', url$$1);
    run('DELETE FROM visit_fts WHERE url = ?;', url$$1);
    await run('COMMIT;');
  } finally {
    parallelize();
    release();
  }
}

async function removeVisitsAfter (timestamp) {
  var release = await lock('history-db');
  try {
    serialize();
    run('BEGIN TRANSACTION;');
    run('DELETE FROM visits WHERE ts >= ?;', timestamp);
    run('DELETE FROM visit_stats WHERE last_visit_ts >= ?;', timestamp);
    await run('COMMIT;');
  } finally {
    parallelize();
    release();
  }
}

async function removeAllVisits () {
  var release = await lock('history-db');
  run('DELETE FROM visits;');
  run('DELETE FROM visit_stats;');
  run('DELETE FROM visit_fts;');
  release();
}

// exported api
// =

var historyAPI = {
  async addVisit (...args) {
    return addVisit(0, ...args)
  },

  async getVisitHistory (...args) {
    return getVisitHistory(0, ...args)
  },

  async getMostVisited (...args) {
    return getMostVisited(0, ...args)
  },

  async search (...args) {
    return search(...args)
  },

  async removeVisit (...args) {
    return removeVisit(...args)
  },

  async removeAllVisits (...args) {
    return removeAllVisits(...args)
  },

  async removeVisitsAfter (...args) {
    return removeVisitsAfter(...args)
  }
};

// exported methods
// =

function add$2 (profileId, appURL, profileURL) {
  return run(`
    INSERT OR REPLACE
      INTO keys (profileId, appURL, profileURL)
      VALUES (?, ?, ?)
  `, [profileId, appURL, profileURL])
}

function changeAppURL (profileId, appURL) {
  return run(`UPDATE keys SET appURL = ? WHERE profileId = ?`, [appURL, profileId])
}

function changeProfileURL (profileId, profileURL) {
  return run(`UPDATE keys SET profileURL = ? WHERE profileId = ?`, [profileURL, profileId])
}

function remove$2 (profileId) {
  return run(`DELETE FROM keys WHERE profileId = ?`, [profileId])
}

function get$4 (profileId) {
  return get$2(`SELECT appURL, profileURL FROM keys WHERE profileId = ?`, [profileId])
}

// exported api
// =

var keysAPI = {
  async add (...args) {
    console.log('lol. im here in web-apis/keys.js', args);
    return add$2(0, ...args)
  },

  async changeAppURL (...args) {
    return changeAppURL(0, ...args)
  },

  async changeProfileURL (...args) {
    return changeProfileURL(0, ...args)
  },

  async remove (...args) {
    return remove$2(0, ...args)
  },

  async get (...args) {
    return get$4(0, ...args)
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

function getWebContentsWindow (wc) {
  while (wc && wc.hostWebContents) {
    wc = wc.hostWebContents;
  }
  return electron.BrowserWindow.fromWebContents(wc)
}

// globals
// =
var db$2;
var migrations$2;
var setupPromise$2;

// exported methods
// =

function setup$9 () {
  // open database
  var dbPath = path__default.join(electron.app.getPath('userData'), 'SiteData');
  db$2 = new sqlite3.Database(dbPath);
  setupPromise$2 = setupSqliteDB(db$2, migrations$2, '[SITEDATA]');

  // wire up RPC
  rpc.exportAPI('beakerSitedata', manifest$1, { get: get$5, set: set$1, getPermissions, getPermission, setPermission }, internalOnly);
}

async function set$1 (url$$1, key, value) {
  await setupPromise$2;
  var origin = await extractOrigin$1(url$$1);
  if (!origin) return null
  return cbPromise(cb => {
    db$2.run(`
      INSERT OR REPLACE
        INTO sitedata (origin, key, value)
        VALUES (?, ?, ?)
    `, [origin, key, value], cb);
  })
}

async function get$5 (url$$1, key) {
  await setupPromise$2;
  var origin = await extractOrigin$1(url$$1);
  if (!origin) return null
  return cbPromise(cb => {
    db$2.get(`SELECT value FROM sitedata WHERE origin = ? AND key = ?`, [origin, key], (err, res) => {
      if (err) return cb(err)
      cb(null, res && res.value);
    });
  })
}

async function getPermissions (url$$1) {
  await setupPromise$2;
  var origin = await extractOrigin$1(url$$1);
  if (!origin) return null
  return cbPromise(cb => {
    db$2.all(`SELECT key, value FROM sitedata WHERE origin = ? AND key LIKE 'perm:%'`, [origin], (err, rows) => {
      if (err) return cb(err)

      // convert to a dictionary
      // TODO - pull defaults from browser settings
      var perms = { /* js: true */ };
      if (rows) rows.forEach(row => { perms[row.key.slice('5')] = row.value; });
      cb(null, perms);
    });
  })
}



function getPermission (url$$1, key) {
  return get$5(url$$1, 'perm:' + key)
}

function setPermission (url$$1, key, value) {
  value = !!value;
  return set$1(url$$1, 'perm:' + key, value)
}



// internal methods
// =

async function extractOrigin$1 (originURL) {
  var urlp = url__default.parse(originURL);
  if (!urlp || !urlp.host || !urlp.protocol) return
  if (urlp.protocol === 'dat:') {
    urlp.host = await datDns.resolveName(urlp.host);
  }
  return (urlp.protocol + urlp.host)
}

migrations$2 = [
  // version 1
  // - includes favicons for default bookmarks
  function (cb) {
    db$2.exec(`
      CREATE TABLE sitedata(
        origin NOT NULL,
        key NOT NULL,
        value
      );
      CREATE UNIQUE INDEX sitedata_origin_key ON sitedata (origin, key);
      INSERT OR REPLACE INTO "sitedata" VALUES('https:duckduckgo.com','favicon','data:image/png;base64,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');
      INSERT OR REPLACE INTO "sitedata" VALUES('https:beakerbrowser.com','favicon','data:image/png;base64,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');
      INSERT OR REPLACE INTO "sitedata" VALUES('https:groups.google.com','favicon','data:image/png;base64,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');
      PRAGMA user_version = 1;
    `, cb);
  },
  // version 2
  // - more favicons for default bookmarks
  function (cb) {
    db$2.exec(`
      INSERT OR REPLACE INTO "sitedata" VALUES('dat:1f968afe867f06b0d344c11efc23591c7f8c5fb3b4ac938d6000f330f6ee2a03','favicon','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAB+0lEQVQ4T2NkoBAw4tDPOnPrkZfK0uKCTIwMDL9+/2E4de1uU12cTz26elwGsOT3zetvy47PufH0E8Onz28YHPVVpRkYGJ4RawBDxcxVXbUJwaUgAz5/ecPgoKfKw8DA8JWOBsxY1VWbSIELulbsWJEd6Bp+4+lHhp8/PzHMW7Nea05t4XWivFA+abG+j5PdBV1FKYZ7rz4zCPNwMGw9dmpTlr9DAAMDw39kQ7DFAuPMrUf2BtmaOv79+4/h+ccfDP//MzAw/vvOsHLPIfeO9IhdeA2omb02JMDBerWytBDDxy+/GD58+83w7/9/Bn4uNoaTV65fj3I21WFgYPgHMwTdBczL9p2972igIyvIw8rw8t1vhl9//oMN+P33HwMv51+G2Zt2ZbWkhkzHakDTos1l3rYmnWe/XmNQFhBniN/ZzsAIgowMDH///2PI1Q5lMGBRf7Niy07VBQ2FH0CGwF2QUd8t5uvld28vyxFuPzkbhtc/3jL0XFvBwMbMArYMFHK//v5h6NHJYjh28N7EiiivAhQD6udvaE3x8ai6++8xgziHAMOb328Zbn19wMAEygxQa/4x/mcw59BlePf8xz87HWVOkJlwF4TlVrgIi0vHMPz/jxQu6EH0HxJ6//++mllXWMvAwPADWQXIrWzI3sKT0/8yMDD8BBkFAKGg0xFAPKtMAAAAAElFTkSuQmCC');
      PRAGMA user_version = 2;
    `, cb);
  },
  // version 3
  // - more favicons for default bookmarks
  function (cb) {
    db$2.exec(`
      INSERT OR REPLACE INTO "sitedata" VALUES('https:hashbase.io','favicon','data:image/png;base64,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');
      INSERT OR REPLACE INTO "sitedata" VALUES('https:twitter.com','favicon','data:image/png;base64,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');
      INSERT OR REPLACE INTO "sitedata" VALUES('https:github.com','favicon','data:image/png;base64,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');
      PRAGMA user_version = 3;
    `, cb);
  }
];

/* globals beaker */

// front-end only:
var yo;
if (typeof document !== 'undefined') {
  yo = require('yo-yo');
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
  var el = yo`<span>${prettyHash(archiveKey)}</span>`;
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
      return yo`<span>${firstWord} files to <a onclick=${viewArchive}>${title}</a></span>`
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
      return yo`<span>${firstWord} the archive <a onclick=${viewArchive}>${title}</a></span>`
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

function getPermId (permissionToken) {
  return permissionToken.split(':')[0]
}





function pluralize (num, base, suffix = 's') {
  if (num === 1) { return base }
  return base + suffix
}





function makeSafe (str) {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;').replace(/"/g, '')
}

var debug$4 = require('debug')('beaker');
// globals
// =

var idCounter = 0;
var activeRequests = [];

// exported api
// =

function setup$8 () {
  // wire up handlers
  electron.session.defaultSession.setPermissionRequestHandler(onPermissionRequestHandler);
  electron.ipcMain.on('permission-response', onPermissionResponseHandler);
}

function requestPermission (permission, webContents$$1, opts) {
  return new Promise((resolve, reject) => onPermissionRequestHandler(webContents$$1, permission, resolve, opts))
}

function grantPermission (permission, webContents$$1) {
  var siteURL = (typeof webContents$$1 === 'string') ? webContents$$1 : webContents$$1.getURL();

  // update the DB
  const PERM = PERMS[getPermId(permission)];
  if (PERM && PERM.persist) {
    setPermission(siteURL, permission, 1);
  }
  return Promise.resolve()
}



function queryPermission (permission, webContents$$1) {
  return getPermission(webContents$$1.getURL(), permission)
}

function denyAllRequests (win) {
  // remove all requests in the window, denying as we go
  activeRequests = activeRequests.filter(req => {
    if (req.win === win) {
      debug$4('Denying outstanding permission-request for closing window, req #' + req.id + ' for ' + req.permission);
      req.cb(false);
      return false
    }
    return true
  });
}

// event handlers
// =

function onPermissionRequestHandler (webContents$$1, permission, cb, opts) {
  // look up the containing window
  var win = getContainingWindow(webContents$$1);
  if (!win) {
    console.error('Warning: failed to find containing window of permission request, ' + permission);
    return cb(false)
  }
  const url$$1 = webContents$$1.getURL();

  // check if the perm is auto-allowed or auto-disallowed
  const PERM = PERMS[getPermId(permission)];
  if (PERM && PERM.alwaysAllow) return cb(true)
  if (PERM && PERM.alwaysDisallow) return cb(false)

  // check the sitedatadb
  getPermission(url$$1, permission).catch(err => false).then(res => {
    if (res === 1) {
      return cb(true)
    }

    // if we're already tracking this kind of permission request, then bundle them
    var req = activeRequests.find(req => req.win === win && req.permission === permission);
    if (req) {
      var oldCb = req.cb;
      req.cb = decision => { oldCb(decision); cb(decision); };
    } else {
      // track the new cb
      req = { id: ++idCounter, win, url: url$$1, permission, cb };
      activeRequests.push(req);
    }

    // send message to create the UI
    win.webContents.send('command', 'perms:prompt', req.id, webContents$$1.id, permission, opts);
  });
}

function onPermissionResponseHandler (e, reqId, decision) {
  // lookup the cb
  var req = activeRequests.find(req => req.id == reqId);
  if (!req) { return console.error('Warning: failed to find permission request for response #' + reqId) }

  // untrack
  activeRequests.splice(activeRequests.indexOf(req), 1);

  // hand down the decision
  var cb = req.cb;
  cb(decision);

  // persist approvals
  const PERM = PERMS[getPermId(req.permission)];
  if (decision && PERM && PERM.persist) {
    setPermission(req.url, req.permission, 1);
  }
}

function getContainingWindow (webContents$$1) {
  return electron.BrowserWindow.fromWebContents(webContents$$1.hostWebContents)
}

// exported api
// =

const to$1 = (opts) =>
  (opts && typeof opts.timeout !== 'undefined')
    ? opts.timeout
    : DEFAULT_DAT_API_TIMEOUT;

var datArchiveAPI = {
  async createArchive ({title, description} = {}) {
    // initiate the modal
    var win = getWebContentsWindow(this.sender);
    // DISABLED
    // this mechanism is a bit too temperamental
    // are we sure it's the best policy anyway?
    // -prf
    // await assertSenderIsFocused(this.sender)

    // run the creation modal
    var res = await showModal(win, 'create-archive', {title, description});
    if (!res || !res.url) throw new beakerErrorConstants.UserDeniedError()

    // grant write permissions to the creating app
    var newArchiveKey = await lookupUrlDatKey(res.url);
    grantPermission('modifyDat:' + newArchiveKey, this.sender.getURL());
    return res.url
  },

  async forkArchive (url$$1, {title, description} = {}) {
    // initiate the modal
    var win = getWebContentsWindow(this.sender);
    // DISABLED
    // this mechanism is a bit too temperamental
    // are we sure it's the best policy anyway?
    // -prf
    // await assertSenderIsFocused(this.sender)

    // run the fork modal
    var key1 = await lookupUrlDatKey(url$$1);
    var key2 = await lookupUrlDatKey(this.sender.getURL());
    var isSelfFork = key1 === key2;
    var res = await showModal(win, 'fork-archive', {url: url$$1, title, description, isSelfFork});
    if (!res || !res.url) throw new beakerErrorConstants.UserDeniedError()

    // grant write permissions to the creating app
    var newArchiveKey = await lookupUrlDatKey(res.url);
    grantPermission('modifyDat:' + newArchiveKey, this.sender.getURL());
    return res.url
  },

  async loadArchive (url$$1) {
    if (!url$$1 || typeof url$$1 !== 'string') {
      return Promise.reject(new beakerErrorConstants.InvalidURLError())
    }
    url$$1 = await datDns.resolveName(url$$1);
    await getOrLoadArchive(url$$1);
    return Promise.resolve(true)
  },

  async getInfo (url$$1, opts = {}) {
    return timer(to$1(opts), async () => {
      var info = await getArchiveInfo(url$$1);
      if (this.sender.getURL().startsWith('beaker:')) {
        return info
      }
      // return a subset of the data
      return {
        key: info.key,
        url: info.url,
        isOwner: info.isOwner,

        // state
        version: info.version,
        peers: info.peers,
        mtime: info.mtime,
        metaSize: info.metaSize,
        stagingSize: info.stagingSize,

        // manifest
        title: info.title,
        description: info.description
      }
    })
  },

  async diff (url$$1, opts = {}) {
    var {archive, version} = await lookupArchive(url$$1, opts);
    if (version) return [] // TODO
    if (!archive.staging) return []
    return pda__default.diff(archive.staging, {shallow: opts.shallow})
  },

  async commit (url$$1, opts = {}) {
    var {archive, version} = await lookupArchive(url$$1, opts);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    if (!archive.staging) return []
    await assertWritePermission(archive, this.sender);
    var res = await pda__default.commit(archive.staging);
    await updateSizeTracking(archive);
    return res
  },

  async revert (url$$1, opts = {}) {
    var {archive, version} = await lookupArchive(url$$1, opts);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    if (!archive.staging) return []
    await assertWritePermission(archive, this.sender);
    var res = await pda__default.revert(archive.staging);
    await updateSizeTracking(archive);
    return res
  },

  async history (url$$1, opts = {}) {
    var reverse = opts.reverse === true;
    var {start, end} = opts;
    var {archive, version} = await lookupArchive(url$$1, opts);

    // if reversing the output, modify start/end
    start = start || 0;
    end = end || archive.metadata.length;
    if (reverse) {
      // swap values
      let t = start;
      start = end;
      end = t;
      // start from the end
      start = archive.metadata.length - start;
      end = archive.metadata.length - end;
    }

    return new Promise((resolve, reject) => {
      // .stagingFS doesnt provide history()
      // and .checkoutFS falls back to .stagingFS
      // so we need to manually select checkoutFS or archive
      var ctx = ((version) ? archive.checkoutFS : archive);
      var stream = ctx.history({live: false, start, end});
      stream.pipe(concat({encoding: 'object'}, values => {
        values = values.map(massageHistoryObj);
        if (reverse) values.reverse();
        resolve(values);
      }));
      stream.on('error', reject);
    })
  },

  async stat (url$$1, opts = {}) {
    var {archive, filepath} = await lookupArchive(url$$1, opts);
    return pda__default.stat(archive.checkoutFS, filepath)
  },

  async readFile (url$$1, opts = {}) {
    var {archive, filepath} = await lookupArchive(url$$1, opts);
    return pda__default.readFile(archive.checkoutFS, filepath, opts)
  },

  async writeFile (url$$1, data, opts = {}) {
    var {archive, filepath, version} = await lookupArchive(url$$1, opts);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    var senderOrigin = extractOrigin(this.sender.getURL());
    await assertWritePermission(archive, this.sender);
    await assertQuotaPermission(archive, senderOrigin, Buffer.byteLength(data, opts.encoding));
    await assertValidFilePath(filepath);
    await assertUnprotectedFilePath(filepath, this.sender);
    return pda__default.writeFile(archive.stagingFS, filepath, data, opts)
  },

  async unlink (url$$1) {
    var {archive, filepath, version} = await lookupArchive(url$$1);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    await assertWritePermission(archive, this.sender);
    await assertUnprotectedFilePath(filepath, this.sender);
    return pda__default.unlink(archive.stagingFS, filepath)
  },

  // TODO copy-disabled
  /* async copy(url, dstPath) {
    return timer(to(), async (checkin) => {
      checkin('searching for archive')
      var {archive, filepath} = await lookupArchive(url)
      if (checkin('copying file')) return
      var senderOrigin = archivesDb.extractOrigin(this.sender.getURL())
      await assertWritePermission(archive, this.sender)
      await assertUnprotectedFilePath(dstPath, this.sender)
      return pda.copy(archive.stagingFS, filepath, dstPath)
    })
  }, */

  // TODO rename-disabled
  /* async rename(url, dstPath) {
    return timer(to(), async (checkin) => {
      checkin('searching for archive')
      var {archive, filepath} = await lookupArchive(url)
      if (checkin('renaming file')) return
      var senderOrigin = archivesDb.extractOrigin(this.sender.getURL())
      await assertWritePermission(archive, this.sender)
      await assertUnprotectedFilePath(filepath, this.sender)
      await assertUnprotectedFilePath(dstPath, this.sender)
      return pda.rename(archive.stagingFS, filepath, dstPath)
    })
  }, */

  async download (url$$1, opts = {}) {
    return timer(to$1(opts), async (checkin) => {
      var {archive, filepath, version} = await lookupArchive(url$$1, false);
      if (version) throw new Error('Not yet supported: can\'t download() old versions yet. Sorry!') // TODO
      if (archive.writable) {
        return // no need to download
      }
      return pda__default.download(archive, filepath)
    })
  },

  async readdir (url$$1, opts = {}) {
    var {archive, filepath} = await lookupArchive(url$$1, opts);
    var names = await pda__default.readdir(archive.checkoutFS, filepath, opts);
    if (opts.stat) {
      for (let i = 0; i < names.length; i++) {
        names[i] = {
          name: names[i],
          stat: await pda__default.stat(archive.checkoutFS, path__default.join(filepath, names[i]))
        };
      }
    }
    return names
  },

  async mkdir (url$$1) {
    var {archive, filepath, version} = await lookupArchive(url$$1);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    await assertWritePermission(archive, this.sender);
    await assertValidPath(filepath);
    await assertUnprotectedFilePath(filepath, this.sender);
    return pda__default.mkdir(archive.stagingFS, filepath)
  },

  async rmdir (url$$1, opts = {}) {
    var {archive, filepath, version} = await lookupArchive(url$$1, opts);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    await assertWritePermission(archive, this.sender);
    await assertUnprotectedFilePath(filepath, this.sender);
    return pda__default.rmdir(archive.stagingFS, filepath, opts)
  },

  async createFileActivityStream (url$$1, pathPattern) {
    var {archive} = await lookupArchive(url$$1);
    if (archive.staging) {
      return pda__default.createFileActivityStream(archive, archive.stagingFS, pathPattern)
    } else {
      return pda__default.createFileActivityStream(archive, pathPattern)
    }
  },

  async createNetworkActivityStream (url$$1) {
    var {archive} = await lookupArchive(url$$1);
    return pda__default.createNetworkActivityStream(archive)
  },

  async importFromFilesystem (opts) {
    assertTmpBeakerOnly(this.sender);
    var {archive, filepath, version} = await lookupArchive(opts.dst, opts);
    if (version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    return pda__default.exportFilesystemToArchive({
      srcPath: opts.src,
      dstArchive: archive.stagingFS,
      dstPath: filepath,
      ignore: opts.ignore,
      dryRun: opts.dryRun,
      inplaceImport: opts.inplaceImport !== false
    })
  },

  async exportToFilesystem (opts) {
    assertTmpBeakerOnly(this.sender);

    // check if there are files in the destination path
    var dst = opts.dst;
    try {
      var files = await jetpack.listAsync(dst);
      if (files && files.length > 0) {
        // ask the user if they're sure
        var res = await new Promise(resolve => {
          electron.dialog.showMessageBox({
            type: 'question',
            message: 'This folder is not empty. Some files may be overwritten. Continue export?',
            buttons: ['Yes', 'No, cancel']
          }, resolve);
        });
        if (res != 0) {
          return false
        }
      }
    } catch (e) {
      // no files
    }

    var {archive, filepath} = await lookupArchive(opts.src, opts);
    return pda__default.exportArchiveToFilesystem({
      srcArchive: archive.checkoutFS,
      srcPath: filepath,
      dstPath: opts.dst,
      ignore: opts.ignore,
      overwriteExisting: opts.overwriteExisting,
      skipUndownloadedFiles: opts.skipUndownloadedFiles !== false
    })
  },

  async exportToArchive (opts) {
    assertTmpBeakerOnly(this.sender);
    var src = await lookupArchive(opts.src, opts);
    var dst = await lookupArchive(opts.dst, opts);
    if (dst.version) throw new beakerErrorConstants.ArchiveNotWritableError('Cannot modify a historic version')
    return pda__default.exportArchiveToArchive({
      srcArchive: src.archive.checkoutFS,
      srcPath: src.filepath,
      dstArchive: dst.archive.stagingFS,
      dstPath: dst.filepath,
      ignore: opts.ignore,
      skipUndownloadedFiles: opts.skipUndownloadedFiles !== false
    })
  },

  async resolveName (name) {
    return datDns.resolveName(name)
  },

  async selectArchive ({title, buttonLabel, filters} = {}) {
    // initiate the modal
    var win = getWebContentsWindow(this.sender);
    // DISABLED
    // this mechanism is a bit too temperamental
    // are we sure it's the best policy anyway?
    // -prf
    // await assertSenderIsFocused(this.sender)
    var res = await showModal(win, 'select-archive', {title, buttonLabel, filters});
    if (!res || !res.url) throw new beakerErrorConstants.UserDeniedError()
    return res.url
  }
};

// internal helpers
// =

// helper to check if filepath refers to a file that userland is not allowed to edit directly
function assertUnprotectedFilePath (filepath, sender) {
  if (sender.getURL().startsWith('beaker:')) {
    return // can write any file
  }
  if (filepath === '/' + DAT_MANIFEST_FILENAME) {
    throw new beakerErrorConstants.ProtectedFileNotWritableError()
  }
}

// temporary helper to make sure the call is made by a beaker: page
function assertTmpBeakerOnly (sender) {
  if (!sender.getURL().startsWith('beaker:')) {
    throw new beakerErrorConstants.PermissionsError()
  }
}

async function assertWritePermission (archive, sender) {
  var archiveKey = archive.key.toString('hex');
  const perm = ('modifyDat:' + archiveKey);

  // ensure we have the archive's private key
  if (!archive.writable) {
    throw new beakerErrorConstants.ArchiveNotWritableError()
  }

  // beaker: always allowed
  if (sender.getURL().startsWith('beaker:')) {
    return true
  }

  // self-modification ALWAYS allowed
  var senderDatKey = await lookupUrlDatKey(sender.getURL());
  if (senderDatKey === archiveKey) {
    return true
  }

  // ensure the sender is allowed to write
  var allowed = await queryPermission(perm, sender);
  if (allowed) return true

  // ask the user
  var details = await getArchiveInfo(archiveKey);
  allowed = await requestPermission(perm, sender, { title: details.title });
  if (!allowed) throw new beakerErrorConstants.UserDeniedError()
  return true
}

async function assertQuotaPermission (archive, senderOrigin, byteLength) {
  // beaker: always allowed
  if (senderOrigin.startsWith('beaker:')) {
    return
  }

  // fetch the archive settings
  const userSettings = await getUserSettings(0, archive.key);

  // fallback to default quota
  var bytesAllowed = userSettings.bytesAllowed || DAT_QUOTA_DEFAULT_BYTES_ALLOWED;

  // check the new size
  var newSize = (archive.metaSize + archive.stagingSize + byteLength);
  if (newSize > bytesAllowed) {
    throw new beakerErrorConstants.QuotaExceededError()
  }
}

async function assertValidFilePath (filepath) {
  if (filepath.slice(-1) === '/') {
    throw new beakerErrorConstants.InvalidPathError('Files can not have a trailing slash')
  }
  await assertValidPath(filepath);
}

async function assertValidPath (fileOrFolderPath) {
  if (!DAT_VALID_PATH_REGEX.test(fileOrFolderPath)) {
    throw new beakerErrorConstants.InvalidPathError('Path contains invalid characters')
  }
}

// async function assertSenderIsFocused (sender) {
//   if (!sender.isFocused()) {
//     throw new UserDeniedError('Application must be focused to spawn a prompt')
//   }
// }

async function parseUrlParts (url$$1) {
  var archiveKey, filepath, version;
  if (DAT_HASH_REGEX.test(url$$1)) {
    // simple case: given the key
    archiveKey = url$$1;
    filepath = '/';
  } else {
    var urlp = parseDatURL(url$$1);

    // validate
    if (urlp.protocol !== 'dat:') {
      throw new beakerErrorConstants.InvalidURLError('URL must be a dat: scheme')
    }
    if (!DAT_HASH_REGEX.test(urlp.host)) {
      urlp.host = await datDns.resolveName(url$$1);
    }

    archiveKey = urlp.host;
    filepath = decodeURIComponent(urlp.pathname || '');
    version = urlp.version;
  }
  return {archiveKey, filepath, version}
}

// helper to handle the URL argument that's given to most args
// - can get a dat hash, or dat url
// - returns {archive, filepath, version}
// - sets archive.checkoutFS to what's requested by version
// - throws if the filepath is invalid
async function lookupArchive (url$$1, opts = {}) {
  async function lookupArchiveInner (checkin) {
    checkin('searching for archive');

    // lookup the archive
    var {archiveKey, filepath, version} = await parseUrlParts(url$$1);
    var archive = getArchive(archiveKey);
    if (!archive) archive = await loadArchive(archiveKey);

    // set checkoutFS according to the version requested
    if (version) {
      checkin('checking out a previous version from history');
      archive.checkoutFS = archive.checkout(+version);
    } else {
      archive.checkoutFS = archive.stagingFS;
    }

    return {archive, filepath, version}
  }
  if (opts === false) {
    // dont use timeout
    return lookupArchiveInner(noop)
  } else {
    // use timeout
    return timer(to$1(opts), lookupArchiveInner)
  }
}

async function lookupUrlDatKey (url$$1) {
  if (url$$1.startsWith('dat://') === false) {
    return false // not a dat site
  }

  var urlp = parseDatURL(url$$1);
  try {
    return await datDns.resolveName(urlp.hostname)
  } catch (e) {
    return false
  }
}

function massageHistoryObj ({name, version, type}) {
  return {path: name, version, type}
}

function noop () {}

// internal manifests
// internal apis
// external manifests
// external apis
// exported api
// =

function setup$3 () {
  // internal apis
  rpc.exportAPI('profiles', profilesManifest, profilesAPI, internalOnly);
  rpc.exportAPI('archives', archivesManifest, archivesAPI, internalOnly);
  rpc.exportAPI('bookmarks', bookmarksManifest, bookmarksAPI, internalOnly);
  rpc.exportAPI('history', historyManifest, historyAPI, internalOnly);
  rpc.exportAPI('keys', keysManifest, keysAPI, internalOnly);

  // external apis
  rpc.exportAPI('dat-archive', datArchiveManifest, datArchiveAPI, secureOnly);

  // register a message-handler for setting up the client
  // - see lib/fg/import-web-apis.js
  // TODO replace this with manual exports
  electron.ipcMain.on('get-web-api-manifests', (event, scheme) => {
    var protos;

    // hardcode the beaker: scheme, since that's purely for internal use
    if (scheme === 'beaker:') {
      protos = {
        beakerBrowser,
        beakerDownloads: manifest,
        beakerSitedata: manifest$1
      };
      event.returnValue = protos;
      return
    }

    event.returnValue = {};
  });
}

// globals
// =

// downloads list
// - shared across all windows
var downloads = [];

// used for rpc
var downloadsEvents = new EventEmitter();

// exported api
// =

function setup$11 () {
  // wire up RPC
  rpc.exportAPI('beakerDownloads', manifest, { eventsStream: eventsStream$1, getDownloads, pause, resume, cancel, remove: remove$3, open: open$1, showInFolder }, internalOnly);
}

function registerListener (win, opts = {}) {
  const listener = (e, item, webContents$$1) => {
    // dont touch if already being handled
    // - if `opts.saveAs` is being used, there may be multiple active event handlers
    if (item.isHandled) { return }

    // build a path to an unused name in the downloads folder
    const filePath = opts.saveAs ? opts.saveAs : unusedFilename.sync(path__default.join(electron.app.getPath('downloads'), item.getFilename()));

    // track as an active download
    item.id = ('' + Date.now()) + ('' + Math.random()); // pretty sure this is collision proof but replace if not -prf
    item.name = path__default.basename(filePath);
    item.setSavePath(filePath);
    item.isHandled = true;
    item.downloadSpeed = speedometer();
    downloads.push(item);
    downloadsEvents.emit('new-download', toJSON(item));

    // TODO: use mime type checking for file extension when no extension can be inferred
    // item.getMimeType()

    // update dock-icon progress bar
    var lastBytes = 0;
    item.on('updated', () => {
      var sumProgress = {
        receivedBytes: getSumReceivedBytes(),
        totalBytes: getSumTotalBytes()
      };

      // track rate of download
      item.downloadSpeed(item.getReceivedBytes() - lastBytes);
      lastBytes = item.getReceivedBytes();

      // emit
      downloadsEvents.emit('updated', toJSON(item));
      downloadsEvents.emit('sum-progress', sumProgress);
      win.setProgressBar(sumProgress.receivedBytes / sumProgress.totalBytes);
    });

    item.on('done', (e, state) => {
      downloadsEvents.emit('done', toJSON(item));

      // replace entry with a clone that captures the final state
      downloads.splice(downloads.indexOf(item), 1, capture(item));

      // reset progress bar when done
      if (isNoActiveDownloads() && !win.isDestroyed()) {
        win.setProgressBar(-1);
      }

      // inform users of error conditions
      if (state === 'interrupted') {
        electron.dialog.showErrorBox('Download error', `The download of ${item.getFilename()} was interrupted`);
      }

      if (state === 'completed') {
        // flash the dock on osx
        if (process.platform === 'darwin') {
          electron.app.dock.downloadFinished(filePath);
        }

        // optional, for one-time downloads
        if (opts.unregisterWhenDone) {
          webContents$$1.session.removeListener('will-download', listener);
        }
      }
    });
  };

  win.webContents.session.prependListener('will-download', listener);
  win.on('close', () => win.webContents.session.removeListener('will-download', listener));
}

function download (win, url$$1, opts) {
  // register for onetime use of the download system
  opts = Object.assign({}, opts, {unregisterWhenDone: true});
  registerListener(win, opts);
  win.webContents.downloadURL(url$$1);
}

// rpc api
// =

function eventsStream$1 () {
  return emitStream(downloadsEvents)
}

function getDownloads () {
  return Promise.resolve(downloads.map(toJSON))
}

function pause (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.pause(); }
  return Promise.resolve()
}

function resume (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.resume(); }
  return Promise.resolve()
}

function cancel (id) {
  var download = downloads.find(d => d.id == id);
  if (download) { download.cancel(); }
  return Promise.resolve()
}

function remove$3 (id) {
  var download = downloads.find(d => d.id == id);
  if (download && download.getState() != 'progressing') { downloads.splice(downloads.indexOf(download), 1); }
  return Promise.resolve()
}

function open$1 (id) {
  return new Promise((resolve, reject) => {
    // find the download
    var download = downloads.find(d => d.id == id);
    if (!download || download.state != 'completed') { return reject() }

    // make sure the file is still there
    fs.stat(download.getSavePath(), err => {
      if (err) { return reject() }

      // open
      electron.shell.openItem(download.getSavePath());
      resolve();
    });
  })
}

function showInFolder (id) {
  return new Promise((resolve, reject) => {
    // find the download
    var download = downloads.find(d => d.id == id);
    if (!download || download.state != 'completed') { return reject() }

    // make sure the file is still there
    fs.stat(download.getSavePath(), err => {
      if (err) { return reject() }

      // open
      electron.shell.showItemInFolder(download.getSavePath());
      resolve();
    });
  })
}

// internal helpers
// =

// reduce down to attributes
function toJSON (item) {
  return {
    id: item.id,
    name: item.name,
    url: item.getURL(),
    state: item.getState(),
    isPaused: item.isPaused(),
    receivedBytes: item.getReceivedBytes(),
    totalBytes: item.getTotalBytes(),
    downloadSpeed: item.downloadSpeed()
  }
}

// create a capture of the final state of an item
function capture (item) {
  var savePath = item.getSavePath();
  var dlspeed = item.download;
  item = toJSON(item);
  item.getURL = () => item.url;
  item.getState = () => item.state;
  item.isPaused = () => false;
  item.getReceivedBytes = () => item.receivedBytes;
  item.getTotalBytes = () => item.totalBytes;
  item.getSavePath = () => savePath;
  item.downloadSpeed = () => dlspeed;
  return item
}

// sum of received bytes
function getSumReceivedBytes () {
  return getActiveDownloads().reduce((acc, item) => acc + item.getReceivedBytes(), 0)
}

// sum of total bytes
function getSumTotalBytes () {
  return getActiveDownloads().reduce((acc, item) => acc + item.getTotalBytes(), 0)
}

function getActiveDownloads () {
  return downloads.filter(d => d.getState() == 'progressing')
}

// all downloads done?
function isNoActiveDownloads () {
  return getActiveDownloads().length === 0
}

var debug$5 = require('debug')('beaker');

// globals
// =
var userDataDir;
var stateStoreFile = 'shell-window-state.json';
var numActiveWindows = 0;

// exported methods
// =

function setup$10 () {
  // config
  userDataDir = jetpack.cwd(electron.app.getPath('userData'));

  // load pinned tabs
  electron.ipcMain.on('shell-window-ready', e => {
    // if this is the first window opened (since app start or since all windows closing)
    if (numActiveWindows === 1) {
      e.sender.webContents.send('command', 'load-pinned-tabs');
    }
  });

  // create first shell window
  return createShellWindow()
}

function createShellWindow () {
  // create window
  var { x, y, width, height } = ensureVisibleOnSomeDisplay(restoreState());
  var win = new electron.BrowserWindow({
    titleBarStyle: 'hidden-inset',
    fullscreenable: false,
    x,
    y,
    width,
    height,
    vibrancy: 'light',
    defaultEncoding: 'UTF-8',
    webPreferences: {
      webSecurity: false, // disable same-origin-policy in the shell window, webviews have it restored
      allowRunningInsecureContent: true,
      nativeWindowOpen: true
    },
    icon: path__default.join(__dirname, (process.platform === 'win32') ? './assets/img/logo.ico' : './assets/img/logo.png')
  });
  registerListener(win);
  loadShell(win);
  numActiveWindows++;

  // register shortcuts
  for (var i = 1; i <= 9; i++) { electronLocalshortcut.register(win, 'CmdOrCtrl+' + i, onTabSelect(win, i - 1)); }
  electronLocalshortcut.register(win, 'Ctrl+Tab', onNextTab(win));
  electronLocalshortcut.register(win, 'Ctrl+Shift+Tab', onPrevTab(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+[', onGoBack(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+]', onGoForward(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+N', onNewWindow(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+Q', onQuit(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+T', onNewTab(win));
  electronLocalshortcut.register(win, 'CmdOrCtrl+W', onCloseTab(win));

  // register event handlers
  win.on('scroll-touch-begin', sendScrollTouchBegin);
  win.on('scroll-touch-end', sendToWebContents('scroll-touch-end'));
  win.on('focus', sendToWebContents('focus'));
  win.on('blur', sendToWebContents('blur'));
  win.on('enter-full-screen', sendToWebContents('enter-full-screen'));
  win.on('leave-full-screen', sendToWebContents('leave-full-screen'));
  win.on('close', onClose(win));

  // TCW CHANGES -- this listens for a synchronous message from the icp
  // in the shell-window/ui/pages.js in the "create" function and returns
  // 'pong'

  electron.ipcMain.on('synchronous-message', (event, arg) => {
    console.log(arg); // prints "ping"
    event.returnValue = 'pong';
  });

  // this listens for an asynchronous message from the icp
  // in the shell-window/ui/pages.js in the "create" function

  electron.ipcMain.on('asynchronous-message', (event, arg) => {
    console.log(arg); // prints "ping"
    event.sender.send('asynchronous-reply', 'pong');
  });

  electron.ipcMain.on('inject-gizmo', (event, gizmo) => {
    promptInjectGizmo(win, gizmo);
  });

  electron.ipcMain.on('inject-post', (event, post) => {
    promptInjectPost(win, post);
  });

  // this listens for the current webview url from
  // webview-preload/locationbar.js

  electron.ipcMain.on('get-webview-url', (event, url$$1) => {
    getActiveWindow().send('new-url', url$$1); // sends to shell-window/ui/navbar/browser-script.js
  });

  electron.ipcMain.on('keys-reset', event => {
    var win = getActiveWindow();
    console.log('keys reset in windows');
    win.webContents.send('keys-reset');
  });

  // end

  return win
}

function getActiveWindow () {
  // try to pull the focused window; if there isnt one, fallback to the last created
  var win = electron.BrowserWindow.getFocusedWindow();
  if (!win) {
    win = electron.BrowserWindow.getAllWindows().pop();
  }
  return win
}



function ensureOneWindowExists () {
  if (numActiveWindows === 0) {
    createShellWindow();
  }
}

// internal methods
// =

// TCW -- these send the prompts to inject either the subscript or widget
// into the currently focused webview

async function promptInjectGizmo (win, gizmo) {
  win = win || getActiveWindow();
  var id = await win.webContents.executeJavaScript(`
    (function () {
      var webview = document.querySelector('webview:not(.hidden)')
      return webview && webview.getWebContents().id
    })()
  `);
  return electron.webContents.fromId(id).send('inject-gizmo', gizmo)
}

async function promptInjectPost (win, post) {
  win = win || getActiveWindow();
  var id = await win.webContents.executeJavaScript(`
    (function () {
      var webview = document.querySelector('webview:not(.hidden)')
      return webview && webview.getWebContents().id
    })()
  `);
  return electron.webContents.fromId(id).send('inject-post', post)
}

// end

function loadShell (win) {
  win.loadURL('beaker://shell-window');
  debug$5('Opening beaker://shell-window');
}

function getCurrentPosition (win) {
  var position = win.getPosition();
  var size = win.getSize();
  return {
    x: position[0],
    y: position[1],
    width: size[0],
    height: size[1]
  }
}

function windowWithinBounds (windowState, bounds) {
  return windowState.x >= bounds.x &&
    windowState.y >= bounds.y &&
    windowState.x + windowState.width <= bounds.x + bounds.width &&
    windowState.y + windowState.height <= bounds.y + bounds.height
}

function restoreState () {
  var restoredState = {};
  try {
    restoredState = userDataDir.read(stateStoreFile, 'json');
  } catch (err) {
    // For some reason json can't be read (might be corrupted).
    // No worries, we have defaults.
  }
  return Object.assign({}, defaultState(), restoredState)
}

function defaultState () {
  var bounds = electron.screen.getPrimaryDisplay().bounds;
  var width = Math.max(800, Math.min(1800, bounds.width - 50));
  var height = Math.max(600, Math.min(1200, bounds.height - 50));
  return Object.assign({}, {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height
  })
}

function ensureVisibleOnSomeDisplay (windowState) {
  var visible = electron.screen.getAllDisplays().some(display => windowWithinBounds(windowState, display.bounds));
  if (!visible) {
    // Window is partially or fully not visible now.
    // Reset it to safe defaults.
    return defaultState(windowState)
  }
  return windowState
}

// shortcut event handlers
// =

function onClose (win) {
  return e => {
    numActiveWindows--;

    // deny any outstanding permission requests
    denyAllRequests(win);

    // unregister shortcuts
    electronLocalshortcut.unregisterAll(win);

    // save state
    // NOTE this is called by .on('close')
    // if quitting multiple windows at once, the final saved state is unpredictable
    if (!win.isMinimized() && !win.isMaximized()) {
      var state = getCurrentPosition(win);
      userDataDir.write(stateStoreFile, state, { atomic: true });
    }
  }
}

function onTabSelect (win, tabIndex) {
  return () => win.webContents.send('command', 'set-tab', tabIndex)
}

function onNextTab (win) {
  return () => win.webContents.send('command', 'window:next-tab')
}

function onPrevTab (win) {
  return () => win.webContents.send('command', 'window:prev-tab')
}

function onGoBack (win) {
  return () => win.webContents.send('command', 'history:back')
}

function onGoForward (win) {
  return () => win.webContents.send('command', 'history:forward')
}

function onNewWindow (win) {
  return () => createShellWindow()
}

function onQuit (win) {
  return () => electron.app.quit()
}

function onNewTab (win) {
  return () => win.webContents.send('command', 'file:new-tab')
}

function onCloseTab (win) {
  return () => win.webContents.send('command', 'file:close-tab')
}

// window event handlers
// =

function sendToWebContents (event) {
  return e => e.sender.webContents.send('window-event', event)
}

function sendScrollTouchBegin (e) {
  // get the cursor x/y within the window
  var cursorPos = electron.screen.getCursorScreenPoint();
  var winPos = e.sender.getBounds();
  cursorPos.x -= winPos.x; cursorPos.y -= winPos.y;
  e.sender.webContents.send('window-event', 'scroll-touch-begin', {
    cursorX: cursorPos.x,
    cursorY: cursorPos.y
  });
}

var darwinMenu = {
  label: 'Parallel',
  submenu: [
    {
      label: 'Preferences',
      click (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'beaker://settings');
      }
    },
    { type: 'separator' },
    { label: 'Services', role: 'services', submenu: [] },
    { type: 'separator' },
    { label: 'Hide Parallel', accelerator: 'Command+H', role: 'hide' },
    { label: 'Hide Others', accelerator: 'Command+Alt+H', role: 'hideothers' },
    { label: 'Show All', role: 'unhide' },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Command+Q', click () { electron.app.quit(); } }
  ]
};

var fileMenu = {
  label: 'File',
  submenu: [
    {
      label: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab');
      }
    },
    {
      label: 'New Window',
      accelerator: 'CmdOrCtrl+N',
      click: function () { createShellWindow(); }
    },
    {
      label: 'Reopen Closed Tab',
      accelerator: 'CmdOrCtrl+Shift+T',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:reopen-closed-tab');
      }
    },
    {
      label: 'Open File',
      accelerator: 'CmdOrCtrl+O',
      click: function (item, win) {
        if (win) {
          electron.dialog.showOpenDialog({ title: 'Open file...', properties: ['openFile', 'createDirectory'] }, files => {
            if (files && files[0]) { win.webContents.send('command', 'file:new-tab', 'file://' + files[0]); }
          });
        }
      }
    },
    {
      label: 'Open Location',
      accelerator: 'CmdOrCtrl+L',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:open-location');
      }
    },
    { type: 'separator' },
    {
      label: 'Close Window',
      accelerator: 'CmdOrCtrl+Shift+W',
      click: function (item, win) {
        if (win) win.close();
      }
    },
    {
      label: 'Close Tab',
      accelerator: 'CmdOrCtrl+W',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:close-tab');
      }
    }
  ]
};

var editMenu = {
  label: 'Edit',
  submenu: [
    { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
    { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
    { type: 'separator' },
    { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
    { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
    { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
    { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
    {
      label: 'Find in Page',
      accelerator: 'CmdOrCtrl+F',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'edit:find');
      }
    }
  ]
};

var viewMenu = {
  label: 'View',
  submenu: [{
    label: 'Reload',
    accelerator: 'CmdOrCtrl+R',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:reload');
    }
  },
  {
    label: 'Hard Reload (Clear Cache)',
    accelerator: 'CmdOrCtrl+Shift+R',
    click: function (item, win) {
      // HACK
      // this is *super* lazy but it works
      // clear all dat-dns cache on hard reload, to make sure the next
      // load is fresh
      // -prf
      datDns.flushCache();

      if (win) win.webContents.send('command', 'view:hard-reload');
    }
  },
  { type: 'separator' },
  {
    label: 'Zoom In',
    accelerator: 'CmdOrCtrl+Plus',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:zoom-in');
    }
  },
  {
    label: 'Zoom Out',
    accelerator: 'CmdOrCtrl+-',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:zoom-out');
    }
  },
  {
    label: 'Actual Size',
    accelerator: 'CmdOrCtrl+0',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:zoom-reset');
    }
  },
  { type: 'separator' },
  {
    label: 'Toggle DevTools',
    accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+I' : 'Shift+CmdOrCtrl+I',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:toggle-dev-tools');
    }
  },
  {
    label: 'Toggle Sidebar',
    accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+B' : 'Shift+CmdOrCtrl+B',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'view:toggle-sidebar');
    }
  }]
};

var showHistoryAccelerator = 'Ctrl+h';

if (process.platform === 'darwin') {
  showHistoryAccelerator = 'Cmd+y';
}

var historyMenu = {
  label: 'History',
  role: 'history',
  submenu: [
    {
      label: 'Back',
      accelerator: 'CmdOrCtrl+Left',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'history:back');
      }
    },
    {
      label: 'Forward',
      accelerator: 'CmdOrCtrl+Right',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'history:forward');
      }
    },
    {
      label: 'Show Full History',
      accelerator: showHistoryAccelerator,
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'beaker://history');
      }
    }
  ]
};

var windowMenu = {
  label: 'Window',
  role: 'window',
  submenu: [
    {
      label: 'Minimize',
      accelerator: 'CmdOrCtrl+M',
      role: 'minimize'
    },
    {
      label: 'Close',
      accelerator: 'CmdOrCtrl+W',
      role: 'close'
    },
    {
      label: 'Next Tab',
      accelerator: 'CmdOrCtrl+}',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'window:next-tab');
      }
    },
    {
      label: 'Previous Tab',
      accelerator: 'CmdOrCtrl+{',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'window:prev-tab');
      }
    }
  ]
};
if (process.platform == 'darwin') {
  windowMenu.submenu.push({
    type: 'separator'
  });
  windowMenu.submenu.push({
    label: 'Bring All to Front',
    role: 'front'
  });
}

var beakerDevMenu = {
  label: 'ParallelDev',
  submenu: [{
    label: 'Reload Shell-Window',
    click: function () {
      electron.BrowserWindow.getFocusedWindow().webContents.reloadIgnoringCache();
    }
  }, {
    label: 'Open Archives Debug Page',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'file:new-tab', 'beaker://internal-archives/');
    }
  }, {
    label: 'Open Dat-DNS Cache Page',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'file:new-tab', 'beaker://dat-dns-cache/');
    }
  }, {
    label: 'Toggle Shell-Window DevTools',
    click: function () {
      electron.BrowserWindow.getFocusedWindow().toggleDevTools();
    }
  }]
};

var helpMenu = {
  label: 'Help',
  role: 'help',
  submenu: [
    {
      label: 'Help',
      accelerator: 'F1',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'https://beakerbrowser.com/docs/');
      }
    },
    {
      label: 'Report Bug',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'https://github.com/beakerbrowser/beaker/issues');
      }
    },
    {
      label: 'Mailing List',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'https://groups.google.com/forum/#!forum/beaker-browser');
      }
    }
  ]
};

var keysMenu = {
  label: 'Keys',
  submenu: [
    {
      label: 'View Keys',
      click: function (item, win) {
        if (win) win.webContents.send('command', 'file:new-tab', 'beaker://keys');
      }
    }
  ]
};
if (process.platform !== 'darwin') {
  helpMenu.submenu.push({ type: 'separator' });
  helpMenu.submenu.push({
    label: 'About',
    role: 'about',
    click: function (item, win) {
      if (win) win.webContents.send('command', 'file:new-tab', 'beaker://settings');
    }
  });
}

function buildWindowMenu () {
  var menus = [fileMenu, editMenu, viewMenu, historyMenu, windowMenu, helpMenu];
  if (process.platform === 'darwin') menus.unshift(darwinMenu);
  menus.push(beakerDevMenu); // TODO: remove in release build?
  menus.push(keysMenu);
  return menus
}

function registerContextMenu () {
  // register the context menu on every created webContents
  electron.app.on('web-contents-created', (e, webContents$$1) => {
    webContents$$1.on('context-menu', async (e, props) => {
      var menuItems = [];
      const { mediaFlags, editFlags } = props;
      const hasText = props.selectionText.trim().length > 0;
      const can = type => editFlags[`can${type}`] && hasText;
      const isDat = props.pageURL.startsWith('dat://');

      // get the focused window, ignore if not available (not in focus)
      // - fromWebContents(webContents) doesnt seem to work, maybe because webContents is often a webview?
      var targetWindow = electron.BrowserWindow.getFocusedWindow();
      if (!targetWindow) { return }

      // ignore clicks on the shell window
      if (props.pageURL == 'beaker://shell-window/') { return }

      // helper to call code on the element under the cursor
      const callOnElement = js => webContents$$1.executeJavaScript(`
        var el = document.elementFromPoint(${props.x}, ${props.y})
        new Promise(resolve => { ${js} })
      `);

      // fetch custom menu information
      try {
        var customMenu = await callOnElement(`
          if (!el) {
            return resolve(null)
          }

          // check for a context menu setting
          var contextMenuId
          while (el && el.getAttribute) {
            contextMenuId = el.getAttribute('contextmenu')
            if (contextMenuId) break
            el = el.parentNode
          }
          if (!contextMenuId) {
            return resolve(null)
          }

          // lookup the context menu el
          var contextMenuEl = document.querySelector('menu#' + contextMenuId)
          if (!contextMenuEl) {
            return resolve(null)
          }

          // extract the menu items that are commands
          var menuItemEls = contextMenuEl.querySelectorAll('menuitem, hr')
          resolve(Array.from(menuItemEls)
            .filter(el => {
              if (el.tagName === 'HR') return true
              var type = el.getAttribute('type')
              return !type || type.toLowerCase() === 'command'
            })
            .map(el => {
              if (el.tagName === 'HR') return { type: 'separator' }
              return {
                menuId: contextMenuId,
                type: 'command',
                disabled: el.getAttribute('disabled'),
                label: el.getAttribute('label')
              }
            })
          )
        `);
      } catch (e) {
        console.error('Error checking for a custom context menu', e);
      }
      if (customMenu && customMenu.length) {
        // add to the menu, with a 10 item limit
        customMenu.slice(0, 10).forEach(customItem => {
          if (customItem.type === 'separator') {
            menuItems.push({ type: 'separator' });
          } else if (customItem.label.trim()) {
            menuItems.push({
              label: customItem.label,
              click: () => webContents$$1.executeJavaScript(`
                var el = document.querySelector('#${customItem.menuId} menuitem[label="${customItem.label}"]')
                var evt = new MouseEvent('click', {bubbles: true, cancelable: true, view: window})
                el.dispatchEvent(evt)
              `),
              enabled: customItem.disabled === null
            });
          }
        });
        menuItems.push({ type: 'separator' });
      }

      // helper to run a download prompt for media
      const downloadPrompt = (item, win) => {
        var defaultPath = path__default.join(electron.app.getPath('downloads'), path__default.basename(props.srcURL));
        electron.dialog.showSaveDialog({ title: `Save ${props.mediaType} as...`, defaultPath }, filepath => {
          if (filepath) { download(win, props.srcURL, { saveAs: filepath }); }
        });
      };

      // links
      if (props.linkURL && props.mediaType === 'none') {
        menuItems.push({ label: 'Open Link in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.linkURL) });
        menuItems.push({ label: 'Copy Link Address', click: () => electron.clipboard.writeText(props.linkURL) });
        menuItems.push({ type: 'separator' });
      }

      // images
      if (props.mediaType == 'image') {
        menuItems.push({ label: 'Save Image As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Image', click: () => webContents$$1.copyImageAt(props.x, props.y) });
        menuItems.push({ label: 'Copy Image URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Image in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // videos and audios
      if (props.mediaType == 'video' || props.mediaType == 'audio') {
        menuItems.push({ label: 'Loop', type: 'checkbox', checked: mediaFlags.isLooping, click: () => callOnElement('el.loop = !el.loop') });
        if (mediaFlags.hasAudio) { menuItems.push({ label: 'Muted', type: 'checkbox', checked: mediaFlags.isMuted, click: () => callOnElement('el.muted = !el.muted') }); }
        if (mediaFlags.canToggleControls) { menuItems.push({ label: 'Show Controls', type: 'checkbox', checked: mediaFlags.isControlsVisible, click: () => callOnElement('el.controls = !el.controls') }); }
        menuItems.push({ type: 'separator' });
      }

      // videos
      if (props.mediaType == 'video') {
        menuItems.push({ label: 'Save Video As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Video URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Video in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // audios
      if (props.mediaType == 'audio') {
        menuItems.push({ label: 'Save Audio As...', click: downloadPrompt });
        menuItems.push({ label: 'Copy Audio URL', click: () => electron.clipboard.writeText(props.srcURL) });
        menuItems.push({ label: 'Open Audio in New Tab', click: (item, win) => win.webContents.send('command', 'file:new-tab', props.srcURL) });
        menuItems.push({ type: 'separator' });
      }

      // clipboard
      if (props.isEditable) {
        menuItems.push({ label: 'Cut', role: 'cut', enabled: can('Cut') });
        menuItems.push({ label: 'Copy', role: 'copy', enabled: can('Copy') });
        menuItems.push({ label: 'Paste', role: 'paste', enabled: editFlags.canPaste });
        menuItems.push({ type: 'separator' });
      } else if (hasText) {
        menuItems.push({ label: 'Copy', role: 'copy', enabled: can('Copy') });
        menuItems.push({ type: 'separator' });
      }

      // view source
      if (!props.pageURL.startsWith('beaker://')) {
        var viewSourceURL = props.pageURL;
        if (isDat) {
          viewSourceURL = props.pageURL.slice('dat://'.length);
        }
        menuItems.push({
          label: 'View Source',
          click: (item, win) => {
            win.webContents.send('command', 'file:new-tab', 'beaker://view-source/' + viewSourceURL);
          }
        });
      }

      // fork
      if (isDat) {
        menuItems.push({
          label: 'Fork this site',
          click: async (item, win) => {
            var res = await win.webContents.executeJavaScript(`
              DatArchive.fork("${props.pageURL}")
                .then(archive => archive.url)
                .catch(() => false)
            `);
            if (res) {
              win.webContents.send('command', 'file:new-tab', res);
            }
          }
        });
      }

      // inspector
      if (isDat) {
        menuItems.push({
          label: 'Inspect Site Files',
          click: (item, win) => {
            win.webContents.send('command', 'view:open-sidebar');
          }
        });
      }
      menuItems.push({
        label: 'Inspect Element',
        click: item => {
          webContents$$1.inspectElement(props.x, props.y);
          if (webContents$$1.isDevToolsOpened()) { webContents$$1.devToolsWebContents.focus(); }
        }
      });

      // show menu
      var menu = electron.Menu.buildFromTemplate(menuItems);
      menu.popup(targetWindow, {async: true});
    });
  });
}

function setup$12 () {
  electron.app.on('login', async function (e, webContents$$1, request, authInfo, cb) {
    e.preventDefault(); // default is to cancel the auth; prevent that
    var res = await showModal(getWebContentsWindow(webContents$$1), 'basic-auth', authInfo);
    cb(res.username, res.password);
  });
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

function archivesDebugPage () {
  var archives = getActiveArchives();
  return `<html>
    <body>
      ${Object.keys(archives).map(key => {
    var a = archives[key];
    return `<div style="font-family: monospace">
          <h3>${a.key.toString('hex')}</h3>
          <table>
            <tr><td>Meta DKey</td><td>${a.discoveryKey.toString('hex')}</td></tr>
            <tr><td>Content DKey</td><td>${a.content.discoveryKey.toString('hex')}</td></tr>
            <tr><td>Meta Key</td><td>${a.key.toString('hex')}</td></tr>
            <tr><td>Content Key</td><td>${a.content.key.toString('hex')}</td></tr>
            ${a.replicationStreams.map((s, i) => `
              <tr><td>Peer ${i}</td><td>${s.peerInfo.type} ${s.peerInfo.host}:${s.peerInfo.port}</td></tr>
            `).join('')}
          </table>
        </div>`
  }).join('')}
    </body>
  </html>`
}

function datDnsCachePage () {
  var cache = datDns.listCache();
  return `<html>
    <body>
      <h1>Dat DNS cache</h1>
      <p><button>Clear cache</button></p>
      <table style="font-family: monospace">
        ${Object.keys(cache).map(name => {
    var key = cache[name];
    return `<tr><td><strong>${name}</strong></td><td>${key}</td></tr>`
  }).join('')}
      </table>
      <script src="beaker://dat-dns-cache/main.js"></script>
    </body>
  </html>`
}

function datDnsCacheJS () {
  return `
    document.querySelector('button').addEventListener('click', clear)
    async function clear () {
      await beaker.archives.clearDnsCache()
      location.reload()
    }
  `
}

// constants
// =

// content security policies
const BEAKER_CSP = `
  default-src 'self' beaker:;
  img-src beaker-favicon: beaker: data: dat: http: https;
  script-src 'self' beaker:;
  media-src 'self' beaker: dat:;
  style-src 'self' 'unsafe-inline' beaker:;
`.replace(/\n/g, '');

// globals
// =

var serverPort; // port assigned to us
var requestNonce; // used to limit access to the server from the outside

// exported api
// =

function setup$13 () {
  // generate a secret nonce
  requestNonce = '' + crypto.randomBytes(4).readUInt32LE(0);

  // setup the protocol handler
  electron.protocol.registerHttpProtocol('beaker',
    (request, cb) => {
      // send requests to the protocol server
      cb({
        method: request.method,
        url: `http://localhost:${serverPort}/?url=${encodeURIComponent(request.url)}&nonce=${requestNonce}`
      });
    }, err => {
      if (err) {
        throw new Error('Failed to create protocol: beaker. ' + err)
      }
    }
  );

  // create the internal beaker HTTP server
  var server = http.createServer(beakerServer);
  listenRandomPort(server, { host: '127.0.0.1' }, (err, port) => { serverPort = port; });
}

// internal methods
// =

async function beakerServer (req, res) {
  var cb = once((code, status, contentType, path$$1) => {
    res.writeHead(code, status, {
      'Content-Type': (contentType || 'text/html; charset=utf-8'),
      'Content-Security-Policy': BEAKER_CSP,
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof path$$1 === 'string') {
      var rs = fs.createReadStream(path$$1);
      rs.pipe(res);
      rs.on('error', err => {
        res.writeHead(404);
        res.end(' '); // need to put some content on the wire for some reason
      });
    } else if (typeof path$$1 === 'function') {
      res.end(path$$1());
    } else {
      res.end(errorPage(code + ' ' + status));
    }
  });
  var queryParams = url__default.parse(req.url, true).query;
  var requestUrl = queryParams.url;
  {
    // strip off the hash
    let i = requestUrl.indexOf('#');
    if (i !== -1) requestUrl = requestUrl.slice(0, i);
  }
  {
    // strip off the query
    let i = requestUrl.indexOf('?');
    if (i !== -1) requestUrl = requestUrl.slice(0, i);
  }

  // check the nonce
  // (only want this process to access the server)
  if (queryParams.nonce !== requestNonce) {
    return cb(403, 'Forbidden')
  }

  // browser ui
  if (requestUrl === 'beaker://shell-window/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'shell-window.html'))
  }
  if (requestUrl === 'beaker://shell-window/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'shell-window.build.js'))
  }
  if (requestUrl === 'beaker://shell-window/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/shell-window.css'))
  }
  if (requestUrl === 'beaker://assets/icons.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/icons.css'))
  }
  if (requestUrl === 'beaker://assets/font-awesome.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/fonts/font-awesome/css/font-awesome.min.css'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.woff2') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.woff2'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.woff') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.woff'))
  }
  if (requestUrl === 'beaker://assets/fontawesome-webfont.svg') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'assets/fonts/fontawesome-webfont.svg'))
  }
  if (requestUrl === 'beaker://assets/font-photon-entypo') {
    return cb(200, 'OK', 'application/font-woff', path__default.join(__dirname, 'assets/fonts/photon-entypo.woff'))
  }
  if (requestUrl === 'beaker://assets/font-source-sans-pro') {
    return cb(200, 'OK', 'application/font-woff2', path__default.join(__dirname, 'assets/fonts/source-sans-pro.woff2'))
  }
  if (requestUrl === 'beaker://assets/font-source-sans-pro-le') {
    return cb(200, 'OK', 'application/font-woff2', path__default.join(__dirname, 'assets/fonts/source-sans-pro-le.woff2'))
  }
  if (requestUrl.startsWith('beaker://assets/logo2')) {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/logo2.png'))
  }
  if (requestUrl.startsWith('beaker://assets/logo')) {
    return cb(200, 'OK', 'image/png', path__default.join(__dirname, 'assets/img/logo.png'))
  }

  // builtin pages
  if (requestUrl === 'beaker://assets/builtin-pages.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages.css'))
  }
  if (requestUrl === 'beaker://start/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/start.html'))
  }
  if (requestUrl === 'beaker://start/background-image') {
    return cb(200, 'OK', 'image/png', path__default.join(electron.app.getPath('userData'), 'start-background-image'))
  }
  if (requestUrl === 'beaker://start/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/start.css'))
  }
  if (requestUrl === 'beaker://start/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/start.build.js'))
  }
  if (requestUrl === 'beaker://bookmarks/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/bookmarks.html'))
  }
  if (requestUrl === 'beaker://bookmarks/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/bookmarks.build.js'))
  }

  // new - keys

  if (requestUrl === 'beaker://keys/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/keys.html'))
  }
  if (requestUrl === 'beaker://keys/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/keys.build.js'))
  }

  // end

  if (requestUrl === 'beaker://history/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/history.html'))
  }
  if (requestUrl === 'beaker://history/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/history.build.js'))
  }
  if (requestUrl === 'beaker://downloads/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/downloads.html'))
  }
  if (requestUrl === 'beaker://downloads/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/downloads.build.js'))
  }
  if (requestUrl === 'beaker://library/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/library.css'))
  }
  if (requestUrl === 'beaker://library/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/library.build.js'))
  }
  if (requestUrl === 'beaker://library/' || requestUrl.startsWith('beaker://library/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/library.html'))
  }
  if (requestUrl === 'beaker://view-source/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/view-source.css'))
  }
  if (requestUrl === 'beaker://view-source/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/view-source.build.js'))
  }
  if (requestUrl === 'beaker://view-source/' || requestUrl.startsWith('beaker://view-source/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/view-source.html'))
  }
  if (requestUrl === 'beaker://swarm-debugger/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/swarm-debugger.css'))
  }
  if (requestUrl === 'beaker://swarm-debugger/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/swarm-debugger.build.js'))
  }
  if (requestUrl === 'beaker://swarm-debugger/' || requestUrl.startsWith('beaker://swarm-debugger/')) {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/swarm-debugger.html'))
  }
  if (requestUrl === 'beaker://settings/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/settings.html'))
  }
  if (requestUrl === 'beaker://settings/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/settings.build.js'))
  }
  if (requestUrl === 'beaker://dat-sidebar/main.js') {
    return cb(200, 'OK', 'application/javascript', path__default.join(__dirname, 'builtin-pages/build/dat-sidebar.build.js'))
  }
  if (requestUrl === 'beaker://dat-sidebar/main.css') {
    return cb(200, 'OK', 'text/css', path__default.join(__dirname, 'stylesheets/builtin-pages/dat-sidebar.css'))
  }
  if (requestUrl === 'beaker://dat-sidebar/' || requestUrl.startsWith('beaker://dat-sidebar/')) {
    return cb(200, 'OK', 'text/html', path__default.join(__dirname, 'builtin-pages/dat-sidebar.html'))
  }

  // modals
  if (requestUrl === 'beaker://create-archive-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/create-archive-modal.html'))
  }
  if (requestUrl === 'beaker://create-archive-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/create-archive-modal.css'))
  }
  if (requestUrl === 'beaker://create-archive-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/create-archive-modal.build.js'))
  }
  if (requestUrl === 'beaker://fork-archive-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/fork-archive-modal.html'))
  }
  if (requestUrl === 'beaker://fork-archive-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/fork-archive-modal.css'))
  }
  if (requestUrl === 'beaker://fork-archive-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/fork-archive-modal.build.js'))
  }
  if (requestUrl === 'beaker://basic-auth-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/basic-auth-modal.html'))
  }
  if (requestUrl === 'beaker://basic-auth-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/basic-auth-modal.css'))
  }
  if (requestUrl === 'beaker://basic-auth-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/basic-auth-modal.build.js'))
  }
  if (requestUrl === 'beaker://prompt-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/prompt-modal.html'))
  }
  if (requestUrl === 'beaker://prompt-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/prompt-modal.css'))
  }
  if (requestUrl === 'beaker://prompt-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/prompt-modal.build.js'))
  }
  if (requestUrl === 'beaker://select-archive-modal/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', path__default.join(__dirname, 'builtin-pages/select-archive-modal.html'))
  }
  if (requestUrl === 'beaker://select-archive-modal/main.css') {
    return cb(200, 'OK', 'text/css; charset=utf-8', path__default.join(__dirname, 'stylesheets/builtin-pages/select-archive-modal.css'))
  }
  if (requestUrl === 'beaker://select-archive-modal/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', path__default.join(__dirname, 'builtin-pages/build/select-archive-modal.build.js'))
  }

  // debugging
  if (requestUrl === 'beaker://internal-archives/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', archivesDebugPage)
  }
  if (requestUrl === 'beaker://dat-dns-cache/') {
    return cb(200, 'OK', 'text/html; charset=utf-8', datDnsCachePage)
  }
  if (requestUrl === 'beaker://dat-dns-cache/main.js') {
    return cb(200, 'OK', 'application/javascript; charset=utf-8', datDnsCacheJS)
  }

  return cb(404, 'Not Found')
}

/**
 * beaker-favicon:
 *
 * Helper protocol to serve site favicons from the sitedata db.
 **/

function setup$14 () {
  // load default favicon
  var defaultFaviconBuffer = -6; // not found, till we load it
  fs.readFile(path__default.join(__dirname, './assets/img/default-favicon.ico'), (err, buf) => {
    if (err) { console.error('Failed to load default favicon', path__default.join(__dirname, './assets/img/default-favicon.ico'), err); }
    if (buf) { defaultFaviconBuffer = buf; }
  });

  // register favicon protocol
  electron.protocol.registerBufferProtocol('beaker-favicon', (request, cb) => {
    var url$$1 = request.url.slice('beaker-favicon:'.length);

    // look up in db
    get$5(url$$1, 'favicon').then(data => {
      if (data) {
        // `data` is a data url ('data:image/png;base64,...')
        // so, skip the beginning and pull out the data
        data = data.split(',')[1];
        if (data) { return cb({ mimeType: 'image/png', data: Buffer.from(data, 'base64') }) }
      }
      cb({ mimeType: 'image/png', data: defaultFaviconBuffer });
    }).catch(() => cb({ mimeType: 'image/png', data: defaultFaviconBuffer }));
  }, e => {
    if (e) { console.error('Failed to register beaker-favicon protocol', e); }
  });
}

const styles = `<style>
  .entry {
    background: no-repeat center left;
    padding: 3px 20px;
    font-family: Consolas, 'Lucida Console', Monaco, monospace;
    font-size: 13px;
  }
  .updog {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAKxJREFUeNpi/P//PwMlgImBQjAMDGBBF2BkZISz09LSwCE8a9YsuCBGoIMEkDEMJCUl/b90+QoYg9i41LNgc1ZycvL/hMQkhgcPH4H5iUnJIJf9nzt3LiNBL2RkZPwPj4hk4BMUYuDh44MEFDMLQ0xsHAMrKyvIJYyEwuDLiuXLeP7+/Qv3EihcmJmZGZiYmL5gqEcPFKBiAyDFjCPQ/wLVX8BrwGhSJh0ABBgAsetR5KBfw9EAAAAASUVORK5CYII=');
  }
  .directory {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAAXdEVYdEF1dGhvcgBMYXBvIENhbGFtYW5kcmVp35EaKgAAACl0RVh0RGVzY3JpcHRpb24AQmFzZWQgb2YgSmFrdWIgU3RlaW5lciBkZXNpZ26ghAVzAAABbElEQVQ4jaWQO0tDQRCFz2x2A8YHQoogaKFW2qSysbATsdAIWgrWlhIFBRvLoFhZW/gb0vgPRBAStEgExZA2VR7X3Nw7MxY3BhUjCU6zMOz5zrcL/HPo/HDzREFnZMj1tgoI1FPm/ePL/M2fgNxRxltaXh8xxkCEoSIQYQQdH6XHO6/T8ZePL/PFfgBLCifCqJQfesswDNBoNhAEnQQRFXLZjV+qAefiRQsAba/e27MIWl4Ta1t7SE3N9lVXEVxfnaYtyJjS0z04DCMlF8fK6jaSyRQatUpfwFhypvsEUrOze4CxiUmoAlBF4LfwXq/1DUcG3UJhRmJ0HI1a9c/AzxGOAAYApEsbCiBfAMrDA5T5nwb8zYCHN/j8RABQFYAINGgYgEhUamPGKLOQiyciCFH3NABRdFsFqhoVqUJV4bebiBmjNmZd8eW5kJ6bXxhUAADw9lpWY12BLrKZRWNjt0EYTA8DsM5Vw7a/9gEhN65EVGzVRQAAAABJRU5ErkJggg==');
  }
  .file {
    background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAASdEVYdFRpdGxlAFBhcGVyIFNoZWV0c7mvkfkAAAAXdEVYdEF1dGhvcgBMYXBvIENhbGFtYW5kcmVp35EaKgAAACd0RVh0RGVzY3JpcHRpb24Ad2l0aCBhIEhVR0UgaGVscCBmcm9tIEpha3VihlQHswAAAhNJREFUOI11kstqU1EUhr91ctI2A2uTNsRaOxDEkeILiIgTL6CCAx+iUnTSgQPBRxAFSxWhA8XiBQst7aQjUV+kMWlzOaeJVZvsy3JwctK0wQWLvQabb/3/v7eoKuubqzdFZMk5PwuKqqIKoAB/Qba8d8/v3b2/xfFSVVbXPpWbUUO990Pd7Xa0Uv2paxurf1Y+vnucwA87AOh0OjP5iQL7v/dptWOacZ1ao0plZ5vdepV2q8Wt67dzxanik7fvlxcGBQQAxlgAqpUK5e0KO5Ua9d2IuNlmL/pFuVwhCAKuXrmWGx0Ze/pm+dXlFBAmAANAYSqPcy5p73DO4pwjE8OHzyuMZXNcvHAp9/3H1wXgWx9gjQGURi3CWjuU01S+xMkTBbxYgiCQg4ODGy9ePsvMzz1yfQUKTBTGcc7iVVHv8T5V4hhhFJExzp09z8bmesarzwIpINkaN1s454YUpCWBkC706gcysEkG+clxnPNo7y/0PsMhQHoAa1CvwyFCQBAoipBcFY4eyWCtxTt/FCBAHO3h7P8tZMIMpeI0xlh8z+pABkLpVBG0J1UGVKQKVBARrDH9rAaeERq1iG63298YhiFnZmf63rWXiTEGd9wCwOmZaUTkaA8ooJfpEEBEqnEcTRcKk//1n1a73QIkMtZ0EluqzD98cCfMhoum2y2pgpI84fEZlGx2pG6MmVtafP0F4B+wR1eZMTEGTgAAAABJRU5ErkJggg==');
  }
</style>`;

async function renderDirectoryListingPage (archive, dirPath, webRoot) {
  // handle the webroot
  webRoot = webRoot || '/';
  const realPath = p => path.join(webRoot, p);
  const webrootPath = p => path.relative(webRoot, p);

  // list files
  var names = [];
  try { names = await pda.readdir(archive, realPath(dirPath)); } catch (e) {}

  // stat each file
  var entries = await Promise.all(names.map(async (name) => {
    var entry;
    var entryPath = path.join(dirPath, name);
    try { entry = await pda.stat(archive, realPath(entryPath)); } catch (e) { return false }
    entry.path = webrootPath(entryPath);
    entry.name = name;
    return entry
  }));
  entries = entries.filter(Boolean);

  // sort the listing
  entries.sort((a, b) => {
    // directories on top
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    // alphabetical after that
    return a.name.localeCompare(b.name)
  });

  // show the updog if path is not top
  var updog = '';
  if (['/', '', '..'].includes(webrootPath(dirPath)) === false) {
    updog = `<div class="entry updog"><a href="..">..</a></div>`;
  }

  // render entries
  var totalFiles = 0;
  entries = entries.map(entry => {
    totalFiles++;
    var url$$1 = makeSafe(entry.path);
    if (!url$$1.startsWith('/')) url$$1 = '/' + url$$1; // all urls should have a leading slash
    if (entry.isDirectory() && !url$$1.endsWith('/')) url$$1 += '/'; // all dirs should have a trailing slash
    var type = entry.isDirectory() ? 'directory' : 'file';
    return `<div class="entry ${type}"><a href="${url$$1}">${makeSafe(entry.name)}</a></div>`
  }).join('');

  // render summary
  var summary = `<div class="entry">${totalFiles} ${pluralize(totalFiles, 'file')}</div>`;

  // render final
  return '<meta charset="UTF-8">' + styles + updog + entries + summary
}

var debug$7 = require('debug')('beaker');

// config default mimetype
mime.default_type = 'text/plain';
const TEXT_TYPE_RE = /^text\/|^application\/(javascript|json)/;

function identify (name, chunk) {
  // try to identify the type by the chunk contents
  var mimeType;
  var identifiedExt = (chunk) ? identifyFiletype(chunk) : false;
  if (identifiedExt) { mimeType = mime.lookup(identifiedExt); }
  if (mimeType) {
    debug$7('[DAT] Identified entry mimetype as', mimeType);
  } else {
    // fallback to using the entry name
    mimeType = mime.lookup(name);
    debug$7('[DAT] Assumed mimetype from entry name', mimeType);
  }

  // hackish fix
  // the svg test can be a bit aggressive: html pages with
  // inline svgs can be falsely interpretted as svgs
  // double check that
  if (identifiedExt === 'svg' && mime.lookup(name) === 'text/html') {
    return 'text/html; charset=utf8'
  }

  // assume utf-8 for text types
  if (TEXT_TYPE_RE.test(mimeType)) {
    mimeType += '; charset=utf8';
  }

  return mimeType
}

function identifyStream (name, cb) {
  var first = true;
  return through2(function (chunk, enc, cb2) {
    if (first) {
      first = false;
      cb(identify(name, chunk));
    }
    this.push(chunk);
    cb2();
  })
}

var debug$6 = require('debug')('dat');
// HACK
// attempt to load utp-native to make sure it's correctly built
// discovery-swarm intentionally swallows that failure but we want
// it to be logged
// -prf
try {
  require('utp-native');
} catch (err) {
  console.error('Failed to load utp-native. Peer-to-peer connectivity may be degraded.', err);
}

// constants
// =

// how long till we give up?
const REQUEST_TIMEOUT_MS = 30e3; // 30 seconds

// content security policies
const DAT_CSP = `
default-src dat: https: data: blob:;
script-src dat: https: 'unsafe-eval' 'unsafe-inline' data: blob:;
style-src dat: https: 'unsafe-inline' data: blob:;
object-src 'none';
`.replace(/\n/g, ' ');

// globals
// =

var serverPort$1; // port assigned to us
var requestNonce$1; // used to limit access to the server from the outside

// exported api
// =

function setup$15 () {
  // generate a secret nonce
  requestNonce$1 = crypto.randomBytes(4).readUInt32LE(0);

  // setup the network & db
  setup$5();

  // setup the protocol handler
  electron.protocol.registerHttpProtocol('dat',
    (request, cb) => {
      // send requests to the protocol server
      cb({
        method: request.method,
        url: 'http://localhost:' + serverPort$1 + '/?url=' + encodeURIComponent(request.url) + '&nonce=' + requestNonce$1
      });
    }, err => {
      if (err) throw beakerErrorConstants.ProtocolSetupError(err, 'Failed to create protocol: dat')
    }
  );

  // create the internal dat HTTP server
  var server = http.createServer(datServer);
  listenRandomPort(server, { host: '127.0.0.1' }, (_, port) => { serverPort$1 = port; });
}



async function datServer (req, res) {
  var cb = once((code, status, errorPageInfo) => {
    res.writeHead(code, status, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': "default-src 'unsafe-inline' beaker:;",
      'Access-Control-Allow-Origin': '*'
    });
    res.end(errorPage(errorPageInfo || (code + ' ' + status)));
  });
  var queryParams = url.parse(req.url, true).query;
  var fileReadStream;
  var headersSent = false;
  var archive;

  // check the nonce
  // (only want this process to access the server)
  if (queryParams.nonce != requestNonce$1) {
    return cb(403, 'Forbidden')
  }

  // validate request
  var urlp = parseDatURL(queryParams.url, true);
  if (!urlp.host) {
    return cb(404, 'Archive Not Found')
  }
  if (req.method !== 'GET') {
    return cb(405, 'Method Not Supported')
  }

  // stateful vars that may need cleanup
  var timeout;
  function cleanup () {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  // track whether the request has been aborted by client
  // if, after some async, we find `aborted == true`, then we just stop
  var aborted = false;
  req.once('aborted', () => {
    aborted = true;
    cleanup();
    debug$6('Request aborted by client');
  });

  // resolve the name
  // (if it's a hostname, do a DNS lookup)
  try {
    var archiveKey = await datDns.resolveName(urlp.host, {ignoreCachedMiss: true});
    if (aborted) return
  } catch (err) {
    cleanup();
    return cb(404, 'No DNS record found for ' + urlp.host)
  }

  // setup a timeout
  timeout = setTimeout(() => {
    if (aborted) return

    // cleanup
    aborted = true;
    debug$6('Timed out searching for', archiveKey);
    if (fileReadStream) {
      fileReadStream.destroy();
      fileReadStream = null;
    }

    // error page
    var resource = archive ? 'page' : 'site';
    cb(504, `Timed out searching for ${resource}`, {
      resource,
      errorCode: 'dat-timeout',
      validatedURL: urlp.href
    });
  }, REQUEST_TIMEOUT_MS);

  try {
    // start searching the network
    archive = await getOrLoadArchive(archiveKey);
    if (aborted) return
  } catch (err) {
    debug$6('Failed to open archive', archiveKey, err);
    cleanup();
    return cb(500, 'Failed')
  }

  // parse path
  var filepath = decodeURIComponent(urlp.path);
  if (!filepath) filepath = '/';
  if (filepath.indexOf('?') !== -1) filepath = filepath.slice(0, filepath.indexOf('?')); // strip off any query params
  var isFolder = filepath.endsWith('/');

  // checkout version if needed
  var archiveFS = archive.stagingFS;
  if (urlp.version) {
    let seq = +urlp.version;
    if (seq <= 0) {
      return cb(404, 'Version too low')
    }
    if (seq > archive.version) {
      return cb(404, 'Version too high')
    }
    archiveFS = archive.checkout(seq);
  }

  // read the manifest (it's needed in a couple places)
  var manifest;
  try { manifest = await pda__default.readManifest(archiveFS); } catch (e) { manifest = null; }

  // handle zip download
  if (urlp.query.download_as === 'zip') {
    cleanup();

    // (try to) get the title from the manifest
    let zipname = false;
    if (manifest) {
      zipname = slugify(manifest.title || '').toLowerCase();
    }
    zipname = zipname || 'archive';

    // serve the zip
    res.writeHead(200, 'OK', {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipname}.zip"`,
      'Content-Security-Policy': DAT_CSP,
      'Access-Control-Allow-Origin': '*'
    });
    var zs = toZipStream(archive);
    zs.on('error', err => console.log('Error while producing .zip file', err));
    zs.pipe(res);
    return
  }

  // lookup entry
  debug$6('Attempting to lookup', archiveKey, filepath);
  var statusCode = 200;
  var entry;
  const tryStat = async (path$$1) => {
    // abort if we've already found it
    if (entry) return
    // apply the web_root config
    if (manifest && manifest.web_root) {
      if (path$$1) {
        path$$1 = path.join(manifest.web_root, path$$1);
      } else {
        path$$1 = manifest.web_root;
      }
    }
    // attempt lookup
    try {
      entry = await pda__default.stat(archiveFS, path$$1);
      entry.path = path$$1;
    } catch (e) {}
  };
  // detect if this is a folder without a trailing slash
  if (!isFolder) {
    await tryStat(filepath);
    if (entry && entry.isDirectory()) {
      filepath = filepath + '/';
      isFolder = true;
    }
  }
  entry = false;
  // do actual lookup
  if (isFolder) {
    await tryStat(filepath + 'index.html');
    await tryStat(filepath + 'index.md');
    await tryStat(filepath);
  } else {
    await tryStat(filepath);
    await tryStat(filepath + '.html'); // fallback to .html
  }

  // still serving?
  if (aborted) return

  // handle folder
  if ((!entry && isFolder) || (entry && entry.isDirectory())) {
    cleanup();
    res.writeHead(200, 'OK', {
      'Content-Type': 'text/html',
      'Content-Security-Policy': DAT_CSP,
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(await renderDirectoryListingPage(archiveFS, filepath, manifest && manifest.web_root))
  }

  // handle not found
  if (!entry) {
    statusCode = 404;
    debug$6('Entry not found:', urlp.path);

    // check for a fallback page
    await tryStat(manifest.fallback_page);

    if (!entry) {
      cleanup();
      return cb(404, 'File Not Found')
    }
  }

  // caching if-match
  // TODO
  // this unfortunately caches the CSP header too
  // we'll need the etag to change when CSP perms change
  // TODO- try including all headers...
  // -prf
  // const ETag = 'block-' + entry.content.blockOffset
  // if (req.headers['if-none-match'] === ETag) {
  //   return cb(304, 'Not Modified')
  // }

  // fetch the permissions
  // TODO this has been disabled until we can create a better UX -prf
  // var origins
  // try {
  //   origins = await sitedataDb.getNetworkPermissions('dat://' + archiveKey)
  // } catch (e) {
  //   origins = []
  // }

  // handle range
  res.setHeader('Accept-Ranges', 'bytes');
  var range = req.headers.range && parseRange(entry.size, req.headers.range);
  if (range && range.type === 'bytes') {
    range = range[0]; // only handle first range given
    statusCode = 206;
    res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + entry.size);
    res.setHeader('Content-Length', range.end - range.start + 1);
    debug$6('Serving range:', range);
  } else {
    if (entry.size) {
      res.setHeader('Content-Length', entry.size);
    }
  }

  // fetch the entry and stream the response
  debug$6('Entry found:', entry.path);
  fileReadStream = archiveFS.createReadStream(entry.path, range);
  fileReadStream
    .pipe(identifyStream(entry.path, mimeType => {
      // cleanup the timeout now, as bytes have begun to stream
      cleanup();

      // send headers, now that we can identify the data
      headersSent = true;
      var headers = {
        'Content-Type': mimeType,
        'Content-Security-Policy': DAT_CSP,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age: 60'
        // ETag
      };
      res.writeHead(statusCode, 'OK', headers);
    }))
    .pipe(res);

  // handle empty files
  fileReadStream.once('end', () => {
    if (!headersSent) {
      cleanup();
      debug$6('Served empty file');
      res.writeHead(200, 'OK', {
        'Content-Security-Policy': DAT_CSP,
        'Access-Control-Allow-Origin': '*'
      });
      res.end('\n');
      // TODO
      // for some reason, sending an empty end is not closing the request
      // this may be an issue in beaker's interpretation of the page-load ?
      // but Im solving it here for now, with a '\n'
      // -prf
    }
  });

  // handle read-stream errors
  fileReadStream.once('error', err => {
    debug$6('Error reading file', err);
    if (!headersSent) cb(500, 'Failed to read file');
  });

  // abort if the client aborts
  req.once('aborted', () => {
    if (fileReadStream) {
      fileReadStream.destroy();
    }
  });
}

Error.stackTraceLimit = Infinity;

// This is main process of Electron, started as first thing when your
// app starts. This script is running through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

// read config from env vars
if (process.env.beaker_user_data_path) {
  console.log('User data path set by environment variables');
  console.log('userData:', process.env.beaker_user_data_path);
  electron.app.setPath('userData', process.env.beaker_user_data_path);
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

// configure the protocols
electron.protocol.registerStandardSchemes(['dat', 'beaker'], { secure: true });

electron.app.on('ready', function () {
  // databases
  setup$6();
  setup$1();
  setup$9();
  setup$4();

  // base
  setup$$1();

  // ui
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(buildWindowMenu()));
  registerContextMenu();
  setup$10();
  setup$11();
  setup$8();
  setup$12();

  // protocols
  setup$13();
  setup$14();
  setup$15();

  // configure chromium's permissions for the protocols
  electron.protocol.registerServiceWorkerSchemes(['dat']);

  // web APIs
  setup$3();

  // listen OSX open-url event
  setup$2();
});

electron.app.on('activate', () => ensureOneWindowExists());
electron.app.on('open-url', (e, url$$1) => open(url$$1));

electron.app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') { electron.app.quit(); }
});

}());