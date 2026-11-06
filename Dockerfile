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
COPY scripts scripts
RUN npm run build --workspace @stoerdesk/api
# Drizzle's migrator needs meta/_journal.json next to the SQL files. Fail the
# build here rather than at container start if the copy step left it out.
RUN test -f apps/api/dist/db/migrations/meta/_journal.json

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
# The installed commit of the image. The compose file passes it as a build
# argument; without it the API reads the version of the tracked `VERSION` file
# that the image carries (specs/18-self-update.md §18.3).
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# The root `prepare` script (husky) needs the dev dependencies and a git
# repository — neither exists in the runtime image.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=api-build /app/apps/api/dist apps/api/dist
# The version of record of this commit; the fallback of the installed version.
COPY VERSION ./VERSION
# Uploads are written by the unprivileged `node` user.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
# Apply pending migrations, then start the server. Running it here keeps the
# schema up to date without a separate migration container.
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && exec node apps/api/dist/index.js"]

# ---------- Web ----------
FROM base AS web-build
# The version shown in the web shell comes from the development workflow: the
# tracked `VERSION` file (written by pre-commit, tagged by post-commit) is part
# of the build context, so no git metadata is needed. CI may pass the release tag
# explicitly; any non-empty value is accepted, including pre-releases.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
COPY tsconfig.base.json ./
COPY VERSION ./VERSION
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
