FROM node:22-bookworm-slim AS web
WORKDIR /build/web
RUN npm install -g pnpm@11.25.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.lock /app/server/requirements.lock
RUN pip install --no-cache-dir -r server/requirements.lock
COPY server/ /app/server/
RUN pip install --no-cache-dir --no-deps -e ./server
COPY --from=web /build/web/dist /app/web/dist
ENV DATA_DIR=/data PUBLIC_HOSTING=true CODEX_ENABLED=false APP_MODE=live
RUN useradd --create-home --uid 10001 appuser && mkdir -p /data && chown appuser:appuser /data
USER appuser
EXPOSE 8000
CMD ["uvicorn", "hackathon_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
