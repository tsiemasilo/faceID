# Face ID Recognition App

## Overview
A React-based face recognition application that uses real-time camera face detection, similar to iOS Face ID. Users can register their face with their name, and the system will recognize them on subsequent uses. Built with face-api.js for accurate face detection and recognition.

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 4
- **Styling**: Tailwind CSS 3
- **Icons**: Lucide React
- **Face Recognition**: face-api.js (TensorFlow.js based)
- **AI Models**: TinyFaceDetector, FaceLandmark68, FaceRecognition

### Project Structure
```
/
├── public/
│   └── models/                    # AI model weights for face detection
├── src/
│   ├── App.tsx                    # Main application component
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Tailwind CSS imports
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS configuration
└── package.json                   # Dependencies and scripts
```

## Key Features
1. **New User Registration**: 
   - User enters their name
   - App requests camera permission (persisted per device)
   - iOS-style face scanning with animated overlay
   - Face descriptor saved to localStorage linked to user's name

2. **Existing User Recognition**:
   - Camera activates for face scanning
   - Real-time face detection and recognition
   - User's name displayed above their detected face
   - Fast and accurate matching using face descriptors

3. **iOS-Style UI**:
   - Gradient background with modern design
   - Animated circular scanning overlay
   - Corner brackets similar to Apple Face ID
   - Smooth transitions and responsive layout

4. **Smart Permission Handling**:
   - Camera permission saved in localStorage
   - Only asks once per device
   - Clear permission request flow

## Technical Implementation

### Face Detection & Recognition
- Uses face-api.js with TensorFlow.js CPU backend
- TinyFaceDetector for fast face detection
- 68-point facial landmark detection
- Face descriptors (128-dimensional vectors) for recognition
- FaceMatcher with 0.6 threshold for accurate matching

### Storage
- Face descriptors stored in localStorage as JSON
- Camera permission status persisted
- No backend required - fully client-side

### Camera Integration
- MediaDevices API for camera access
- Configures for front-facing camera (facingMode: 'user')
- High-quality video (1280x720 ideal resolution)
- Real-time video processing with canvas overlay

## Development
- Development server runs on port 5000
- Vite dev server configured for Replit environment
- Hot module replacement enabled
- Responsive design works on mobile and desktop

## Deployment
- Build command: `npm run build`
- Production server: Vite preview
- Autoscale deployment target (stateless)
- All models and assets served statically

## Recent Changes
- **2024-10-24**: Complete rebuild from scratch
  - Removed WebAuthn-based biometric attendance system
  - Implemented real face recognition with camera
  - Added face-api.js for ML-based face detection
  - Created iOS-style scanning interface
  - Implemented new/existing user flow
  - Added persistent camera permission handling
  - Made fully responsive for mobile and web

## State Management
The application uses React's built-in `useState` for state management:
- `view`: Current screen ('welcome', 'name-input', 'scanning', 'recognition')
- `isNewUser`: Whether registering a new user or recognizing existing
- `userName`: Name input for new user registration
- `modelsLoaded`: AI models loading status
- `cameraGranted`: Camera permission status
- `isScanning`: Active face scanning state
- `message`: User feedback messages
- `recognizedUser`: Name of recognized user
- `savedUsers`: Array of registered users with face descriptors

## Known Limitations
1. Data stored in localStorage only (no backend)
2. Face descriptors can be cleared if browser cache is cleared
3. Works best with good lighting conditions
4. Requires camera access to function
5. CPU backend used (slower than GPU but more compatible)
6. Single face detection per frame (designed for single-user authentication)

## Performance Notes
- CPU backend ensures compatibility across all devices
- TinyFaceDetector chosen for speed vs SSD MobileNet
- Face recognition threshold set to 0.6 for balance of accuracy/false positives
- Real-time processing at 30fps on modern devices
