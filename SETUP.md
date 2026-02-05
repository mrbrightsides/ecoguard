# 🛠️ Setup & Installation

Follow these steps to deploy your own instance of the EcoGuard Vanguard Engine.

## 📋 Prerequisites

*   **Node.js**: v18.0.0 or higher.
*   **Google Gemini API Key**: Obtain one from the [Google AI Studio](https://aistudio.google.com/).
*   **Browser Permissions**: The app requires Camera, Microphone, and Geolocation access to function as intended.

## 🚀 Local Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/mrbrightsides/ecoguard.git
    cd ecoguard
    ```

2.  **Configure Environment Variables**
    Create a `.env` file in the root directory:
    ```env
    API_KEY=your_gemini_api_key_here
    ```

3.  **Install Dependencies**
    ```bash
    npm install
    ```

4.  **Launch the Vanguard HUD**
    ```bash
    npm start
    ```
    The app will typically be available at `http://localhost:3000`.

## 📱 Mobile Setup

For the best experience, use a mobile device:
1.  Ensure you are using `HTTPS` (required for Camera/Mic access).
2.  Enable "High Accuracy" location settings.
3.  When prompted, allow permissions for the Vanguard Sensor suite.

## 🌐 Deployment (Vercel/Netlify)

Ensure your deployment platform has the `API_KEY` environment variable configured in their dashboard. The app is designed as an ES Module and will work out-of-the-box with standard React build scripts.