#!/bin/bash

# ARES AWS Deployment Prep Script
echo "============================================"
echo " ARES Production AWS Deployment Packager"
echo "============================================"

# 1. Build Frontend
echo "[1/3] Building React Frontend for Production..."
cd frontend || exit 1
npm run build
cd ..

# 2. Package Frontend for S3
echo "[2/3] Zipping Frontend Build..."
mkdir -p deployment_package
cd frontend/dist || exit 1
zip -r ../../deployment_package/frontend_build.zip ./*
cd ../..

# 3. Inform User
echo "[3/3] Deployment Packager Complete!"
echo "--------------------------------------------"
echo "Your frontend production build is zipped at: deployment_package/frontend_build.zip"
echo "Your backend is ready to be built as a Docker container using backend/Dockerfile."
echo "Please refer to docs/AWS_DEPLOYMENT_GUIDE.md for the final AWS console steps."
echo "============================================"
