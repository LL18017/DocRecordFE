import { NextRequest, NextResponse } from "next/server";

const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/error-404",
];

export function proxy(request: NextRequest) {
    const token = request.cookies.get("token")?.value;

    const pathname = request.nextUrl.pathname;

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!token && !isPublicRoute) {
        return NextResponse.redirect(
            new URL("/login", request.url)
        );
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
}