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
CMD ["node", "apps/api/dist/index.js"]

# ---------- Web ----------
FROM base AS web-build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @stoerdesk/web

FROM nginx:1.27-alpine AS web
# The rendered template replaces the default server of the image.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/web/nginx-pwa.conf.template /etc/nginx/templates/default.conf.template
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
