import React from "react";
import { createRoot } from "react-dom/client";
import "./storage-shim.js"; // must run BEFORE Ledger so window.storage exists
import "./index.css";
import TrekWeb from "./webapp.jsx";
import "./polish.css";

createRoot(document.getElementById("root")).render(<TrekWeb />);
