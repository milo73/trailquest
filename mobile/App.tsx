import { QuesterProvider, useQuester } from "./src/store/QuesterStore";
import { BrowseScreen } from "./src/screens/BrowseScreen";
import { PreviewScreen } from "./src/screens/PreviewScreen";
import { NavigateScreen } from "./src/screens/NavigateScreen";
import { StopScreen } from "./src/screens/StopScreen";
import { FinishScreen } from "./src/screens/FinishScreen";

function Flow() {
  const { state } = useQuester();
  switch (state.phase) {
    case "preview": return <PreviewScreen />;
    case "navigate": return <NavigateScreen />;
    case "stop": return <StopScreen />;
    case "finish": return <FinishScreen />;
    default: return <BrowseScreen />;
  }
}

export default function App() {
  return (
    <QuesterProvider>
      <Flow />
    </QuesterProvider>
  );
}
