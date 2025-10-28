import { useState, useEffect, useRef } from 'react';
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
      
      console.log('⚙️ Setting TensorFlow backend to CPU...');
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      console.log('✅ TensorFlow backend ready');
      
      const MODEL_URL = '/models';
      console.log('📦 Loading models from:', MODEL_URL);
      
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

  // Helper function to apply mobile-optimized camera constraints
  const applyMobileConstraints = async (stream: MediaStream) => {
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as any;
        
        // Build advanced constraints based on what's supported
        const advancedConstraints: any = {};
        
        if (capabilities?.focusMode?.includes?.('continuous')) {
          advancedConstraints.focusMode = 'continuous';
        }
        
        if (capabilities?.zoom) {
          advancedConstraints.zoom = 1.0;
        }
        
        // Apply constraints if we have any
        if (Object.keys(advancedConstraints).length > 0) {
          await videoTrack.applyConstraints({
            advanced: [advancedConstraints]
          } as any);
          console.log('✅ Applied mobile camera constraints:', advancedConstraints);
        }
      }
    } catch (e) {
      console.log('⚠️ Could not apply advanced camera constraints (browser may not support):', e);
    }
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode, keepExistingOnFail: boolean = false) => {
    const existingStream = streamRef.current;
    
    try {
      // Don't stop existing stream yet if we want to keep it on failure
      if (!keepExistingOnFail) {
        stopCamera();
      }
      
      // Mobile-optimized constraints with fallbacks
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
        console.log('Failed with ideal constraints, trying exact facingMode...', error);
        // Fallback: try with exact facingMode for better mobile support
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
          console.log('Failed with exact facingMode, trying basic constraints...', error2);
          // Final fallback: basic constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: mode,
            },
            audio: false
          });
          await applyMobileConstraints(stream);
        }
      }
      
      // If we got here, new stream is successful - now stop old one
      if (keepExistingOnFail && existingStream) {
        existingStream.getTracks().forEach(track => track.stop());
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Wait for video to be ready with proper dimensions
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video element not found'));
            return;
          }
          
          const video = videoRef.current;
          let attempts = 0;
          const maxAttempts = 50; // 5 seconds max
          
          const checkVideoReady = () => {
            // Check if video has dimensions and is ready to play
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
              console.log('Camera ready with dimensions:', video.videoWidth, 'x', video.videoHeight);
              
              // Retry play() on recoverable errors
              let playAttempts = 0;
              const maxPlayAttempts = 3;
              
              const tryPlay = () => {
                video.play()
                  .then(() => {
                    console.log('Camera started successfully');
                    resolve();
                  })
                  .catch((error) => {
                    playAttempts++;
                    if (playAttempts < maxPlayAttempts && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
                      console.log(`Play attempt ${playAttempts} failed, retrying...`, error.name);
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
              // Check again in 100ms
              setTimeout(checkVideoReady, 100);
            }
          };
          
          // Start checking immediately
          video.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            checkVideoReady();
          };
          
          // Also check if metadata is already loaded
          if (video.readyState >= 1) {
            checkVideoReady();
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
    console.log('🔵 startFaceDetection called', { 
      hasVideo: !!videoRef.current, 
      modelsLoaded,
      hasCanvas: !!canvasRef.current,
      isScanningRef: isScanningRef.current,
      videoElement: videoRef.current ? {
        videoWidth: videoRef.current.videoWidth,
        videoHeight: videoRef.current.videoHeight,
        readyState: videoRef.current.readyState,
        paused: videoRef.current.paused,
        ended: videoRef.current.ended
      } : null
    });

    if (!videoRef.current || !modelsLoaded) {
      console.error('❌ Face detection not started: video or models not ready', {
        hasVideo: !!videoRef.current,
        modelsLoaded
      });
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!canvas) {
      console.error('Face detection not started: canvas not ready');
      // Retry until canvas is ready
      requestAnimationFrame(() => {
        if (isScanningRef.current) {
          startFaceDetection();
        }
      });
      return;
    }

    // Retry until video has dimensions (with safety limit)
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('Video dimensions not ready yet, retrying...', { 
        width: video.videoWidth, 
        height: video.videoHeight,
        readyState: video.readyState
      });
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
    
    console.log('✅ Starting face detection with size:', displaySize);
    faceapi.matchDimensions(canvas, displaySize);

    const detectFaces = async () => {
      // Check scanning state first, then video state
      if (isScanningRef.current) {
        // If video is paused or ended, try to resume it
        if (video.paused || video.ended) {
          if (!video.ended) {
            console.log('⚠️ Video is paused, attempting to play...');
            try {
              await video.play();
            } catch (error) {
              console.error('Failed to play video:', error);
            }
          } else {
            console.log('🛑 Video has ended, stopping detection');
            return;
          }
        }
        
        // Increment frame counter
        frameCountRef.current++;
        
        // Log every 30 frames to avoid flooding console
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
              console.log(`✅ Face detected! Count: ${detections.length}, Frame: ${frameCountRef.current}`);
              setDetectionStatus(`Face detected! (${detections.length})`);
              
              const resizedDetections = faceapi.resizeResults(detections, displaySize);
              
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Save the current transform state
                  ctx.save();
                  
                  // Mirror the canvas if front camera to match the mirrored video
                  if (facingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                  }
                  
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  
                  // Face model visualization hidden for privacy
                  // faceapi.draw.drawDetections(canvas, resizedDetections);
                  // faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

                  // Restore the transform state
                  ctx.restore();

                  // Use refs to avoid stale closure values
                  console.log('🎯 Face detected - checking registration type', {
                    isNewUser: isNewUserRef.current,
                    userName: userNameRef.current,
                    frame: frameCountRef.current
                  });

                  if (isNewUserRef.current) {
                    handleNewUserRegistration(detections[0]);
                  } else {
                    handleExistingUserRecognition(detections[0], resizedDetections[0]);
                  }
                }
              }
            } else {
              // Update status when no face is detected
              if (frameCountRef.current % 30 === 0) {
                setDetectionStatus('Scanning for faces...');
              }
            }
          } catch (error) {
            console.error('❌ Face detection error:', error);
            setDetectionStatus('Detection error');
          }
        } else {
          // Video not ready
          if (frameCountRef.current % 30 === 0) {
            console.log('⏳ Video not ready yet, readyState:', video.readyState);
            setDetectionStatus('Waiting for video...');
          }
        }
        
        // Always request next frame to keep the loop running
        requestAnimationFrame(detectFaces);
      } else {
        console.log('🛑 Detection loop stopped', {
          paused: video.paused,
          ended: video.ended,
          isScanningRef: isScanningRef.current
        });
      }
    };

    console.log('🚀 Initiating detectFaces loop...', {
      isScanningRef: isScanningRef.current,
      videoReady: !video.paused && !video.ended,
      displaySize
    });
    frameCountRef.current = 0;
    setDetectionStatus('Starting detection...');
    detectFaces();
  };

  const handleNewUserRegistration = async (detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>) => {
    console.log('🚀 handleNewUserRegistration called', {
      hasDetection: !!detection,
      hasDescriptor: !!detection?.descriptor,
      userName: userNameRef.current,
      userNameState: userName,
      savedUsersCount: savedUsers.length
    });

    // Check userName from ref (which should be current)
    const currentUserName = userNameRef.current;
    
    if (!currentUserName || !currentUserName.trim()) {
      console.error('❌ Registration failed: userName is empty!', {
        userNameRef: userNameRef.current,
        userNameState: userName
      });
      setMessage('Error: Name not found. Please try again.');
      return;
    }

    if (!detection || !detection.descriptor) {
      console.error('❌ Registration failed: No face descriptor!');
      setMessage('Error: Could not capture face data. Please try again.');
      return;
    }

    console.log('✅ Registering new user:', currentUserName);
    isScanningRef.current = false;
    setIsScanning(false);
    setDetectionStatus('Face captured!');

    try {
      const descriptor = Array.from(detection.descriptor) as number[];
      console.log('📊 Face descriptor extracted, length:', descriptor.length);
      
      const newUser: SavedUser = {
        name: currentUserName,
        descriptor: descriptor
      };

      const updatedUsers = [...savedUsers, newUser];
      setSavedUsers(updatedUsers);
      
      console.log('💾 Saving to localStorage...', {
        totalUsers: updatedUsers.length,
        newUserName: currentUserName
      });
      
      localStorage.setItem('faceIdUsers', JSON.stringify(updatedUsers));
      console.log('✅ Successfully saved to localStorage!');

      stopCamera();
      setMessage(`✓ Face registered successfully for ${currentUserName}!`);
      
      setTimeout(() => {
        setView('welcome');
        setUserName('');
        setMessage('');
        isNewUserRef.current = false;
        userNameRef.current = '';
      }, 3000);
    } catch (error) {
      console.error('❌ Error during registration:', error);
      setMessage('Error saving face data. Please try again.');
      isScanningRef.current = true;
      setIsScanning(true);
      
      // Restart face detection loop if video and canvas are ready
      if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        console.log('🔄 Restarting face detection after registration error');
        startFaceDetection();
      }
    }
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
      console.log('✅ User recognized:', match.label);
      isScanningRef.current = false;
      setIsScanning(false);
      setDetectionStatus(`Recognized: ${match.label}`);
      
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
    // Prevent concurrent camera flips
    if (isFlippingCameraRef.current) {
      console.log('⚠️ Camera flip already in progress, ignoring request');
      return;
    }
    
    isFlippingCameraRef.current = true;
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    // Save scanning state but DON'T stop the loop yet
    const wasScanning = isScanningRef.current;
    console.log('🔄 Flipping camera, wasScanning:', wasScanning);
    
    // Only stop if we were scanning - this allows the current loop to finish gracefully
    if (wasScanning) {
      isScanningRef.current = false;
      setIsScanning(false);
    }
    
    // Try to start camera with new facing mode, keeping existing stream if it fails
    const success = await startCamera(newFacingMode, true);
    
    if (success) {
      // Only update state if camera switch succeeded
      setFacingMode(newFacingMode);
      console.log('✅ Camera flipped successfully to:', newFacingMode);
      
      // Resume face detection if it was running, waiting for video readiness
      if (wasScanning && videoRef.current) {
        const video = videoRef.current;
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        
        // Wait for video to have dimensions and HAVE_ENOUGH_DATA before resuming
        const waitForReady = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= video.HAVE_ENOUGH_DATA) {
            console.log('✅ Video ready after camera flip, resuming detection at dimensions:', video.videoWidth, 'x', video.videoHeight);
            
            // Set scanning state FIRST
            isScanningRef.current = true;
            setIsScanning(true);
            
            // Reset frame counter
            frameCountRef.current = 0;
            
            // Start new detection loop
            startFaceDetection();
            
            // Release flip lock
            isFlippingCameraRef.current = false;
          } else {
            attempts++;
            if (attempts >= maxAttempts) {
              console.error('❌ Video not ready after camera flip timeout');
              setMessage('Camera flip timeout. Please try again.');
              // Restore scanning state to allow manual retry
              isScanningRef.current = true;
              setIsScanning(true);
              // Try to start detection anyway - it has its own retry logic
              startFaceDetection();
              // Release flip lock
              isFlippingCameraRef.current = false;
              return;
            }
            requestAnimationFrame(waitForReady);
          }
        };
        
        waitForReady();
      } else {
        // Not scanning, just release the lock
        isFlippingCameraRef.current = false;
      }
    } else {
      // Failed to switch - show message and keep current camera
      setMessage(`${newFacingMode === 'environment' ? 'Back' : 'Front'} camera not available`);
      setTimeout(() => setMessage(''), 2000);
      
      // Resume detection with existing camera if it was running
      if (wasScanning) {
        console.log('🔄 Resuming detection with existing camera after failed flip');
        isScanningRef.current = true;
        setIsScanning(true);
        // Restart detection to ensure it's running
        startFaceDetection();
      }
      
      // Release flip lock
      isFlippingCameraRef.current = false;
    }
  };

  const handleNewUserFlow = async () => {
    console.log('👤 Starting new user flow');
    setIsNewUser(true);
    isNewUserRef.current = true;
    setView('name-input');
  };

  const handleExistingUserFlow = async () => {
    console.log('🔍 Starting existing user flow');
    // Check if there are any registered users first
    if (savedUsers.length === 0) {
      setMessage('No registered users found. Please register as a new user first.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    
    setIsNewUser(false);
    isNewUserRef.current = false;
    
    // Switch to scanning view FIRST to render the video element
    console.log('📺 Switching to scanning view to render video element');
    setView('scanning');
    setIsScanning(false);
    isScanningRef.current = false;
    setDetectionStatus('Starting camera...');
    
    // Wait for next frame to ensure video element is rendered
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    
    // Now start the camera with the rendered video element
    console.log('📸 Starting camera...');
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
    
    console.log('✅ Camera started successfully, initializing detection');
    // Set scanning state
    setIsScanning(true);
    isScanningRef.current = true;
    frameCountRef.current = 0;
    setDetectionStatus('Initializing detection...');
    
    // Wait for next frame to ensure canvas is rendered, then start detection
    requestAnimationFrame(() => {
      console.log('🎬 Starting face detection from handleExistingUserFlow');
      startFaceDetection();
    });
  };

  const handleNameSubmit = async () => {
    if (!userName.trim()) {
      setMessage('Please enter your name');
      return;
    }

    console.log('📝 Name submitted:', userName);
    userNameRef.current = userName.trim();
    console.log('📋 Refs updated:', {
      isNewUserRef: isNewUserRef.current,
      userNameRef: userNameRef.current
    });

    // Switch to scanning view FIRST to render the video element
    console.log('📺 Switching to scanning view to render video element');
    setView('scanning');
    setIsScanning(false);
    isScanningRef.current = false;
    setDetectionStatus('Starting camera...');
    setMessage('Starting camera...');

    // Wait for next frame to ensure video element is rendered
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));

    // Now start the camera with the rendered video element
    console.log('📸 Starting camera...');
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

    console.log('✅ Camera started successfully, initializing detection');
    // Set scanning state
    setIsScanning(true);
    isScanningRef.current = true;
    frameCountRef.current = 0;
    setDetectionStatus('Initializing detection...');
    setMessage('Position your face in the frame...');
    
    // Wait for next frame to ensure canvas is rendered, then start detection
    requestAnimationFrame(() => {
      console.log('🎬 Starting face detection from handleNameSubmit');
      startFaceDetection();
    });
  };

  const handleBackToWelcome = () => {
    console.log('🔙 Returning to welcome screen');
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

            <div className="mt-8 text-center">
              {savedUsers.length > 0 ? (
                <p className="text-sm text-gray-500">
                  {savedUsers.length} registered user{savedUsers.length !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
                  No registered users yet. Start by registering as a new user.
                </p>
              )}
            </div>
            
            {message && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center text-sm">
                {message}
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
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                />
                
                {/* Face guide overlay - oval shape */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative" style={{ width: '280px', height: '380px' }}>
                    {/* Main oval guide */}
                    <div 
                      className="absolute inset-0 border-4 border-white/70"
                      style={{ 
                        borderRadius: '50%',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 255, 255, 0.3)'
                      }}
                    ></div>
                    
                    {/* Animated scanning line - moves vertically with glow */}
                    {isScanning && (
                      <>
                        {/* Main bright scanning line */}
                        <div 
                          className="absolute left-0 right-0 scanning-line"
                          style={{ 
                            top: '0',
                            height: '3px',
                            background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.3) 20%, rgba(99, 102, 241, 1) 50%, rgba(139, 92, 246, 0.3) 80%, transparent 100%)',
                            boxShadow: '0 0 15px 3px rgba(99, 102, 241, 0.8), 0 0 30px 6px rgba(99, 102, 241, 0.5), 0 0 45px 9px rgba(99, 102, 241, 0.3)',
                            animation: 'scan 3s ease-in-out infinite'
                          }}
                        ></div>
                        {/* Outer glow effect */}
                        <div 
                          className="absolute left-0 right-0 scanning-line"
                          style={{ 
                            top: '-8px',
                            height: '20px',
                            background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.4) 0%, transparent 70%)',
                            filter: 'blur(8px)',
                            animation: 'scan 3s ease-in-out infinite'
                          }}
                        ></div>
                      </>
                    )}
                    
                    {/* Inner oval ring - animated pulse */}
                    <div 
                      className="absolute inset-6 border-2 border-indigo-400/50"
                      style={{ 
                        borderRadius: '50%',
                        animation: 'pulse 2s ease-in-out infinite'
                      }}
                    ></div>
                  </div>
                </div>

                {/* Status indicator - minimal */}
                {isScanning && (
                  <div className="absolute top-6 left-0 right-0 flex flex-col items-center pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-sm text-white text-sm px-5 py-2 rounded-full">
                      <span>{detectionStatus}</span>
                    </div>
                  </div>
                )}

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
