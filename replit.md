# Biometric Attendance System

## Overview
A React-based biometric attendance system using Face ID/Touch ID via the WebAuthn API. This application allows users to register with their biometric credentials (Face ID on iOS or fingerprint/face recognition on other devices) and mark attendance using those credentials.

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 4
- **Styling**: Tailwind CSS 3
- **Icons**: Lucide React
- **Authentication**: WebAuthn API for biometric authentication

### Project Structure
```
/
├── src/
│   ├── BiometricAttendance.tsx   # Main component with all functionality
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Tailwind CSS imports
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
```

## Key Features
1. **User Registration**: Register new users with their Face ID/Touch ID credentials
2. **Attendance Marking**: Authenticate using biometrics to mark attendance
3. **Records Management**: View registered users and attendance history
4. **Platform Detection**: Automatically detects iOS devices for Face ID
5. **System Status**: Shows HTTPS and WebAuthn support status

## Important Notes

### Security Requirements
- **HTTPS Required**: Face ID and WebAuthn require HTTPS to function. The app will work in the Replit environment and when deployed, but biometric features will show warnings on non-HTTPS connections.
- **Platform Credentials**: Uses platform authenticators (Face ID, Touch ID) rather than security keys

### Development
- Development server runs on port 5000
- Vite dev server configured for Replit environment with hot module replacement
- All network requests allowed for Replit proxy compatibility

### Deployment
- Build command: `npm run build`
- Uses Vite preview server for production
- Autoscale deployment target (stateless)

## Recent Changes
- **2024-10-24**: Initial project setup
  - Created Vite + React + TypeScript project structure
  - Configured Tailwind CSS for styling
  - Set up Lucide React for icons
  - Configured Vite for Replit environment (host 0.0.0.0, port 5000)
  - Set up development workflow
  - Configured deployment for autoscale target

## State Management
The application uses React's built-in `useState` for state management:
- `users`: Array of registered users with their biometric credentials
- `attendanceRecords`: Array of attendance records
- `currentView`: Navigation state ('home', 'register', 'records')
- `formData`: Form input for user registration
- `message`: UI feedback messages
- `isIOS`: iOS device detection flag
- `systemCheck`: System capability checks (HTTPS, WebAuthn support)

## Known Limitations
1. Data is stored in browser memory only (resets on page reload)
2. No backend persistence - suitable for demo/prototype
3. Face ID requires HTTPS and won't work on localhost
4. Best experience on Safari iOS for Face ID
