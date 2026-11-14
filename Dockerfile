# Imagen única para la API, los consumidores y el simulador (npm workspaces).
# Se elige el servicio con el build arg WORKSPACE, por ejemplo services/api.
# Debian slim y no Alpine: @confluentinc/kafka-javascript trae librdkafka precompilada para glibc.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG WORKSPACE
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/ranking-consumer/package.json services/ranking-consumer/
COPY services/rachas-consumer/package.json services/rachas-consumer/
COPY services/analitica-consumer/package.json services/analitica-consumer/
COPY services/notificaciones-consumer/package.json services/notificaciones-consumer/
COPY tools/simulador/package.json tools/simulador/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace packages/shared --workspace ${WORKSPACE} --include-workspace-root
COPY packages/shared packages/shared
COPY ${WORKSPACE} ${WORKSPACE}
RUN npm run build -w packages/shared && npm run build -w ${WORKSPACE} \
 && npm prune --omit=dev --workspace packages/shared --workspace ${WORKSPACE}

FROM node:22-bookworm-slim
WORKDIR /app
ARG WORKSPACE
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/${WORKSPACE} ${WORKSPACE}
WORKDIR /app/${WORKSPACE}
USER node
CMD ["node", "dist/index.js"]
