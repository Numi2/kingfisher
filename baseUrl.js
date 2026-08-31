const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const baseURL = process.env.NEXT_PUBLIC_BASE_URL || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
