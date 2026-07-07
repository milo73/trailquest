module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: [],
  setupFiles: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-maps|@react-native-async-storage/.*))",
  ],
};
