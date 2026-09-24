# Hugging Face Space (Docker SDK): a static server for the compiled city. The dataset's Content/ folder is mounted
# read-only at /data as a Space volume (see space/README.md); the image itself holds only the server.
FROM node:22-alpine
WORKDIR /app
COPY server.mjs /app/server.mjs
ENV PORT=7860 CONTENT_DIR=/data
EXPOSE 7860
USER node
CMD ["node", "/app/server.mjs"]
