import { ipcRenderer } from 'electron'

// TCW CHANGES -- injects scripts into the webview DOM

export function setup() {
  ipcRenderer.on("inject-scripts", function(event , data){
    console.log('in setup');
    const dat1 = {
      scriptName: 'Emoji mouse',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/background-green/',
      jsFilename: 'background-green.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const dat2 = {
      scriptName: 'Emoji mouse',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/mouse-emoji/',
      jsFilename: 'emoji.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const scriptArray = [dat1, dat2]

    scriptArray.forEach(script => {
      getDatScripts(script)
    })

  });
}

async function getDatScripts(scriptInfo){
  try {
    const SECURITY_POLICY = `<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'self';\">`
    let jsString
    let cssString
    const scriptArchive = new DatArchive(scriptInfo.datRoot)
    if (scriptInfo.jsFilename) {
      jsString = await scriptArchive.readFile(
        scriptInfo.datPath + scriptInfo.jsFilename,
        scriptInfo.jsFilenameType
      )
    }
    if (scriptInfo.cssFilename) {
      cssString = await scriptArchive.readFile(
        scriptInfo.datPath + scriptInfo.cssFilename,
        scriptInfo.cssFilenameType
      )
    }

    const body = document.body || document.getElementsByTagName('body')[0]
    const head = document.head || document.getElementsByTagName('head')[0]

    head.prepend(SECURITY_POLICY);

    if (jsString) {
      const jsElement = document.createElement('script')
      jsElement.appendChild(document.createTextNode(jsString))
      body.appendChild(jsElement)
    }

    if (cssString) {
      const cssElement = document.createElement('style')
      cssElement.type = 'text/css'
      cssElement.appendChild(document.createTextNode(cssString))
      head.appendChild(cssElement)
    }
  } catch (err) {
    console.log(err);
  }
}


// TCW -- END
