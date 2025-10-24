import React, { useState, useEffect } from 'react';
import { UserPlus, Fingerprint, Users, Clock, Smartphone, AlertCircle, CheckCircle } from 'lucide-react';

export default function BiometricAttendance() {
  const [users, setUsers] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [currentView, setCurrentView] = useState('home');
  const [formData, setFormData] = useState({ firstName: '', lastName: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isIOS, setIsIOS] = useState(false);
  const [systemCheck, setSystemCheck] = useState({ isHTTPS: false, hasWebAuthn: false, hostname: '' });

  useEffect(() => {
    // Detect iOS device
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // System checks
    setSystemCheck({
      isHTTPS: window.location.protocol === 'https:',
      hasWebAuthn: window.PublicKeyCredential !== undefined,
      hostname: window.location.hostname
    });
  }, []);

  // Check if WebAuthn is supported
  const isWebAuthnSupported = () => {
    return window.PublicKeyCredential !== undefined && 
           navigator.credentials !== undefined;
  };

  // Generate a random challenge
  const generateChallenge = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return array;
  };

  // Convert string to Uint8Array
  const stringToBuffer = (str) => {
    return new TextEncoder().encode(str);
  };

  // Convert buffer to base64
  const bufferToBase64 = (buffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  };

  // Base64 URL encode
  const base64urlEncode = (buffer) => {
    const base64 = bufferToBase64(buffer);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  // Register new user with biometrics (Face ID/Touch ID)
  const registerUser = async () => {
    if (!formData.firstName || !formData.lastName) {
      setMessage({ text: 'Please enter both first name and last name', type: 'error' });
      return;
    }

    // Check HTTPS
    if (!systemCheck.isHTTPS) {
      setMessage({ 
        text: '⚠️ HTTPS is required for Face ID. Please deploy to Netlify first - Face ID will not work on localhost.', 
        type: 'error' 
      });
      return;
    }

    if (!isWebAuthnSupported()) {
      setMessage({ 
        text: 'Face ID authentication is not available. Please make sure you are using Safari on iOS and Face ID is set up.', 
        type: 'error' 
      });
      return;
    }

    setMessage({ 
      text: '👤 Preparing Face ID authentication...', 
      type: 'info' 
    });

    // Small delay to show the message
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const userId = crypto.randomUUID();
      const challenge = generateChallenge();
      
      // Get the correct rpId - for Netlify it should be the full hostname
      let rpId = window.location.hostname;
      
      // For localhost testing (won't work with Face ID but helps with debugging)
      if (rpId === 'localhost' || rpId === '127.0.0.1') {
        rpId = 'localhost';
      }

      console.log('Registration starting with rpId:', rpId);

      const publicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
          name: "Attendance System",
          id: rpId,
        },
        user: {
          id: stringToBuffer(userId),
          name: `${formData.firstName.toLowerCase()}.${formData.lastName.toLowerCase()}`,
          displayName: `${formData.firstName} ${formData.lastName}`,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },  // ES256 (preferred for iOS)
          { alg: -257, type: "public-key" } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          requireResidentKey: false,
          residentKey: "discouraged",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "none"
      };

      console.log('Calling navigator.credentials.create...');
      
      // This will trigger Face ID
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });

      console.log('Credential created successfully');

      if (!credential) {
        throw new Error("No credential returned");
      }

      const newUser = {
        id: userId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        credentialId: bufferToBase64(credential.rawId),
        publicKey: credential.response.getPublicKey ? bufferToBase64(credential.response.getPublicKey()) : 'N/A',
        registeredAt: new Date().toISOString(),
        device: isIOS ? 'iOS (Face ID/Touch ID)' : 'Other Device',
        rpId: rpId
      };

      const updatedUsers = [...users, newUser];
      setUsers(updatedUsers);
      
      setMessage({ 
        text: `✅ ${formData.firstName} ${formData.lastName} registered successfully with Face ID!`, 
        type: 'success' 
      });
      setFormData({ firstName: '', lastName: '' });
      
      setTimeout(() => {
        setCurrentView('home');
        setMessage({ text: '', type: '' });
      }, 2500);

    } catch (error) {
      console.error('Registration error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      let errorMessage = '';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = '❌ Face ID authentication was cancelled or timed out.\n\n';
        if (isIOS) {
          errorMessage += 'Tips:\n';
          errorMessage += '• Make sure Face ID is enabled in Settings > Face ID & Passcode\n';
          errorMessage += '• When prompted, look directly at your iPhone\n';
          errorMessage += '• Make sure nothing is blocking your face\n';
          errorMessage += '• Try again and tap "Continue" when prompted';
        } else {
          errorMessage += 'Please try again and complete the authentication.';
        }
      } else if (error.name === 'NotSupportedError') {
        errorMessage = '❌ Face ID is not available.\n\n';
        errorMessage += 'Please check:\n';
        errorMessage += '• Face ID is set up in Settings > Face ID & Passcode\n';
        errorMessage += '• You are using Safari (not Chrome)\n';
        errorMessage += '• Your iPhone supports Face ID';
      } else if (error.name === 'InvalidStateError') {
        errorMessage = '❌ This device is already registered.\n\n';
        errorMessage += 'This biometric credential already exists. You can use it to mark attendance.';
      } else if (error.name === 'SecurityError') {
        errorMessage = '❌ Security error occurred.\n\n';
        errorMessage += 'Make sure:\n';
        errorMessage += '• You are using HTTPS (required for Face ID)\n';
        errorMessage += '• The website is deployed (not localhost)';
      } else if (error.name === 'AbortError') {
        errorMessage = '❌ Authentication was aborted.\n\n';
        errorMessage += 'The request timed out or was cancelled. Please try again.';
      } else {
        errorMessage = `❌ Registration failed: ${error.name || 'Unknown error'}\n\n`;
        errorMessage += error.message || 'Please try again or contact support.';
      }
      
      setMessage({ text: errorMessage, type: 'error' });
    }
  };

  // Mark attendance using biometrics (Face ID/Touch ID)
  const markAttendance = async () => {
    if (!systemCheck.isHTTPS) {
      setMessage({ 
        text: '⚠️ HTTPS is required for Face ID. Please deploy to Netlify first.', 
        type: 'error' 
      });
      return;
    }

    if (!isWebAuthnSupported()) {
      setMessage({ 
        text: 'Face ID authentication is not available.', 
        type: 'error' 
      });
      return;
    }

    if (users.length === 0) {
      setMessage({ text: '❌ No users registered yet. Please register first.', type: 'error' });
      return;
    }

    setMessage({ 
      text: '👤 Preparing Face ID authentication...', 
      type: 'info' 
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const challenge = generateChallenge();
      
      let rpId = window.location.hostname;
      if (rpId === 'localhost' || rpId === '127.0.0.1') {
        rpId = 'localhost';
      }

      console.log('Authentication starting with rpId:', rpId);

      const publicKeyCredentialRequestOptions = {
        challenge: challenge,
        timeout: 60000,
        userVerification: "required",
        rpId: rpId,
      };

      console.log('Calling navigator.credentials.get...');

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions
      });

      console.log('Authentication successful');

      if (!assertion) {
        throw new Error("No assertion returned");
      }

      const credentialIdBase64 = bufferToBase64(assertion.rawId);
      
      const matchedUser = users.find(user => user.credentialId === credentialIdBase64);

      if (matchedUser) {
        const now = new Date();
        const attendanceRecord = {
          id: crypto.randomUUID(),
          userId: matchedUser.id,
          firstName: matchedUser.firstName,
          lastName: matchedUser.lastName,
          timestamp: now.toISOString(),
          time: now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          }),
          date: now.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }),
        };

        const updatedRecords = [attendanceRecord, ...attendanceRecords];
        setAttendanceRecords(updatedRecords);
        
        setMessage({ 
          text: `✅ Attendance marked for ${matchedUser.firstName} ${matchedUser.lastName}`, 
          type: 'success' 
        });

        setTimeout(() => {
          setMessage({ text: '', type: '' });
        }, 3000);
      } else {
        setMessage({ 
          text: '❌ User not found. This Face ID is not registered in the system.', 
          type: 'error' 
        });
      }

    } catch (error) {
      console.error('Authentication error:', error);
      console.error('Error name:', error.name);
      
      let errorMessage = '';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = '❌ Face ID authentication was cancelled or timed out.\n\n';
        errorMessage += 'Please try again and look at your iPhone when prompted.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = '❌ No matching Face ID found.\n\n';
        errorMessage += 'Please register first before marking attendance.';
      } else {
        errorMessage = `❌ Authentication failed: ${error.name || 'Unknown error'}\n\n`;
        errorMessage += 'Please try again.';
      }
      
      setMessage({ text: errorMessage, type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-indigo-900 flex items-center gap-3">
            {isIOS ? <Smartphone className="w-8 h-8" /> : <Fingerprint className="w-8 h-8" />}
            Biometric Attendance
          </h1>
          <p className="text-gray-600 mt-2">
            {isIOS ? 'Secure attendance with Face ID' : 'Secure attendance with biometrics'}
          </p>
          
          {/* System Status */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {systemCheck.isHTTPS ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span className={systemCheck.isHTTPS ? 'text-green-700' : 'text-red-700'}>
                {systemCheck.isHTTPS ? 'HTTPS Enabled ✓' : 'HTTPS Required ✗'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {systemCheck.hasWebAuthn ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span className={systemCheck.hasWebAuthn ? 'text-green-700' : 'text-red-700'}>
                {systemCheck.hasWebAuthn ? 'WebAuthn Supported ✓' : 'WebAuthn Not Supported ✗'}
              </span>
            </div>
            {isIOS && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-700">iOS Device Detected ✓</span>
              </div>
            )}
          </div>

          {!systemCheck.isHTTPS && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-800 font-semibold">
                ⚠️ Face ID requires HTTPS
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Please deploy this app to Netlify. Face ID will not work on localhost or HTTP connections.
              </p>
            </div>
          )}
        </div>

        {/* Message Display */}
        {message.text && (
          <div className={`p-4 rounded-lg mb-6 whitespace-pre-line ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 border border-green-300' 
              : message.type === 'info'
              ? 'bg-blue-100 text-blue-800 border border-blue-300'
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Navigation */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setCurrentView('home')}
              className={`p-4 rounded-lg font-semibold transition-all ${
                currentView === 'home'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isIOS ? <Smartphone className="w-6 h-6 mx-auto mb-2" /> : <Fingerprint className="w-6 h-6 mx-auto mb-2" />}
              <span className="text-xs">Mark Attendance</span>
            </button>
            <button
              onClick={() => setCurrentView('register')}
              className={`p-4 rounded-lg font-semibold transition-all ${
                currentView === 'register'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <UserPlus className="w-6 h-6 mx-auto mb-2" />
              <span className="text-xs">Register User</span>
            </button>
            <button
              onClick={() => setCurrentView('records')}
              className={`p-4 rounded-lg font-semibold transition-all ${
                currentView === 'records'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Clock className="w-6 h-6 mx-auto mb-2" />
              <span className="text-xs">View Records</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'home' && (
            <div className="text-center py-12">
              {isIOS ? (
                <Smartphone className="w-24 h-24 mx-auto text-indigo-600 mb-6" />
              ) : (
                <Fingerprint className="w-24 h-24 mx-auto text-indigo-600 mb-6" />
              )}
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Mark Your Attendance</h2>
              <p className="text-gray-600 mb-8">
                {isIOS 
                  ? 'Tap below and look at your iPhone to authenticate with Face ID' 
                  : 'Tap below and authenticate with your biometric sensor'}
              </p>
              <button
                onClick={markAttendance}
                disabled={!systemCheck.isHTTPS}
                className="bg-indigo-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-indigo-700 transition-colors shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isIOS ? '👤 Use Face ID' : 'Scan Biometric'}
              </button>
              <div className="mt-8 text-sm text-gray-500">
                <p>Registered Users: {users.length}</p>
                <p>Today's Attendance: {attendanceRecords.filter(r => 
                  new Date(r.timestamp).toDateString() === new Date().toDateString()
                ).length}</p>
              </div>
            </div>
          )}

          {currentView === 'register' && (
            <div className="max-w-md mx-auto py-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Register New User</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter last name"
                  />
                </div>
                <button
                  onClick={registerUser}
                  disabled={!systemCheck.isHTTPS}
                  className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isIOS ? <Smartphone className="w-5 h-5" /> : <Fingerprint className="w-5 h-5" />}
                  {isIOS ? 'Register with Face ID' : 'Register with Biometrics'}
                </button>
              </div>
              
              {isIOS && systemCheck.isHTTPS && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-semibold text-blue-800 mb-2">
                    📱 Face ID Setup Instructions:
                  </p>
                  <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                    <li>Make sure Face ID is enabled in iPhone Settings</li>
                    <li>Enter your first and last name above</li>
                    <li>Tap "Register with Face ID"</li>
                    <li>When prompted, look directly at your iPhone</li>
                    <li>Wait for Face ID to recognize you</li>
                    <li>You'll see a success message when done!</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {currentView === 'records' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Users className="w-6 h-6" />
                Registered Users ({users.length})
              </h2>
              <div className="mb-8 space-y-2">
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No users registered yet</p>
                ) : (
                  users.map((user) => (
                    <div key={user.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="font-semibold text-gray-800">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-gray-500">
                        Registered: {new Date(user.registeredAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Device: {user.device}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Clock className="w-6 h-6" />
                Attendance Records ({attendanceRecords.length})
              </h2>
              <div className="space-y-2">
                {attendanceRecords.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No attendance records yet</p>
                ) : (
                  attendanceRecords.map((record) => (
                    <div key={record.id} className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="font-semibold text-gray-800">
                        {record.firstName} {record.lastName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {record.date}
                      </p>
                      <p className="text-sm font-mono text-green-700">
                        Time: {record.time}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}