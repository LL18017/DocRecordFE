import { LoginRequest, LoginResponse, User, UserRegister } from "@/types";
import { apiFetch } from "./api";

const SESSION_TOKEN_NAME = "token";
const NAME_COOKIE_CURRENT_USER = "user";

function setSessionTokenCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `${SESSION_TOKEN_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Strict${secure}`;
}

function setCurrentUserCookie(usuario: any) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `${NAME_COOKIE_CURRENT_USER}=${encodeURIComponent(JSON.stringify(usuario))}; path=/; SameSite=Strict${secure}`;
}

function getCookieByName(cookieName: string): string | null {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

function clearSessionTokenCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `${SESSION_TOKEN_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secure}`;
  document.cookie = `${NAME_COOKIE_CURRENT_USER}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secure}`;
}

export const authService = {
  async login(credentials: LoginRequest){
    const response = await apiFetch('/auth/login', {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    // switch (response.status) {
    //     case 401:
    //         window.location.href = "/error-401";
    //         break;
    //     case 403:
    //         window.location.href = "/error-403";
    //         break;
    //     case 500:
    //         window.location.href = "/error-500";
    //         break;
    // }

    const data = await response.json();
    console.log(data)
    const token = data.token;

    setSessionTokenCookie(token);
    sessionStorage.setItem("user", JSON.stringify(data))

    return data;
  },

  async register(user: UserRegister) {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(user)
    })
    const usaurio = await res.json()
    return {
      success: res.ok,
      message: res.ok ? "Se ha registrado correctamente" : "Lo sentimos, no hemos podido completar tu registro '" + usaurio.message+"'",
      data: usaurio.data
    }
  },

  logout() {
    clearSessionTokenCookie();
    sessionStorage.removeItem("user")
  },

  getToken(): string | null {
    return getCookieByName(SESSION_TOKEN_NAME);
  },

  getCurrentUser() {
    const user = sessionStorage.getItem("user");

    return user ? JSON.parse(user) : null;
  },

  isAuthenticated(): boolean {
    return !!getCookieByName(SESSION_TOKEN_NAME);
  },
}
