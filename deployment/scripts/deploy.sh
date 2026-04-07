#!/bin/bash
# Deployment script for AI Governance Platform

set -e

echo "=== AI Governance Platform Deployment ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment
ENV=${1:-production}
COMPOSE_FILE="deployment/docker/docker-compose.yml"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

echo -e "${YELLOW}Building and deploying for environment: $ENV${NC}"

# Load environment file
if [ -f "config/$ENV.env" ]; then
    source "config/$ENV.env"
else
    echo -e "${RED}Error: config/$ENV.env not found${NC}"
    exit 1
fi

# Build images
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose -f $COMPOSE_FILE build

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker-compose -f $COMPOSE_FILE up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check health
echo -e "${YELLOW}Checking service health...${NC}"
docker-compose -f $COMPOSE_FILE ps

echo -e "${GREEN}Deployment complete!${NC}"
echo "API available at: http://localhost:8000"
echo "Frontend available at: http://localhost:3000"
