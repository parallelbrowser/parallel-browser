import * as keysDb from '../dbs/keys'

// exported api
// =

export default {
  async add (...args) {
    console.log('lol. im here in web-apis/keys.js', args)
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
  }
}
