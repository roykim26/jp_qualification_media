FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.16.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm run build
# tsc emits JS only, so the SQL migrations must be copied into dist explicitly.
RUN cp -r apps/web/public dist/apps/web/public \
 && cp -r packages/db/migrations dist/packages/db/migrations

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.16.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY config ./config
EXPOSE 3000 4100
CMD ["node", "dist/apps/web/src/server.js"]
