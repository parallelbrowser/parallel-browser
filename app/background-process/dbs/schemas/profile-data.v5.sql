CREATE TABLE keys (
  profileId INTEGER PRIMARY KEY NOT NULL,
  appURL TEXT,
  profileURL TEXT,
  updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
  createdAt INTEGER DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE
);

INSERT INTO keys (profileId, appURL, profileURL) VALUES (0, 'dat://8783d32b34bd79da196a8039dc476b2c7ca39a618af840baba68d968fefcec16', 'empty');


PRAGMA user_version = 5;
