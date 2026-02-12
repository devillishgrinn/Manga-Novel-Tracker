# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY manifest.json ./
COPY popup.html ./
COPY src ./src
RUN npm run build

FROM alpine:3.20 AS extension
WORKDIR /extension
COPY --from=build /app/manifest.json ./manifest.json
COPY --from=build /app/popup.html ./popup.html
COPY --from=build /app/dist ./dist

# This image stores built extension artifacts only.
CMD ["sh"]
