import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as faceapi from 'face-api.js';
import { Camera, User, UserPlus, Loader, RefreshCw, Check, Sparkles, Trash2, Lock, X, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SavedUser {
  name: string;
  descriptor: number[] | number[][];
}

interface AdminUser {
  name: string;
  created_at: string;
  sample_count: number;
}

const FACE_MATCH_THRESHOLD = 0.45;

export default function App() {
  const [view, setView] = useState<'welcome' | 'name-input' | 'scanning' | 'success' | 'admin'>('welcome');
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
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearPasswordError, setClearPasswordError] = useState('');
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [learningProgress, setLearningProgress] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);
  const frameCountRef = useRef(0);
  const isNewUserRef = useRef(false);
  const userNameRef = useRef('');
  const isFlippingCameraRef = useRef(false);
  const learningStartTimeRef = useRef<number>(0);
  const collectedDescriptorsRef = useRef<number[][]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        console.log('🔄 Starting to load AI models...');
        if (!cancelled) setMessage('Loading AI models...');
        
        await faceapi.tf.setBackend('cpu');
        await faceapi.tf.ready();
        
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        
        console.log('✅ All models loaded successfully!');
        if (!cancelled) {
          setModelsLoaded(true);
          setMessage('');
        }
      } catch (error) {
        console.error('❌ Error loading models:', error);
        if (!cancelled) setMessage('Error loading face detection models');
      }
    };

    loadModels();
    loadSavedUsers();
    checkCameraPermission();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadSavedUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const users = await response.json();
        setSavedUsers(users);
      } else {
        console.error('Failed to load users from database');
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const openClearModal = () => {
    setShowClearModal(true);
    setClearPassword('');
    setClearPasswordError('');
  };

  const closeClearModal = () => {
    setShowClearModal(false);
    setClearPassword('');
    setClearPasswordError('');
  };

  const handleClearAllUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: clearPassword }),
      });

      if (response.ok) {
        setSavedUsers([]);
        setAdminUsers([]);
        setMessage('All registered faces have been cleared');
        setTimeout(() => setMessage(''), 3000);
        closeClearModal();
      } else {
        const data = await response.json();
        setClearPasswordError(data.error || 'Incorrect password. Please try again.');
      }
    } catch (error) {
      console.error('Error clearing users:', error);
      setClearPasswordError('Failed to clear users. Please try again.');
    }
  };

  const openAdminPasswordModal = () => {
    setShowAdminPasswordModal(true);
    setAdminPassword('');
    setAdminPasswordError('');
  };

  const closeAdminPasswordModal = () => {
    setShowAdminPasswordModal(false);
    setAdminPassword('');
    setAdminPasswordError('');
  };

  const loadAdminUsers = async (password: string) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        const users = await response.json();
        setAdminUsers(users);
        return true;
      } else {
        const data = await response.json();
        setAdminPasswordError(data.error || 'Invalid password');
        return false;
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
      setAdminPasswordError('Failed to load users');
      return false;
    }
  };

  const handleAdminAccess = async () => {
    const success = await loadAdminUsers(adminPassword);
    if (success) {
      closeAdminPasswordModal();
      setView('admin');
    }
  };

  const handleBackFromAdmin = () => {
    setView('welcome');
    setAdminUsers([]);
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
        const settings = videoTrack.getSettings?.() as any;
        
        console.log('📷 Camera capabilities:', capabilities);
        console.log('📷 Current camera settings:', settings);
        
        const basicConstraints: any = {};
        
        // Prevent zoom wobble by locking zoom
        if (capabilities?.zoom) {
          const currentZoom = settings?.zoom || 1.0;
          basicConstraints.zoom = currentZoom;
          console.log(`🔒 Locking zoom at ${currentZoom}`);
        }
        
        // Use manual focus to prevent autofocus hunting which causes zoom-like effects
        if (capabilities?.focusMode) {
          if (capabilities.focusMode.includes('manual')) {
            basicConstraints.focusMode = 'manual';
            // Set focus distance to a reasonable middle value for face scanning
            if (capabilities.focusDistance) {
              const midDistance = (capabilities.focusDistance.min + capabilities.focusDistance.max) / 2;
              basicConstraints.focusDistance = midDistance;
            }
            console.log('🎯 Using manual focus mode');
          } else if (capabilities.focusMode.includes('continuous')) {
            basicConstraints.focusMode = 'continuous';
            console.log('🎯 Using continuous focus mode');
          }
        }
        
        // Disable exposure compensation to prevent brightness adjustments that affect zoom perception
        if (capabilities?.exposureMode && capabilities.exposureMode.includes('manual')) {
          basicConstraints.exposureMode = 'manual';
        }
        
        // Apply basic constraints (not advanced) for better compatibility
        if (Object.keys(basicConstraints).length > 0) {
          try {
            await videoTrack.applyConstraints(basicConstraints);
            console.log('✅ Camera constraints applied successfully');
          } catch (constraintError) {
            console.log('⚠️ Could not apply all constraints, trying subset:', constraintError);
            // Try with just zoom lock as fallback
            if (basicConstraints.zoom) {
              try {
                await videoTrack.applyConstraints({ zoom: basicConstraints.zoom } as any);
                console.log('✅ Zoom lock applied');
              } catch (e) {
                console.log('⚠️ Could not lock zoom');
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Could not apply camera constraints:', e);
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
        const video = videoRef.current;
        video.srcObject = stream;
        streamRef.current = stream;
        
        // Force load the video
        video.load();
        
        console.log('📹 Waiting for video to be ready...');
        
        await new Promise<void>((resolve, reject) => {
          if (!video) {
            reject(new Error('Video element not found'));
            return;
          }
          
          let attempts = 0;
          const maxAttempts = 100; // Increased from 50 for slower devices
          
          const checkVideoReady = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            const ready = video.readyState;
            
            console.log(`📹 Video check - Width: ${width}, Height: ${height}, ReadyState: ${ready}, Attempt: ${attempts + 1}`);
            
            // Check for HAVE_CURRENT_DATA (2) or better
            if (width > 0 && height > 0 && ready >= video.HAVE_CURRENT_DATA) {
              console.log('✅ Video dimensions loaded, attempting to play...');
              
              let playAttempts = 0;
              const maxPlayAttempts = 5;
              
              const tryPlay = () => {
                video.play()
                  .then(() => {
                    console.log('✅ Video playing successfully');
                    // Wait a bit more for the first frame to render
                    setTimeout(() => resolve(), 300);
                  })
                  .catch((error) => {
                    console.error(`❌ Play attempt ${playAttempts + 1} failed:`, error);
                    playAttempts++;
                    if (playAttempts < maxPlayAttempts) {
                      setTimeout(tryPlay, 150);
                    } else {
                      reject(error);
                    }
                  });
              };
              
              tryPlay();
            } else {
              attempts++;
              if (attempts >= maxAttempts) {
                console.error('❌ Video ready timeout - dimensions not loading');
                reject(new Error('Video dimensions timeout'));
                return;
              }
              setTimeout(checkVideoReady, 50);
            }
          };
          
          // Listen for multiple events to catch when video is ready
          video.onloadedmetadata = () => {
            console.log('📹 Metadata loaded event fired');
            checkVideoReady();
          };
          
          video.onloadeddata = () => {
            console.log('📹 Data loaded event fired');
            checkVideoReady();
          };
          
          video.oncanplay = () => {
            console.log('📹 Can play event fired');
            checkVideoReady();
          };
          
          // Start checking immediately if video already has metadata
          if (video.readyState >= video.HAVE_METADATA) {
            console.log('📹 Video already has metadata, checking immediately');
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

    const currentTime = Date.now();
    
    if (learningStartTimeRef.current === 0) {
      learningStartTimeRef.current = currentTime;
      collectedDescriptorsRef.current = [];
      setLearningProgress(0);
      
      try {
        console.log('🔄 Fetching fresh user list for duplicate check...');
        const response = await fetch('/api/users');
        const freshUsers: SavedUser[] = response.ok ? await response.json() : [];
        console.log(`📊 Found ${freshUsers.length} users in database for duplicate check`);
        
        if (freshUsers.length > 0) {
          const allDescriptors: Float32Array[] = [];
          freshUsers.forEach(user => {
            const descriptors = Array.isArray(user.descriptor[0]) 
              ? (user.descriptor as number[][]).map(d => new Float32Array(d))
              : [new Float32Array(user.descriptor as number[])];
            allDescriptors.push(...descriptors);
          });

          const labeledDescriptors = freshUsers.map(user => {
            const descriptors = Array.isArray(user.descriptor[0]) 
              ? (user.descriptor as number[][]).map(d => new Float32Array(d))
              : [new Float32Array(user.descriptor as number[])];
            return new faceapi.LabeledFaceDescriptors(user.name, descriptors);
          });

          const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, FACE_MATCH_THRESHOLD);
          const match = faceMatcher.findBestMatch(detection.descriptor);
          
          console.log(`🔍 Registration duplicate check - Match: ${match.label}, Distance: ${match.distance.toFixed(3)} (threshold: ${FACE_MATCH_THRESHOLD})`);

          if (match.label !== 'unknown') {
            isScanningRef.current = false;
            setIsScanning(false);
            stopCamera();
            learningStartTimeRef.current = 0;
            collectedDescriptorsRef.current = [];
            setLearningProgress(0);
            setMessage(`This face is already registered as "${match.label}". Please use a different face.`);
            setTimeout(() => {
              setView('welcome');
              setUserName('');
              setMessage('');
              isNewUserRef.current = false;
              userNameRef.current = '';
            }, 4000);
            return;
          }
        } else {
          console.log('✅ No users in database - proceeding with registration');
        }
      } catch (error) {
        console.error('⚠️ Error fetching users for duplicate check:', error);
        console.log('⚠️ Proceeding with registration anyway');
      }
    }

    const elapsedSeconds = Math.floor((currentTime - learningStartTimeRef.current) / 1000);
    const MIN_LEARNING_SECONDS = 5;
    
    if (elapsedSeconds < MIN_LEARNING_SECONDS) {
      // Collect more samples for better accuracy - sample every 5 frames instead of 10
      if (frameCountRef.current % 5 === 0) {
        const descriptor = Array.from(detection.descriptor) as number[];
        collectedDescriptorsRef.current.push(descriptor);
        console.log(`📸 Collected descriptor ${collectedDescriptorsRef.current.length} at ${elapsedSeconds}s`);
      }
      
      setLearningProgress(elapsedSeconds);
      setDetectionStatus(`Learning your face... ${elapsedSeconds}/${MIN_LEARNING_SECONDS} seconds`);
      return;
    }

    const descriptor = Array.from(detection.descriptor) as number[];
    collectedDescriptorsRef.current.push(descriptor);

    isScanningRef.current = false;
    setIsScanning(false);
    setDetectionStatus('Face learning complete!');
    setLearningProgress(MIN_LEARNING_SECONDS);

    try {
      const descriptors = collectedDescriptorsRef.current.length > 0 
        ? collectedDescriptorsRef.current 
        : [descriptor];

      console.log(`📊 Registration - Collected ${descriptors.length} face descriptors for user: ${currentUserName}`);

      const newUser: SavedUser = {
        name: currentUserName,
        descriptor: descriptors
      };

      console.log('📤 Sending registration data to server...');
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      console.log(`📥 Server response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server error:', errorData);
        throw new Error(errorData.error || 'Failed to save user');
      }

      const responseData = await response.json();
      console.log('✅ Registration successful:', responseData);

      const updatedUsers = [...savedUsers, newUser];
      setSavedUsers(updatedUsers);

      learningStartTimeRef.current = 0;
      collectedDescriptorsRef.current = [];
      setLearningProgress(0);

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
      
      let errorMessage = 'Error saving face data. ';
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          errorMessage = 'This name is already registered. Please use a different name.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('required')) {
          errorMessage = 'Invalid data. Please try scanning again.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Please try again.';
      }
      
      console.log(`📋 Showing error to user: ${errorMessage}`);
      setMessage(errorMessage);
      
      learningStartTimeRef.current = 0;
      collectedDescriptorsRef.current = [];
      setLearningProgress(0);
      isScanningRef.current = true;
      setIsScanning(true);
      
      if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
        startFaceDetection();
      }
    }
  };

  const handleExistingUserRecognition = async (
    detection: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>,
    _resizedDetection: any
  ) => {
    if (savedUsers.length === 0) {
      setMessage('No registered users found');
      return;
    }

    const labeledDescriptors = savedUsers.map(user => {
      const descriptors = Array.isArray(user.descriptor[0]) 
        ? (user.descriptor as number[][]).map(d => new Float32Array(d))
        : [new Float32Array(user.descriptor as number[])];
      return new faceapi.LabeledFaceDescriptors(user.name, descriptors);
    });

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, FACE_MATCH_THRESHOLD);
    const match = faceMatcher.findBestMatch(detection.descriptor);
    
    const confidence = Math.max(0, Math.min(100, (1 - (match.distance / FACE_MATCH_THRESHOLD)) * 100));
    console.log(`🔍 Recognition - Match: ${match.label}, Distance: ${match.distance.toFixed(3)}, Confidence: ${confidence.toFixed(1)}% (threshold: ${FACE_MATCH_THRESHOLD})`);

    if (match.label !== 'unknown') {
      isScanningRef.current = false;
      setIsScanning(false);
      setDetectionStatus(`Recognized: ${match.label} (${confidence.toFixed(0)}% confidence)`);
      setRecognizedUser(match.label);
      
      const newDescriptor = Array.from(detection.descriptor) as number[];
      
      try {
        await fetch(`/api/users/${encodeURIComponent(match.label)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ descriptor: newDescriptor }),
        });
        
        const updatedUsers = savedUsers.map(user => {
          if (user.name === match.label) {
            const currentDescriptors = Array.isArray(user.descriptor[0])
              ? (user.descriptor as number[][])
              : [user.descriptor as number[]];
            return {
              ...user,
              descriptor: [...currentDescriptors, newDescriptor]
            };
          }
          return user;
        });
        setSavedUsers(updatedUsers);
      } catch (error) {
        console.error('Error updating user descriptors:', error);
      }
      
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
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 }
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

        <AnimatePresence>
          {!modelsLoaded ? (
            <motion.div
              key="loading"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
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
          ) : view === 'welcome' ? (
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
              
              <div>
                <h2 className="text-3xl font-bold text-gray-800 text-center">Welcome</h2>
                <p className="text-gray-600 text-center mt-2">Choose an option to continue</p>
              </div>

              <div className="w-full space-y-4 mt-8">
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
              </div>

              <div className="mt-8 text-center space-y-3">
                {savedUsers.length > 0 ? (
                  <p className="text-sm text-gray-500">
                    {savedUsers.length} registered user{savedUsers.length !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <div className="text-sm text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200 shadow-sm">
                    No registered users yet. Start by registering!
                  </div>
                )}
                <Button
                  onClick={openAdminPasswordModal}
                  variant="outline"
                  size="sm"
                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </Button>
              </div>
              
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
          ) : view === 'name-input' ? (
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
          ) : view === 'scanning' ? (
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
                      {isNewUser && learningProgress > 0 && learningProgress < 5 && (
                        <div className="mt-2 w-48 bg-gray-700/80 rounded-full h-2 overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${(learningProgress / 5) * 100}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
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
          ) : view === 'success' ? (
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
          ) : view === 'admin' ? (
            <motion.div
              key="admin"
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
                className="mb-6"
              >
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Shield className="w-7 h-7 text-indigo-600" />
                  Admin Panel
                </h2>
                <p className="text-gray-600 text-sm mt-1">Manage registered users</p>
              </motion.div>

              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex-1 overflow-auto"
              >
                <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Registration Date</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold">Face Samples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {adminUsers.length > 0 ? (
                        adminUsers.map((user, index) => (
                          <motion.tr
                            key={user.name}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {new Date(user.created_at).toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                                {user.sample_count}
                              </span>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                            No registered users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {message && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-center text-sm"
                >
                  {message}
                </motion.div>
              )}

              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-3 mt-6"
              >
                {adminUsers.length > 0 && (
                  <Button
                    onClick={openClearModal}
                    variant="outline"
                    size="lg"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-5 h-5 mr-2" />
                    Clear All Faces
                  </Button>
                )}
                
                <Button
                  onClick={handleBackFromAdmin}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  Back to Home
                </Button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Clear All Faces Modal */}
        <AnimatePresence>
          {showClearModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
              onClick={closeClearModal}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", duration: 0.3 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              >
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-red-500 to-pink-500 p-6 relative">
                  <button
                    onClick={closeClearModal}
                    className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Clear All Faces</h3>
                      <p className="text-red-50 text-sm">This action cannot be undone</p>
                    </div>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-amber-800 text-sm">
                      You are about to delete all {savedUsers.length} registered face{savedUsers.length !== 1 ? 's' : ''}. 
                      Please enter the password to confirm.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Lock className="w-4 h-4" />
                      Password
                    </label>
                    <input
                      type="password"
                      value={clearPassword}
                      onChange={(e) => {
                        setClearPassword(e.target.value);
                        setClearPasswordError('');
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleClearAllUsers()}
                      placeholder="Enter password"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-4 focus:ring-red-100 focus:outline-none transition-all"
                      autoFocus
                    />
                    {clearPasswordError && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-red-600 text-sm flex items-center gap-1"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {clearPasswordError}
                      </motion.p>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-gray-50 p-6 flex gap-3">
                  <Button
                    onClick={closeClearModal}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleClearAllUsers}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Password Modal */}
        <AnimatePresence>
          {showAdminPasswordModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
              onClick={closeAdminPasswordModal}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", duration: 0.3 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              >
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 relative">
                  <button
                    onClick={closeAdminPasswordModal}
                    className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Admin Access</h3>
                      <p className="text-indigo-50 text-sm">Enter password to continue</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Lock className="w-4 h-4" />
                      Admin Password
                    </label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        setAdminPasswordError('');
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleAdminAccess()}
                      placeholder="Enter admin password"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all"
                      autoFocus
                    />
                    {adminPasswordError && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-red-600 text-sm flex items-center gap-1"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {adminPasswordError}
                      </motion.p>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 p-6 flex gap-3">
                  <Button
                    onClick={closeAdminPasswordModal}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdminAccess}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Access Admin
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
