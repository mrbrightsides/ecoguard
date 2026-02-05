
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Leaf, Camera, MapPin, Globe, Loader2, Info, ChevronRight, AlertTriangle, 
  X, RotateCcw, Check, Upload, ThumbsUp, ThumbsDown, Send, Sparkles, 
  Target, Map as MapIcon, Plus, Trash2, TreePine, Shovel, Calendar, 
  ExternalLink, Layers, LayoutGrid, Zap, History, MessageSquare, 
  ZoomIn, ZoomOut, Video, ZapOff, Scan, Activity, Eye, Play, Pause, 
  Square, Film, BadgeCheck, ShieldAlert, Search, ArrowRight, 
  Mic, MicOff, Wand2, Newspaper, TrendingUp, Download, Volume2,
  Clock, Zap as ZapIcon, Circle, Video as VideoIcon, Pin, PinOff,
  Crosshair, ShieldCheck, Target as TargetIcon, Bookmark, Save, Trash,
  Search as SearchIcon, Command, Database, Share2, UploadCloud, HelpCircle,
  Gauge, Radar, Navigation, MapPinOff, Locate, Filter, Settings, Flame, 
  EyeOff, Layers2, Zap as ZapFlash, MonitorPlay, PauseCircle, StopCircle,
  PlayCircle, Eye as EyeIcon, Scan as ScanIcon, Box
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { 
  analyzeEnvironmentMedia, 
  findLocalEcoResources, 
  getEnvironmentPulse, 
  detectEnvironmentalObjects, 
  searchEnvironmentalIssue 
} from './services/geminiService';
import { 
  EnvironmentIssue, ActionPlan, GroundingLink, LocationData, 
  CustomMarker, FeedbackEntry, DetectedObject, DetectionFeedback, 
  AnalysisHistoryEntry, SectorTask
} from './types';

// Helper for converting file to base64
const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

