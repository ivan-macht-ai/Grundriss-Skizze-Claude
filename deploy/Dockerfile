# Baut die App und liefert sie mit nginx aus. Build-Kontext ist das Hauptverzeichnis des Repos.
FROM node:22-alpine AS bauen
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=bauen /app/dist /usr/share/nginx/html
