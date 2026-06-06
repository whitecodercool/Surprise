FROM node:20-alpine

# Run as non-root user for security (Docker Escape prevention)
USER node

WORKDIR /usr/src/app

# We will install dependencies when the script runs or via package.json
CMD ["node", "admin.js"]
