FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV MCP_HTTP_PATH=/mcp

COPY package.json ./
RUN npm install --omit=dev
COPY bin ./bin
COPY kb ./kb
COPY samples ./samples
COPY src ./src
COPY scripts ./scripts
COPY README.md ./README.md
COPY LICENSE ./LICENSE

EXPOSE 3000

CMD ["node", "src/http-server.js"]
