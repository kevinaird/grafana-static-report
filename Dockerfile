FROM node:20.15.1-alpine3.20

WORKDIR /app

COPY package*.json ./

RUN npm install --global \
 && npx puppeteer browsers install chrome

COPY . .

ENTRYPOINT ["grafana-report"]
