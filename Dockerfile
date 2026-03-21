FROM node:alpine

WORKDIR /app
ENV NODE_ENV=production

COPY index.js package.json ./

USER node
EXPOSE 3000

CMD ["node", "index.js"]
