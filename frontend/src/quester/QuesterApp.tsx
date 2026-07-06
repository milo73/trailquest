import { QuesterProvider, useQuester } from "./store";
import { Configure } from "./screens/Configure";
import { Preview } from "./screens/Preview";
import { Navigate } from "./screens/Navigate";
import { Stop } from "./screens/Stop";
import { Finish } from "./screens/Finish";

function Flow() {
  const { state } = useQuester();
  switch (state.phase) {
    case "preview": return <Preview />;
    case "navigate": return <Navigate />;
    case "stop": return <Stop />;
    case "finish": return <Finish />;
    default: return <Configure />;
  }
}

export default function QuesterApp() {
  return (
    <QuesterProvider>
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f0eee9" }}>
        <Flow />
      </div>
    </QuesterProvider>
  );
}
