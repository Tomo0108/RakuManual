import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { applyAccentToDocument } from "@/lib/accent-storage"
import "./index.css"
import "@xyflow/react/dist/style.css"
import App from "./App"

applyAccentToDocument()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