// Audio helpers for Live API
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const App: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'home' | 'analyze' | 'local' | 'pulse' | 'history'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  
  // Media states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'photo' | 'video'>('photo');
  const [capturedMedia, setCapturedMedia] = useState<{data: string, type: string, url: string} | null>(null);
  
  // AR states
  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const liveScanIntervalRef = useRef<number | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  
  // History states
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<AnalysisHistoryEntry | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Voice Command Feedback
  const [voiceNotification, setVoiceNotification] = useState<string | null>(null);

  // Video recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Camera advanced states
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  // Timer states
  const [timerDelay, setTimerDelay] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Local Sector Grid states
  const [isScanningSector, setIsScanningSector] = useState(false);
  const [sectorInitialized, setSectorInitialized] = useState(false);
  const [localNodes, setLocalNodes] = useState<SectorTask[]>([]);
  const [selectedNode, setSelectedNode] = useState<SectorTask | null>(null);
  const [gridLayer, setGridLayer] = useState<'radar' | 'heat' | 'topo'>('radar');

  // Live Audio Analysis states
  const [isAudioAnalysisActive, setIsAudioAnalysisActive] = useState(false);
  const [sessionPromise, setSessionPromise] = useState<Promise<any> | null>(null);
  const [transcriptions, setTranscriptions] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const currentTranscriptionRef = useRef({ user: '', ai: '' });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);

  // Results states
  const [analysisResult, setAnalysisResult] = useState<{ issue: EnvironmentIssue; actionPlan: ActionPlan } | null>(null);
  const [newsPulse, setNewsPulse] = useState<{ text: string; links: GroundingLink[] } | null>(null);
  const [localResources, setLocalResources] = useState<{ text: string; links: GroundingLink[] } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPulse = async () => {
    try {
      const pulse = await getEnvironmentPulse();
      setNewsPulse(pulse);
    } catch (e) {
      console.error("Failed to fetch pulse", e);
      setError("Failed to fetch global environmental pulse.");
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => setError("Location access is required for regional intelligence.")
      );
    }
    fetchPulse();

    const savedHistory = localStorage.getItem('ecoGuardHistory');
    if (savedHistory) {
      try {
        setAnalysisHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    return () => { 
      stopAudioAnalysis(); 
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (liveScanIntervalRef.current) clearInterval(liveScanIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ecoGuardHistory', JSON.stringify(analysisHistory));
  }, [analysisHistory]);

  // Live AR Scan Logic
  useEffect(() => {
    if (isLiveScanning && isCameraOpen && videoRef.current) {
      liveScanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        try {
          const objects = await detectEnvironmentalObjects(base64);
          setDetectedObjects(objects);
        } catch (e) { console.error("Live scan failed", e); }
      }, 3000); // 3 seconds to be polite to rate limits
    } else {
      if (liveScanIntervalRef.current) clearInterval(liveScanIntervalRef.current);
      if (!capturedMedia) setDetectedObjects([]);
    }
    return () => { if (liveScanIntervalRef.current) clearInterval(liveScanIntervalRef.current); };
  }, [isLiveScanning, isCameraOpen, capturedMedia]);

  const initializeSector = async () => {
    if (!location) {
      setError("Awaiting GPS lock for sector initialization.");
      return;
    }
    
    setIsScanningSector(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const resources = await findLocalEcoResources(location, "environmental organizations and recycling centers");
      
      const groundedNodes: SectorTask[] = resources.links.map((link, i) => ({
        id: `grounded-${i}`,
        title: link.title,
        type: 'intelligence',
        uri: link.uri,
        latOffset: (Math.random() - 0.5) * 0.02,
        lngOffset: (Math.random() - 0.5) * 0.02,
        description: "Verified Regional Resource Node identified via planetary intelligence uplink.",
        priority: 'low',
        status: 'completed'
      }));

      const mockReports: SectorTask[] = [
        { id: 'report-1', title: "Unauthorized Dumping Site", type: 'pollution', latOffset: 0.005, lngOffset: -0.008, description: "Alert: Hazardous waste detected in woodland sector. Immediate containment required.", priority: 'high', status: 'pending' },
        { id: 'report-2', title: "Reforestation Project", type: 'restoration', latOffset: -0.003, lngOffset: 0.012, description: "Community-led green canopy expansion. Volunteers needed for irrigation.", priority: 'medium', status: 'in-progress' },
        { id: 'report-3', title: "Water Quality Warning", type: 'pollution', latOffset: 0.01, lngOffset: 0.005, description: "Runoff detected in regional tributary. Aquatic habitat at risk.", priority: 'high', status: 'pending' }
      ];

      setLocalNodes([...groundedNodes, ...mockReports]);
      setSectorInitialized(true);
    } catch (e) {
      setError("Sector initialization sequence failed.");
    } finally {
      setIsScanningSector(false);
    }
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedMedia(null);
    setDetectedObjects([]);
    setCountdown(null);
    setIsFlashOn(false);
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsSaved(false);
    setIsLiveScanning(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: true 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const capabilities = track.getCapabilities() as any;
      if (capabilities && capabilities.torch) {
        setIsFlashSupported(true);
      }
    } catch (err) {
      setError("Camera access denied.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    videoTrackRef.current = null;
    setIsCameraOpen(false);
    setCountdown(null);
    setIsFlashOn(false);
    setIsLiveScanning(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64 = dataUrl.split(',')[1];
      setCapturedMedia({ data: base64, type: 'image/jpeg', url: dataUrl });
      setIsLiveScanning(false);
      stopCamera();
      try {
        const objects = await detectEnvironmentalObjects(base64);
        setDetectedObjects(objects);
      } catch (e) { console.error("Detection failed", e); }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      try {
        const base64 = await fileToBase64(file);
        const url = URL.createObjectURL(file);
        setCapturedMedia({ data: base64, type: file.type, url });
        setIsLiveScanning(false);
        if (file.type.startsWith('image/')) {
          const objects = await detectEnvironmentalObjects(base64);
          setDetectedObjects(objects);
        }
      } catch (err) {
        setError("Failed to process uploaded file.");
      } finally {
        setLoading(false);
      }
    }
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    recordedChunksRef.current = [];
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }
    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const base64 = await fileToBase64(blob);
      setCapturedMedia({ data: base64, type: 'video/webm', url });
      stopCamera();
    };
    mediaRecorderRef.current.start();
    setIsRecording(true);
    setIsPaused(false);
    setRecordingTime(0);
    timerIntervalRef.current = window.setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecordingAction = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const startCaptureCountdown = () => {
    if (timerDelay === 0) {
      if (mediaMode === 'photo') capturePhoto();
      else startRecording();
      return;
    }
    setCountdown(timerDelay);
    const intervalId = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(intervalId);
          if (mediaMode === 'photo') capturePhoto();
          else startRecording();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleConfirmAnalysis = async () => {
    if (!capturedMedia) return;
    setLoading(true);
    try {
      const result = await analyzeEnvironmentMedia(capturedMedia.data, capturedMedia.type);
      setAnalysisResult(result);
      if (location) {
        const local = await findLocalEcoResources(location, result.issue.title);
        setLocalResources(local);
      }
    } catch (e) { setError("Analysis failed."); } finally { setLoading(false); }
  };

  const saveToHistory = () => {
    if (!analysisResult) return;
    const entry: AnalysisHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      issue: analysisResult.issue,
      actionPlan: analysisResult.actionPlan,
      mediaUrl: capturedMedia?.url
    };
    setAnalysisHistory(prev => [entry, ...prev]);
    setIsSaved(true);
    setVoiceNotification("MISSION ARCHIVED SUCCESSFULLY");
    setTimeout(() => setVoiceNotification(null), 3000);
  };

  const reopenAnalysis = async (item: AnalysisHistoryEntry) => {
    setLoading(true);
    try {
      setActiveTab('analyze');
      setCapturedMedia({
        data: '', 
        type: item.mediaUrl?.includes('video') ? 'video/webm' : 'image/jpeg',
        url: item.mediaUrl || ''
      });
      setAnalysisResult({ issue: item.issue, actionPlan: item.actionPlan });
      setIsSaved(true);
      if (location) {
        const resources = await findLocalEcoResources(location, item.issue.title);
        setLocalResources(resources);
      }
      setSelectedHistoryItem(null);
    } catch (e) {
      setError("Failed to reconstruct tactical document.");
    } finally {
      setLoading(false);
    }
  };

  const stopAudioAnalysis = () => {
    setIsAudioAnalysisActive(false);
    if (sessionPromise) sessionPromise.then(s => s.close());
    setSessionPromise(null);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const triggerVoiceCommand = (command: string) => {
    const cmd = command.toLowerCase();
    if (cmd.includes("go to sensor") || cmd.includes("open camera") || cmd.includes("switch to analyze")) {
      setActiveTab('analyze');
      setVoiceNotification("NAVIGATING TO SENSOR HUB");
    } else if (cmd.includes("go to grid") || cmd.includes("open map") || cmd.includes("switch to grid")) {
      setActiveTab('local');
      setVoiceNotification("NAVIGATING TO SECTOR GRID");
    } else if (cmd.includes("go to pulse") || cmd.includes("check news") || cmd.includes("switch to pulse")) {
      setActiveTab('pulse');
      setVoiceNotification("NAVIGATING TO GLOBAL PULSE");
    } else if (cmd.includes("go to archive") || cmd.includes("check history") || cmd.includes("switch to archive")) {
      setActiveTab('history');
      setVoiceNotification("NAVIGATING TO MISSION ARCHIVE");
    } else if (cmd.includes("archive mission") || cmd.includes("save mission") || cmd.includes("save result")) {
      saveToHistory();
    }
    setTimeout(() => setVoiceNotification(null), 3000);
  };

  const toggleAudioAnalysis = async () => {
    if (isAudioAnalysisActive) {
      stopAudioAnalysis();
      return;
    }
    setIsAudioAnalysisActive(true);
    setTranscriptions([]);
    currentTranscriptionRef.current = { user: '', ai: '' };
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const outputAudioContext = audioContextRef.current;
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      const promise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const inputCtx = new AudioContext({ sampleRate: 16000 });
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
              promise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputAudioTranscription) {
              const text = message.serverContent.inputAudioTranscription.text;
              currentTranscriptionRef.current.user += text;
              setTranscriptions(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'user') return [...prev.slice(0, -1), { role: 'user', text: currentTranscriptionRef.current.user }];
                return [...prev, { role: 'user', text: currentTranscriptionRef.current.user }];
              });
              triggerVoiceCommand(text);
            }
            if (message.serverContent?.outputTranscription) {
              currentTranscriptionRef.current.ai += message.serverContent.outputTranscription.text;
              setTranscriptions(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'ai') return [...prev.slice(0, -1), { role: 'ai', text: currentTranscriptionRef.current.ai }];
                return [...prev, { role: 'ai', text: currentTranscriptionRef.current.ai }];
              });
            }
            if (message.serverContent?.turnComplete) currentTranscriptionRef.current = { user: '', ai: '' };
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
              const source = outputAudioContext.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNode);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: (e) => { setError("Live stream interrupted."); stopAudioAnalysis(); },
          onclose: () => setIsAudioAnalysisActive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: "You are the EcoGuard Live Audio Analyst. Help users identify environmental issues through their descriptions. Listen for commands like 'Go to Grid' or 'Archive this mission'."
        }
      });
      setSessionPromise(promise);
    } catch (err) { setError("Microphone access required."); setIsAudioAnalysisActive(false); }
  };

  const resetAnalysis = () => {
    setAnalysisResult(null);
    setCapturedMedia(null);
    setDetectedObjects([]);
    setLoading(false);
    setIsSaved(false);
    setLocalResources(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getImpactColor = (score: number) => {
    if (score <= 30) return 'text-emerald-400';
    if (score <= 60) return 'text-amber-400';
    return 'text-red-500';
  };

  const getImpactBg = (score: number) => {
    if (score <= 30) return 'bg-emerald-500';
    if (score <= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen pb-32 bg-slate-950 text-slate-100 font-['Inter'] selection:bg-emerald-500/30">
      {/* AR HUD STYLES */}
      <style>{`
        .ar-corner { position: absolute; width: 8px; height: 8px; border-color: inherit; }
        .ar-corner-tl { top: -2px; left: -2px; border-top-width: 2px; border-left-width: 2px; }
        .ar-corner-tr { top: -2px; right: -2px; border-top-width: 2px; border-right-width: 2px; }
        .ar-corner-bl { bottom: -2px; left: -2px; border-bottom-width: 2px; border-left-width: 2px; }
        .ar-corner-br { bottom: -2px; right: -2px; border-bottom-width: 2px; border-right-width: 2px; }
        
        @keyframes radar-sweep { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        .animate-radar-sweep { animation: radar-sweep 8s linear infinite; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 20s linear infinite; }
        @keyframes pulse-soft { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(0.98); } }
        .animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
      `}</style>

      {/* Hidden input for media upload */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,video/*" className="hidden" />

      {/* Voice Command Notification Overlay */}
      {voiceNotification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4">
          <div className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-[0.2em] shadow-2xl flex items-center gap-4 border border-white/20">
            <ZapFlash size={18} className="animate-pulse"/> {voiceNotification}
          </div>
        </div>
      )}

      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-emerald-500/5 to-transparent"></div>
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Leaf size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">ECOGUARD <span className="text-emerald-400">VANGUARD</span></h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Environmental Command</p>
            </div>
          </div>
          <button 
            onClick={toggleAudioAnalysis}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-black text-xs transition-all ${
              isAudioAnalysisActive ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
            }`}
          >
            {isAudioAnalysisActive ? <Mic size={16} /> : <MicOff size={16} />}
            {isAudioAnalysisActive ? 'LIVE SESSION ACTIVE' : 'LIVE AUDIO ANALYSIS'}
          </button>
        </div>
      </header>

      {/* Detail Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
          <div className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh] relative">
            <button onClick={() => setSelectedHistoryItem(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors p-2"><X size={28}/></button>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="aspect-video rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl bg-black">
                  {selectedHistoryItem.mediaUrl?.includes('video') ? (
                    <video src={selectedHistoryItem.mediaUrl} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={selectedHistoryItem.mediaUrl} className="w-full h-full object-cover" />
                  )}
                </div>
                <button 
                  onClick={() => reopenAnalysis(selectedHistoryItem)}
                  className="w-full py-5 bg-emerald-500 text-white rounded-[2rem] font-black text-xs shadow-xl flex items-center justify-center gap-3"
                >
                  <Activity size={20}/> REOPEN IN SENSOR HUD
                </button>
              </div>
              <div className="space-y-8">
                <h3 className="text-3xl font-black text-white tracking-tight leading-tight">{selectedHistoryItem.issue.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{selectedHistoryItem.issue.description}</p>
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Tactical Action Plan</h4>
                    {selectedHistoryItem.actionPlan.steps.map((step, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-[10px] font-black text-emerald-400">{i+1}</div>
                            <p className="text-xs text-slate-300">{step.step}</p>
                        </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pt-10">
        {activeTab === 'home' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={12}/> Planetary Intelligence Engine
                </div>
                <h2 className="text-6xl font-black leading-tight text-white tracking-tighter">
                  Identify, Analyze, <br /> <span className="text-emerald-400">Remediate.</span>
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed max-w-lg">
                  Deploy the EcoGuard Vanguard Sensor to detect environmental hazards in real-time. Fusing computer vision with planetary grounding.
                </p>
                <div className="flex gap-4">
                  <button onClick={() => setActiveTab('analyze')} className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black flex items-center gap-3 shadow-xl hover:scale-105 transition-all">
                    <Camera size={24}/> INITIALIZE SENSOR
                  </button>
                  <button onClick={() => setActiveTab('local')} className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black flex items-center gap-3 hover:bg-white/10 transition-all">
                    <MapIcon size={24}/> SECTOR GRID
                  </button>
                </div>
              </div>
              <div className="relative aspect-video bg-slate-900 border border-white/10 rounded-[4rem] overflow-hidden flex items-center justify-center group shadow-2xl">
                <div className="absolute inset-0 bg-emerald-500/5"></div>
                <Globe size={120} className="text-emerald-500/20 animate-spin-slow" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analyze' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 pb-20 relative">
            <div className="flex flex-col lg:flex-row gap-10">
              <div className="flex-1 space-y-6">
                {/* HUD Header with Mode Switcher and Live Scan Toggle */}
                <div className="flex items-center justify-between px-4">
                  <div className="flex gap-2 p-1 bg-slate-900 rounded-2xl border border-white/5">
                    <button onClick={() => setMediaMode('photo')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mediaMode === 'photo' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Photo</button>
                    <button onClick={() => setMediaMode('video')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mediaMode === 'video' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Video</button>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {isCameraOpen && !isRecording && (
                        <button 
                            onClick={() => setIsLiveScanning(!isLiveScanning)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isLiveScanning ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-slate-500 border border-white/10'}`}
                        >
                            <ScanIcon size={14}/> {isLiveScanning ? 'LIVE SCAN ACTIVE' : 'LIVE SCAN'}
                        </button>
                    )}
                    {isRecording && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-black">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        REC {formatTime(recordingTime)}
                        </div>
                    )}
                  </div>
                </div>

                <div className="relative bg-black rounded-[3rem] overflow-hidden aspect-video shadow-2xl border border-white/10 group">
                  {!isCameraOpen && !capturedMedia ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
                      <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                        <Camera size={48} className="text-emerald-400 opacity-50"/>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 px-6 w-full max-w-lg">
                        <button onClick={startCamera} className="flex-1 px-8 py-5 bg-emerald-500 text-white rounded-3xl font-black text-xs shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-4">
                          <Camera size={24}/> INITIALIZE LENS
                        </button>
                        <button onClick={handleUploadClick} className="flex-1 px-8 py-5 bg-white/5 border border-white/10 text-white rounded-3xl font-black text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-4">
                          <UploadCloud size={24}/> IMPORT INTEL
                        </button>
                      </div>
                    </div>
                  ) : isCameraOpen ? (
                    <div className="relative w-full h-full">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"/>
                      
                      {/* AR Overlays on Video */}
                      <div className="absolute inset-0 pointer-events-none z-20">
                         {detectedObjects.map((obj) => {
                            const [ymin, xmin, ymax, xmax] = obj.box_2d;
                            const isPollution = obj.category === 'pollution' || obj.category === 'waste';
                            const color = isPollution ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)';
                            
                            return (
                                <div 
                                    key={obj.id}
                                    className="absolute transition-all duration-1000 animate-pulse-soft pointer-events-auto cursor-help"
                                    style={{ 
                                        top: `${ymin / 10}%`, 
                                        left: `${xmin / 10}%`, 
                                        width: `${(xmax - xmin) / 10}%`, 
                                        height: `${(ymax - ymin) / 10}%`,
                                        borderColor: color
                                    }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedDetectionId(obj.id); }}
                                >
                                    {/* Tactical Corners */}
                                    <div className="ar-corner ar-corner-tl" />
                                    <div className="ar-corner ar-corner-tr" />
                                    <div className="ar-corner ar-corner-bl" />
                                    <div className="ar-corner ar-corner-br" />
                                    
                                    {/* Floating Label */}
                                    <div className="absolute -top-7 left-0 flex items-center gap-2">
                                        <div className="bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-sm border border-inherit flex items-center gap-1.5">
                                            <span className="text-[8px] font-black text-white uppercase tracking-tighter">{obj.label}</span>
                                            <span className="text-[7px] font-bold opacity-50 text-white">{Math.round(obj.score * 100)}%</span>
                                        </div>
                                    </div>

                                    {/* Selection Tooltip */}
                                    {selectedDetectionId === obj.id && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-48 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl z-50">
                                            <div className="flex items-center justify-between mb-2">
                                                <h5 className="text-[9px] font-black text-white uppercase tracking-widest">{obj.category} Intel</h5>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedDetectionId(null); }}><X size={10}/></button>
                                            </div>
                                            <p className="text-[9px] leading-relaxed text-slate-300 italic">"{obj.explanation}"</p>
                                        </div>
                                    )}
                                </div>
                            );
                         })}
                      </div>

                      <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 z-30">
                        {mediaMode === 'photo' ? (
                          <button onClick={startCaptureCountdown} className="w-20 h-20 bg-white rounded-full border-[10px] border-white/30 shadow-2xl active:scale-90 transition-all"></button>
                        ) : (
                          <div className="flex items-center gap-6 p-4 bg-black/40 backdrop-blur-xl rounded-[2.5rem] border border-white/10">
                            {!isRecording ? (
                              <button onClick={startRecording} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-all">
                                <VideoIcon size={32}/>
                              </button>
                            ) : (
                              <button onClick={stopRecordingAction} className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-950 shadow-xl active:scale-90 transition-all animate-pulse">
                                <StopCircle size={32}/>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <button onClick={stopCamera} className="absolute top-6 right-6 p-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white"><X size={24}/></button>
                    </div>
                  ) : (
                    <div className="relative w-full h-full bg-slate-900">
                      {capturedMedia?.type.startsWith('video/') ? (
                        <video src={capturedMedia.url} controls className="w-full h-full object-contain" autoPlay loop />
                      ) : (
                        <img src={capturedMedia?.url} className="w-full h-full object-cover"/>
                      )}
                      
                      {/* Post-Capture AR Overlays */}
                      {!capturedMedia?.type.startsWith('video/') && detectedObjects.map((obj) => {
                        const [ymin, xmin, ymax, xmax] = obj.box_2d;
                        const isPollution = obj.category === 'pollution' || obj.category === 'waste';
                        const color = isPollution ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)';
                        
                        return (
                          <div 
                            key={obj.id}
                            className="absolute border border-transparent transition-all group/detection cursor-help"
                            style={{ 
                                top: `${ymin / 10}%`, 
                                left: `${xmin / 10}%`, 
                                width: `${(xmax - xmin) / 10}%`, 
                                height: `${(ymax - ymin) / 10}%`,
                                borderColor: color
                            }}
                            onClick={() => setSelectedDetectionId(selectedDetectionId === obj.id ? null : obj.id)}
                          >
                            <div className="ar-corner ar-corner-tl" />
                            <div className="ar-corner ar-corner-tr" />
                            <div className="ar-corner ar-corner-bl" />
                            <div className="ar-corner ar-corner-br" />

                            <div className="absolute -top-7 left-0 backdrop-blur-md bg-slate-900/90 border border-inherit px-2 py-0.5 rounded-sm shadow-xl flex items-center gap-1.5 whitespace-nowrap z-40">
                              <span className="text-[9px] font-black text-white uppercase tracking-tighter">{obj.label}</span>
                            </div>

                            {selectedDetectionId === obj.id && (
                                <div className="absolute top-full left-0 mt-2 w-48 bg-slate-950/90 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95">
                                    <p className="text-[9px] text-slate-300 leading-relaxed font-medium">"{obj.explanation}"</p>
                                </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {capturedMedia && (
                  <div className="flex gap-4">
                    <button onClick={resetAnalysis} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                      <RotateCcw size={18}/> NEW SCAN
                    </button>
                    {!analysisResult && (
                      <button onClick={handleConfirmAnalysis} disabled={loading} className="flex-[2] py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">
                        {loading ? <Loader2 className="animate-spin"/> : <Activity size={18}/>} TACTICAL ANALYSIS
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {analysisResult && (
                <div className="w-full lg:w-96 space-y-6 animate-in slide-in-from-right-8">
                  <div className="bg-slate-900 border border-white/10 p-8 rounded-[3rem] shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20"></div>
                    <div className="mb-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Impact Score</h4>
                        <div className={`text-2xl font-black ${getImpactColor(analysisResult.issue.impactScore)}`}>{analysisResult.issue.impactScore}</div>
                      </div>
                      <div className="relative h-4 bg-black/40 rounded-xl overflow-hidden flex gap-1 p-1 border border-white/5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`flex-1 rounded-sm ${analysisResult.issue.impactScore >= (i + 1) * 10 ? getImpactBg(analysisResult.issue.impactScore) : 'bg-slate-800'}`}/>
                        ))}
                      </div>
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 leading-tight tracking-tight">{analysisResult.issue.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-8">{analysisResult.issue.description}</p>
                    <button onClick={saveToHistory} disabled={isSaved} className={`w-full py-4 rounded-2xl font-black text-[10px] tracking-widest flex items-center justify-center gap-3 transition-all ${isSaved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}>
                      {isSaved ? <ShieldCheck size={16}/> : <Bookmark size={16}/>}
                      {isSaved ? 'MISSION ARCHIVED' : 'SAVE TO VANGUARD LOG'}
                    </button>
                  </div>

                  {localResources && localResources.links.length > 0 && (
                    <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-[3rem] shadow-xl animate-in slide-in-from-bottom-4">
                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <MapIcon size={14}/> Intelligence Fusion
                      </h4>
                      <div className="space-y-4">
                        {localResources.links.slice(0, 3).map((link, i) => (
                          <a key={i} href={link.uri} target="_blank" className="block p-4 bg-blue-600/20 border border-blue-400/20 rounded-2xl hover:bg-blue-600/40 transition-all group">
                             <div className="flex items-center justify-between">
                               <span className="text-xs font-bold text-white group-hover:text-blue-200">{link.title}</span>
                               <ExternalLink size={12} className="text-blue-400"/>
                             </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'local' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 pb-32">
            <h2 className="text-5xl font-black text-white tracking-tighter uppercase">Regional Sector Grid</h2>
            <div className="h-[600px] bg-slate-900 rounded-[4rem] border border-white/10 relative overflow-hidden shadow-2xl">
               <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div className="grid grid-cols-12 h-full w-full">
                    {Array.from({ length: 144 }).map((_, i) => (
                      <div key={i} className="border-[0.5px] border-emerald-500/10 h-full w-full"></div>
                    ))}
                  </div>
               </div>
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.05)_45deg,rgba(16,185,129,0.1)_90deg,transparent_90deg)] rounded-full animate-radar-sweep pointer-events-none"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 {!sectorInitialized ? (
                   <button onClick={initializeSector} className="px-12 py-6 bg-emerald-500 text-white rounded-full font-black text-sm shadow-2xl hover:scale-105 transition-all flex items-center gap-4">
                     {isScanningSector ? <Loader2 className="animate-spin" /> : <Radar />} INITIALIZE REGIONAL SWEEP
                   </button>
                 ) : (
                   <span className="text-slate-700 text-[10px] font-black tracking-[1em] uppercase">Sector Active</span>
                 )}
               </div>
            </div>
          </div>
        )}

        {/* Pulse and History Views - Consistent styling */}
        {activeTab === 'pulse' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 pb-20">
            <h2 className="text-5xl font-black text-white tracking-tighter uppercase text-center">Global Eco-Pulse</h2>
            {newsPulse ? (
              <div className="bg-slate-900 border border-white/10 p-12 rounded-[4rem] shadow-2xl max-w-4xl mx-auto">
                <p className="text-slate-300 text-xl leading-relaxed font-medium mb-12">{newsPulse.text}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {newsPulse.links.map((l, i) => (
                    <a key={i} href={l.uri} target="_blank" className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-emerald-500/10 transition-all group">
                      <h4 className="text-white font-bold text-sm group-hover:text-emerald-400">{l.title}</h4>
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500 mt-4">Intelligence Source <ChevronRight size={12}/></div>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={64}/></div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 pb-20">
            <h2 className="text-5xl font-black text-white tracking-tighter uppercase text-center">Mission Archive</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analysisHistory.map((item) => (
                <div key={item.id} onClick={() => setSelectedHistoryItem(item)} className="bg-slate-900/50 border border-white/10 p-6 rounded-[2.5rem] hover:bg-white/10 transition-all cursor-pointer group relative overflow-hidden">
                  <div className="aspect-video w-full rounded-2xl overflow-hidden mb-5 bg-slate-800">
                    {item.mediaUrl && <img src={item.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                  </div>
                  <h4 className="text-lg font-black text-white group-hover:text-emerald-400">{item.issue.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-2">{item.issue.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 flex gap-4 p-4 bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl z-50">
        {[
          { id: 'analyze', icon: <Camera size={22} />, label: 'Sensor' },
          { id: 'history', icon: <History size={22} />, label: 'Archive' },
          { id: 'local', icon: <MapPin size={22} />, label: 'Grid' },
          { id: 'pulse', icon: <Newspaper size={22} />, label: 'Pulse' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all group ${activeTab === item.id ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}
          >
            {item.icon}
            {activeTab === item.id && <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>}
          </button>
        ))}
      </nav>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
