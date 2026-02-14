FROM node:22-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN npm install -g bun@1.3.9

ARG BUN_COMPILE_TARGET=bun-linux-x64
RUN cd apps/api && BUN_COMPILE_TARGET=${BUN_COMPILE_TARGET} bun run compile


FROM gcr.io/distroless/base-debian12:nonroot

WORKDIR /app

COPY --from=build /app/apps/api/dist/server /app/server

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/app/server"]
