import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import MyNotes from "./pages/MyNotes";
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
      </Route>
    </Routes>
  );
}
