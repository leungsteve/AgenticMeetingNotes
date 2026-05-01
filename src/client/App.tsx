import { Route, Routes, useNavigate } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import AuthGate from "./components/AuthGate";
import SignedOutScreen from "./components/SignedOutScreen";
import { SessionProvider } from "./hooks/useSession";
import Accounts from "./pages/Accounts";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import ManagerDashboard from "./pages/ManagerDashboard";
import MyNotes from "./pages/MyNotes";
import OutboundSfdc from "./pages/OutboundSfdc";
import RiskTracker from "./pages/RiskTracker";
import Settings from "./pages/Settings";
import TeamView from "./pages/TeamView";

function SignedOutRoute() {
  const navigate = useNavigate();
  return (
    <SignedOutScreen
      onSignIn={() => {
        // Use the full Google flow rather than just navigating back to "/" —
        // we need to actually re-issue an OIDC redirect.
        window.location.href = "/auth/google/start?returnTo=%2F";
        void navigate;
      }}
    />
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        {/* /signed-out bypasses AuthGate so users see the confirmation screen
            even though they have no session. */}
        <Route path="/signed-out" element={<SignedOutRoute />} />

        <Route
          element={
            <AuthGate>
              <AppLayout />
            </AuthGate>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/notes" element={<MyNotes />} />
          <Route path="/team" element={<TeamView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/risk" element={<RiskTracker />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/outbound-sfdc" element={<OutboundSfdc />} />
          <Route path="/chat" element={<Chat />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
