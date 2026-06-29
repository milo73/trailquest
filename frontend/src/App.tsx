import { Navigate as RouterNavigate, Route, Routes } from "react-router-dom";
import QuesterApp from "./quester/QuesterApp";
import StudioApp from "./studio/StudioApp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RouterNavigate to="/play" replace />} />
      <Route path="/play/*" element={<QuesterApp />} />
      <Route path="/studio/*" element={<StudioApp />} />
    </Routes>
  );
}
