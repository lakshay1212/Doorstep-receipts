# Untested in the authoring sandbox (no Docker there). Build and run locally first:
#   docker build -t doorstep-receipts . && docker run -p 3000:3000 doorstep-receipts
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p data && chown -R node:node /app
USER node
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/server.ts"]
