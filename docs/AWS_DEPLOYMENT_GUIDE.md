# ARES AWS Production Deployment Guide

This guide outlines the simplest and most scalable way to host the ARES application on AWS, ensuring secure communication between the frontend and backend.

## Architecture Choice
- **Backend (API)**: AWS App Runner or AWS Elastic Container Service (ECS) using the provided `Dockerfile`.
- **Frontend (UI)**: AWS S3 with static website hosting, fronted by AWS CloudFront for HTTPS.

---

## Part 1: Deploying the Backend
We have created a production-ready `Dockerfile` in the `backend/` directory.

### Using AWS App Runner (Easiest)
AWS App Runner is a fully managed service that makes it easy to deploy containerized web applications.

1. **Upload your code to AWS**:
   - Push your entire repository to GitHub.
   - Alternatively, you can push the Docker image to Amazon ECR (Elastic Container Registry).
2. **Create an App Runner Service**:
   - Go to the **AWS App Runner** console.
   - Click **Create service**.
   - Select **Source code repository** (link your GitHub) or **Container registry** (if you pushed to ECR).
   - *Build settings*: Select `Dockerfile` and point it to `/backend/Dockerfile`.
   - *Port*: Set to `8000`.
3. **Deploy**:
   - Click **Create & deploy**.
   - App Runner will give you a public URL (e.g., `https://random-id.awsapprunner.com`). 
   - **Save this URL. This is your Production API URL.**

---

## Part 2: Preparing and Building the Frontend
Before building the frontend, you must tell it where your backend lives on the internet, so it stops looking for `localhost:8000`.

1. **Configure Environment Variables**:
   - In the `frontend/` folder, create a file named `.env.production`.
   - Add the following line, replacing the URL with the backend URL you got from AWS App Runner:
     ```
     VITE_API_URL=https://your-app-runner-url.awsapprunner.com
     ```
2. **Package the Frontend**:
   - Open your terminal in the root of the project.
   - Run the automated packager: `./deploy_aws.sh`
   - This will build the optimized React app and output a ZIP file at `deployment_package/frontend_build.zip`.

---

## Part 3: Deploying the Frontend (AWS S3 & CloudFront)
1. **Create an S3 Bucket**:
   - Go to the **Amazon S3** console.
   - Create a bucket (e.g., `ares-mission-control-ui`).
   - Uncheck "Block all public access" (you want the website to be public).
   - Go to the bucket's **Properties** tab and enable **Static website hosting**. Set the index document to `index.html`.
2. **Upload the Files**:
   - Unzip your `frontend_build.zip`.
   - Upload the *contents* of the `dist` folder directly into the S3 bucket.
3. **Set Permissions**:
   - Under the **Permissions** tab, add a Bucket Policy that allows public read access (`s3:GetObject`).
4. **CloudFront (Optional but Recommended)**:
   - To get a secure HTTPS URL and faster loading, go to **AWS CloudFront**.
   - Create a distribution pointing to your S3 bucket endpoint.

---

## Part 4: CORS Configuration (Final Link)
If your frontend is hosted on S3 (e.g., `http://ares-mission-control.s3.amazonaws.com`) but your backend is on App Runner, the backend needs to know it is allowed to accept requests from the frontend domain.

1. Open `backend/.env` (or configure this environment variable in your AWS App Runner settings).
2. Set the `BACKEND_CORS_ORIGINS` to your S3 or CloudFront URL:
   ```
   BACKEND_CORS_ORIGINS=["http://ares-mission-control.s3.amazonaws.com", "https://your-cloudfront-url.net"]
   ```
3. Restart the backend.

**Congratulations! ARES is now live on AWS.**
