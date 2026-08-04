# Multi-stage Dockerfile for OneView Nest apps
ARG APP_NAME=oneview-api

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
ARG APP_NAME
RUN npm run packages:build
WORKDIR /app/apps/${APP_NAME}
RUN npx nest build

FROM node:20-alpine AS runner
ARG APP_NAME=oneview-api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
# packages:build runs in `build` — must copy dist from there (deps has sources only)
COPY --from=build /app/packages ./packages
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/apps/${APP_NAME}/dist ./apps/${APP_NAME}/dist
COPY --from=deps /app/apps/${APP_NAME}/package.json ./apps/${APP_NAME}/package.json
COPY --from=deps /app/prisma ./prisma
WORKDIR /app/apps/${APP_NAME}
EXPOSE 3001
CMD ["node", "dist/main.js"]
