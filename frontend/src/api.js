import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A deactivated account is logged out everywhere as soon as it makes a request
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 403 &&
      err.response.data?.detail === "This account has been deactivated" &&
      localStorage.getItem("token")
    ) {
      localStorage.clear();
      window.location.href = "/login?deactivated=1";
    }
    return Promise.reject(err);
  },
);

export default API;
