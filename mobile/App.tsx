import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { colors } from "./src/theme";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
      <Text style={{ color: colors.navy }}>TrailQuester</Text>
      <StatusBar style="auto" />
    </View>
  );
}
