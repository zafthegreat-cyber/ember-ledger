import { createRoot } from "react-dom/client";
import tokens from "../design/tokens/tokens.json";
import MobileScreenSet from "./mobileScreenSetApp.jsx";

function flattenTokens(source, prefix = "--ets") {
  return Object.entries(source).reduce((vars, [key, value]) => {
    if (value && typeof value === "object") {
      return { ...vars, ...flattenTokens(value, `${prefix}-${key}`) };
    }
    return { ...vars, [`${prefix}-${key}`]: value };
  }, {});
}

const tokenVars = flattenTokens(tokens);

Object.entries(tokenVars).forEach(([key, value]) => {
  document.documentElement.style.setProperty(key, value);
});

createRoot(document.getElementById("screen-set-root")).render(<MobileScreenSet tokenVars={tokenVars} />);
