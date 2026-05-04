# FK Label Master - Android Build Instructions

I have completely rebuilt the sharing architecture and optimized the build workflow to be extremely robust. 

## How to get your NEW APK:

1. **Export to GitHub**: In AI Studio, click the **"Share"** button or go to the project menu and select **"Export to GitHub"**. Create a NEW repository if necessary to ensure a fresh start.
2. **Go to Actions**: Visit your repository on GitHub and click the **"Actions"** tab.
3. **Wait for Build**: Select the **"Build Android APK"** workflow. It usually takes 3-5 minutes.
4. **Download**: Once finished, click on the build run, scroll down to **"Artifacts"**, and download **"app-debug"**.

## NEW FEATURE: Secure Sharing
I have implemented **Native Android Sharing**. Instead of a standard download, the app will now open the official Android "Share/Save" menu. This is the most reliable way to save PDFs on Android devices.

## Troubleshooting FAQ:

### 1. I see yellow "Deprecation" warnings in GitHub logs.
**DO NOT WORRY.** These are general warnings from GitHub about their infrastructure. They do **NOT** affect your build. As long as you see a green checkmark next to the task name, your APK was built successfully.

### 2. The APK failed with a Red X.
If the build fails, scroll to the VERY end of the logs in the **"Build Android APK"** step. Look for the error message after the line `./gradlew assembleDebug`. Usually, simply clicking **"Re-run all jobs"** on the GitHub page fixes any temporary server errors.

### 3. "No save as appeared"
If you are testing the app **inside the browser preview**, the "Share" feature will not work (due to browser security limits). You **MUST** install the actual APK on your phone to use the "Share via" feature properly.
