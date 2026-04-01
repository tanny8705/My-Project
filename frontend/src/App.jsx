import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AddActivity from "./pages/AddActivity.jsx";
import ActivityHistory from "./pages/ActivityHistory.jsx";
import Profile from "./pages/Profile.jsx";
import InternshipSubmit from "./pages/InternshipSubmit.jsx";
import InternshipSubmissions from "./pages/InternshipSubmissions.jsx";
import FacultyPanel from "./pages/FacultyPanel.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import AdminStudentsPage from "./pages/AdminStudentsPage.jsx";
import AdminFacultyPage from "./pages/AdminFacultyPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminHodPage from "./pages/AdminHodPage.jsx";
import AdminTpoPage from "./pages/AdminTpoPage.jsx";
import HodPanel from "./pages/HodPanel.jsx";
import TpoPanel from "./pages/TpoPanel.jsx";

function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function Home() {
  const { token, user, loading } = useAuth();
  if (loading) {
    return (
      <div className="layout">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  if (user?.roles?.includes("admin")) return <Navigate to="/admin" replace />;
  if (user?.roles?.includes("faculty")) return <Navigate to="/faculty" replace />;
  if (user?.roles?.includes("hod")) return <Navigate to="/hod" replace />;
  if (user?.roles?.includes("tpo")) return <Navigate to="/tpo" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-activity" element={<AddActivity />} />
        <Route path="/history" element={<ActivityHistory />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/internship-submit" element={<InternshipSubmit />} />
        <Route path="/internships" element={<InternshipSubmissions />} />
        <Route path="/faculty" element={<FacultyPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin/students" element={<AdminStudentsPage />} />
        <Route path="/admin/faculty" element={<AdminFacultyPage />} />
        <Route path="/admin/hod" element={<AdminHodPage />} />
        <Route path="/admin/tpo" element={<AdminTpoPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/hod" element={<HodPanel />} />
        <Route path="/tpo" element={<TpoPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
