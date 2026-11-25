FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
