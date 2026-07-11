FROM node:18-alpine

# Install curl for health check
RUN apk add --no-cache curl

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
