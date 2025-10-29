# Face ID Recognition App

### Overview
This project is a React-based face recognition application designed to mimic iOS Face ID. It enables users to register their faces with a name and subsequently recognizes them using real-time camera feeds. The application leverages `face-api.js` for accurate face detection and recognition, providing a seamless and secure authentication experience. The business vision is to provide a robust, user-friendly biometric authentication solution that can be integrated into various applications requiring secure personal identification. Its market potential lies in enhancing security and user experience in mobile and web applications, offering a modern alternative to traditional password-based systems. The project aims to set a high standard for client-side biometric authentication, making advanced AI accessible and practical for everyday use.

### User Preferences
I prefer clear, concise explanations and a direct approach to problem-solving. When making changes, please prioritize the use of functional components and hooks in React. I prefer an iterative development process, where small, tested changes are made frequently. Please ask for my approval before implementing any major architectural changes or significant feature additions. Do not make changes to the `public/models/` folder. Do not modify the core `face-api.js` library files.

### System Architecture
The application is built with React 18 and TypeScript, using Vite for fast development and Tailwind CSS for styling. Framer Motion is integrated for smooth UI transitions and micro-interactions, complemented by shadcn/ui for consistent components and Lucide React for icons.

**UI/UX Decisions:**
The design adopts an iOS-style aesthetic with a modern gradient background, animated circular scanning overlay, and corner brackets for a familiar Face ID experience. Smooth transitions, responsive layouts, and micro-interactions ensure a polished user experience. A custom modal, matching the app's design, is used for interactions like clearing faces, featuring Framer Motion animations.

**Technical Implementations:**
- **Face Detection & Recognition**: Utilizes `face-api.js` (TensorFlow.js CPU backend) with TinyFaceDetector for speed, 68-point facial landmark detection, and 128-dimensional face descriptors for recognition. A FaceMatcher with a 0.45 threshold ensures accurate matching. Visual overlays are hidden during scanning for privacy, showing only the iOS-style frame and status.
- **Camera Integration**: Employs the MediaDevices API, supporting both front (`user`) and rear (`environment`) cameras with a flip camera button and graceful fallback. Mobile-optimized constraints prevent autofocus zoom wobble, ensuring stable video processing.
- **State Management**: React's `useState` manages core application states including `view`, `isNewUser`, `userName`, `modelsLoaded`, `cameraGranted`, `isScanning`, `message`, `recognizedUser`, `savedUsers`, and `facingMode`.

**Feature Specifications:**
- **User Registration**: Users enter their name, grant camera permission, and perform an iOS-style face scan. The face descriptor is saved with their name.
- **User Recognition**: Activates the camera for real-time face scanning, detecting and recognizing existing users by displaying their name.
- **Permission Handling**: Camera permission is persisted in `localStorage` to only ask once per device.
- **Camera Flexibility**: Allows switching between front and back cameras, with robust error handling to maintain the active stream even if a switch fails.

**System Design Choices:**
- **Storage**: Face descriptors and user names are stored in a PostgreSQL database.
- **Backend**: An Express.js server handles API requests in development, while Netlify Functions provide serverless API endpoints for production.
- **Security**: Environment variables secure sensitive data like `CLEAR_USERS_PASSWORD`. SSL certificate validation is enabled for production database connections. Duplicate face detection prevents multiple registrations of the same face.

### External Dependencies
- **Frontend Framework**: React 18
- **Build Tool**: Vite 4
- **Styling**: Tailwind CSS 3
- **Animation Library**: Framer Motion
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Face Recognition**: `face-api.js` (TensorFlow.js based, includes TinyFaceDetector, FaceLandmark68, FaceRecognition models)
- **Backend**: Express.js (for development)
- **Database**: PostgreSQL (Netlify-hosted)
- **API Deployment**: Netlify Functions