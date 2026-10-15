export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Request failed.'); }
  return response.status === 204 ? undefined as T : response.json();
}
export const number = (value: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows: (string | number | boolean)[][]) {
  return rows.map(row => row.map(cell => {
    const value = String(cell); return `"${(/^[=+@\-\t\r\n]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
