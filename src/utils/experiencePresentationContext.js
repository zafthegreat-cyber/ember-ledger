import { createContext } from "react";

// Display preferences only. This context must never authorize routes or data.
// Null keeps standalone legacy boards compatible until their host supplies it.
export const ExperiencePresentationContext = createContext(null);
