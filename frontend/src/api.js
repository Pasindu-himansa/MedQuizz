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

const logOutTo = (reason) => {
  localStorage.clear();
  window.location.href = `/login?${reason}=1`;
};

// Send the user back to login when their login token stops working:
// 401 = token expired/invalid, 403 = account deactivated.
// A wrong password on /login is also a 401, so that request is left alone.
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const hadToken = !!localStorage.getItem("token");
    const isLogin = err.config?.url === "/login";
    if (hadToken && !isLogin) {
      if (status === 401) logOutTo("expired");
      else if (
        status === 403 &&
        err.response.data?.detail === "This account has been deactivated"
      )
        logOutTo("deactivated");
    }
    return Promise.reject(err);
  },
);

export default API;
