FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3030
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache sqlite && npm install -g prisma@6

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY prisma/seed.sql ./prisma/seed.sql
COPY --from=builder /app/start.sh ./start.sh

RUN chmod +x start.sh

EXPOSE 3030
CMD ["sh", "start.sh"]
