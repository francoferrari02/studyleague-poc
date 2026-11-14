FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci necesita los package.json de todos los workspaces para validar el lockfile.
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/ranking-consumer/package.json services/ranking-consumer/
COPY services/rachas-consumer/package.json services/rachas-consumer/
COPY services/analitica-consumer/package.json services/analitica-consumer/
COPY services/notificaciones-consumer/package.json services/notificaciones-consumer/
COPY tools/simulador/package.json tools/simulador/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root
COPY apps/web apps/web
ARG VITE_DEMO=false
ARG VITE_API_URL=/api
ENV VITE_DEMO=$VITE_DEMO VITE_API_URL=$VITE_API_URL
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
