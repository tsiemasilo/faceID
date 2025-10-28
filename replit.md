# Face ID Recognition App

## Overview
A React-based face recognition application that uses real-time camera face detection, similar to iOS Face ID. Users can register their face with their name, and the system will recognize them on subsequent uses. Built with face-api.js for accurate face detection and recognition.

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 4
- **Styling**: Tailwind CSS 3
- **Animation Library**: Framer Motion (smooth page transitions and micro-interactions)
- **UI Components**: shadcn/ui (Button component with multiple variants)
- **Icons**: Lucide React
- **Face Recognition**: face-api.js (TensorFlow.js based)
- **AI Models**: TinyFaceDetector, FaceLandmark68, FaceRecognition

### Project Structure
```
/
├── public/
│   └── models/                    # AI model weights for face detection
├── src/
│   ├── components/
│   │   └── ui/
│   │       └── button.tsx         # shadcn/ui Button component
│   ├── lib/
│   │   └── utils.ts               # Utility functions (cn helper)
│   ├── App.tsx                    # Main application component
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Tailwind CSS + custom styles
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration (with path aliases)
├── tsconfig.json                  # TypeScript configuration
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
   - Flip camera button to switch between front and back cameras

4. **Smart Permission Handling**:
   - Camera permission saved in localStorage
   - Only asks once per device
   - Clear permission request flow

5. **Camera Flexibility**:
   - Switch between front-facing and rear-facing cameras
   - Graceful fallback if alternate camera unavailable
   - Maintains active stream when camera switch fails

## Technical Implementation

### Face Detection & Recognition
- Uses face-api.js with TensorFlow.js CPU backend
- TinyFaceDetector for fast face detection
- 68-point facial landmark detection (hidden from UI for privacy)
- Face descriptors (128-dimensional vectors) for recognition
- FaceMatcher with 0.6 threshold for accurate matching
- Visual overlays hidden during scanning - only iOS-style frame and status shown

### Storage
- Face descriptors stored in localStorage as JSON
- Camera permission status persisted
- No backend required - fully client-side

### Camera Integration
- MediaDevices API for camera access
- Supports both front-facing ('user') and rear-facing ('environment') cameras
- Flip camera button with graceful fallback on failure
- High-quality video (1280x720 ideal resolution)
- Real-time video processing with canvas overlay
- Robust error handling with stream preservation on camera switch failures
- Mobile-optimized constraints to prevent autofocus zoom wobble
- Dynamic capability detection and constraint application per device

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

- **2024-10-28**: Password-protected modal for clearing all faces
  - Replaced browser confirm with custom modal matching app's design aesthetic
  - Modal features gradient red/pink header with warning icon and smooth Framer Motion animations
  - Password protection (0852Tsie) required to clear all registered faces
  - Real-time password validation with error feedback
  - Modal can be closed via Cancel button, X button, or clicking outside
  - Enter key support for quick password submission
  - Shows count of faces to be deleted before action
  - Note: Password is client-side only (visible in source code) but provides protection against accidental deletion

- **2024-10-28**: Duplicate face prevention and data management features
  - Added duplicate face detection during registration to prevent same face registering multiple times
  - System now checks if a face already exists using FaceMatcher with 0.6 threshold before allowing registration
  - If duplicate detected, shows clear error message indicating which name the face is already registered under
  - Added "Clear All Faces" button to welcome screen for easy data management
  - Clear function includes confirmation dialog to prevent accidental data loss
  - Fixed Netlify deployment TypeScript error (unused variable in handleExistingUserRecognition)

- **2024-10-28**: Comprehensive UI/UX overhaul with Framer Motion animations
  - Integrated Framer Motion for smooth page transitions across all views
  - Fixed glitchy scanning animation with proper easing and keyframe sequences
  - Implemented shadcn/ui Button component system with multiple variants (default, secondary, outline, ghost)
  - Added micro-interactions throughout: hover effects, scale animations, and tap feedback
  - Created dedicated success screen with scale animations and visual celebration effects
  - Enhanced gradient backgrounds with glassmorphism and modern shadow effects
  - Improved scanning beam animation for smooth vertical sweep without glitches
  - Added AnimatePresence for seamless view transitions
  - Implemented requestAnimationFrame-driven detection loop for optimal performance
  - All animations use cubic-bezier easing for professional feel
  - Added custom scrollbar styling and focus-visible states for accessibility

- **2024-10-24**: Privacy and mobile UX improvements
  - Hidden face model visualization (bounding boxes and landmarks) during scanning for better privacy
  - Face detection still works in background - only visual overlay is hidden
  - Implemented mobile camera constraints to prevent autofocus zoom wobble
  - Added `applyMobileConstraints` helper that checks device capabilities and applies focus/zoom settings
  - Mobile users will experience more stable camera view during face scanning

- **2024-10-24**: Fixed critical face detection loop issue
  - Modified detectFaces function to check isScanningRef.current FIRST before checking video state
  - Added auto-resume functionality when video is paused (critical for mobile browsers)
  - Fixed race condition that caused detection loop to stop immediately after starting
  - Added comprehensive console logging throughout detection pipeline
  - Detection loop now keeps running once scanning starts, preventing early exit
  - Face detection now works reliably on iPhone Safari, Samsung Internet, and Android Chrome
  
- **2024-10-24**: Enhanced mobile camera support with fallback constraints
  - Added flexible camera constraints (min/max/ideal) for better device compatibility
  - Implemented multi-level fallback: ideal → exact → basic constraints
  - Improved camera flip function with proper state management and timeout protection
  - Better error handling for devices with limited camera APIs

## Recent Changes
- **2024-10-24**: Fixed face registration state closure bug
  - Fixed critical bug where face registration wouldn't work due to stale state values in async detection loop
  - Added refs (isNewUserRef, userNameRef) to ensure detection loop always has current values
  - Added comprehensive console logging throughout registration flow for debugging
  - Improved error handling with proper recovery - detection loop restarts after errors
  - Removed silent failures and added clear error messages for users
  - Face registration now works reliably - users will see success message after face is captured

- **2024-10-24**: UX improvements for existing user authentication flow
  - Added validation check to prevent camera from starting when no users are registered
  - Display helpful error message when user clicks "Existing User" with no registered profiles
  - Improved welcome screen to show clear warning when no users exist (instead of only showing count)
  - Enhanced user guidance to encourage new user registration before attempting authentication

- **2024-10-24**: Face detection improvements and UI enhancements
  - Fixed face detection to properly start and run continuously
  - Added video mirroring for front camera (acts like a mirror)
  - Changed scanning overlay to larger oval shape (72x96) to better match face proportions
  - Added canvas mirroring to match video orientation
  - Improved debugging with console logging for face detection
  - Fixed animation loop to continue even when video isn't ready
  - Added readyState check for video data availability
  
- **2024-10-24**: Camera functionality fixes and flip camera feature
  - Fixed camera initialization to properly wait for video stream playback
  - Added flip camera button to switch between front and back cameras
  - Implemented graceful fallback when switching to unavailable camera
  - Fixed UI flow to only show scanning view after camera successfully starts
  - Added stream preservation when camera switch fails
  - Improved error handling and user feedback

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
- `facingMode`: Current camera mode ('user' for front, 'environment' for back)

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
