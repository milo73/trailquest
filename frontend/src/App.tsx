import { Navigate, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/play" replace />} />
      <Route path="/play/*" element={<div>TrailQuester</div>} />
      <Route path="/studio/*" element={<div>Trail Creator</div>} />
    </Routes>
  );
}
