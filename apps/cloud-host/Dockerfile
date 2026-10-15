FROM ccr.ccs.tencentyun.com/liguobao/node:22-slim

ENV NODE_ENV=production \
    PATH=/opt/dsh/node_modules/.bin:$PATH \
    HOME=/data/home \
    DSH_HOME=/data/dsh \
    DSH_WORKSPACE=/data/workspace \
    DSH_TELEMETRY_DISABLED=1

WORKDIR /opt/dsh
# Native modules use prebuilt artifacts where available; these tools also make
# npm's native fallback and the user's ordinary workspace tools available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git curl bash python3 make g++ procps \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && mkdir -p /data/dsh /data/workspace /data/home \
    && chown -R 1000:1000 /data
COPY bootstrap.mjs ./

USER 1000:1000
# Keep the startup cwd outside the volume so Docker/containerd does not create
# /data/workspace as root before our non-root entrypoint initializes it.
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "/opt/dsh/bootstrap.mjs"]
