import { createContext, useContext } from "react";

export const CloudWorkspaceContext = createContext(null);
export function useCloudWorkspace() { return useContext(CloudWorkspaceContext); }
