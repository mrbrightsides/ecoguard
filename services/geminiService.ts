
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EnvironmentIssue, ActionPlan, LocationData, GroundingLink, DetectedObject } from "../types";

// Always create a new client instance for each request to ensure it uses the latest configuration
const getAIClient = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * Helper to remove asterisks from AI generated text (usually markdown formatting)
 */
const cleanText = (text: string): string => {
  return text.replace(/\*/g, '');
};

/**
 * Recursively cleans all string values in an object
 */
const cleanObjectStrings = (obj: any): any => {
  if (typeof obj === 'string') {
    return cleanText(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanObjectStrings(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: any = {};
    for (const key in obj) {
      cleaned[key] = cleanObjectStrings(obj[key]);
    }
    return cleaned;
  }
  return obj;
};

/**
 * Analyzes an image or video to detect environmental issues with deep reasoning
 */
export async function analyzeEnvironmentMedia(
  base64Data: string, 
  mimeType: string = 'image/jpeg'
): Promise<{ issue: EnvironmentIssue; actionPlan: ActionPlan }> {
  const ai = getAIClient();
  
  const isVideo = mimeType.startsWith('video/');
  const promptText = isVideo 
    ? "Analyze this video for environmental concerns. Provide deep reasoning for your impact score. Observe the entire clip. Identify the primary issue, its severity, and calculate an 'Impact Score' from 0 to 100 based on ecological damage shown. Provide a structured action plan. Return the response in strict JSON format. DO NOT use markdown formatting like asterisks in your text descriptions."
    : "Analyze this image for environmental concerns. Provide deep reasoning for your impact score. Identify the primary issue, its severity, and calculate an 'Impact Score' from 0 to 100 based on ecological damage. Provide a structured action plan. Return the response in strict JSON format. DO NOT use markdown formatting like asterisks in your text descriptions.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Upgraded to Pro for deeper analysis
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Data } },
        { text: promptText }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 4000 }, // Added thinking budget for complex ecological reasoning
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          issue: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, description: "low, medium, high, or critical" },
              impactCategory: { type: Type.STRING },
              impactScore: { type: Type.NUMBER, description: "Score from 0 to 100 representing total ecological damage" }
            },
            required: ["title", "description", "severity", "impactCategory", "impactScore"]
          },
          actionPlan: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    priority: { type: Type.NUMBER },
                    difficulty: { type: Type.STRING }
                  },
                  required: ["step", "priority", "difficulty"]
                }
              },
              longTermGoal: { type: Type.STRING }
            },
            required: ["summary", "steps", "longTermGoal"]
          }
        },
        required: ["issue", "actionPlan"]
      }
    }
  });

  const rawJson = JSON.parse(response.text || '{}');
  return cleanObjectStrings(rawJson);
}

/**
 * Finds local environmental resources using Google Maps grounding
 */
export async function findLocalEcoResources(location: LocationData, query: string): Promise<{ text: string; links: GroundingLink[] }> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find local environmental resources near me related to: ${query}. Include recycling centers, environmental NGOs, or cleanup groups. Provide plain text response without markdown bolding or asterisks.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: location.latitude,
            longitude: location.longitude
          }
        }
      }
    }
  });

  const links: GroundingLink[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.maps) {
        links.push({ title: chunk.maps.title, uri: chunk.maps.uri });
      }
    });
  }

  return {
    text: cleanText(response.text || "No specific local resources found."),
    links
  };
}

/**
 * Gets latest environmental news using Search grounding
 */
export async function getEnvironmentPulse(): Promise<{ text: string; links: GroundingLink[] }> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "What are the top 3 critical global environmental issues trending this week and what can individuals do about them today? Give a response in plain text without any asterisks or markdown formatting.",
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const links: GroundingLink[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) {
        links.push({ title: chunk.web.title, uri: chunk.web.uri });
      }
    });
  }

  return {
    text: cleanText(response.text || "Unable to fetch latest news."),
    links
  };
}

/**
 * Targeted search for specific environmental issues
 */
export async function searchEnvironmentalIssue(query: string): Promise<{ text: string; links: GroundingLink[] }> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Tell me about the current state of the following environmental issue: ${query}. Provide a brief summary and recent developments. No markdown bolding or asterisks.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const links: GroundingLink[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) {
        links.push({ title: chunk.web.title, uri: chunk.web.uri });
      }
    });
  }

  return {
    text: cleanText(response.text || "No information found for this query."),
    links
  };
}

/**
 * Real-time object detection for AR overlay
 */
export async function detectEnvironmentalObjects(base64Image: string): Promise<DetectedObject[]> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: "Detect environmental objects in this scene. Focus on waste, pollution, healthy vegetation, or water sources. Return a JSON list of objects. Each object must have: label, category (pollution, waste, vegetation, water, habitat, other), box_2d [ymin, xmin, ymax, xmax] normalized 0-1000, score, and a brief explanation (max 15 words) of why this object was flagged as an environmental concern." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            category: { type: Type.STRING },
            box_2d: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              minItems: 4,
              maxItems: 4
            },
            score: { type: Type.NUMBER },
            explanation: { type: Type.STRING }
          },
          required: ["label", "category", "box_2d", "score", "explanation"]
        }
      }
    }
  });

  try {
    const raw = JSON.parse(response.text || '[]');
    const results = Array.isArray(raw) ? raw : [];
    // Assign IDs for feedback tracking
    return results.map((obj: any) => ({
      ...obj,
      id: crypto.randomUUID()
    }));
  } catch (e) {
    console.error("Failed to parse detection results", e);
    return [];
  }
}
