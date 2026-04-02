#!/bin/sh
set -e
npx prisma db push --accept-data-loss
exec npx next start -p 3030
