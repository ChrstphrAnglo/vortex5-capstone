import {BrowserRouter, Routes, Route, Navigate, useLocation} from 'react-router-dom'
import { useAuthContext } from './hooks/useAuthContext';

// Pages & components
import Home from './pages/Home.jsx'
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import VerifySignup from './pages/VerifySignup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Analytics from './pages/Analytics.jsx';
import Auditlog from './pages/Auditlog.jsx'
import Navbar from './components/Navbar.jsx'
import Header from './components/Header.jsx';
import UserManagement from './pages/UserManagement.jsx';
import ClassroomRecords from './pages/ClassroomRecords.jsx';
import AlertsAndNotifications from './pages/AlertsAndNotifications.jsx';
import ConnectSensor from './pages/ConnectSensor.jsx';
import Profile from './pages/Profile.jsx';
import BulletinBoard from './pages/BulletinBoard.jsx';
import AnimationViewer from './pages/AnimationViewer.jsx';
import WebBulletinBoard from './pages/WebBulletinBoard.jsx';
import Thresholds from './pages/Thresholds.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';

// Create a separate component for the routes (needs to be inside BrowserRouter)
function AppRoutes() {
  const { user } = useAuthContext()
  const location = useLocation()
  
  // Define public pages that should NOT have Navbar and Header
  const publicPages = ['/login', '/signup', '/verify-signup', '/forgot-password', '/reset-password']
  // "/" is the landing page (no app shell) for a logged-out visitor, but
  // becomes Home (with the shell) once logged in.
  const isPublicPage = publicPages.includes(location.pathname) || (location.pathname === '/' && !user)

  return (
    <>
      {/* Only show Navbar on non-public pages */}
      {!isPublicPage && <Navbar />}
      
      {/* Use different containers based on page type */}
      <div className={!isPublicPage ? "main-content" : "full-page-content"}>
        {/* Only show Header on non-public pages */}
        {!isPublicPage && <Header />}
        <div className='pages'>
          <Routes>
            <Route
              path="/"
              element={user ? <Home /> : <LandingPage />}
            />

            <Route
              path="/configuration"
              element={<Navigate to="/configuration/Thresholds" replace />}
            />

            <Route
              path="/analytics"
              element={user ? <Analytics /> : <Navigate to="/login" />}
            />

            <Route
              path="/classroomrecords"
              element={user ? <ClassroomRecords /> : <Navigate to="/login" />}
            />

            <Route
              path="/alerts-and-notifications"
              element={user ? <AlertsAndNotifications /> : <Navigate to="/login" />}
            />

            <Route
              path="/connect-sensor"
              element={user ? <ConnectSensor /> : <Navigate to="/login" />}
            />

            <Route
              path="/profile"
              element={user ? <Profile /> : <Navigate to="/login" />}
            />

            <Route
              path="/device/:deviceId"
              element={user ? <DeviceDetail /> : <Navigate to="/login" />}
            />
            
            {/* Intentionally unguarded — a public kiosk/signage display, no login required */}
            <Route
              path="/bulletin-board"
              element={<BulletinBoard />}
            />

            <Route
              path="/configuration/Thresholds"
              element={user ? <Thresholds /> : <Navigate to="/login" />}
            />

            <Route
              path="/configuration/WebBulletinBoard"
              element={user ? <WebBulletinBoard /> : <Navigate to="/login" />}
            />

            {/* Intentionally unguarded — a public kiosk/signage display, no login required */}
            <Route
              path="/animation-viewer"
              element={<AnimationViewer />}
            />

            <Route
              path="/auditlog"
              element={user ? <Auditlog /> : <Navigate to="/login" />}
            />

            <Route
              path="/usermanagement"
              element={user ? <UserManagement /> : <Navigate to="/login" />}
            />

            <Route
              path="/login"
              element={!user ? <Login /> : <Navigate to="/" />}
            />
            
            <Route
              path="/signup"
              element={!user ? <Signup /> : <Navigate to="/" />}
            />

            <Route
              path="/verify-signup"
              element={!user ? <VerifySignup /> : <Navigate to="/" />}
            />

            <Route
              path="/forgot-password"
              element={!user ? <ForgotPassword /> : <Navigate to="/" />}
            />

            <Route
              path="/reset-password"
              element={!user ? <ResetPassword /> : <Navigate to="/" />}
            />
          </Routes>
        </div>
      </div>
    </>
  )
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}

export default App;