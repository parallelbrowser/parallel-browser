import { ipcRenderer } from 'electron'
import { setup as setupUI } from './shell-window/ui'
import importWebAPIs from './lib/fg/import-web-apis'
import DatArchive from './lib/web-apis/dat-archive'
import beaker from './lib/web-apis/beaker'


beaker.keys.get(0).then(keyset => {
  console.log('keyset', keyset)
  window.keyset = keyset
  console.log('window keyset in shell', window.keyset)
})
importWebAPIs()
window.DatArchive = DatArchive
window.beaker = beaker
setupUI(() => {
  ipcRenderer.send('shell-window-ready')
})
