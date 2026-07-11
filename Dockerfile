# Dockerfile
# 使用多阶段构建：减小最终镜像体积，提高安全性

# ══════════════════════════════════════════════════════
# 第一阶段：构建阶段
# 安装所有依赖、生成 Prisma Client、编译 TypeScript
# ══════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# 先单独复制 package.json，利用 Docker 缓存层
# 只要 package.json 没变，npm install 这层会走缓存，加快构建
COPY package*.json ./

# 安装全部依赖（包含 devDependencies，TypeScript 编译需要）
# 使用国内镜像源，速度更快
RUN npm install --registry=https://registry.npmmirror.com

# 复制 Prisma 相关文件（必须在 prisma generate 之前）
COPY prisma ./prisma
COPY prisma.config.ts ./

# 复制所有源代码
COPY . .

# 生成 Prisma Client
# 根据 schema.prisma 生成到 src/generated/prisma/
RUN npx prisma generate

# 编译 TypeScript 到 dist/
RUN npm run build

# ══════════════════════════════════════════════════════
# 第二阶段：生产阶段
# 只包含运行所需的文件，不包含构建工具
# 最终镜像体积从约 800MB 减小到约 200MB
# ══════════════════════════════════════════════════════
FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# 从构建阶段复制 package.json
COPY --from=builder /app/package*.json ./

# 只安装生产依赖（不安装 TypeScript、ts-node 等开发工具）
RUN npm install --only=production --registry=https://registry.npmmirror.com

# 从构建阶段复制编译后的 JavaScript
COPY --from=builder /app/dist ./dist

# 从构建阶段复制 Prisma 生成的 Client
COPY --from=builder /app/src/generated ./src/generated

# 复制 prisma 目录（执行迁移时需要）
COPY --from=builder /app/prisma ./prisma

# 复制 prisma.config.ts（Prisma 7 必须的配置文件）
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3000

CMD ["node", "dist/src/main.js"]