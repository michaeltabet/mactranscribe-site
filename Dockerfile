# MacTranscribe SSR site — multi-stage build producing a slim standalone Node server.
# Stage 1: install + build
FROM node:24-alpine AS build
WORKDIR /app

# Install deps with a clean, reproducible install.
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Build the Astro SSR app. No secrets are needed at build time.
COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: runtime
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

# Non-root user.
RUN addgroup -S app && adduser -S app -G app

# Copy only what the standalone server needs.
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 4321

# The @astrojs/node standalone adapter emits this entrypoint.
CMD ["node", "./dist/server/entry.mjs"]
