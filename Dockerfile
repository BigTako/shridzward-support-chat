# Use Node 20 instead of 22 for better compatibility
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 3000

# Add this environment variable to handle OpenSSL issues
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Start the server
CMD ["npm", "start"]