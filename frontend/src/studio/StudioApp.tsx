import { Route, Routes, Navigate } from "react-router-dom";
import { Dashboard } from "./screens/Dashboard";

export default function StudioApp() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="route" element={<Dashboard />} />
      <Route path="stop" element={<Dashboard />} />
      <Route path="validate" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  );
}
