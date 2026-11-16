export async function api(path, body) {
  const res = await fetch(`/api/${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail?.map?.(d => `${d.loc.at(-1)}: ${d.msg}`).join('; ') ?? JSON.stringify(j.detail);
    } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.json();
}
