CREATE TABLE keys (
  profileId INTEGER PRIMARY KEY NOT NULL,
  appURL TEXT,
  profileURL TEXT,
  updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
  createdAt INTEGER DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (profileId) REFERENCES profiles (id) ON DELETE CASCADE
);

INSERT INTO keys (profileId, appURL, profileURL) VALUES (0, 'dat://ca4ed3a956dd8ba2a6025cfa44cffe4b220298194009b130aa0b5fe2fae00f9a', 'empty');


PRAGMA user_version = 5;
