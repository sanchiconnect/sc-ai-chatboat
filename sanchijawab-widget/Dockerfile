# Builds widget.js and serves it as a static file. This is what customers'
# <script> tags load, so it must be reachable from the public internet
# (ideally behind a CDN) at the URL given to the admin as NEXT_PUBLIC_WIDGET_URL.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && rm -f dist/test.html

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
