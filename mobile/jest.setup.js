/* global jest */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  watchPositionAsync: jest.fn(async (_opts, cb) => {
    cb({ coords: { latitude: 52.38, longitude: 4.63, accuracy: 5 } });
    return { remove: jest.fn() };
  }),
  Accuracy: { Balanced: 3 },
}));

jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const make = (testID) => (props) =>
    React.createElement(View, { testID, ...props }, props.children);
  const MapView = make("map");
  MapView.Marker = make("marker");
  MapView.Polyline = make("polyline");
  MapView.UrlTile = make("urltile");
  return {
    __esModule: true,
    default: MapView,
    Marker: MapView.Marker,
    Polyline: MapView.Polyline,
    UrlTile: MapView.UrlTile,
    PROVIDER_DEFAULT: "default",
  };
});
