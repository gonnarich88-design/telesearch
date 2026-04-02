#!/bin/sh
set -e

# First deploy: copy seed DB if volume is empty
if [ ! -f ./prisma/dev.db ]; then
  echo "No database found — copying seed data..."
  cp ./prisma-seed/dev.db ./prisma/dev.db
fi

prisma db push --accept-data-loss
exec node server.js
