import * as keysDb from '../dbs/keys'
import * as keysLibrary from '../networks/keys/library'
// exported api
// =

export default {
  async add (...args) {
    return keysDb.add(0, ...args)
  },

  async changeAppURL (...args) {
    return keysDb.changeAppURL(0, ...args)
  },

  async changeProfileURL (...args) {
    return keysDb.changeProfileURL(0, ...args)
  },

  async remove (...args) {
    return keysDb.remove(0, ...args)
  },

  async get (...args) {
    return keysDb.get(0, ...args)
  },

  async sendPulse () {
    keysLibrary.sendPulse()
    return Promise.resolve(true)
  }
}
