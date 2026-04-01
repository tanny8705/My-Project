import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ActivityForm from "../components/ActivityForm.jsx";

export default function AddActivity() {
  const { token, user, loading } = useAuth();
  const navigate = useNavigate();

  if (!token && !loading) {
    navigate("/login");
    return null;
  }
  if (loading || !user) return <p className="muted layout">Loading…</p>;
  if (user.roles?.includes("admin")) {
    navigate("/admin");
    return null;
  }
  if (!user.roles?.includes("student")) {
    navigate("/faculty");
    return null;
  }

  return (
    <div className="layout">
      <h1>Add activity</h1>
      <p className="muted">Upload proof; credits are awarded only after faculty approval.</p>
      <ActivityForm token={token} onSuccess={() => navigate("/history")} />
    </div>
  );
}
