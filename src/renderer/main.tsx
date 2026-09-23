import React from "react";
import { createRoot } from "react-dom/client";
import "./types/ipc";
import "./styles/globals.css";
import "./styles/placement.css";
import "./styles/dual.css";
import "./styles/providers.css";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
