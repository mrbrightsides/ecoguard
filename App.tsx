
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
  PlayCircle, Eye as EyeIcon, Scan as ScanIcon, Box, Waves, Mountain,
  Radio, Map as MapAlt, Lock, Unlock
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
  const [pinnedDetections, setPinnedDetections] = useState<DetectedObject[]>([]);
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
      }, 3000); 
    } else {
      if (liveScanIntervalRef.current) clearInterval(liveScanIntervalRef.current);
      if (!capturedMedia) setDetectedObjects([]);
    }
    return () => { if (liveScanIntervalRef.current) clearInterval(liveScanIntervalRef.current); };
  }, [isLiveScanning, isCameraOpen, capturedMedia]);

  const togglePinDetection = (obj: DetectedObject) => {
    setPinnedDetections(prev => {
      const isPinned = prev.find(p => p.id === obj.id);
      if (isPinned) {
        setVoiceNotification("INTEL UNLOCKED");
        return prev.filter(p => p.id !== obj.id);
      } else {
        setVoiceNotification("INTEL PINNED TO HUD");
        return [...prev, obj];
      }
    });
    setTimeout(() => setVoiceNotification(null), 2000);
  };

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
    setPinnedDetections([]);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // CRITICAL: Mobile browsers need autoPlay, playsInline and sometimes muted to show stream
        videoRef.current.setAttribute('playsinline', 'true');
      }
      
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
        setPinnedDetections([]);
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
              const text = message.serverContent.outputTranscription.text;
              currentTranscriptionRef.current.ai += text;
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
    setPinnedDetections([]);
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
    <div className="min-h-screen pb-32 bg-slate-950 text-slate-100 font-['Inter'] selection:bg-emerald-500/30 overflow-x-hidden w-full">
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
        
        @keyframes vocalize { 0%, 100% { height: 4px; opacity: 0.4; } 50% { height: 20px; opacity: 1; } }
        .vocalizer-bar { animation: vocalize 1s ease-in-out infinite; }
        .vocalizer-bar:nth-child(2) { animation-delay: 0.2s; }
        .vocalizer-bar:nth-child(3) { animation-delay: 0.4s; }
        .vocalizer-bar:nth-child(4) { animation-delay: 0.1s; }
        .vocalizer-bar:nth-child(5) { animation-delay: 0.3s; }

        .topo-grid { background-image: radial-gradient(circle, rgba(16,185,129,0.1) 1px, transparent 1px); background-size: 40px 40px; }
        .topo-line { background-image: linear-gradient(rgba(16,185,129,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.05) 1px, transparent 1px); background-size: 80px 80px; }
      `}</style>

      {/* Hidden input for media upload */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,video/*" className="hidden" />

      {/* Voice Command Notification Overlay */}
      {voiceNotification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 w-[90%] sm:w-auto">
          <div className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] shadow-2xl flex items-center gap-4 border border-white/20 whitespace-nowrap overflow-hidden">
            <ZapFlash size={18} className="animate-pulse flex-shrink-0"/> {voiceNotification}
          </div>
        </div>
      )}

      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-emerald-500/5 to-transparent"></div>
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer overflow-hidden" onClick={() => setActiveTab('home')}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
              <Leaf size={22} className="text-white sm:w-7 sm:h-7" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm sm:text-xl font-black text-white tracking-tight whitespace-nowrap">ECOGUARD <span className="text-emerald-400">VANGUARD</span></h1>
              <p className="text-[7px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Environmental Command</p>
            </div>
          </div>
          <button 
            onClick={toggleAudioAnalysis}
            className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-black text-[9px] sm:text-xs transition-all flex-shrink-0 ${
              isAudioAnalysisActive ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
            }`}
          >
            {isAudioAnalysisActive ? <Mic size={14} /> : <MicOff size={14} />}
            <span className="hidden xs:inline">{isAudioAnalysisActive ? 'LIVE SESSION ACTIVE' : 'LIVE AUDIO ANALYSIS'}</span>
            <span className="xs:hidden">{isAudioAnalysisActive ? 'LIVE' : 'AUDIO'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 w-full overflow-hidden">
        {activeTab === 'home' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 w-full">
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8 w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={12}/> Planetary Intelligence Engine
                </div>
                <h2 className="text-4xl sm:text-6xl font-black leading-tight text-white tracking-tighter">
                  Identify, Analyze, <br /> <span className="text-emerald-400">Remediate.</span>
                </h2>
                <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-lg">
                  Deploy the EcoGuard Vanguard Sensor to detect environmental hazards in real-time. Fusing computer vision with planetary grounding.
                </p>
                <div className="flex flex-col xs:flex-row gap-4 w-full">
                  <button onClick={() => setActiveTab('analyze')} className="flex-1 px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:scale-105 transition-all text-sm">
                    <Camera size={20}/> INITIALIZE SENSOR
                  </button>
                  <button onClick={() => setActiveTab('local')} className="flex-1 px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-white/10 transition-all text-sm">
                    <MapIcon size={20}/> SECTOR GRID
                  </button>
                </div>
              </div>
              <div className="relative aspect-video w-full bg-slate-900 border border-white/10 rounded-[2rem] sm:rounded-[4rem] overflow-hidden flex items-center justify-center group shadow-2xl">
                <div className="absolute inset-0 bg-emerald-500/5"></div>
                <Globe size={80} className="text-emerald-500/20 animate-spin-slow sm:w-32 sm:h-32" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analyze' && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-6 pb-20 relative w-full overflow-hidden">
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-10">
              <div className="flex-1 space-y-6 w-full overflow-hidden">
                <div className="flex items-center justify-between px-2 sm:px-4">
                  <div className="flex gap-2 p-1 bg-slate-900 rounded-2xl border border-white/5">
                    <button onClick={() => setMediaMode('photo')} className={`px-4 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${mediaMode === 'photo' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Photo</button>
                    <button onClick={() => setMediaMode('video')} className={`px-4 sm:px-6 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${mediaMode === 'video' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Video</button>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-4">
                    {isCameraOpen && !isRecording && (
                        <button 
                            onClick={() => setIsLiveScanning(!isLiveScanning)}
                            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isLiveScanning ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-slate-500 border border-white/10'}`}
                        >
                            <ScanIcon size={12} className="sm:w-3.5 sm:h-3.5"/> <span>{isLiveScanning ? 'SCAN ON' : 'LIVE SCAN'}</span>
                        </button>
                    )}
                    {isRecording && (
                        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[9px] sm:text-[10px] font-black">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        REC {formatTime(recordingTime)}
                        </div>
                    )}
                  </div>
                </div>

                <div className="relative bg-black rounded-[2rem] sm:rounded-[3rem] overflow-hidden aspect-video shadow-2xl border border-white/10 group w-full">
                  {/* Live Audio Feedback HUD Component */}
                  {isAudioAnalysisActive && (
                    <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-[60] flex items-center gap-3 sm:gap-4 bg-slate-950/60 backdrop-blur-md p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-cyan-500/30 animate-in fade-in slide-in-from-left-4">
                      <div className="flex items-end gap-1 h-4 sm:h-5 w-6 sm:w-8">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="vocalizer-bar flex-1 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                        ))}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[7px] sm:text-[8px] font-black text-cyan-400 uppercase tracking-widest truncate">Voice Uplink Active</span>
                        <span className="text-[6px] sm:text-[7px] font-bold text-slate-400 uppercase truncate">Listening...</span>
                      </div>
                    </div>
                  )}

                  {/* Transcription Overlay (Subtitles) */}
                  {isAudioAnalysisActive && transcriptions.length > 0 && (
                    <div className="absolute bottom-24 sm:bottom-32 left-4 right-4 sm:left-10 sm:right-10 z-[60] pointer-events-none">
                      <div className="max-w-xl mx-auto space-y-2">
                        {transcriptions.slice(-2).map((t, i) => (
                          <div key={i} className={`flex gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 ${t.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-bold border backdrop-blur-md max-w-[85%] ${t.role === 'ai' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-100' : 'bg-slate-900/60 border-white/10 text-white'}`}>
                               <span className="opacity-50 mr-2 text-[7px] sm:text-[8px] font-black tracking-widest">{t.role === 'ai' ? 'AI:' : 'USER:'}</span>
                               {t.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isCameraOpen && !capturedMedia ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 sm:gap-8 p-6">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                        <Camera size={32} className="text-emerald-400 opacity-50 sm:w-12 sm:h-12"/>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
                        <button onClick={startCamera} className="flex-1 px-8 py-4 sm:py-5 bg-emerald-500 text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3">
                          <Camera size={18} className="sm:w-6 sm:h-6"/> INITIALIZE LENS
                        </button>
                        <button onClick={handleUploadClick} className="flex-1 px-8 py-4 sm:py-5 bg-white/5 border border-white/10 text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                          <UploadCloud size={18} className="sm:w-6 sm:h-6"/> IMPORT INTEL
                        </button>
                      </div>
                    </div>
                  ) : isCameraOpen ? (
                    <div className="relative w-full h-full">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 pointer-events-none z-20">
                         {[...detectedObjects, ...pinnedDetections].map((obj, index) => {
                            const [ymin, xmin, ymax, xmax] = obj.box_2d;
                            const isPinned = !!pinnedDetections.find(p => p.id === obj.id);
                            const isPollution = obj.category === 'pollution' || obj.category === 'waste';
                            const color = isPinned ? 'rgba(255, 255, 255, 1)' : (isPollution ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)');
                            
                            const isDuplicate = detectedObjects.find(d => d.id === obj.id) && pinnedDetections.find(p => p.id === obj.id) && obj.box_2d === pinnedDetections.find(p => p.id === obj.id)?.box_2d;
                            if (isDuplicate && detectedObjects.indexOf(obj) === -1) return null;

                            return (
                                <div 
                                    key={`${obj.id}-${index}`} 
                                    className={`absolute transition-all duration-1000 ${isPinned ? 'border-2' : 'animate-pulse-soft'} pointer-events-auto cursor-help`} 
                                    style={{ 
                                        top: `${ymin / 10}%`, 
                                        left: `${xmin / 10}%`, 
                                        width: `${(xmax - xmin) / 10}%`, 
                                        height: `${(ymax - ymin) / 10}%`, 
                                        borderColor: color,
                                        zIndex: isPinned ? 30 : 20
                                    }} 
                                    onClick={(e) => { e.stopPropagation(); setSelectedDetectionId(selectedDetectionId === obj.id ? null : obj.id); }}
                                >
                                    <div className="ar-corner ar-corner-tl" /><div className="ar-corner ar-corner-tr" /><div className="ar-corner ar-corner-bl" /><div className="ar-corner ar-corner-br" />
                                    <div className="absolute -top-7 left-0 flex items-center gap-1.5 sm:gap-2">
                                        <div className={`bg-slate-950/80 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded-sm border border-inherit flex items-center gap-1 sm:gap-1.5`}>
                                            {isPinned && <Lock size={8} className="text-white"/>}
                                            <span className="text-[7px] sm:text-[8px] font-black text-white uppercase tracking-tighter whitespace-nowrap">{obj.label}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); togglePinDetection(obj); }}
                                            className="bg-slate-950/90 p-0.5 sm:p-1 rounded-sm border border-white/20 text-white hover:bg-emerald-500 transition-colors"
                                        >
                                            {isPinned ? <PinOff size={10}/> : <Pin size={10}/>}
                                        </button>
                                    </div>
                                    {selectedDetectionId === obj.id && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-40 sm:w-48 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2 sm:p-3 rounded-xl shadow-2xl z-50">
                                            <p className="text-[8px] sm:text-[9px] leading-relaxed text-slate-300 italic">"{obj.explanation}"</p>
                                        </div>
                                    )}
                                </div>
                            );
                         })}
                      </div>
                      <div className="absolute bottom-6 sm:bottom-10 left-0 right-0 flex justify-center items-center gap-6 sm:gap-8 z-30">
                        {mediaMode === 'photo' ? (
                          <button onClick={startCaptureCountdown} className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full border-[6px] sm:border-[10px] border-white/30 shadow-2xl active:scale-90 transition-all"></button>
                        ) : (
                          <div className="flex items-center gap-4 sm:gap-6 p-3 sm:p-4 bg-black/40 backdrop-blur-xl rounded-full border border-white/10">
                            {!isRecording ? (<button onClick={startRecording} className="w-12 h-12 sm:w-16 sm:h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-all"><VideoIcon size={24} className="sm:w-8 sm:h-8"/></button>) : (<button onClick={stopRecordingAction} className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center text-slate-950 shadow-xl active:scale-90 transition-all animate-pulse"><StopCircle size={24} className="sm:w-8 sm:h-8"/></button>)}
                          </div>
                        )}
                      </div>
                      <button onClick={stopCamera} className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 sm:p-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl sm:rounded-2xl text-white"><X size={20} className="sm:w-6 sm:h-6"/></button>
                    </div>
                  ) : (
                    <div className="relative w-full h-full bg-slate-900">
                      {capturedMedia?.type.startsWith('video/') ? (<video src={capturedMedia.url} controls playsInline className="w-full h-full object-contain" autoPlay loop />) : (<img src={capturedMedia?.url} className="w-full h-full object-cover"/>)}
                      {!capturedMedia?.type.startsWith('video/') && [...detectedObjects, ...pinnedDetections].map((obj, index) => {
                        const [ymin, xmin, ymax, xmax] = obj.box_2d;
                        const isPinned = !!pinnedDetections.find(p => p.id === obj.id);
                        const isPollution = obj.category === 'pollution' || obj.category === 'waste';
                        const color = isPinned ? 'rgba(255, 255, 255, 1)' : (isPollution ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)');
                        
                        const isDuplicate = detectedObjects.find(d => d.id === obj.id) && pinnedDetections.find(p => p.id === obj.id);
                        if (isDuplicate && detectedObjects.indexOf(obj) === -1) return null;

                        return (
                          <div 
                            key={`${obj.id}-${index}`} 
                            className={`absolute border border-transparent transition-all group/detection cursor-help ${isPinned ? 'border-2' : ''}`} 
                            style={{ 
                                top: `${ymin / 10}%`, 
                                left: `${xmin / 10}%`, 
                                width: `${(xmax - xmin) / 10}%`, 
                                height: `${(ymax - ymin) / 10}%`, 
                                borderColor: color,
                                zIndex: isPinned ? 30 : 20
                            }} 
                            onClick={() => setSelectedDetectionId(selectedDetectionId === obj.id ? null : obj.id)}
                          >
                            <div className="ar-corner ar-corner-tl" /><div className="ar-corner ar-corner-tr" /><div className="ar-corner ar-corner-bl" /><div className="ar-corner ar-corner-br" />
                            <div className="absolute -top-7 left-0 backdrop-blur-md bg-slate-900/90 border border-inherit px-2 py-0.5 rounded-sm shadow-xl flex items-center gap-1.5 whitespace-nowrap z-40">
                                {isPinned && <Lock size={8} className="text-white"/>}
                                <span className="text-[8px] sm:text-[9px] font-black text-white uppercase tracking-tighter">{obj.label}</span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); togglePinDetection(obj); }}
                                    className="ml-2 bg-slate-800 p-0.5 rounded-sm text-white hover:text-emerald-400"
                                >
                                    {isPinned ? <PinOff size={10}/> : <Pin size={10}/>}
                                </button>
                            </div>
                            {selectedDetectionId === obj.id && (<div className="absolute top-full left-0 mt-2 w-40 sm:w-48 bg-slate-950/90 backdrop-blur-xl border border-white/10 p-2 sm:p-3 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95"><p className="text-[8px] sm:text-[9px] text-slate-300 leading-relaxed font-medium">"{obj.explanation}"</p></div>)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {capturedMedia && (
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
                    <button onClick={resetAnalysis} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-[10px] sm:text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2"><RotateCcw size={16} className="sm:w-4.5 sm:h-4.5"/> NEW SCAN</button>
                    {!analysisResult && (<button onClick={handleConfirmAnalysis} disabled={loading} className="flex-[2] py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] sm:text-xs shadow-lg flex items-center justify-center gap-3 hover:scale-[1.02] transition-all">{loading ? <Loader2 className="animate-spin w-4 h-4 sm:w-4.5 sm:h-4.5"/> : <Activity size={16} className="sm:w-4.5 sm:h-4.5"/>} TACTICAL ANALYSIS</button>)}
                  </div>
                )}
              </div>
              
              <div className="w-full lg:w-96 space-y-6 animate-in slide-in-from-right-8 overflow-hidden">
                {/* Pinned Intel Dashboard */}
                {pinnedDetections.length > 0 && (
                  <div className="bg-slate-900/50 border border-white/10 p-4 sm:p-6 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl w-full">
                    <h4 className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                      <Lock size={12}/> Pinned Intel ({pinnedDetections.length})
                    </h4>
                    <div className="space-y-2 sm:space-y-3">
                      {pinnedDetections.map(obj => (
                        <div key={obj.id} className="p-2 sm:p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between group">
                          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${obj.category === 'pollution' || obj.category === 'waste' ? 'bg-red-500' : 'bg-emerald-500'}`}/>
                            <span className="text-[8px] sm:text-[10px] font-bold text-white uppercase truncate">{obj.label}</span>
                          </div>
                          <button onClick={() => togglePinDetection(obj)} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 opacity-100 transition-opacity p-1">
                            <Trash2 size={12} className="sm:w-3.5 sm:h-3.5"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult && (
                  <div className="bg-slate-900 border border-white/10 p-6 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-xl relative overflow-hidden group w-full">
                    <div className="mb-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest">Impact Score</h4>
                        <div className={`text-xl sm:text-2xl font-black ${getImpactColor(analysisResult.issue.impactScore)}`}>{analysisResult.issue.impactScore}</div>
                      </div>
                      <div className="relative h-3 sm:h-4 bg-black/40 rounded-xl overflow-hidden flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 border border-white/5">
                        {Array.from({ length: 10 }).map((_, i) => (<div key={i} className={`flex-1 rounded-sm ${analysisResult.issue.impactScore >= (i + 1) * 10 ? getImpactBg(analysisResult.issue.impactScore) : 'bg-slate-800'}`}/>))}
                      </div>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-black text-white mb-2 sm:mb-3 leading-tight tracking-tight">{analysisResult.issue.title}</h3>
                    <p className="text-slate-400 text-[11px] sm:text-sm leading-relaxed mb-6 sm:mb-8">{analysisResult.issue.description}</p>
                    <button onClick={saveToHistory} disabled={isSaved} className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[8px] sm:text-[10px] tracking-widest flex items-center justify-center gap-3 transition-all ${isSaved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/50' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}>{isSaved ? <ShieldCheck size={14} className="sm:w-4 sm:h-4"/> : <Bookmark size={14} className="sm:w-4 sm:h-4"/>} {isSaved ? 'MISSION ARCHIVED' : 'SAVE TO VANGUARD LOG'}</button>
                  </div>
                )}
                
                {localResources && localResources.links.length > 0 && (
                  <div className="bg-blue-600/10 border border-blue-500/30 p-6 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-xl animate-in slide-in-from-bottom-4 w-full">
                    <h4 className="text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2"><MapIcon size={12} className="sm:w-3.5 sm:h-3.5"/> Intelligence Fusion</h4>
                    <div className="space-y-3 sm:space-y-4">{localResources.links.slice(0, 3).map((link, i) => (<a key={i} href={link.uri} target="_blank" className="block p-3 sm:p-4 bg-blue-600/20 border border-blue-400/20 rounded-xl sm:rounded-2xl hover:bg-blue-600/40 transition-all group"><div className="flex items-center justify-between gap-2"><span className="text-[10px] sm:text-xs font-bold text-white group-hover:text-blue-200 truncate">{link.title}</span><ExternalLink size={10} className="text-blue-400 flex-shrink-0"/></div></a>))}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'local' && (
          <div className="space-y-8 sm:space-y-10 animate-in fade-in slide-in-from-bottom-8 pb-32 w-full overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 sm:gap-6 md:items-center justify-between w-full">
              <div className="overflow-hidden">
                <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter uppercase truncate">Regional Sector Grid</h2>
                <p className="text-slate-400 text-[11px] sm:text-sm mt-1 sm:mt-2">Planetary grounding data visualized through multi-spectral tactical layers.</p>
              </div>
              
              <div className="flex gap-1.5 p-1 bg-slate-900 border border-white/10 rounded-2xl sm:rounded-3xl self-start overflow-x-auto w-full xs:w-auto no-scrollbar">
                <button 
                  onClick={() => setGridLayer('radar')} 
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${gridLayer === 'radar' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Radar size={14} className="sm:w-4 sm:h-4"/> Radar
                </button>
                <button 
                  onClick={() => setGridLayer('heat')} 
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${gridLayer === 'heat' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Flame size={14} className="sm:w-4 sm:h-4"/> Heatmap
                </button>
                <button 
                  onClick={() => setGridLayer('topo')} 
                  className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${gridLayer === 'topo' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <MapAlt size={14} className="sm:w-4 sm:h-4"/> Topo
                </button>
              </div>
            </div>

            <div className="relative h-[60vh] sm:h-[650px] bg-slate-900 rounded-[2rem] sm:rounded-[4rem] border border-white/10 overflow-hidden shadow-2xl group w-full">
               {/* RADAR LAYER */}
               {gridLayer === 'radar' && (
                 <>
                   <div className="absolute inset-0 opacity-15 pointer-events-none">
                      <div className="grid grid-cols-8 sm:grid-cols-12 h-full w-full">
                        {Array.from({ length: 96 }).map((_, i) => (<div key={i} className="border-[0.5px] border-emerald-500/10 h-full w-full"></div>))}
                      </div>
                   </div>
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.03)_45deg,rgba(16,185,129,0.08)_90deg,transparent_90deg)] rounded-full animate-radar-sweep pointer-events-none"></div>
                 </>
               )}

               {/* HEATMAP LAYER */}
               {gridLayer === 'heat' && (
                 <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-red-950/10"></div>
                    {localNodes.map(node => (
                      <div 
                        key={`heat-${node.id}`} 
                        className={`absolute w-64 h-64 sm:w-96 sm:h-96 blur-[80px] sm:blur-[120px] rounded-full mix-blend-screen opacity-40 animate-pulse-soft transition-all duration-1000 ${node.type === 'pollution' ? 'bg-red-500' : node.type === 'restoration' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ top: `calc(50% + ${node.latOffset * 2000}% - 128px)`, left: `calc(50% + ${node.lngOffset * 2000}% - 128px)` }}
                      />
                    ))}
                 </div>
               )}

               {/* TOPO LAYER */}
               {gridLayer === 'topo' && (
                 <div className="absolute inset-0 topo-grid topo-line opacity-20 pointer-events-none"></div>
               )}

               {/* Common Elements */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                 <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center animate-pulse">
                    <div className="w-2 h-2 sm:w-4 sm:h-4 bg-emerald-500 rounded-full border border-white shadow-xl"></div>
                 </div>
               </div>

               {/* Node Visualization */}
               <div className="absolute inset-0 p-6 sm:p-10 w-full h-full overflow-hidden">
                 {!sectorInitialized ? (
                   <div className="h-full w-full flex flex-col items-center justify-center gap-6 sm:gap-8 text-center px-4">
                     <div className="w-24 h-24 sm:w-32 sm:h-32 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center animate-pulse-soft">
                        <Radar size={32} className="text-emerald-500 sm:w-12 sm:h-12" />
                     </div>
                     <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">Sector Offline</h3>
                        <p className="text-slate-500 text-[11px] sm:text-sm max-w-xs mx-auto">Initialize sweep to sync with planetary intelligence data hubs.</p>
                        <button onClick={initializeSector} disabled={isScanningSector} className="px-8 py-4 bg-emerald-500 text-white rounded-full font-black text-xs sm:text-sm shadow-2xl hover:scale-105 transition-all flex items-center gap-3 mx-auto mt-4 sm:mt-6">
                            {isScanningSector ? <Loader2 className="animate-spin w-4 h-4" /> : <Radar size={18} />} {isScanningSector ? 'SYNCING...' : 'INITIALIZE SWEEP'}
                        </button>
                     </div>
                   </div>
                 ) : (
                   <div className="relative w-full h-full overflow-hidden">
                     {localNodes.map(node => (
                       <div 
                         key={node.id} 
                         className="absolute animate-in fade-in zoom-in-50 duration-500"
                         style={{ top: `calc(50% + ${node.latOffset * 2500}%)`, left: `calc(50% + ${node.lngOffset * 2500}%)` }}
                       >
                         <button 
                            onClick={() => setSelectedNode(node)}
                            className={`group/marker relative -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all ${selectedNode?.id === node.id ? 'scale-110 sm:scale-125 z-50' : 'hover:scale-110'}`}
                         >
                            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 shadow-2xl flex items-center justify-center transition-all ${
                              node.type === 'pollution' ? 'bg-red-500/20 border-red-500 text-red-500' :
                              node.type === 'restoration' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' :
                              'bg-blue-500/20 border-blue-500 text-blue-500'
                            }`}>
                               {node.type === 'pollution' ? <AlertTriangle size={12}/> : 
                                node.type === 'restoration' ? <TreePine size={12}/> : <Info size={12}/>}
                            </div>
                            
                            {(selectedNode?.id === node.id) && (
                              <div className="absolute bottom-full mb-3 w-48 sm:w-56 bg-slate-900/95 backdrop-blur-xl border border-white/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-2 pointer-events-auto">
                                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                                    <span className={`text-[7px] sm:text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm ${getImpactBg(node.priority === 'high' ? 80 : 40)}`}>{node.type}</span>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedNode(null); }} className="text-slate-500 p-1"><X size={10}/></button>
                                </div>
                                <h4 className="text-[10px] sm:text-xs font-black text-white mb-1.5 sm:mb-2">{node.title}</h4>
                                <p className="text-[9px] sm:text-[10px] text-slate-400 leading-relaxed mb-3 sm:mb-4 line-clamp-3">{node.description}</p>
                                {node.uri && (
                                  <a href={node.uri} target="_blank" className="flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black text-emerald-400 uppercase tracking-widest hover:text-white transition-colors">
                                    Access Intel <ExternalLink size={10}/>
                                  </a>
                                )}
                              </div>
                            )}
                         </button>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
            </div>
            
            {sectorInitialized && (
                <div className="grid grid-cols-3 gap-3 sm:gap-6 animate-in slide-in-from-bottom-4 w-full">
                    <div className="bg-slate-900 border border-white/10 p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-left">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-red-500/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-red-500 flex-shrink-0"><AlertTriangle size={18} className="sm:w-6 sm:h-6"/></div>
                        <div className="overflow-hidden">
                            <h4 className="text-base sm:text-xl font-black text-white truncate">{localNodes.filter(n => n.type === 'pollution').length}</h4>
                            <p className="text-[6px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">Hazards</p>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-white/10 p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-left">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-emerald-500/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-emerald-500 flex-shrink-0"><TreePine size={18} className="sm:w-6 sm:h-6"/></div>
                        <div className="overflow-hidden">
                            <h4 className="text-base sm:text-xl font-black text-white truncate">{localNodes.filter(n => n.type === 'restoration').length}</h4>
                            <p className="text-[6px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">Growth</p>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-white/10 p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-left">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-500/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-500 flex-shrink-0"><Database size={18} className="sm:w-6 sm:h-6"/></div>
                        <div className="overflow-hidden">
                            <h4 className="text-base sm:text-xl font-black text-white truncate">{localNodes.filter(n => n.type === 'intelligence').length}</h4>
                            <p className="text-[6px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">Nodes</p>
                        </div>
                    </div>
                </div>
            )}
          </div>
        )}

        {/* Pulse and History Views - Consistent styling */}
        {activeTab === 'pulse' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 pb-20 w-full">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter uppercase text-center">Global Eco-Pulse</h2>
            {newsPulse ? (
              <div className="bg-slate-900 border border-white/10 p-6 sm:p-12 rounded-[2rem] sm:rounded-[4rem] shadow-2xl max-w-4xl mx-auto w-full">
                <p className="text-slate-300 text-base sm:text-xl leading-relaxed font-medium mb-8 sm:mb-12">{newsPulse.text}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {newsPulse.links.map((l, i) => (
                    <a key={i} href={l.uri} target="_blank" className="p-4 sm:p-6 bg-white/5 rounded-2xl sm:rounded-3xl border border-white/5 hover:bg-emerald-500/10 transition-all group overflow-hidden">
                      <h4 className="text-white font-bold text-xs sm:text-sm group-hover:text-emerald-400 line-clamp-2">{l.title}</h4>
                      <div className="flex items-center gap-2 text-[7px] sm:text-[9px] font-black uppercase text-slate-500 mt-4">Source <ChevronRight size={12}/></div>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={48}/></div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 pb-20 w-full">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter uppercase text-center">Mission Archive</h2>
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full">
              {analysisHistory.map((item) => (
                <div key={item.id} onClick={() => setSelectedHistoryItem(item)} className="bg-slate-900/50 border border-white/10 p-4 sm:p-6 rounded-[2rem] hover:bg-white/10 transition-all cursor-pointer group relative overflow-hidden w-full">
                  <div className="aspect-video w-full rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 bg-slate-800">
                    {item.mediaUrl && <img src={item.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                  </div>
                  <h4 className="text-sm sm:text-lg font-black text-white group-hover:text-emerald-400 truncate">{item.issue.title}</h4>
                  <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-2 mt-2">{item.issue.description}</p>
                </div>
              ))}
              {analysisHistory.length === 0 && (
                <div className="col-span-full py-20 text-center text-slate-500">
                  <History size={48} className="mx-auto mb-4 opacity-20"/>
                  <p className="font-bold uppercase tracking-widest text-[10px]">No Archived Missions Found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[95vh] relative no-scrollbar">
            <button onClick={() => setSelectedHistoryItem(null)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-slate-500 hover:text-white transition-colors p-2 bg-black/40 rounded-full z-10"><X size={24}/></button>
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8 sm:gap-10 mt-6 lg:mt-0">
              <div className="space-y-6">
                <div className="aspect-video rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl bg-black">
                  {selectedHistoryItem.mediaUrl?.includes('video') ? (
                    <video src={selectedHistoryItem.mediaUrl} controls playsInline className="w-full h-full object-contain" />
                  ) : (
                    <img src={selectedHistoryItem.mediaUrl} className="w-full h-full object-cover" />
                  )}
                </div>
                <button 
                  onClick={() => reopenAnalysis(selectedHistoryItem)}
                  className="w-full py-4 sm:py-5 bg-emerald-500 text-white rounded-[1.5rem] sm:rounded-[2rem] font-black text-[10px] sm:text-xs shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  <Activity size={18}/> REOPEN IN SENSOR HUD
                </button>
              </div>
              <div className="space-y-6 sm:space-y-8">
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">{selectedHistoryItem.issue.title}</h3>
                <p className="text-slate-400 text-[11px] sm:text-sm leading-relaxed">{selectedHistoryItem.issue.description}</p>
                <div className="space-y-4">
                    <h4 className="text-[9px] sm:text-[10px] font-black uppercase text-emerald-400 tracking-widest">Tactical Action Plan</h4>
                    <div className="space-y-3">
                      {selectedHistoryItem.actionPlan.steps.map((step, i) => (
                          <div key={i} className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-emerald-400">{i+1}</div>
                              <p className="text-[11px] sm:text-xs text-slate-300 leading-normal">{step.step}</p>
                          </div>
                      ))}
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex gap-2 sm:gap-4 p-2 sm:p-4 bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-full sm:rounded-[2.5rem] shadow-2xl z-50 w-[90%] sm:w-auto max-w-sm sm:max-w-none">
        {[
          { id: 'analyze', icon: <Camera size={20} />, label: 'Sensor' },
          { id: 'history', icon: <History size={20} />, label: 'Archive' },
          { id: 'local', icon: <MapPin size={20} />, label: 'Grid' },
          { id: 'pulse', icon: <Newspaper size={20} />, label: 'Pulse' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex-1 flex items-center justify-center gap-3 px-3 sm:px-6 py-3 sm:py-4 rounded-full transition-all group ${activeTab === item.id ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}
          >
            {item.icon}
            {activeTab === item.id && <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">{item.label}</span>}
          </button>
        ))}
      </nav>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
