# Domma AvatarIA — imagem única para web e worker (FFmpeg + fontes incluídos)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Web: npm start  ·  Worker: npm run worker (defina o Start Command no serviço)
CMD ["npm", "start"]
