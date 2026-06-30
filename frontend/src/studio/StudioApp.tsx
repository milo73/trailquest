import { Route, Routes, Navigate } from "react-router-dom";
import { Dashboard } from "./screens/Dashboard";
import { RouteEditor } from "./screens/RouteEditor";
import { StopEditor } from "./screens/StopEditor";
import { Validation } from "./screens/Validation";
import { DraftProvider } from "./draftStore";

export default function StudioApp() {
  return (
    <DraftProvider>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="route" element={<RouteEditor />} />
        <Route path="stop" element={<StopEditor />} />
        <Route path="validate" element={<Validation />} />
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </DraftProvider>
  );
}
