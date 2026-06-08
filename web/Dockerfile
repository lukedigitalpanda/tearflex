FROM node:20-alpine AS builder
WORKDIR /app
# Copy shared types (referenced via @shared/* alias in tsconfig)
COPY shared/ ./shared/
# Copy web app
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
# Ensure public dir exists (Next.js standalone requires it even if empty)
RUN mkdir -p public
# API_URL is server-only (not NEXT_PUBLIC_*) so it doesn't need to be set at build time
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# standalone output includes only what's needed — no node_modules copy required
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static
COPY --from=builder /app/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
