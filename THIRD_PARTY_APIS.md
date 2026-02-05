# 🔌 Third-Party Integrations

EcoGuard AI leverages a suite of powerful APIs and libraries to deliver its vanguard experience.

## 🤖 Google Gemini API (`@google/genai`)

The backbone of the application's intelligence.

| Model | Purpose |
| :--- | :--- |
| `gemini-3-flash-preview` | Structured JSON analysis, impact scoring, and object detection. |
| `gemini-2.5-flash` | Grounded information retrieval via Maps and Search. |
| `gemini-2.5-flash-native-audio` | Real-time voice interaction (Live API). |

### Integrated Tools:
*   **Google Search Tool**: Used to ground global ecological pulse data in real-time news.
*   **Google Maps Tool**: Used to locate verified recycling centers, NGOs, and environmental resources based on user coordinates.

## 🎨 UI & Visualization

*   **Tailwind CSS**: Utility-first CSS framework for the tactical HUD and responsive layouts.
*   **Lucide React**: Vector icons used for sensor status, mission types, and navigation.
*   **ESM.sh**: CDN used for importing dependencies directly via the `importmap` in `index.html`.

## 📡 Web Standard APIs

*   **MediaDevices API**: Accesses the device camera and microphone for environmental sensing.
*   **Web Audio API**: Manages low-latency audio processing for the Live AI uplink.
*   **Geolocation API**: Provides the coordinates necessary for the Regional Sector Grid.
*   **MediaRecorder API**: Enables video capture for multi-frame ecological analysis.