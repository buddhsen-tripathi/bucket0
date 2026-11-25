# Bucket0 media service: thumbnails for images, videos, and PDFs.
# Deployable as a Cloudflare Container or any Docker host.

FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips \
    ffmpeg \
    graphicsmagick \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY server.ts thumbnail-native.ts body-limit.ts ./

ENV PORT=8080
EXPOSE 8080
USER bun
CMD ["bun", "run", "server.ts"]
