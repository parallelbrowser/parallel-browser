import { ipcRenderer } from 'electron'
import ParallelAPI from 'parallel-scratch-api'

// TCW CHANGES -- injects scripts into the webview DOM

export function setup() {
  // listens for the 'inject-scripts' ipc event called in the
  // onDomReady function in shell-window/pages.js

  ipcRenderer.on( 'inject-scripts', ( event , data ) => {

    // hardcoded sample results from a script query

    const dat1 = {
      scriptName: 'Background Green',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/background-green/',
      jsFilename: 'background-green.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const dat2 = {
      scriptName: 'Emoji Mouse',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/mouse-emoji/',
      jsFilename: 'emoji.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const dat3 = {
      scriptName: 'Mouse-DOM Test',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/mouse-dom/',
      jsFilename: 'js.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const dat4 = {
      scriptName: 'jQuery',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/jquery/',
      jsFilename: 'js.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const dat5 = {
      scriptName: 'Custom Event Test',
      datRoot: 'dat://e1fa3d35081a83abef84a622a2ed1de5cdc8ab880f7a168bdd5ed3d5ab263a88/',
      datPath: '/custom-events/',
      jsFilename: 'js.txt',
      jsFilenameType: 'utf8',
      cssFilename: '',
      cssFilenameType: 'utf8'
    }

    const scriptArray = [ dat3 ]

    // iterates over array TODO async.each

    scriptArray.forEach( script => {
      getDatScripts( script )
    })

  })

  ipcRenderer.on( 'script-reply', ( event, data ) => {
    console.log('event on reply', event);
    console.log('data on reply', data);
  })
}

async function getDatScripts( scriptInfo ){

  try {

    // define strings to be retrieved
    console.log('script info', scriptInfo);
    let jsString
    let cssString

    // create DatArchive object using the root Dat URL

    const scriptArchive = new DatArchive( scriptInfo.datRoot )

    // const testArchive = new DatArchive( 'dat://5fcc2b1d6751350eb0b80307af726b48ebb489e268a09f747f8b9c73baaad3ea/' )
    // await testArchive.writeFile('/hello.txt', 'world!', 'utf8')

    // gets the javascript from target dat archive

    if ( scriptInfo.jsFilename ) {
      jsString = await scriptArchive.readFile(
        scriptInfo.datPath + scriptInfo.jsFilename,
        scriptInfo.jsFilenameType
      )
    }

    // gets the css from target dat archive

    if ( scriptInfo.cssFilename ) {
      cssString = await scriptArchive.readFile(
        scriptInfo.datPath + scriptInfo.cssFilename,
        scriptInfo.cssFilenameType
      )
    }

    // performs the script injection

    inject( jsString, cssString )

  } catch ( err ) {
    console.log( err );
  }
}

function inject( jsString, cssString ) {

  // define SECURITY_POLICY constant to inject into the page, to allow
  // parallel scripts to run without compromising security

  const SECURITY_POLICY = `<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'self';\">`

  // define body and head of underlying webview DOM

  const body = document.body || document.getElementsByTagName( 'body' )[0]
  const head = document.head || document.getElementsByTagName( 'head' )[0]

  // add custom security policy

  head.prepend( SECURITY_POLICY );

  // appends javascript to the <body>

  if ( jsString ) {
    const jsElement = document.createElement( 'script' )
    jsElement.appendChild(document.createTextNode(jsString))
    body.appendChild(jsElement)
  }

  // appends css to the <head>

  if ( cssString ) {
    const cssElement = document.createElement( 'style' )
    cssElement.type = 'text/css'
    cssElement.appendChild( document.createTextNode( cssString ))
    head.appendChild( cssElement )
  }
}

// TCW -- END
