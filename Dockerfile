# Use official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of your bot's application code
COPY . .

# Expose port 3000 for your web dashboard
EXPOSE 3000

# Start the dashboard and scanner
CMD [ "node", "index.js" ]