import { useAuth } from "@mzon7/zon-incubator-sdk/auth";
import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { to: "/home", label: "Chat" },
  { to: "/projects", label: "Projects" },
];

export default function TopNav() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="topnav">
      {/* Brand */}
      <Link to="/home" className="topnav-brand">
        <div className="topnav-brand-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
            <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
            <circle cx="10" cy="10" r="1.8" fill="currentColor" />
          </svg>
        </div>
        <span className="topnav-brand-name">
          QA<span className="topnav-brand-accent">tester</span>
        </span>
      </Link>

      {/* Nav links */}
      <nav className="topnav-links" aria-label="Main navigation">
        {navLinks.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`topnav-link${pathname === to || (to !== "/home" && pathname.startsWith(to)) ? " topnav-link-active" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* User + sign out */}
      <div className="topnav-user">
        {user?.email && (
          <span className="topnav-email" title={user.email}>
            {user.email}
          </span>
        )}
        <button
          onClick={signOut}
          className="topnav-signout"
          aria-label="Sign out"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path d="M5.5 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M10 10l3-2.5L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="13" y1="7.5" x2="6" y2="7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Sign out
        </button>
      </div>
    </header>
  );
}
