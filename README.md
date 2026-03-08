<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cbfce1fc-7bd1-49d8-837b-e623fff18ac5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Authenticate for Vertex AI locally, for example:
   `gcloud auth application-default login`
3. Optionally create `.env.local` to override the default Vertex settings:
   `GOOGLE_CLOUD_PROJECT=my-rd-coe-demo-gen-ai`
   `GOOGLE_CLOUD_LOCATION=global`
4. Run the app:
   `npm run dev`
