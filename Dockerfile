FROM node:22-alpine

# Install build dependencies for canvas, node-gyp etc if needed
RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the frontend and backend bundle
RUN npm run build

# Install PM2 globally for container clustering
RUN npm install -g pm2

EXPOSE 3000

# Use pm2-runtime to manage container clustering and self-healing
CMD ["pm2-runtime", "ecosystem.config.cjs"]
