"use strict";

const React = require("react");

const useClientLayoutEffect =
  typeof document !== "undefined" ||
  (typeof navigator !== "undefined" && navigator.product === "ReactNative")
    ? React.useLayoutEffect
    : React.useEffect;

function useLatestCallback(callback) {
  const ref = React.useRef(callback);
  const latestCallback = React.useRef(function latestCallback(...args) {
    return ref.current.apply(this, args);
  }).current;

  useClientLayoutEffect(() => {
    ref.current = callback;
  });

  return latestCallback;
}

module.exports = useLatestCallback;
module.exports.default = useLatestCallback;
module.exports.__esModule = true;
