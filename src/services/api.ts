import { authService } from "./auth.service";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function apiFetch(
    endpoint: string,
    options: RequestInit = {}
) {
    const token = authService.getToken();

    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
            ...options.headers,
        },
        ...options,
    });

    switch (response.status) {
        case 401:
            window.location.href = "/error-401";
            break;
        case 403:
            window.location.href = "/signin";
            break;
        // case 500:
        //     window.location.href = "/error-500";
        //     break;
    }

    return response;
}