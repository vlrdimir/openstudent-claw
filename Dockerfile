FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/usr/local/bun
ENV PATH=/usr/local/bun/bin:/home/node/.local/bin:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw

RUN curl -fsSL https://bun.sh/install | bash

RUN ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun

WORKDIR /repo

COPY docker/openclaw-entrypoint.sh /usr/local/bin/openclaw-entrypoint.sh
RUN chmod +x /usr/local/bin/openclaw-entrypoint.sh

RUN mkdir -p /home/node/.openclaw/workspace \
  && chown -R node:node /home/node

USER node

ENTRYPOINT ["/usr/local/bin/openclaw-entrypoint.sh"]
CMD ["openclaw", "gateway"]
