FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --only=production

RUN npx prisma generate

COPY --from=builder /app/dist/src ./dist

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
