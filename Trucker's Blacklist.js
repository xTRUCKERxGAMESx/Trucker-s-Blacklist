import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AlertCircle, Truck, Building, User, FileText, Send, LogIn, Image as ImageIcon, Phone, ChevronUp, ChevronDown, MapPin, UserPlus, LogOut, MessageSquare, Mail } from 'lucide-react';

// Main App component
export default function App() {
  // State for Firebase services and user ID
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [storage, setStorage] = useState(null);

  // State for form inputs
  const [companyName, setCompanyName] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [selectedMediaFiles, setSelectedMediaFiles] = useState([]);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // State for the list of reports and sorting
  const [reports, setReports] = useState([]);
  const [sortBy, setSortBy] = useState('timestamp');

  // New states for authentication and view management
  const [view, setView] = useState('reports');
  const [accountSubView, setAccountSubView] = useState('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState(null);
  const [isLoginView, setIsLoginView] = useState(false);

  // New states for phone number authentication
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSmsSent, setIsSmsSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [isPhoneLoginView, setIsPhoneLoginView] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);

  // New states for GPS functionality
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [routeInfo, setRouteInfo] = useState('');
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [gpsStatus, setGpsStatus] = useState(null);

  // States for the chat feature
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');

  // Get app and user IDs from the environment
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // Initialize Firebase and handle authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authService = getAuth(app);
      const storageService = getStorage(app);
      setDb(firestore);
      setAuth(authService);
      setStorage(storageService);
    } catch (error) {
      console.error("Firebase Initialization Error:", error);
    }
  }, []);

  useEffect(() => {
    if (!auth || !db) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setUserId(user.uid);
        setIsAuthReady(true);
        setView('reports');

        // Setup listener for reports
        const reportsRef = collection(db, `artifacts/${appId}/public/data/reports`);
        const qReports = query(reportsRef);
        const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
          let newReports = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          if (sortBy === 'timestamp') {
              newReports.sort((a, b) => {
                  const timeA = a.timestamp?.seconds || 0;
                  const timeB = b.timestamp?.seconds || 0;
                  return timeB - timeA;
              });
          } else if (sortBy === 'companyName') {
              newReports.sort((a, b) => a.companyName.localeCompare(b.companyName));
          }

          setReports(newReports);
        }, (error) => {
          console.error("Error fetching reports:", error);
        });

        // Setup listener for chat messages
        const chatRef = collection(db, `artifacts/${appId}/public/data/driver-chat-messages`);
        const qChat = query(chatRef);
        const unsubscribeChat = onSnapshot(qChat, (snapshot) => {
          const fetchedMessages = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id
          }));
          const sortedMessages = fetchedMessages.sort((a, b) => a.timestamp?.toMillis() - b.timestamp?.toMillis());
          setChatMessages(sortedMessages);
        }, (error) => {
          console.error("Error fetching chat messages:", error);
        });
        
        return () => {
          unsubscribeReports();
          unsubscribeChat();
        };
      } else {
        setUser(null);
        setUserId(null);
        setIsAuthReady(true);
        setReports([]);
        setChatMessages([]);
      }
    });

    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase Auth Error:", error);
      }
    };

    signIn();

    return () => unsubscribeAuth();
  }, [auth, db, initialAuthToken, sortBy]);

  // Handle media file selection
  const handleMediaFileChange = (e) => {
    setSelectedMediaFiles(e.target.files);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setSubmissionStatus(null);
    if (!db || !userId || !storage) {
      setSubmissionStatus({ type: 'error', message: 'Not authenticated or services not available. Please try again.' });
      setIsLoading(false);
      return;
    }

    if (selectedMediaFiles.length === 0) {
      setSubmissionStatus({ type: 'error', message: 'Please attach at least one photo or video.' });
      setIsLoading(false);
      return;
    }

    try {
      const reportsRef = collection(db, `artifacts/${appId}/public/data/reports`);
      const newDocRef = await addDoc(reportsRef, {
        reporterName: reporterName,
        reporterContact: reporterContact,
        companyName,
        issueDescription,
        timestamp: serverTimestamp(),
        userId,
        mediaUrls: [],
        upvotes: 0,
        downvotes: 0,
        upvotedBy: [],
        downvotedBy: [],
      });

      const uploadMediaPromises = Array.from(selectedMediaFiles).map(async (file) => {
        const storagePath = `artifacts/${appId}/reports/${newDocRef.id}/media/${file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
      });

      const mediaUrls = await Promise.all(uploadMediaPromises);

      await updateDoc(newDocRef, {
        mediaUrls: mediaUrls,
      });

      setCompanyName('');
      setIssueDescription('');
      setReporterName('');
      setReporterContact('');
      setSelectedMediaFiles([]);
      setSubmissionStatus({ type: 'success', message: 'Report submitted successfully!' });
    } catch (error) {
      console.error("Error adding document: ", error);
      setSubmissionStatus({ type: 'error', message: 'Failed to submit report. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle upvoting a report
  const handleUpvote = async (reportId, upvotedBy, downvotedBy) => {
    if (!userId || !db) return;
    const reportRef = doc(db, `artifacts/${appId}/public/data/reports/${reportId}`);

    if (upvotedBy.includes(userId)) {
      const updatedUpvotes = upvotedBy.filter(id => id !== userId);
      await updateDoc(reportRef, {
        upvotes: updatedUpvotes.length,
        upvotedBy: updatedUpvotes,
      });
    } else {
      const updatedUpvotes = [...upvotedBy, userId];
      const updatedDownvotes = downvotedBy.filter(id => id !== userId);
      await updateDoc(reportRef, {
        upvotes: updatedUpvotes.length,
        upvotedBy: updatedUpvotes,
        downvotes: updatedDownvotes.length,
        downvotedBy: updatedDownvotes,
      });
    }
  };

  // Handle downvoting a report
  const handleDownvote = async (reportId, upvotedBy, downvotedBy) => {
    if (!userId || !db) return;
    const reportRef = doc(db, `artifacts/${appId}/public/data/reports/${reportId}`);

    if (downvotedBy.includes(userId)) {
      const updatedDownvotes = downvotedBy.filter(id => id !== userId);
      await updateDoc(reportRef, {
        downvotes: updatedDownvotes.length,
        downvotedBy: updatedDownvotes,
      });
    } else {
      const updatedDownvotes = [...downvotedBy, userId];
      const updatedUpvotes = upvotedBy.filter(id => id !== userId);
      await updateDoc(reportRef, {
        downvotes: updatedDownvotes.length,
        downvotedBy: updatedDownvotes,
        upvotes: updatedUpvotes.length,
        upvotedBy: updatedUpvotes,
      });
    }
  };

  // Handle account creation
  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthStatus(null);
    if (!auth) {
      setAuthStatus({ type: 'error', message: 'Auth service not available.' });
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setAuthStatus({ type: 'success', message: 'Account created successfully! You are now logged in.' });
      setEmail('');
      setPassword('');
      setView('reports');
    } catch (error) {
      let errorMessage = 'Failed to create account. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use. Please use a different one.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'The email address is not valid.';
      }
      setAuthStatus({ type: 'error', message: errorMessage });
    }
  };

  // Handle user sign-in
  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthStatus(null);
    if (!auth) {
      setAuthStatus({ type: 'error', message: 'Auth service not available.' });
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAuthStatus({ type: 'success', message: 'Logged in successfully!' });
      setEmail('');
      setPassword('');
      setView('reports');
    } catch (error) {
      let errorMessage = 'Failed to log in. Please check your email and password.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        errorMessage = 'Invalid email or password.';
      }
      setAuthStatus({ type: 'error', message: errorMessage });
    }
  };

  // Handle password reset
  const handlePasswordReset = async () => {
    setAuthStatus(null);
    if (!auth) {
      setAuthStatus({ type: 'error', message: 'Auth service not available.' });
      return;
    }
    if (!email) {
      setAuthStatus({ type: 'error', message: 'Please enter your email address to reset your password.' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthStatus({ type: 'success', message: 'A password reset link has been sent to your email address.' });
    } catch (error) {
      console.error("Error sending password reset email:", error);
      let errorMessage = 'Failed to send password reset email. Please try again.';
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'The email address is not valid.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No user found with that email address.';
      }
      setAuthStatus({ type: 'error', message: errorMessage });
    }
  };

  // Handle sending SMS code for phone number sign-in
  const handleSendCode = async (e) => {
    e.preventDefault();
    setAuthStatus(null);
    if (!auth) {
      setAuthStatus({ type: 'error', message: 'Auth service not available.' });
      return;
    }
    if (!phoneNumber) {
      setAuthStatus({ type: 'error', message: 'Please enter a valid phone number.' });
      return;
    }

    try {
      // Initialize reCAPTCHA verifier here, ensuring the container is in the DOM
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
        }
      });
      setRecaptchaVerifier(verifier);

      // Use reCAPTCHA verifier to send the code
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmationResult(result);
      setIsSmsSent(true);
      setAuthStatus({ type: 'success', message: 'Verification code sent!' });
    } catch (error) {
      console.error("Error sending SMS code:", error);
      let errorMessage = 'Failed to send verification code. Please try again.';
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'The phone number format is invalid.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'reCAPTCHA verification failed. Please try again.'
      }
      setAuthStatus({ type: 'error', message: errorMessage });
    }
  };

  // Handle verifying SMS code and signing in
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setAuthStatus(null);
    if (!confirmationResult || !verificationCode) {
      setAuthStatus({ type: 'error', message: 'Please enter the verification code.' });
      return;
    }

    try {
      await confirmationResult.confirm(verificationCode);
      setAuthStatus({ type: 'success', message: 'Signed in successfully!' });
      setPhoneNumber('');
      setVerificationCode('');
      setIsSmsSent(false);
      setView('reports');
    } catch (error) {
      console.error("Error verifying code:", error);
      let errorMessage = 'Failed to verify code. Please try again.';
      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'The verification code is invalid.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'The verification code has expired. Please request a new one.';
      }
      setAuthStatus({ type: 'error', message: errorMessage });
    } finally {
        // Reset reCAPTCHA after a successful or failed attempt
        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            setRecaptchaVerifier(null);
        }
    }
  };
  
  // Handle user sign out
  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setAuthStatus({ type: 'success', message: 'You have been logged out successfully.' });
      setAccountSubView('auth');
    } catch (error) {
      console.error("Error signing out:", error);
      setAuthStatus({ type: 'error', message: 'Failed to log out.' });
    }
  };

  // Function to generate a GPS route
  const generateRoute = async (e) => {
    e.preventDefault();
    if (!startLocation || !endLocation) {
      setGpsStatus({ type: 'error', message: 'Please enter both a start and end location.' });
      return;
    }
    setRouteInfo('');
    setIsGeneratingRoute(true);
    setGpsStatus(null);

    const prompt = `Provide a detailed, truck-friendly GPS route for a vehicle weighing 80,000 lbs from ${startLocation} to ${endLocation} in the USA. Include turn-by-turn directions, major highways, and specific warnings about potential low bridges, weight restrictions, or narrow roads. Additionally, integrate information about major truck stops and a realistic estimate of average diesel fuel prices along the route. Do not include any external links or URLs. The tone should be similar to a professional GPS voice. Do not make this a story. Provide only the GPS instructions.`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    const apiKey = ""
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            setRouteInfo(text);
            setGpsStatus({ type: 'success', message: 'Route generated successfully!' });
        } else {
            setGpsStatus({ type: 'error', message: 'Failed to generate route. Please try a different location.' });
        }
    } catch (error) {
        console.error('API call failed:', error);
        setGpsStatus({ type: 'error', message: 'An error occurred while fetching the route.' });
    } finally {
        setIsGeneratingRoute(false);
    }
  };

  // Asynchronous function to handle sending a new chat message.
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (newChatMessage.trim() === '' || !userId) return;
    const chatCollectionPath = `artifacts/${appId}/public/data/driver-chat-messages`;
    try {
      await addDoc(collection(db, chatCollectionPath), {
        text: newChatMessage,
        userId: userId,
        timestamp: serverTimestamp(),
      });
      setNewChatMessage('');
    } catch (error) {
      console.error("Error sending message: ", error);
    }
  };


  return (
    <div
      className="relative flex flex-col items-center p-4 min-h-screen font-sans bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('https://images.unsplash.com/photo-1593456885836-7e3e9d8e7c2e?q=80&w=2670&auto=format&fit=crop')` }}
    >
      {/* Semi-transparent overlay to ensure text is readable */}
      <div className="absolute inset-0 bg-black opacity-50"></div>

      {/* Main content container, which sits on top of the overlay */}
      <div className="relative z-10 w-full max-w-2xl">
        <div className="w-full max-w-2xl text-center mb-4">
          <h1 className="text-4xl font-extrabold text-white mb-2">Trucker's Black Lists</h1>
          <p className="text-xl text-white">Report bad companies & brokers. Stay informed.</p>
          <p className="text-sm text-gray-300 mt-2">Your user ID is: <span className="font-mono text-white break-all">{userId}</span></p>
        </div>

        <div className="flex w-full max-w-2xl mb-4 rounded-xl shadow-md overflow-hidden border border-gray-200 bg-white/90">
          <button
            onClick={() => setView('reports')}
            className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 ${view === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <AlertCircle className="mr-2" size={20} />
            Reports
          </button>
          <button
            onClick={() => setView('gps')}
            className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 ${view === 'gps' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <MapPin className="mr-2" size={20} />
            Trucker GPS
          </button>
          <button
            onClick={() => setView('chat')}
            className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 ${view === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <MessageSquare className="mr-2" size={20} />
            Chat
          </button>
          <button
            onClick={() => setView('account')}
            className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 ${view === 'account' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <User className="mr-2" size={20} />
            Account
          </button>
        </div>

        {view === 'reports' && (
          <>
            <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl mb-8 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <Truck className="mr-2 text-gray-500" />
                Submit a New Report
              </h2>
              {submissionStatus && (
                <div className={`p-3 mb-4 rounded-xl text-sm font-medium ${submissionStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {submissionStatus.message}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">Company / Broker Name</label>
                  <div className="flex items-center border border-gray-300 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <Building className="absolute left-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g., Shady Logistics LLC"
                      className="pl-10 pr-3 py-2 w-full text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="relative">
                  <label htmlFor="issueDescription" className="block text-sm font-medium text-gray-700 mb-1">Description of Issue</label>
                  <div className="flex items-center border border-gray-300 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <FileText className="absolute left-3 top-3 text-gray-400" size={20} />
                    <textarea
                      id="issueDescription"
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      placeholder="e.g., They are not paying for loads and their dispatcher is rude."
                      rows="4"
                      className="pl-10 pr-3 py-2 w-full text-gray-900 placeholder-gray-400 focus:outline-none resize-none bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="relative">
                  <label htmlFor="mediaUpload" className="block text-sm font-medium text-gray-700 mb-1">Attach Photos or Videos</label>
                  <div className="flex items-center border border-gray-300 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <ImageIcon className="absolute left-3 text-gray-400" size={20} />
                    <input
                      type="file"
                      id="mediaUpload"
                      onChange={handleMediaFileChange}
                      multiple
                      accept="image/*,video/*"
                      className="pl-10 pr-3 py-2 w-full text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="relative">
                  <label htmlFor="reporterName" className="block text-sm font-medium text-gray-700 mb-1">Your Legal Name</label>
                  <div className="flex items-center border border-gray-300 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <User className="absolute left-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      id="reporterName"
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      placeholder="e.g., John Doe"
                      className="pl-10 pr-3 py-2 w-full text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                      required
                    />
                  </div>
                </div>
                <div className="relative">
                  <label htmlFor="reporterContact" className="block text-sm font-medium text-gray-700 mb-1">Your Contact Info (Phone or Email)</label>
                  <div className="flex items-center border border-gray-300 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <Phone className="absolute left-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      id="reporterContact"
                      value={reporterContact}
                      onChange={(e) => setReporterContact(e.target.value)}
                      placeholder="e.g., 555-123-4567 or example@email.com"
                      className="pl-10 pr-3 py-2 w-full text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading || !companyName || !issueDescription || selectedMediaFiles.length === 0 || !reporterName || !reporterContact}
                >
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <Send className="mr-2" size={20} />
                      Submit Report
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <Truck className="mr-2 text-gray-500" />
                Recent Reports
              </h2>
              <div className="flex space-x-2 mb-4">
                  <button
                      onClick={() => setSortBy('timestamp')}
                      className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${sortBy === 'timestamp' ? 'bg-blue-600 text-white shadow' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                      Sort by Date
                  </button>
                  <button
                      onClick={() => setSortBy('companyName')}
                      className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${sortBy === 'companyName' ? 'bg-blue-600 text-white shadow' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                      Sort by Company Name
                  </button>
              </div>
              {reports.length === 0 ? (
                <p className="text-gray-500 italic text-center">No reports yet. Be the first to submit one!</p>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div key={report.id} className="p-4 bg-gray-50/70 rounded-xl border border-gray-200">
                      <p className="font-bold text-lg text-gray-900">{report.companyName}</p>
                      <p className="text-sm text-gray-600 italic">Reported by: {report.reporterName}</p>
                      <p className="mt-2 text-gray-800">{report.issueDescription}</p>

                      {report.mediaUrls && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          {report.mediaUrls.map((url, index) => (
                            <div key={index}>
                              {url.match(/\.(jpeg|jpg|png|gif)$/i) ? (
                                <img src={url} alt="Report media" className="rounded-lg object-cover w-full h-32" />
                              ) : (
                                <video src={url} controls className="rounded-lg object-cover w-full h-32"></video>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center mt-4 space-x-4">
                        <button
                          onClick={() => handleUpvote(report.id, report.upvotedBy || [], report.downvotedBy || [])}
                          disabled={!userId}
                          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-colors ${
                            (report.upvotedBy || []).includes(userId)
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-green-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <ChevronUp size={16} />
                          <span>{report.upvotes || 0}</span>
                        </button>
                        <button
                          onClick={() => handleDownvote(report.id, report.upvotedBy || [], report.downvotedBy || [])}
                          disabled={!userId}
                          className={`flex items-center space-x-1 px-3 py-1 rounded-full transition-colors ${
                            (report.downvotedBy || []).includes(userId)
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-red-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <ChevronDown size={16} />
                          <span>{report.downvotes || 0}</span>
                        </button>
                      </div>

                      <p className="mt-2 text-xs text-gray-400">
                        {report.timestamp ? new Date(report.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {view === 'gps' && (
          <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <MapPin className="mr-2 text-gray-500" />
              Trucker GPS
            </h2>
            <p className="text-gray-600 mb-4">Enter your start and end points to get a route optimized for heavy vehicles (80,000 lbs), including information on **key truck stops** and **estimated fuel prices**.</p>
            {gpsStatus && (
              <div className={`p-3 mb-4 rounded-xl text-sm font-medium ${gpsStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {gpsStatus.message}
              </div>
            )}
            <form onSubmit={generateRoute} className="space-y-4">
              <div>
                <label htmlFor="startLocation" className="block text-sm font-medium text-gray-700 mb-1">Start Location</label>
                <input
                  type="text"
                  id="startLocation"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="e.g., Chicago, IL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="endLocation" className="block text-sm font-medium text-gray-700 mb-1">End Location</label>
                <input
                  type="text"
                  id="endLocation"
                  value={endLocation}
                  onChange={(e) => setEndLocation(e.target.value)}
                  placeholder="e.g., Dallas, TX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGeneratingRoute}
              >
                {isGeneratingRoute ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <>
                    <MapPin className="mr-2" size={20} />
                    Generate Route
                  </>
                )}
              </button>
            </form>
            {routeInfo && (
              <div className="mt-6 p-4 bg-gray-50/70 rounded-xl border border-gray-200 whitespace-pre-wrap">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Route Details</h3>
                <p className="text-gray-700">{routeInfo}</p>
              </div>
            )}
          </div>
        )}

        {view === 'chat' && (
          <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200 h-[600px] flex flex-col">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <MessageSquare className="mr-2 text-gray-500" />
              Driver Chat
            </h2>
            <div className="flex-grow overflow-y-auto mb-4 p-4 bg-gray-50/70 rounded-xl space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 italic mt-10">Start the conversation!</div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.userId === userId ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`p-3 rounded-2xl max-w-xs md:max-w-md break-words shadow-sm ${
                        msg.userId === userId
                          ? 'bg-blue-500 text-white rounded-br-none'
                          : 'bg-gray-200 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      <p className="font-bold text-xs opacity-80 mb-1">
                        {msg.userId === userId ? 'You' : `Driver: ${msg.userId}`}
                      </p>
                      <p className="text-sm">{msg.text}</p>
                      <span className="block text-right text-xs opacity-60 mt-1">
                        {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSendChatMessage} className="flex">
              <input
                type="text"
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                className="flex-grow p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 bg-white"
                placeholder="Type your message..."
              />
              <button
                type="submit"
                className="ml-3 px-6 py-2 bg-blue-600 text-white rounded-full font-semibold shadow-md hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Send
              </button>
            </form>
          </div>
        )}

        {view === 'account' && (
          <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <User className="mr-2 text-gray-500" />
              Account
            </h2>
            {authStatus && (
              <div className={`p-3 mb-4 rounded-xl text-sm font-medium ${authStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {authStatus.message}
              </div>
            )}
            
            {user ? (
              // Logged in view
              <div className="space-y-4">
                <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-200">
                  <p className="text-gray-800">You are logged in as:</p>
                  <p className="font-bold text-lg text-gray-900 break-all">{user.email || user.phoneNumber || 'Anonymous'}</p>
                  <p className="text-sm text-gray-600 mt-1 break-all">User ID: {userId}</p>
                </div>
                <div className="flex space-x-2">
                    <button
                      onClick={() => setAccountSubView('auth')}
                      className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 rounded-xl ${accountSubView === 'auth' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                      <LogOut className="mr-2" size={20} />
                      Log Out
                    </button>
                    <button
                      onClick={() => setAccountSubView('messages')}
                      className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 rounded-xl ${accountSubView === 'messages' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                      <Mail className="mr-2" size={20} />
                      My Messages
                    </button>
                </div>

                {accountSubView === 'auth' && (
                    <button
                        onClick={handleSignOut}
                        className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    >
                        <LogOut className="mr-2" size={20} />
                        Log Out
                    </button>
                )}

                {accountSubView === 'messages' && (
                    <div className="w-full bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-xl border border-gray-200 h-[400px] flex flex-col">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                            <MessageSquare className="mr-2 text-gray-500" />
                            My Messages (Public Chat)
                        </h3>
                        <div className="flex-grow overflow-y-auto mb-4 p-2 bg-gray-50/70 rounded-xl space-y-4">
                            {chatMessages.length === 0 ? (
                                <div className="text-center text-gray-500 italic mt-10">Start the conversation!</div>
                            ) : (
                                chatMessages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.userId === userId ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`p-3 rounded-2xl max-w-xs md:max-w-md break-words shadow-sm ${
                                                msg.userId === userId
                                                    ? 'bg-blue-500 text-white rounded-br-none'
                                                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                                            }`}
                                        >
                                            <p className="font-bold text-xs opacity-80 mb-1">
                                                {msg.userId === userId ? 'You' : `Driver: ${msg.userId}`}
                                            </p>
                                            <p className="text-sm">{msg.text}</p>
                                            <span className="block text-right text-xs opacity-60 mt-1">
                                                {msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <form onSubmit={handleSendChatMessage} className="flex">
                            <input
                                type="text"
                                value={newChatMessage}
                                onChange={(e) => setNewChatMessage(e.target.value)}
                                className="flex-grow p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 bg-white"
                                placeholder="Type your message..."
                            />
                            <button
                                type="submit"
                                className="ml-3 px-6 py-2 bg-blue-600 text-white rounded-full font-semibold shadow-md hover:bg-blue-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                Send
                            </button>
                        </form>
                    </div>
                )}
              </div>
            ) : (
              // Logged out view
              <div className="space-y-4">
                <div className="flex space-x-2">
                    <button
                        onClick={() => { setIsLoginView(true); setIsPhoneLoginView(false); setAuthStatus(null); }}
                        className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 rounded-xl ${isLoginView && !isPhoneLoginView ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        <LogIn className="mr-2" size={20} />
                        Email/Password
                    </button>
                    <button
                        onClick={() => { setIsPhoneLoginView(true); setIsLoginView(false); setAuthStatus(null); }}
                        className={`flex-1 flex justify-center items-center py-3 px-4 transition-colors duration-200 rounded-xl ${isPhoneLoginView ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        <Phone className="mr-2" size={20} />
                        Phone Number
                    </button>
                </div>

                {/* Email/Password Login Form */}
                {isLoginView && (
                    <div className="space-y-4">
                        <form onSubmit={isLoginView ? handleSignIn : handleSignUp} className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your-email@example.com"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                            >
                                <LogIn className="mr-2" size={20} />
                                Log In
                            </button>
                        </form>
                        <div className="text-center mt-4">
                            <button onClick={() => setIsLoginView(false)} className="text-sm font-medium text-blue-600 hover:underline">
                                Don't have an account? Sign Up
                            </button>
                            <button onClick={handlePasswordReset} className="ml-4 text-sm font-medium text-blue-600 hover:underline">
                                Forgot Password?
                            </button>
                        </div>
                        <button
                            onClick={handleSignUp}
                            className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-blue-600 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            <UserPlus className="mr-2" size={20} />
                            Sign Up
                        </button>
                    </div>
                )}
                
                {/* Phone Number Login Form */}
                {isPhoneLoginView && (
                    <div className="space-y-4">
                        {!isSmsSent ? (
                            <>
                                <form onSubmit={handleSendCode} className="space-y-4">
                                    <div>
                                        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">Phone Number (with country code)</label>
                                        <input
                                            type="tel"
                                            id="phoneNumber"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="e.g., +15551234567"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            required
                                        />
                                    </div>
                                    <div id="recaptcha-container"></div>
                                    <button
                                        type="submit"
                                        className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                    >
                                        <Send className="mr-2" size={20} />
                                        Send Verification Code
                                    </button>
                                </form>
                            </>
                        ) : (
                            <>
                                <form onSubmit={handleVerifyCode} className="space-y-4">
                                    <div>
                                        <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                                        <input
                                            type="text"
                                            id="verificationCode"
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value)}
                                            placeholder="Enter the 6-digit code"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full flex justify-center items-center py-3 px-6 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                                    >
                                        <LogIn className="mr-2" size={20} />
                                        Verify and Log In
                                    </button>
                                </form>
                            </>
                        )}
                        <div className="text-center mt-4">
                            <button onClick={() => setIsPhoneLoginView(false)} className="text-sm font-medium text-blue-600 hover:underline">
                                Go back to Email/Password login
                            </button>
                        </div>
                    </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
