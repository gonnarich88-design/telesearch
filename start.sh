#!/bin/sh
set -e
node node_modules/prisma/build/index.js db push --accept-data-loss
exec node server.js
