import { Platform } from "react-native";

/**
 * Hide native/web scrollbars and keep the page chrome navy (web only).
 */
export function applyWebChrome() {
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;

  const id = "jock-web-chrome";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    html, body, #root {
      background-color: #07111F !important;
      margin: 0;
      height: 100%;
      overflow: hidden;
    }
    /* Hide scrollbars everywhere; scrolling still works */
    * {
      scrollbar-width: none !important; /* Firefox */
      -ms-overflow-style: none !important; /* legacy Edge */
    }
    *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
      background: transparent !important;
    }
  `;
  document.head.appendChild(style);
}
