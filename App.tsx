
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
  EyeOff, Layers2
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
  const [activeTab, setActiveTab] = useState<'home' | 'analyze' | 'local' | 'pulse' | 'history'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  
  // Media states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'photo' | 'video'>('photo');
  const [capturedMedia, setCapturedMedia] = useState<{data: string, type: string, url: string} | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [pinnedDetections, setPinnedDetections] = useState<DetectedObject[]>([]);
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);
  
  // Hover Preview states
  const [isHoveringUpload, setIsHoveringUpload] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // History states
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<AnalysisHistoryEntry | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    local: AnalysisHistoryEntry[];
    global: { text: string; links: GroundingLink[] } | null;
  } | null>(null);

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
  const [timerDelay, setTimerDelay] = useState<number>(0); // 0, 3, 5, 10
  const [countdown, setCountdown] = useState<number | null>(null);

  // AR Feedback states
  const [selectedDetection, setSelectedDetection] = useState<DetectedObject | null>(null);
  const [detectionComment, setDetectionComment] = useState('');
  const [feedbackLogs, setFeedbackLogs] = useState<DetectionFeedback[]>([]);

  // Local Sector Grid states
  const [isScanningSector, setIsScanningSector] = useState(false);
  const [sectorInitialized, setSectorInitialized] = useState(false);
  const [localNodes, setLocalNodes] = useState<SectorTask[]>([]);
  const [selectedNode, setSelectedNode] = useState<SectorTask | null>(null);
  const [reportingNode, setReportingNode] = useState(false);
  const [gridLayer, setGridLayer] = useState<'radar' | 'heat' | 'topo'>('radar');
  const [newBeaconPriority, setNewBeaconPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newBeaconType, setNewBeaconType] = useState<SectorTask['type']>('restoration');

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

  // Defined fetchPulse to fetch latest environmental news
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

    // Load history from localStorage
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
      stopPreviewStream();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ecoGuardHistory', JSON.stringify(analysisHistory));
  }, [analysisHistory]);

  const stopPreviewStream = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
  };

  const startPreviewStream = async () => {
    if (previewStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Failed to start preview stream", err);
    }
  };

  const initializeSector = async () => {
    if (!location) {
      setError("Awaiting GPS lock for sector initialization.");
      return;
    }
    
    setIsScanningSector(true);
    try {
      // Simulate real-time scanning delay
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

  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        const base64 = await fileToBase64(file);
        setCapturedMedia({ data: base64, type: file.type, url });
        
        if (file.type.startsWith('image/')) {
          try {
            const objects = await detectEnvironmentalObjects(base64);
            setDetectedObjects(objects);
          } catch (e) { console.error("Detection failed", e); }
        }
      }
    };
    input.click();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const localMatches = analysisHistory.filter(item => 
        item.issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.issue.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const globalInfo = await searchEnvironmentalIssue(searchQuery);
      setSearchResults({
        local: localMatches,
        global: globalInfo
      });
    } catch (err) {
      console.error("Search failed", err);
      setError("Tactical search failed to establish uplink.");
    } finally {
      setIsSearching(false);
    }
  };

  const startCamera = async () => {
    stopPreviewStream();
    setIsCameraOpen(true);
    setCapturedMedia(null);
    setDetectedObjects([]);
    setCountdown(null);
    setIsFlashOn(false);
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setIsSaved(false);
    setSearchResults(null);
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
      } else {
        setIsFlashSupported(false);
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
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  const toggleFlash = async () => {
    if (!videoTrackRef.current || !isFlashSupported) return;
    const newFlashState = !isFlashOn;
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: newFlashState }] as any
      });
      setIsFlashOn(newFlashState);
    } catch (err) {
      console.error("Failed to toggle flash", err);
    }
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
      stopCamera();
      try {
        const objects = await detectEnvironmentalObjects(base64);
        setDetectedObjects(objects);
      } catch (e) { console.error("Detection failed", e); }
    }
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    recordedChunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
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

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
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
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalysisHistory(prev => prev.filter(item => item.id !== id));
    if (selectedHistoryItem?.id === id) setSelectedHistoryItem(null);
  };

  const submitDetectionFeedback = (isCorrect: boolean) => {
    if (!selectedDetection) return;
    const log: DetectionFeedback = {
      detectionId: selectedDetection.id,
      label: selectedDetection.label,
      isCorrect,
      comment: detectionComment,
      timestamp: new Date().toISOString()
    };
    setFeedbackLogs(prev => [...prev, log]);
    setSelectedDetection(null);
    setDetectionComment('');
    alert(`Feedback logged: ${isCorrect ? 'Verified' : 'Flagged as incorrect'}`);
  };

  const togglePinDetection = (obj: DetectedObject) => {
    const isPinned = pinnedDetections.find(p => p.id === obj.id);
    if (isPinned) setPinnedDetections(prev => prev.filter(p => p.id !== obj.id));
    else setPinnedDetections(prev => [...prev, obj]);
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
              currentTranscriptionRef.current.user += message.serverContent.inputAudioTranscription.text;
              setTranscriptions(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'user') return [...prev.slice(0, -1), { role: 'user', text: currentTranscriptionRef.current.user }];
                return [...prev, { role: 'user', text: currentTranscriptionRef.current.user }];
              });
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
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
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
          systemInstruction: "You are the EcoGuard Live Audio Analyst. Help users identify environmental issues through their descriptions. Provide safety advice and identification tips."
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
    setSearchResults(null);
  };

  const toggleTimer = () => {
    const sequence = [0, 3, 5, 10];
    const currentIndex = sequence.indexOf(timerDelay);
    const nextIndex = (currentIndex + 1) % sequence.length;
    setTimerDelay(sequence[nextIndex]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isObjPinned = (id: string) => pinnedDetections.some(p => p.id === id);

  const clearHUD = () => setPinnedDetections([]);

  const locatePin = (id: string) => {
    setHighlightedPinId(id);
    setTimeout(() => setHighlightedPinId(null), 1500);
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

  const dropSimulatedBeacon = () => {
    if (!location) return;
    const newNode: SectorTask = {
      id: `field-${Date.now()}`,
      title: "Field Deployment Beacon",
      type: newBeaconType,
      priority: newBeaconPriority,
      latOffset: (Math.random() - 0.5) * 0.005,
      lngOffset: (Math.random() - 0.5) * 0.005,
      description: "Vanguard Operative manually deployed tactical beacon for ground-level ecological observation.",
      status: 'pending'
    };
    setLocalNodes(prev => [newNode, ...prev]);
    setReportingNode(false);
    setSelectedNode(newNode);
  };

  const getPriorityColor = (priority: string) => {
    if (priority === 'high') return 'bg-red-500';
    if (priority === 'medium') return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <div className="min-h-screen pb-32 bg-slate-950 text-slate-100">
      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none">
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

      {/* Node Briefing Modal */}
      {selectedNode && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${getPriorityColor(selectedNode.priority)}`}></div>
            <button onClick={() => setSelectedNode(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors p-2"><X size={28}/></button>
            
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-3xl ${
                  selectedNode.type === 'intelligence' ? 'bg-blue-500/10 text-blue-400' : 
                  selectedNode.type === 'pollution' ? 'bg-red-500/10 text-red-400' :
                  selectedNode.type === 'restoration' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-cyan-500/10 text-cyan-400'
                }`}>
                  {selectedNode.type === 'intelligence' ? <Globe size={32}/> : 
                   selectedNode.type === 'pollution' ? <AlertTriangle size={32}/> :
                   selectedNode.type === 'restoration' ? <TreePine size={32}/> :
                   <Navigation size={32}/>}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase text-white ${getPriorityColor(selectedNode.priority)}`}>
                      {selectedNode.priority} Priority
                    </span>
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.1em]">{selectedNode.type} Node</span>
                  </div>
                  <h3 className="text-2xl font-black text-white leading-tight">{selectedNode.title}</h3>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 p-6 rounded-3xl">
                <span className="text-[9px] font-black uppercase text-slate-500 block mb-2">Mission Parameters</span>
                <p className="text-sm font-medium text-slate-300 leading-relaxed italic">"{selectedNode.description}"</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                   <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">Coordinates</span>
                   <p className="text-[10px] font-bold text-slate-300">
                     {location?.latitude.toFixed(4)}N, {location?.longitude.toFixed(4)}E
                   </p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                   <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">Status</span>
                   <p className={`text-[10px] font-bold uppercase ${selectedNode.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {selectedNode.status}
                   </p>
                </div>
              </div>

              {selectedNode.uri ? (
                <a 
                  href={selectedNode.uri} 
                  target="_blank" 
                  className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-xs shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
                >
                  <ExternalLink size={18}/> OPEN INTELLIGENCE CHANNEL
                </a>
              ) : (
                <button 
                  onClick={() => {
                    const newNodes = localNodes.map(n => n.id === selectedNode.id ? {...n, status: 'in-progress'} : n);
                    setLocalNodes(newNodes as any);
                    setSelectedNode(null);
                  }}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
                >
                  <ZapIcon size={18}/> ACCEPT MISSION
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 pt-10">
        {activeTab === 'home' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={12}/> Environmental Intelligence
                </div>
                <h2 className="text-6xl font-black leading-tight text-white tracking-tighter">
                  Planetary Defense, <br /> <span className="text-emerald-400">Powered by Gemini.</span>
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed max-w-lg">
                  Analyze ecological threats in real-time, speak to specialized AI environmentalists, and contribute to a global knowledge base for earth restoration.
                </p>
                <div className="flex gap-4">
                  <button onClick={() => setActiveTab('analyze')} className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-emerald-500/30 hover:scale-105 transition-all">
                    <Camera size={24}/> INITIALIZE SENSOR
                  </button>
                  <button onClick={() => setActiveTab('pulse')} className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black flex items-center gap-3 hover:bg-white/10 transition-all">
                    <TrendingUp size={24}/> GLOBAL PULSE
                  </button>
                </div>
              </div>
              <div className="relative aspect-square md:aspect-video bg-slate-900 border border-white/10 rounded-[4rem] overflow-hidden flex items-center justify-center group shadow-2xl">
                <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors"></div>
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30 animate-pulse">
                    <Globe size={48} className="text-emerald-400"/>
                  </div>
                  <p className="text-xs font-black uppercase text-emerald-400 tracking-widest">Global Status: Active</p>
                  <p className="text-[10px] text-slate-500 max-w-xs mx-auto">Vanguard Engine v3.5 is monitoring environmental trends across 142 sectors.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: <Mic size={24}/>, title: "Live Audio", desc: "Activate real-time voice analysis to describe and identify flora, fauna, or pollutants hands-free." },
                { icon: <History size={24}/>, title: "Mission History", desc: "Access the Vanguard Archive to view past detections, tactical action plans, and mission logs." },
                { icon: <MapIcon size={24}/>, title: "Regional Grid", desc: "Access grounded intelligence from Google Maps and Search for local action." }
              ].map((card, i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] hover:bg-white/10 transition-all group border-b-4 border-b-transparent hover:border-b-emerald-500">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-emerald-400 mb-8 group-hover:scale-110 transition-transform">{card.icon}</div>
                  <h3 className="text-xl font-bold text-white mb-3">{card.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analyze' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 pb-20 relative">
            <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 shadow-2xl">
              <form onSubmit={handleSearch} className="flex gap-4">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={20}/>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="QUERY ENVIRONMENTAL THREATS OR PRIOR MISSIONS..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-xs font-black tracking-widest text-emerald-400 outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700 uppercase"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="px-8 bg-emerald-600 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-emerald-500 transition-all shadow-lg flex items-center gap-3">
                  {isSearching ? <Loader2 className="animate-spin" size={18}/> : <Crosshair size={18}/>}
                  {isSearching ? 'SCANNIG' : 'SEARCH'}
                </button>
              </form>
            </div>

            <div className="flex flex-col lg:flex-row gap-10">
              <div className="flex-1 space-y-6">
                <div className="relative bg-black rounded-[3rem] overflow-hidden aspect-video shadow-2xl border border-white/10 group">
                  {!isCameraOpen && !capturedMedia ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
                      <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                        <Camera size={48} className="text-emerald-400 opacity-50"/>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 px-6 w-full max-w-lg">
                        <button onClick={startCamera} className="flex-1 px-8 py-5 bg-emerald-500 text-white rounded-3xl font-black text-xs shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-4">
                          <Camera size={24}/> OPEN LENS
                        </button>
                        <button onClick={handleUploadClick} className="flex-1 px-8 py-5 bg-white/5 border border-white/10 text-white rounded-3xl font-black text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-4">
                          <UploadCloud size={24}/> UPLOAD PHOTO
                        </button>
                      </div>
                    </div>
                  ) : isCameraOpen ? (
                    <div className="relative w-full h-full">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"/>
                      <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 z-30">
                        <button onClick={startCaptureCountdown} className="w-20 h-20 bg-white rounded-full border-[10px] border-white/30 shadow-2xl active:scale-90 transition-all"></button>
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
                      {!capturedMedia?.type.startsWith('video/') && detectedObjects.map((obj) => {
                        const [ymin, xmin, ymax, xmax] = obj.box_2d;
                        return (
                          <div 
                            key={obj.id}
                            onClick={() => setSelectedDetection(obj)}
                            className="absolute border-2 transition-all rounded-xl flex flex-col items-start justify-start cursor-pointer group/item overflow-visible border-emerald-500 bg-emerald-500/5"
                            style={{ top: `${ymin / 10}%`, left: `${xmin / 10}%`, width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%` }}
                          >
                            <div className="absolute -top-6 left-0 backdrop-blur-md bg-slate-900/90 border border-white/10 px-2 py-0.5 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap z-40">
                              <Activity size={10} className="text-emerald-400"/>
                              <span className="text-[9px] font-black text-white uppercase tracking-tighter">
                                {obj.label} <span className="text-emerald-400">{Math.round(obj.score * 100)}%</span>
                              </span>
                            </div>
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
                        {loading ? <Loader2 className="animate-spin"/> : <Activity size={18}/>} ANALYZE THREATS
                      </button>
                    )}
                  </div>
                )}
              </div>
              {analysisResult && (
                <div className="w-full lg:w-96 space-y-6 animate-in slide-in-from-right-8">
                  <div className="bg-slate-900 border border-white/10 p-8 rounded-[3rem] shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20"></div>
                    <div className="mb-8 space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                          <Gauge size={14}/> Impact Threshold
                        </h4>
                        <div className={`text-2xl font-black tracking-tighter ${getImpactColor(analysisResult.issue.impactScore)}`}>
                          {analysisResult.issue.impactScore}<span className="text-[10px] text-slate-600 font-black ml-1 uppercase">Score</span>
                        </div>
                      </div>
                      <div className="relative h-4 bg-black/40 rounded-xl overflow-hidden flex gap-1 p-1 border border-white/5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`flex-1 rounded-sm transition-all duration-700 ${
                              analysisResult.issue.impactScore >= (i + 1) * 10 ? getImpactBg(analysisResult.issue.impactScore) : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <h3 className="text-2xl font-black text-white mb-3 leading-tight tracking-tight">{analysisResult.issue.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed mb-8">{analysisResult.issue.description}</p>
                    <button onClick={saveToHistory} disabled={isSaved} className={`mt-8 w-full py-4 rounded-2xl font-black text-[10px] tracking-widest transition-all flex items-center justify-center gap-3 ${isSaved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'}`}>
                      {isSaved ? <ShieldCheck size={16}/> : <Bookmark size={16}/>}
                      {isSaved ? 'MISSION ARCHIVED' : 'SAVE TO MISSION ARCHIVE'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'local' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 pb-32">
            <div className="flex flex-col md:flex-row gap-6 items-end justify-between">
              <div>
                <h2 className="text-5xl font-black text-white tracking-tighter">REGIONAL SECTOR GRID</h2>
                <p className="text-slate-400 text-lg mt-2 font-medium">Coordinate environmental defense via real-time tactical mapping.</p>
              </div>
              <div className="flex gap-3">
                 <button 
                  onClick={initializeSector} 
                  disabled={isScanningSector}
                  className="px-8 py-5 bg-emerald-600 text-white rounded-3xl font-black text-xs shadow-xl shadow-emerald-600/20 hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-50"
                 >
                   {isScanningSector ? <Loader2 className="animate-spin" size={20}/> : <Scan size={20}/>}
                   {sectorInitialized ? 'RE-SCAN SECTOR' : 'INITIALIZE SECTOR GRID'}
                 </button>
                 {sectorInitialized && (
                   <button 
                    onClick={() => setReportingNode(true)}
                    className="px-8 py-5 bg-blue-600 text-white rounded-3xl font-black text-xs shadow-xl shadow-blue-600/20 hover:scale-105 transition-all flex items-center gap-3"
                   >
                     <TargetIcon size={20}/> DEPLOY TASK BEACON
                   </button>
                 )}
              </div>
            </div>

            {!sectorInitialized && !isScanningSector ? (
              <div className="bg-slate-900/40 h-[600px] rounded-[4rem] border border-dashed border-white/10 flex flex-col items-center justify-center gap-8 group">
                 <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center text-slate-600 border border-white/5 group-hover:scale-110 transition-transform">
                   <Radar size={48} className="animate-pulse-slow"/>
                 </div>
                 <div className="text-center space-y-3">
                   <p className="text-sm font-black text-slate-500 uppercase tracking-[0.3em]">Sector Offline</p>
                   <p className="text-xs text-slate-600 max-w-xs px-6">System awaiting GPS handshake to map regional Intelligence Nodes.</p>
                 </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 h-[600px] bg-slate-900 rounded-[4rem] border border-white/10 relative overflow-hidden shadow-2xl group">
                   {/* Map Controls */}
                   <div className="absolute top-6 left-6 z-40 flex flex-col gap-3">
                      <div className="bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/10 flex flex-col gap-2">
                        {[
                          {id:'radar', icon:<Radar size={18}/>, label:'Tactical'},
                          {id:'heat', icon:<Flame size={18}/>, label:'Thermal'},
                          {id:'topo', icon:<Layers2 size={18}/>, label:'Grid'}
                        ].map(layer => (
                          <button 
                            key={layer.id}
                            onClick={() => setGridLayer(layer.id as any)}
                            className={`p-3 rounded-xl transition-all flex items-center gap-3 group/btn ${gridLayer === layer.id ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                          >
                            {layer.icon}
                            <span className="text-[9px] font-black uppercase tracking-widest hidden group-hover/btn:block">{layer.label}</span>
                          </button>
                        ))}
                      </div>
                   </div>

                   <div className={`absolute inset-0 pointer-events-none transition-all duration-1000 ${
                     gridLayer === 'heat' ? 'hue-rotate-[280deg] saturate-200' : 
                     gridLayer === 'topo' ? 'grayscale opacity-60' : 'opacity-20'
                   }`}>
                      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
                      <div className="grid grid-cols-12 h-full w-full">
                        {Array.from({ length: 144 }).map((_, i) => (
                          <div key={i} className="border-[0.5px] border-emerald-500/10 h-full w-full"></div>
                        ))}
                      </div>
                   </div>

                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.05)_45deg,rgba(16,185,129,0.1)_90deg,transparent_90deg)] rounded-full animate-radar-sweep pointer-events-none"></div>

                   {localNodes.map((node) => (
                     <button
                       key={node.id}
                       onClick={() => setSelectedNode(node)}
                       className={`absolute p-4 rounded-full transition-all hover:scale-125 z-20 group/node`}
                       style={{
                         top: `calc(50% + ${node.latOffset * 3000}%)`,
                         left: `calc(50% + ${node.lngOffset * 3000}%)`,
                       }}
                     >
                       <div className={`relative w-8 h-8 flex items-center justify-center rounded-2xl border-2 shadow-2xl bg-slate-950 transition-all ${
                         node.priority === 'high' ? 'border-red-500 animate-pulse-fast shadow-red-500/40' :
                         node.priority === 'medium' ? 'border-amber-500 animate-pulse-slow shadow-amber-500/40' :
                         'border-blue-500 shadow-blue-500/40'
                       }`}>
                         <div className={`absolute -top-2 -right-2 w-3 h-3 rounded-full border-2 border-slate-950 ${getPriorityColor(node.priority)}`}></div>
                         {node.type === 'intelligence' ? <Globe size={16} className="text-blue-400"/> : 
                          node.type === 'pollution' ? <AlertTriangle size={16} className="text-red-400"/> :
                          node.type === 'restoration' ? <TreePine size={16} className="text-emerald-400"/> :
                          <Navigation size={16} className="text-cyan-400"/>}
                       </div>
                     </button>
                   ))}

                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
                      <div className="w-10 h-10 bg-emerald-500/10 border-2 border-emerald-500 rounded-full flex items-center justify-center animate-ping duration-[3000ms]"></div>
                      <div className="absolute top-0 left-0 w-10 h-10 flex items-center justify-center">
                        <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-xl"></div>
                      </div>
                   </div>

                   <div className="absolute bottom-10 left-10 space-y-1 z-30 bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/5">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <Locate size={14}/>
                        <span className="text-[10px] font-black uppercase tracking-widest">Sector Active: {gridLayer}</span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-400">LOC: {location?.latitude.toFixed(6)}N / {location?.longitude.toFixed(6)}E</p>
                   </div>
                </div>

                <div className="h-[600px] flex flex-col gap-6">
                   <div className="flex-1 bg-white/5 border border-white/10 rounded-[3rem] p-8 flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Database size={14}/> Objectives
                        </h3>
                        <div className="flex gap-1">
                          {['high','medium','low'].map(p => (
                            <div key={p} className={`w-1.5 h-1.5 rounded-full ${getPriorityColor(p)}`}></div>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                        {localNodes.sort((a,b) => {
                          const p = {high:3, medium:2, low:1};
                          return p[b.priority] - p[a.priority];
                        }).map(node => (
                          <div 
                            key={node.id} 
                            onClick={() => setSelectedNode(node)}
                            className={`p-4 bg-slate-900/40 border-l-4 rounded-2xl hover:bg-emerald-500/5 transition-all cursor-pointer group ${
                              node.priority === 'high' ? 'border-red-500' :
                              node.priority === 'medium' ? 'border-amber-500' :
                              'border-blue-500'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-[11px] font-black text-white group-hover:text-emerald-400 line-clamp-1">{node.title}</h4>
                              <span className="text-[7px] font-black uppercase text-slate-500">{node.status}</span>
                            </div>
                            <p className="text-[9px] text-slate-500 line-clamp-1 italic">"{node.description}"</p>
                          </div>
                        ))}
                      </div>
                   </div>
                   
                   <div className="bg-emerald-600 p-8 rounded-[3rem] text-white shadow-xl shadow-emerald-600/20">
                      <h4 className="text-[10px] font-black uppercase tracking-widest mb-3">Field Readiness</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                           <span className="text-2xl font-black">{localNodes.filter(n => n.status === 'completed').length}/{localNodes.length}</span>
                           <span className="text-[9px] font-bold opacity-70">SECTOR CLEARANCE</span>
                        </div>
                        <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
                          <div className="h-full bg-white transition-all duration-1000" style={{width: `${(localNodes.filter(n=>n.status==='completed').length/localNodes.length)*100}%`}}></div>
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
            
            {reportingNode && (
               <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95">
                  <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
                     <div className="flex justify-between items-center mb-10">
                        <h3 className="text-3xl font-black text-white tracking-tighter uppercase">Drop Task Beacon</h3>
                        <button onClick={() => setReportingNode(false)} className="text-slate-500 hover:text-white transition-colors p-2"><X size={28}/></button>
                     </div>
                     <div className="space-y-8">
                        <div className="space-y-4">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Mission Priority</label>
                           <div className="grid grid-cols-3 gap-3">
                              {(['low', 'medium', 'high'] as const).map(p => (
                                <button 
                                  key={p}
                                  onClick={() => setNewBeaconPriority(p)}
                                  className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                                    newBeaconPriority === p 
                                    ? `${getPriorityColor(p)} text-white border-transparent shadow-lg` 
                                    : 'bg-white/5 text-slate-500 border-white/5 hover:border-white/20'
                                  }`}
                                >
                                  {p}
                                </button>
                              ))}
                           </div>
                        </div>

                        <div className="space-y-4">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Observation Category</label>
                           <div className="grid grid-cols-2 gap-3">
                              {(['restoration', 'pollution', 'habitat', 'intelligence'] as const).map(t => (
                                <button 
                                  key={t}
                                  onClick={() => setNewBeaconType(t)}
                                  className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                                    newBeaconType === t 
                                    ? 'bg-blue-500 text-white border-transparent shadow-lg' 
                                    : 'bg-white/5 text-slate-500 border-white/5 hover:border-white/20'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                           </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 pt-6">
                           <button onClick={dropSimulatedBeacon} className="w-full py-6 bg-emerald-500 text-white rounded-[2rem] font-black text-xs shadow-xl shadow-emerald-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                             <Check size={18}/> INITIALIZE DEPLOYMENT
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            )}
          </div>
        )}

        {activeTab === 'pulse' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 pb-20">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-5xl font-black text-white tracking-tighter">GLOBAL ECO-PULSE</h2>
              <p className="text-slate-400 text-lg">Real-time ecological trends and trending threats grounded in Search.</p>
            </div>
            {newsPulse ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-slate-900 border border-white/10 p-12 rounded-[4rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5"><Globe size={200}/></div>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Live Summary Feed</span>
                  </div>
                  <p className="text-slate-300 text-xl leading-relaxed font-medium mb-12">{newsPulse.text}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {newsPulse.links.map((l, i) => (
                      <a key={i} href={l.uri} target="_blank" className="p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all group">
                        <h4 className="text-white font-bold text-sm mb-3 group-hover:text-emerald-400 transition-colors">{l.title}</h4>
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500 group-hover:text-emerald-400 mt-4">
                          Explore Source <ChevronRight size={12}/>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="space-y-8">
                   <div className="bg-blue-600 p-10 rounded-[3rem] text-white shadow-xl shadow-blue-600/20">
                      <h3 className="text-xl font-black mb-6 flex items-center gap-3"><TrendingUp size={24}/> Sector Trends</h3>
                      <div className="space-y-5">
                        {[
                          { label: "Ocean Acidification", val: "Critical", color: "text-blue-100" },
                          { label: "Microplastic Saturation", val: "+14.2%", color: "text-red-200" },
                          { label: "Aridification Index", val: "Warning", color: "text-orange-200" },
                        ].map((t, i) => (
                          <div key={i} className="flex justify-between items-end border-b border-white/20 pb-4">
                            <span className="text-xs font-bold opacity-80">{t.label}</span>
                            <span className={`text-sm font-black ${t.color}`}>{t.val}</span>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="h-[500px] flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={64}/>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 pb-20">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-5xl font-black text-white tracking-tighter uppercase">Mission Archive</h2>
              <p className="text-slate-400 text-lg">Review past tactical assessments and action plans stored on your local node.</p>
            </div>
            {analysisHistory.length === 0 ? (
              <div className="h-[400px] bg-white/5 border border-dashed border-white/10 rounded-[4rem] flex flex-col items-center justify-center gap-6 text-slate-600 opacity-60">
                 <History size={80}/>
                 <p className="text-sm font-black uppercase tracking-[0.2em]">Archive is empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {analysisHistory.map((item) => (
                  <div key={item.id} onClick={() => setSelectedHistoryItem(item)} className="bg-slate-900/50 border border-white/10 p-6 rounded-[2.5rem] hover:bg-white/10 transition-all group cursor-pointer relative overflow-hidden">
                    <div className="aspect-video w-full rounded-2xl overflow-hidden mb-5 bg-slate-800">
                      {item.mediaUrl ? <img src={item.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center"><Camera className="text-slate-700" size={32}/></div>}
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md border border-red-500/20">{item.issue.severity}</span>
                        <span className="text-[8px] font-black text-slate-500 uppercase">{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors line-clamp-1">{item.issue.title}</h4>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.issue.description}</p>
                    </div>
                    <button onClick={(e) => deleteHistoryItem(item.id, e)} className="absolute bottom-6 right-6 p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash size={16}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 flex gap-4 p-4 bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl z-50">
        {[
          { id: 'home', icon: <LayoutGrid size={22} />, label: 'Home' },
          { id: 'analyze', icon: <Camera size={22} />, label: 'Sensor' },
          { id: 'history', icon: <History size={22} />, label: 'Archive' },
          { id: 'local', icon: <MapPin size={22} />, label: 'Grid' },
          { id: 'pulse', icon: <Newspaper size={22} />, label: 'Pulse' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-500 group relative ${
              activeTab === item.id ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'text-slate-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span className={`text-[10px] font-black uppercase tracking-widest transition-all overflow-hidden ${activeTab === item.id ? 'max-w-xs ml-1' : 'max-w-0'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.3); }

        @keyframes radar-sweep {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .animate-radar-sweep {
          animation: radar-sweep 8s linear infinite;
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        @keyframes pulse-fast {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .animate-pulse-fast {
          animation: pulse-fast 1s ease-in-out infinite;
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
