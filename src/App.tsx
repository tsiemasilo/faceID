import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as faceapi from 'face-api.js';
import { Camera, User, UserPlus, Loader, RefreshCw, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SavedUser {
  name: string;
  descriptor: number[];
}

export default function App() {
  const [view, setView] = useState<'welcome' | 'name-input' | 'scanning' | 'success'>('welcome');
  const [isNewUser, setIsNewUser] = useState(false);
  const [userName, setUserName] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [recognizedUser, setRecognizedUser] = useState<string | null>(null);
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [detectionStatus, setDetectionStatus] = useState('Initializing...');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);
  const frameCountRef = useRef(0);
  const isNewUserRef = useRef(false);
  const userNameRef = useRef('');
  const isFlippingCameraRef = useRef(false);

  useEffect(() => {
    loadModels();
    loadSavedUsers();
    checkCameraPermission();
  }, []);

  const loadModels = async () => {
    try {
      console.log('🔄 Starting to load AI models...');
      setMessage('Loading AI models...');
      
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      
      console.log('✅ All models loaded successfully!');
      setModelsLoaded(true);
      setMessage('');
    } catch (error) {
      console.error('❌ Error loading models:', error);
      setMessage('Error loading face detection models');
    }
  };

  const loadSavedUsers = () => {
    const saved = localStorage.getItem('faceIdUsers');
    if (saved) {
      setSavedUsers(JSON.parse(saved));
    }
  };

  const checkCameraPermission = () => {
    const granted = localStorage.getItem('cameraPermissionGranted');
    if (granted === 'true') {
      setCameraGranted(true);
    }
  };

  const applyMobileConstraints = async (stream: MediaStream) => {
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as any;
        const advancedConstraints: any = {};
        
        if (capabilities?.focusMode?.includes?.('continuous')) {
          advancedConstraints.focusMode = 'continuous';
        }
        
        if (capabilities?.zoom) {
          advancedConstraints.zoom = 1.0;
        }
        
        if (Object.keys(advancedConstraints).length > 0) {
          await videoTrack.applyConstraints({
            advanced: [advancedConstraints]
          } as any);
        }
      }
    } catch (e) {
      console.log('⚠️ Could not apply advanced camera constraints:', e);
    }
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode, keepExistingOnFail: boolean = false) => {
    const existingStream = streamRef.current;
    
    try {
      if (!keepExistingOnFail) {
        stopCamera();
      }
      
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
        audio: false
      };
      
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        await applyMobileConstraints(stream);
      } catch (error) {
        const fallbackConstraints: MediaStreamConstraints = {
          video: {
            facingMode: { exact: mode },
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 },
          },
          audio: false
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          await applyMobileConstraints(stream);
        } catch (error2) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode },
            audio: false
          });
          await applyMobileConstraints(stream);
        }
      }
      
      if (keepExistingOnFail && existingStream) {
        existingStream.getTracks().forEach(track => track.stop());
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }
          
          const video = videoRef.current;
          let attempts = 0;
          const maxAttempts = 50;
          
          const checkVideoReady = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
              let playAttempts = 0;
              const maxPlayAttempts = 3;
              
              const tryPlay = () => {
                video.play()
                  .then(() => resolve())
                  .catch((error) => {
                    playAttempts++;
                    if (playAttempts < maxPlayAttempts && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
                      setTimeout(tryPlay, 100);
                    } else {
                      reject(error);
                    }
                  });
              };
              
              tryPlay();
            } else {
              attempts++;
              if (attempts >= maxAttempts) {
                reject(new Error('Video dimensions timeout'));
                return;
              }
              setTimeout(checkVideoReady, 100);
            }
          };
          
          video.onloadedmetadata = () => checkVideoReady();
          if (video.readyState >= 1) {
            checkVideoReady();
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('Camera access error:', error);
      setMessage('Camera access is required for face recognition');
      
      if (keepExistingOnFail && existingStream && videoRef.current) {
        videoRef.current.srcObject = existingStream;
        streamRef.current = existingStream;
      }
      
      return false;
    }
  };

  const requestCameraAccess = async () => {
    const started = await startCamera();
    if (started) {
      localStorage.setItem('cameraPermissionGranted', 'true');
      setCameraGranted(true);
    }
    return started;
  };

  const startFaceDetection = async () => {
    if (!videoRef.current || !modelsLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!canvas) {
      requestAnimationFrame(() => {
        if (isScanningRef.current) {
          startFaceDetection();
        }
      });
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestAnimationFrame(() => {
        if (isScanningRef.current) {
          startFaceDetection();
        }
      });
      return;
    }

    const displaySize = { 
      width: video.videoWidth, 
      height: video.videoHeight 
    };
    
    faceapi.matchDimensions(canvas, displaySize);

    const detectFaces = async () => {
      if (isScanningRef.current) {
        if (video.paused || video.ended) {
          if (!video.ended) {
            try {
              await video.play();
            } catch (error) {
              console.error('Failed to play video:', error);
            }
          } else {
            return;
          }
        }
        
        frameCountRef.current++;
        
        if (frameCountRef.current % 30 === 0) {
          console.log(`🔍 Detection loop running - Frame ${frameCountRef.current}`);
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            const detections = await faceapi
              .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
              .withFaceLandmarks()
              .withFaceDescriptors();

            if (detections.length > 0) {
              setDetectionStatus(`Face detected!`);
              
              const resizedDetections = faceapi.resizeResults(detections, displaySize);
              
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.save();
                  
                  if (facingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                  }
                  
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.restore();

                  if (isNewUserRef.current) {
                    handleNewUserRegistration(detections[0]);
                  } else {
                    handleExistingUserRecognition(detections[0], resizedDetections[0]);
                  }
                }
              }
            } else {
              if (frameCountRef.current % 30 === 0) {
                setDetectionStatus('Position your face in the oval...');
              }
            }
          } catch (error) {
            console.error('❌ Face detection error:', error);
            setDetectionStatus('Detection error');
          }
        } else {
          if (frameCountRef.current % 30 === 0) {
            setDetectionStatus('Initializing camera...');
          }
        }
        
        requestAnimationFrame(detectFaces);
      }
    };

    frameCountRef.current = 0;
    setDetectionStatus('Starting detection...');
    detectFaces();
  };

  const handleNewUserRegistration = async (detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>) => {
    const currentUserName = userNameRef.current;
    
    if (!currentUserName || !currentUserName.trim()) {
      setMessage('Error: Name not found. Please try again.');
      return;
    }

    if (!detection || !detection.descriptor) {
      setMessage('Error: Could not capture face data. Please try again.');
      return;
    }

    isScanningRef.current = false;
    setIsScanning(false);
    setDetectionStatus('Face captured!');

    try {
      const descriptor = Array.from(detection.descriptor) as number[];
      const newUser: SavedUser = {
        name: currentUserName,
        descriptor: descriptor
      };

      const updatedUsers = [...savedUsers, newUser];
      setSavedUsers(updatedUsers);
      localStorage.setItem('faceIdUsers', JSON.stringify(updatedUsers));

      stopCamera();
      setRecognizedUser(currentUserName);
      setView('success');
      
      setTimeout(() => {
        setView('welcome');
        setUserName('');
        setRecognizedUser(null);
        setMessage('');
        isNewUserRef.current = false;
        userNameRef.current = '';
      }, 3500);
    } catch (error) {
      console.error('❌ Error during registration:', error);
      setMessage('Error saving face data. Please try again.');
      isScanningRef.current = true;
      setIsScanning(true);
      
      if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        startFaceDetection();
      }
    }
  };

  const handleExistingUserRecognition = (
    detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>,
    _resizedDetection: any
  ) => {
    if (savedUsers.length === 0) {
      setMessage('No registered users found');
      return;
    }

    const labeledDescriptors = savedUsers.map(user => 
      new faceapi.LabeledFaceDescriptors(
        user.name,
        [new Float32Array(user.descriptor)]
      )
    );

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    const match = faceMatcher.findBestMatch(detection.descriptor);

    if (match.label !== 'unknown') {
      isScanningRef.current = false;
      setIsScanning(false);
      setDetectionStatus(`Recognized: ${match.label}`);
      setRecognizedUser(match.label);
      
      stopCamera();
      setView('success');
      
      setTimeout(() => {
        setView('welcome');
        setRecognizedUser(null);
        setMessage('');
      }, 3500);
    } else {
      setRecognizedUser(null);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const flipCamera = async () => {
    if (isFlippingCameraRef.current) return;
    
    isFlippingCameraRef.current = true;
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    const wasScanning = isScanningRef.current;
    
    if (wasScanning) {
      isScanningRef.current = false;
      setIsScanning(false);
    }
    
    const success = await startCamera(newFacingMode, true);
    
    if (success) {
      setFacingMode(newFacingMode);
      
      if (wasScanning && videoRef.current) {
        const video = videoRef.current;
        let attempts = 0;
        const maxAttempts = 50;
        
        const waitForReady = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= video.HAVE_ENOUGH_DATA) {
            isScanningRef.current = true;
            setIsScanning(true);
            frameCountRef.current = 0;
            startFaceDetection();
            isFlippingCameraRef.current = false;
          } else {
            attempts++;
            if (attempts >= maxAttempts) {
              setMessage('Camera flip timeout. Please try again.');
              isScanningRef.current = true;
              setIsScanning(true);
              startFaceDetection();
              isFlippingCameraRef.current = false;
              return;
            }
            requestAnimationFrame(waitForReady);
          }
        };
        
        waitForReady();
      } else {
        isFlippingCameraRef.current = false;
      }
    } else {
      setMessage(`${newFacingMode === 'environment' ? 'Back' : 'Front'} camera not available`);
      setTimeout(() => setMessage(''), 2000);
      
      if (wasScanning) {
        isScanningRef.current = true;
        setIsScanning(true);
        startFaceDetection();
      }
      
      isFlippingCameraRef.current = false;
    }
  };

  const handleNewUserFlow = async () => {
    setIsNewUser(true);
    isNewUserRef.current = true;
    setView('name-input');
  };

  const handleExistingUserFlow = async () => {
    if (savedUsers.length === 0) {
      setMessage('No registered users found. Please register as a new user first.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    
    setIsNewUser(false);
    isNewUserRef.current = false;
    setView('scanning');
    setIsScanning(false);
    isScanningRef.current = false;
    setDetectionStatus('Starting camera...');
    
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    
    let started = false;
    if (!cameraGranted) {
      started = await requestCameraAccess();
    } else {
      started = await startCamera();
    }
    
    if (!started) {
      setMessage('Failed to start camera. Please try again.');
      setView('welcome');
      return;
    }
    
    setIsScanning(true);
    isScanningRef.current = true;
    frameCountRef.current = 0;
    setDetectionStatus('Initializing detection...');
    
    requestAnimationFrame(() => {
      startFaceDetection();
    });
  };

  const handleNameSubmit = async () => {
    if (!userName.trim()) {
      setMessage('Please enter your name');
      return;
    }

    userNameRef.current = userName.trim();
    setView('scanning');
    setIsScanning(false);
    isScanningRef.current = false;
    setDetectionStatus('Starting camera...');
    setMessage('Starting camera...');

    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));

    let started = false;
    if (!cameraGranted) {
      started = await requestCameraAccess();
    } else {
      started = await startCamera();
    }

    if (!started) {
      setMessage('Failed to start camera. Please try again.');
      setView('name-input');
      return;
    }

    setIsScanning(true);
    isScanningRef.current = true;
    frameCountRef.current = 0;
    setDetectionStatus('Initializing detection...');
    setMessage('Position your face in the frame...');
    
    requestAnimationFrame(() => {
      startFaceDetection();
    });
  };

  const handleBackToWelcome = () => {
    isScanningRef.current = false;
    stopCamera();
    setIsScanning(false);
    setView('welcome');
    setUserName('');
    setRecognizedUser(null);
    setMessage('');
    frameCountRef.current = 0;
    setDetectionStatus('Initializing...');
    isNewUserRef.current = false;
    userNameRef.current = '';
    isFlippingCameraRef.current = false;
  };

  const pageVariants = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-6 bg-white/80 backdrop-blur-lg shadow-sm border-b border-purple-100"
        >
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
            <Camera className="w-7 h-7 text-indigo-600" />
            Face ID Recognition
          </h1>
          <p className="text-sm text-gray-600 mt-1">Advanced biometric authentication</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Loading State */}
          {!modelsLoaded && (
            <motion.div
              key="loading"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex items-center justify-center p-6"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Loader className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                </motion.div>
                <p className="text-gray-700 font-medium">{message || 'Initializing...'}</p>
              </div>
            </motion.div>
          )}

          {/* Welcome Screen */}
          {modelsLoaded && view === 'welcome' && (
            <motion.div
              key="welcome"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center p-6 space-y-6"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-32 h-32 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl"
              >
                <Camera className="w-16 h-16 text-white" />
              </motion.div>
              
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="text-3xl font-bold text-gray-800 text-center">Welcome</h2>
                <p className="text-gray-600 text-center mt-2">Choose an option to continue</p>
              </motion.div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="w-full space-y-4 mt-8"
              >
                <Button
                  onClick={handleNewUserFlow}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  <UserPlus className="w-6 h-6" />
                  New User Registration
                </Button>
                
                <Button
                  onClick={handleExistingUserFlow}
                  variant="secondary"
                  size="lg"
                  className="w-full"
                >
                  <User className="w-6 h-6" />
                  Existing User Login
                </Button>
              </motion.div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-8 text-center"
              >
                {savedUsers.length > 0 ? (
                  <p className="text-sm text-gray-500">
                    {savedUsers.length} registered user{savedUsers.length !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <div className="text-sm text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200 shadow-sm">
                    No registered users yet. Start by registering!
                  </div>
                )}
              </motion.div>
              
              {message && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center text-sm"
                >
                  {message}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Name Input Screen */}
          {view === 'name-input' && (
            <motion.div
              key="name-input"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center p-6"
            >
              <div className="w-full max-w-sm space-y-6">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="text-center"
                >
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <UserPlus className="w-10 h-10 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">What's your name?</h2>
                  <p className="text-gray-600 mt-2">We'll use this to identify you</p>
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:outline-none text-lg transition-all shadow-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
                  />
                </motion.div>

                {message && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
                  >
                    {message}
                  </motion.div>
                )}

                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-3"
                >
                  <Button
                    onClick={handleNameSubmit}
                    disabled={!userName.trim()}
                    size="lg"
                    className="w-full"
                  >
                    Continue to Face Scan
                  </Button>
                  
                  <Button
                    onClick={handleBackToWelcome}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    Back
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Scanning Screen */}
          {view === 'scanning' && (
            <motion.div
              key="scanning"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col p-6"
            >
              <motion.div 
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center mb-4"
              >
                <h2 className="text-xl font-bold text-gray-800">
                  {isNewUser ? 'Register Your Face' : 'Face Recognition'}
                </h2>
                <p className="text-gray-600 text-sm mt-1">
                  {isNewUser 
                    ? 'Position your face in the oval' 
                    : recognizedUser 
                      ? `Welcome back, ${recognizedUser}!` 
                      : 'Looking for your face...'}
                </p>
              </motion.div>

              <div className="relative flex-1 flex items-center justify-center">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative w-full max-w-sm aspect-[3/4] bg-black rounded-3xl overflow-hidden shadow-2xl"
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full"
                  />
                  
                  {/* Futuristic Face Guide Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative" style={{ width: '280px', height: '380px' }}>
                      {/* Main oval guide */}
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 border-4"
                        style={{ 
                          borderRadius: '50%',
                          borderColor: 'rgba(139, 92, 246, 0.7)',
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65), inset 0 0 30px rgba(99, 102, 241, 0.15), 0 0 40px rgba(99, 102, 241, 0.3)',
                          filter: 'drop-shadow(0 0 15px rgba(99, 102, 241, 0.4))'
                        }}
                      />
                      
                      {/* Scanning beam animation */}
                      {isScanning && (
                        <>
                          <motion.div
                            className="absolute left-0 right-0"
                            initial={{ top: '-10%', opacity: 0 }}
                            animate={{ 
                              top: '110%',
                              opacity: [0, 1, 1, 1, 0]
                            }}
                            transition={{
                              duration: 2.5,
                              repeat: Infinity,
                              ease: [0.4, 0, 0.2, 1]
                            }}
                            style={{ 
                              height: '4px',
                              background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.4) 15%, rgba(99, 102, 241, 1) 50%, rgba(139, 92, 246, 0.4) 85%, transparent 100%)',
                              boxShadow: '0 0 20px 4px rgba(99, 102, 241, 0.9), 0 0 40px 8px rgba(99, 102, 241, 0.6)',
                              zIndex: 10
                            }}
                          />
                          
                          <motion.div
                            className="absolute left-0 right-0"
                            initial={{ top: '-40px', opacity: 0 }}
                            animate={{ 
                              top: 'calc(110% - 40px)',
                              opacity: [0, 0.6, 0.6, 0.6, 0]
                            }}
                            transition={{
                              duration: 2.5,
                              repeat: Infinity,
                              ease: [0.4, 0, 0.2, 1]
                            }}
                            style={{ 
                              height: '80px',
                              background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.5) 0%, rgba(139, 92, 246, 0.3) 30%, transparent 70%)',
                              filter: 'blur(20px)',
                              zIndex: 5
                            }}
                          />
                        </>
                      )}
                      
                      {/* Pulsing inner ring */}
                      <motion.div 
                        animate={{ 
                          scale: [1, 1.02, 1],
                          opacity: [0.4, 0.7, 0.4]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="absolute inset-6 border-2 rounded-full"
                        style={{ 
                          borderColor: 'rgba(99, 102, 241, 0.5)',
                          boxShadow: 'inset 0 0 20px rgba(99, 102, 241, 0.2)'
                        }}
                      />
                      
                      {/* Corner indicators */}
                      {isScanning && (
                        <>
                          <motion.div 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                          />
                          <motion.div 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status indicator */}
                  {isScanning && (
                    <motion.div 
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="absolute top-6 left-0 right-0 flex flex-col items-center pointer-events-none"
                    >
                      <div className="bg-black/70 backdrop-blur-md text-white text-sm px-5 py-2 rounded-full shadow-lg">
                        {detectionStatus}
                      </div>
                    </motion.div>
                  )}

                  {/* Flip Camera Button */}
                  <motion.button
                    onClick={flipCamera}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md hover:bg-white/30 text-white p-3 rounded-full shadow-lg transition-all pointer-events-auto"
                    aria-label="Flip camera"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </motion.button>
                </motion.div>
              </div>

              {message && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-center font-medium"
                >
                  {message}
                </motion.div>
              )}

              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Button
                  onClick={handleBackToWelcome}
                  variant="outline"
                  size="lg"
                  className="mt-4 w-full"
                >
                  Cancel
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* Success Screen */}
          {view === 'success' && (
            <motion.div
              key="success"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.5 }}
                className="w-32 h-32 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl mb-6"
              >
                <Check className="w-16 h-16 text-white" />
              </motion.div>
              
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Success!</h2>
                <p className="text-xl text-gray-600">
                  {isNewUser ? (
                    <>Welcome, <span className="font-semibold text-indigo-600">{recognizedUser}</span>!</>
                  ) : (
                    <>Welcome back, <span className="font-semibold text-indigo-600">{recognizedUser}</span>!</>
                  )}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {isNewUser ? 'Face registered successfully' : 'Face recognized successfully'}
                </p>
              </motion.div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: 360 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="mt-8"
              >
                <Sparkles className="w-16 h-16 text-yellow-400" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
