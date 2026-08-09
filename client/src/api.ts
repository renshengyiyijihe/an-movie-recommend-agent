import axios, { AxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/',
  timeout: 1000 * 300, // 5 minutes
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!config.headers) config.headers = {};
  if (token) {
    // attach Bearer token when present
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await api.request<T>(config);
    return response.data;
  } catch (error: any) {
    const serverMessage = error?.response?.data?.message;
    if (serverMessage) {
      throw new Error(serverMessage);
    }
    const statusText = error?.response?.statusText;
    if (statusText) {
      throw new Error(statusText);
    }
    throw error;
  }
}
