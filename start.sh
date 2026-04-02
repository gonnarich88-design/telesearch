#!/bin/sh
set -e
prisma db push --accept-data-loss
exec node server.js
