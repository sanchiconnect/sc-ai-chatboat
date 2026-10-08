# SanchiJawab admin dashboard + marketing website (Next.js).
# NEXT_PUBLIC_* values are baked into the browser bundle at BUILD time, so they
# are build args: changing a public URL means rebuilding this image.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WIDGET_URL=http://localhost:5500/widget.js
ARG NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
# false = the Content-Security-Policy is report-only (logs, blocks nothing); true = enforced. See next.config.mjs.
ARG CSP_ENFORCE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WIDGET_URL=$NEXT_PUBLIC_WIDGET_URL \
    NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL \
    CSP_ENFORCE=$CSP_ENFORCE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/public* ./public/
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
