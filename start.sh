#!/bin/sh
set -e

SEED_VERSION="v3"
SEED_MARKER="./prisma/.seed_version"

# Force reimport if seed version doesn't match
if [ ! -f "$SEED_MARKER" ] || [ "$(cat $SEED_MARKER)" != "$SEED_VERSION" ]; then
  echo "Seed version mismatch — reimporting data..."
  rm -f ./prisma/dev.db
  prisma db push --accept-data-loss
  sqlite3 ./prisma/dev.db < ./seed.sql
  echo "$SEED_VERSION" > "$SEED_MARKER"
  echo "Seed done: $(sqlite3 ./prisma/dev.db 'SELECT count(*) FROM Entity;') entities"
else
  prisma db push --accept-data-loss
fi

exec node server.js
