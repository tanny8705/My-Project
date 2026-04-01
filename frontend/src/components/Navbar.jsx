import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function roleSet(user) {
  if (!user?.roles) return new Set();
  return new Set(user.roles);
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const roles = roleSet(user);

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        marginBottom: "1.5rem",
        paddingBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <Link to="/" style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text)" }}>
          CCTS
        </Link>
        {user && (
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            {roles.has("student") && (
              <>
                <NavLink
                  to="/dashboard"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/profile"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Profile
                </NavLink>
                <NavLink
                  to="/add-activity"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Add activity
                </NavLink>
                <NavLink
                  to="/internship-submit"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Submit internship
                </NavLink>
                <NavLink
                  to="/history"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  History
                </NavLink>
              </>
            )}
            {roles.has("faculty") && (
              <NavLink
                to="/faculty"
                style={({ isActive }) => ({
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  fontWeight: 600,
                })}
              >
                Faculty panel
              </NavLink>
            )}
            {roles.has("hod") && (
              <NavLink
                to="/hod"
                style={({ isActive }) => ({
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  fontWeight: 600,
                })}
              >
                HOD panel
              </NavLink>
            )}
            {roles.has("tpo") && (
              <NavLink
                to="/tpo"
                style={({ isActive }) => ({
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  fontWeight: 600,
                })}
              >
                TPO panel
              </NavLink>
            )}
            {roles.has("admin") && (
              <>
                <NavLink
                  to="/admin"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Admin Dashboard
                </NavLink>
                <NavLink
                  to="/admin/students"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Students
                </NavLink>
                <NavLink
                  to="/admin/faculty"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Faculty
                </NavLink>
                <NavLink
                  to="/admin/hod"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  HOD
                </NavLink>
                <NavLink
                  to="/admin/tpo"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  TPO
                </NavLink>
                <NavLink
                  to="/admin/users"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    fontWeight: 600,
                  })}
                >
                  Users & Depts
                </NavLink>
              </>
            )}
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {user.email}
            </span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Log out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
