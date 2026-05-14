# syntax=docker/dockerfile:1

# 后端部署镜像：Zeabur 使用任意 Git 源时需要仓库根目录存在 Dockerfile。
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Prisma 运行和生成客户端时依赖 OpenSSL 证书组件。
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 先复制依赖声明，便于 Docker 缓存 npm ci 结果。
COPY server/package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build

WORKDIR /app

# 构建阶段也需要 OpenSSL 以便执行 prisma generate。
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY server/package*.json ./
COPY server/tsconfig.json ./tsconfig.json
COPY server/prisma ./prisma
COPY server/src ./src

# 生成 Prisma Client 后编译 TypeScript，并移除开发依赖以减小运行镜像。
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# 运行阶段保留 OpenSSL、生产依赖、Prisma schema 和编译产物。
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 3000

# 容器启动时先执行数据库迁移，再启动 Express 服务。
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
