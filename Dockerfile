FROM node:18-alpine
FROM process-service

WORKDIR /app

COPY node_modules/ node_modules/
COPY dist/ build/processor
COPY package.json package.json

ENTRYPOINT [ "node", "build/index.js" ]