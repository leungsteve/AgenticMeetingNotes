FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash node2 && \
    mkdir -p /home/node2/.claude

WORKDIR /workspace

USER node2
