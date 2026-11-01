# syntax=docker/dockerfile:1

# ---------- Base ----------
FROM node:22-alpine AS base
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# ---------- API ----------
FROM base AS api-build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @stoerdesk/api

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# The root `prepare` script (husky) needs the dev dependencies and a git
# repository — neither exists in the runtime image.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=api-build /app/apps/api/dist apps/api/dist
# Uploads are written by the unprivileged `node` user.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
# Apply pending migrations, then start the server. Running it here keeps the
# schema up to date without a separate migration container.
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && exec node apps/api/dist/index.js"]

# ---------- Web ----------
FROM base AS web-build
# The web shell must never display a placeholder: every image build passes a real
# `vMAJOR.MINOR.PATCH` version — CI passes the tag, Compose reads it from `.env`
# (`npm run env:create`, refreshed by the commit hook and `npm run env:version`).
# Anything else stops the image build instead of shipping `dev`.
ARG VITE_APP_VERSION
RUN if ! printf '%s' "$VITE_APP_VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then \
      echo "build arg VITE_APP_VERSION='$VITE_APP_VERSION' is not a vMAJOR.MINOR.PATCH version - run 'npm run env:version' so Compose can read it from .env" >&2; \
      exit 1; \
    fi
ENV VITE_APP_VERSION=$VITE_APP_VERSION
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @stoerdesk/web

FROM nginx:1.27-alpine AS web
# Defaults for deployment panels that do not pass the compose environment; the
# compose file overrides both. The filter keeps nginx variables such as $host
# untouched during the template rendering (docker-entrypoint.d/20-envsubst).
ENV API_UPSTREAM=http://api:3000 \
    UPLOAD_MAX_BYTES=10485760 \
    NGINX_ENVSUBST_FILTER=^(API|UPLOAD)_
# The rendered template replaces the default server of the image.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/web/nginx-pwa.conf.template /etc/nginx/templates/default.conf.template
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
