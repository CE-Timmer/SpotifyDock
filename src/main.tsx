import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { AuthPopup } from "./components/AuthPopup";
import { ControlPanel } from "./components/ControlPanel";
import { HoverZone } from "./components/HoverZone";
import "./styles/globals.css";

const label = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root")!).render(
  label === "hover-zone"
    ? <HoverZone />
    : label === "auth-popup"
    ? <AuthPopup />
    : label === "control"
    ? <ControlPanel />
    : <App />
);
