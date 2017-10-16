var hypercore = require('hypercore')
var hyperdiscovery = require('hyperdiscovery')
var ram = require('random-access-memory')

export function sendPulse () {
  var feed = hypercore(() => { return ram() }, 'e9b687d9e7aeb2a5990bbb16659bbc28f01d8e51b5ebf12d90925e57f4a37272')

  var swarm
  feed.on('ready', function () {
    console.log(feed.key.toString('hex'))
    swarm = hyperdiscovery(feed)
    swarm.on('connection', function (peer, type) {
      console.log('we had a connection')
    })
    feed.append({item: 'hello, parallel!'})
    // feed.close()
    setTimeout(closeSwarm, 1500)
  })

  function closeSwarm () {
    swarm.close()
    feed.close()
  }
}
