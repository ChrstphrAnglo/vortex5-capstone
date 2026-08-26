import {BrowserRouter, Routes, Route, Navigate, useLocation} from 'react-router-dom'
import { useAuthContext } from './hooks/useAuthContext';

// Pages & components
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Configuration from './pages/Configuration.jsx';
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
  const publicPages = ['/login', '/signup', '/forgot-password', '/reset-password']
  const isPublicPage = publicPages.includes(location.pathname)

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
              element={user ? <Home /> : <Navigate to="/login" />}
            />

            <Route 
              path="/configuration"
              element={<Configuration />}
            />
            
            <Route 
              path="/analytics"
              element={<Analytics />}
            />

            <Route 
              path="/classroomrecords"
              element={<ClassroomRecords />}
            />

            <Route 
              path="/alerts-and-notifications"
              element={<AlertsAndNotifications />}
            />

            <Route 
              path="/connect-sensor"
              element={<ConnectSensor />}
            />

            <Route
              path="/profile"
              element={<Profile />}
            />

            <Route
              path="/device/:deviceId"
              element={user ? <DeviceDetail /> : <Navigate to="/login" />}
            />
            
            <Route 
              path="/bulletin-board"
              element={<BulletinBoard />}
            />

            <Route 
              path="/configuration/Thresholds"
              element={<Thresholds />}
            />

            <Route 
              path="/configuration/WebBulletinBoard"
              element={<WebBulletinBoard />}
            />

            <Route 
              path="/animation-viewer"
              element={<AnimationViewer />}
            />

            <Route 
              path="/auditlog"
              element={<Auditlog />}
            />

            <Route 
              path="/usermanagement"
              element={<UserManagement />}
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