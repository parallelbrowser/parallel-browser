import * as db from './profile-data-db'

// exported methods
// =

export function add (profileId, appURL, profileURL) {
  return db.run(`
    INSERT OR REPLACE
      INTO keys (profileId, appURL, profileURL)
      VALUES (?, ?, ?)
  `, [profileId, appURL, profileURL])
}

export function changeAppURL (profileId, appURL) {
  return db.run(`UPDATE keys SET appURL = ? WHERE profileId = ?`, [appURL, profileId])
}

export function changeProfileURL (profileId, profileURL) {
  return db.run(`UPDATE keys SET profileURL = ? WHERE profileId = ?`, [profileURL, profileId])
}

export function remove (profileId) {
  return db.run(`DELETE FROM keys WHERE profileId = ?`, [profileId])
}

export function get (profileId) {
  return db.get(`SELECT appURL, profileURL FROM keys WHERE profileId = ?`, [profileId])
}
