FROM node:22-alpine
WORKDIR /app
COPY game/ ./game/
COPY server/ ./server/
ENV PORT=8080
EXPOSE 8080
CMD ["node","server/server.js"]
