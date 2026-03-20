import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { SavedPeopleProvider } from "./SavedPeopleContext";
import SearchPage from "./pages/SearchPage";
import SavedTablePage from "./pages/SavedTablePage";

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  color: isActive ? "var(--text)" : "var(--muted)",
  fontWeight: isActive ? 600 : 400,
  textDecoration: "none",
  padding: "0.35rem 0.5rem",
  borderRadius: 6,
  background: isActive ? "var(--panel)" : "transparent",
  border: isActive ? "1px solid var(--border)" : "1px solid transparent",
});

export default function App() {
  return (
    <SavedPeopleProvider>
      <BrowserRouter>
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <NavLink to="/" end style={navLinkStyle}>
            Search
          </NavLink>
          <NavLink to="/saved" style={navLinkStyle}>
            Saved table
          </NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/saved" element={<SavedTablePage />} />
        </Routes>
      </BrowserRouter>
    </SavedPeopleProvider>
  );
}
