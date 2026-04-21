import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Accounts from "./pages/Accounts";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import MyNotes from "./pages/MyNotes";
import OutboundSfdc from "./pages/OutboundSfdc";
import Settings from "./pages/Settings";
import TeamView from "./pages/TeamView";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/notes" element={<MyNotes />} />
        <Route path="/team" element={<TeamView />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/outbound-sfdc" element={<OutboundSfdc />} />
        <Route path="/chat" element={<Chat />} />
      </Route>
    </Routes>
  );
}
