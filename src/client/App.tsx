import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Accounts from "./pages/Accounts";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";
import DirectorDashboard from "./pages/DirectorDashboard";
import Inbox from "./pages/Inbox";
import ManagerDashboard from "./pages/ManagerDashboard";
import MyNotes from "./pages/MyNotes";
import OutboundSfdc from "./pages/OutboundSfdc";
import RiskTracker from "./pages/RiskTracker";
import SalesRvpDashboard from "./pages/SalesRvpDashboard";
import Settings from "./pages/Settings";
import TeamView from "./pages/TeamView";
import VpDashboard from "./pages/VpDashboard";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/notes" element={<MyNotes />} />
        <Route path="/team" element={<TeamView />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/risk" element={<RiskTracker />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/director" element={<DirectorDashboard />} />
        <Route path="/vp" element={<VpDashboard />} />
        <Route path="/sales-rvp" element={<SalesRvpDashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/outbound-sfdc" element={<OutboundSfdc />} />
        <Route path="/chat" element={<Chat />} />
      </Route>
    </Routes>
  );
}
