FROM docker:29-cli AS docker-cli

FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MCP_HTTP_PATH=/mcp

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

COPY package.json ./
RUN npm install --omit=dev
COPY bin ./bin
COPY kb ./kb
COPY public ./public
COPY samples ./samples
COPY src ./src
COPY scripts ./scripts
COPY data ./data
COPY README.md ./README.md
COPY LICENSE ./LICENSE

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/sdk-http-server.js"]
