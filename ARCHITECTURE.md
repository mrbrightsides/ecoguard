# 🏗️ Architecture: Vanguard Engine

EcoGuard AI is designed as a high-performance, single-page application (SPA) that emphasizes immediate feedback and tactical data visualization.

## 📡 System Overview

The application follows a "Client-Side First" architecture, minimizing latency by communicating directly with the Google Gemini API from the browser.

### 1. Intelligence Layer (`services/geminiService.ts`)
The core logic resides in specialized functions that wrap the Gemini SDK:
*   **`analyzeEnvironmentMedia`**: Utilizes `gemini-3-flash-preview` with a structured `responseSchema` to ensure valid JSON outputs for the Impact HUD.
*   **`findLocalEcoResources`**: Leverages `gemini-2.5-flash` with the `googleMaps` tool for geo-spatial grounding.
*   **`getEnvironmentPulse`**: Uses `googleSearch` tool for real-time news retrieval.
*   **`detectEnvironmentalObjects`**: Performs spatial analysis for AR bounding boxes.

### 2. UI/UX Layer (`App.tsx`)
A monolithic component structure designed to resemble a tactical military interface:
*   **State Management**: React Hooks (useState, useRef) manage the complex state of camera streams, audio contexts, and tactical grid nodes.
*   **HUD Rendering**: Dynamic SVG/CSS overlays for object detection reticles and radar sweep animations.
*   **Audio Pipeline**: Raw PCM decoding for the Live API to ensure gapless, low-latency voice interaction.

### 3. Data Persistence
*   **Mission Archive**: LocalStorage-based persistence for `AnalysisHistoryEntry` objects, allowing users to review past missions offline.

## 🔄 Data Flow: Tactical Scan
1.  **Input**: User captures media (photo/video).
2.  **Detection**: First-pass AI detection identifies visible objects for the AR reticles.
3.  **Synthesis**: Detailed Gemini analysis generates an `EnvironmentIssue` and `ActionPlan`.
4.  **Grounding**: Latitude/Longitude coordinates are passed to Google Maps tool to fetch local "Intelligence Nodes".
5.  **Visualization**: All data is aggregated into the "Sector Grid" and "Mission Archive".

## 🛡️ Model Selection Strategy
*   **`gemini-3-flash-preview`**: Chosen for complex reasoning, impact scoring, and structured JSON action plans due to its high reasoning speed.
*   **`gemini-2.5-flash-native-audio`**: Powering the Live API for its low-latency multimodal capabilities.
*   **`gemini-2.5-flash`**: Selected for Maps/Search tools for reliable grounding performance.