/** Test-only harness: the real Find Your Driver customer page component. */
import { createRoot } from "react-dom/client";
import FindDriverClient from "../../src/app/find-your-driver/FindDriverClient";

createRoot(document.getElementById("root")!).render(<FindDriverClient />);
