FROM node:20-slim

WORKDIR /usr/src/app

# RUN apt-get update && apt-get install -y iputils-ping curl

COPY . .

RUN npm ci

RUN npm run build

RUN npm cache clean --force

ENV NODE_ENV="production"

CMD [ "npm", "start" ]
