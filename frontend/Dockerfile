# 构建阶段
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 设置pnpm store目录
ENV PNPM_HOME="/app/.pnpm-store"

# 安装pnpm
RUN npm install -g pnpm

# 复制package.json和pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖（包括devDependencies）
RUN pnpm install --no-frozen-lockfile

# 复制所有源代码
COPY . .

# 构建应用
RUN pnpm build

# 生产阶段
FROM node:20-alpine AS runner

WORKDIR /app

# 设置pnpm store目录
ENV PNPM_HOME="/app/.pnpm-store"

# 安装pnpm
RUN npm install -g pnpm

# 设置为生产环境
ENV NODE_ENV production

# 从构建阶段复制必要文件
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["pnpm", "start"]