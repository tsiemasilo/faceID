import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, User, UserPlus, Loader, RefreshCw } from 'lucide-react';

interface SavedUser {
  name: string;
  descriptor: number[];
}

export default function App() {
  const [view, setView] = useState<'welcome' | 'name-input' | 'scanning' | 'recognition'>('welcome');
  const [isNewUser, setIsNewUser] = useState(false);
  const [userName, setUserName] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [recognizedUser, setRecognizedUser] = useState<string | null>(null);
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
    loadModels();
    loadSavedUsers();
    checkCameraPermission();
  }, []);

  const loadModels = async () => {
    try {
      setMessage('Loading AI models...');
      
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      setModelsLoaded(true);
      setMessage('');
    } catch (error) {
      console.error('Error loading models:', error);
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

  const startCamera = async (mode: 'user' | 'environment' = facingMode, keepExistingOnFail: boolean = false) => {
    const existingStream = streamRef.current;
    
    try {
      // Don't stop existing stream yet if we want to keep it on failure
      if (!keepExistingOnFail) {
        stopCamera();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      // If we got here, new stream is successful - now stop old one
      if (keepExistingOnFail && existingStream) {
        existingStream.getTracks().forEach(track => track.stop());
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Wait for video to be ready and play
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }
          
          const playVideo = () => {
            videoRef.current?.play()
              .then(() => {
                console.log('Camera started successfully');
                resolve();
              })
              .catch(reject);
          };
          
          // Check if metadata is already loaded
          if (videoRef.current.readyState >= 2) {
            playVideo();
          } else {
            videoRef.current.onloadedmetadata = playVideo;
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('Camera access error:', error);
      setMessage('Camera access is required for face recognition');
      
      // If we were keeping the existing stream and failed, restore it
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
    
    if (!canvas) return;

    const displaySize = { 
      width: video.videoWidth || 640, 
      height: video.videoHeight || 480 
    };
    
    faceapi.matchDimensions(canvas, displaySize);

    const detectFaces = async () => {
      if (!video.paused && !video.ended && isScanningRef.current) {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (detections.length > 0) {
          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              faceapi.draw.drawDetections(canvas, resizedDetections);
              faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

              if (isNewUser) {
                handleNewUserRegistration(detections[0]);
              } else {
                handleExistingUserRecognition(detections[0], resizedDetections[0]);
              }
            }
          }
        }

        requestAnimationFrame(detectFaces);
      }
    };

    detectFaces();
  };

  const handleNewUserRegistration = async (detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>) => {
    if (!userName) return;

    isScanningRef.current = false;
    setIsScanning(false);

    const descriptor = Array.from(detection.descriptor) as number[];
    const newUser: SavedUser = {
      name: userName,
      descriptor: descriptor
    };

    const updatedUsers = [...savedUsers, newUser];
    setSavedUsers(updatedUsers);
    localStorage.setItem('faceIdUsers', JSON.stringify(updatedUsers));

    stopCamera();
    setMessage(`✓ Face registered successfully for ${userName}!`);
    
    setTimeout(() => {
      setView('welcome');
      setUserName('');
      setMessage('');
    }, 3000);
  };

  const handleExistingUserRecognition = (
    detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>,
    resizedDetection: any
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
      
      setRecognizedUser(match.label);
      
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const box = resizedDetection.detection.box;
          ctx.fillStyle = '#4F46E5';
          ctx.font = 'bold 24px Arial';
          ctx.fillText(match.label, box.x, box.y - 10);
        }
      }
      
      stopCamera();
      setMessage(`✓ Welcome back, ${match.label}!`);
      
      setTimeout(() => {
        setView('welcome');
        setRecognizedUser(null);
        setMessage('');
      }, 2500);
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
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    // Temporarily stop face detection
    const wasScanning = isScanningRef.current;
    isScanningRef.current = false;
    
    // Try to start camera with new facing mode, keeping existing stream if it fails
    const success = await startCamera(newFacingMode, true);
    
    if (success) {
      // Only update state if camera switch succeeded
      setFacingMode(newFacingMode);
    } else {
      // Failed to switch - show message and keep current camera
      setMessage(`${newFacingMode === 'environment' ? 'Back' : 'Front'} camera not available`);
      setTimeout(() => setMessage(''), 2000);
    }
    
    // Resume face detection if it was running
    if (wasScanning) {
      isScanningRef.current = true;
      setTimeout(() => {
        startFaceDetection();
      }, 100);
    }
  };

  const handleNewUserFlow = async () => {
    setIsNewUser(true);
    setView('name-input');
  };

  const handleExistingUserFlow = async () => {
    setIsNewUser(false);
    
    let started = false;
    if (!cameraGranted) {
      started = await requestCameraAccess();
    } else {
      started = await startCamera();
    }
    
    if (!started) {
      setMessage('Failed to start camera. Please try again.');
      return;
    }
    
    // Only switch to scanning view after camera is ready
    setView('scanning');
    setIsScanning(true);
    isScanningRef.current = true;
    
    // Start face detection after camera is ready
    setTimeout(() => {
      startFaceDetection();
    }, 200);
  };

  const handleNameSubmit = async () => {
    if (!userName.trim()) {
      setMessage('Please enter your name');
      return;
    }

    setMessage('Starting camera...');

    let started = false;
    if (!cameraGranted) {
      started = await requestCameraAccess();
    } else {
      started = await startCamera();
    }

    if (!started) {
      setMessage('Failed to start camera. Please try again.');
      return;
    }

    // Only switch to scanning view after camera is ready
    setView('scanning');
    setIsScanning(true);
    isScanningRef.current = true;
    setMessage('Position your face in the frame...');
    
    // Start face detection after camera is ready
    setTimeout(() => {
      startFaceDetection();
    }, 200);
  };

  const handleBackToWelcome = () => {
    isScanningRef.current = false;
    stopCamera();
    setIsScanning(false);
    setView('welcome');
    setUserName('');
    setRecognizedUser(null);
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="p-6 bg-white shadow-sm">
          <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
            <Camera className="w-7 h-7" />
            Face ID Recognition
          </h1>
          <p className="text-sm text-gray-600 mt-1">iOS-style face authentication</p>
        </div>

        {/* Loading State */}
        {!modelsLoaded && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">{message || 'Initializing...'}</p>
            </div>
          </div>
        )}

        {/* Welcome Screen */}
        {modelsLoaded && view === 'welcome' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
              <Camera className="w-16 h-16 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 text-center">Welcome</h2>
            <p className="text-gray-600 text-center">Choose an option to continue</p>

            <div className="w-full space-y-4 mt-8">
              <button
                onClick={handleNewUserFlow}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg transition-all"
              >
                <UserPlus className="w-6 h-6" />
                New User
              </button>
              
              <button
                onClick={handleExistingUserFlow}
                className="w-full bg-white hover:bg-gray-50 text-indigo-600 py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-3 border-2 border-indigo-600 transition-all"
              >
                <User className="w-6 h-6" />
                Existing User
              </button>
            </div>

            {savedUsers.length > 0 && (
              <div className="mt-8 text-center">
                <p className="text-sm text-gray-500">
                  {savedUsers.length} registered user{savedUsers.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Name Input Screen */}
        {view === 'name-input' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">What's your name?</h2>
                <p className="text-gray-600 mt-2">We'll use this to identify you</p>
              </div>

              <div>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none text-lg"
                  onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
                />
              </div>

              {message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {message}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleNameSubmit}
                  disabled={!userName.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white py-3 px-6 rounded-xl font-semibold transition-all"
                >
                  Continue to Face Scan
                </button>
                
                <button
                  onClick={handleBackToWelcome}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold transition-all"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Screen */}
        {view === 'scanning' && (
          <div className="flex-1 flex flex-col p-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                {isNewUser ? 'Register Your Face' : 'Face Recognition'}
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                {isNewUser 
                  ? 'Position your face in the circle' 
                  : recognizedUser 
                    ? `Welcome back, ${recognizedUser}!` 
                    : 'Looking for your face...'}
              </p>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
              <div className="relative w-full max-w-sm aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                />
                
                {/* iOS-style scan overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-64 h-64">
                    {/* Animated scanning ring */}
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-full animate-pulse opacity-50"></div>
                    <div className="absolute inset-4 border-2 border-white rounded-full opacity-30"></div>
                    
                    {/* Corner brackets */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-white rounded-tl-3xl"></div>
                    <div className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-white rounded-tr-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-white rounded-bl-3xl"></div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-white rounded-br-3xl"></div>
                  </div>
                </div>

                {/* Flip Camera Button */}
                <button
                  onClick={flipCamera}
                  className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md hover:bg-white/30 text-white p-3 rounded-full shadow-lg transition-all pointer-events-auto"
                  aria-label="Flip camera"
                >
                  <RefreshCw className="w-6 h-6" />
                </button>
              </div>
            </div>

            {message && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-center font-medium">
                {message}
              </div>
            )}

            <button
              onClick={handleBackToWelcome}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
