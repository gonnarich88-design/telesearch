#!/bin/sh
set -e

prisma db push --accept-data-loss

# First deploy: import seed data if DB is empty
COUNT=$(sqlite3 ./prisma/dev.db "SELECT count(*) FROM Entity;" 2>/dev/null || echo "0")
if [ "$COUNT" = "0" ]; then
  echo "Empty database — importing seed data..."
  sqlite3 ./prisma/dev.db < ./prisma/seed.sql
  echo "Seed imported: $(sqlite3 ./prisma/dev.db 'SELECT count(*) FROM Entity;') entities"
fi

exec node server.js
