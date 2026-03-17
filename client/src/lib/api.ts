import { getApiBaseUrl } from "./platform";

export const buildApiUrl = (path: string) => {
  const cleanPath = path.replace(/^\/+/, "");
  return `${getApiBaseUrl()}/${cleanPath}`;
};
