import { fetchEskaCatalog, fetchRmfCatalog } from "../../catalog.js";
import { animateHeightChange } from "../modal.js";

let fetching = false;
let lastError: string | null = null;

export function isFetching(): boolean {
  return fetching;
}

export function getErrorMessage(): string | null {
  return lastError;
}

export async function refreshCatalog(modalEl: HTMLElement | null, rerender: () => void): Promise<void> {
  if (fetching) return;
  fetching = true;
  lastError = null;

  const refreshBtn = modalEl?.querySelector<HTMLButtonElement>("#catalog-refresh-btn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Pobieranie...";
  }

  try {
    // one network failing must not discard the other's stations
    const results = await Promise.allSettled([fetchRmfCatalog(), fetchEskaCatalog()]);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === results.length) {
      const reason = (failed[0] as PromiseRejectedResult | undefined)?.reason;
      throw reason instanceof Error ? reason : new Error(String(reason));
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Błąd połączenia z serwerem stacji";
  } finally {
    fetching = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Odśwież listę";
    }
    const modalBox = modalEl?.querySelector<HTMLElement>(".k-modal");
    if (modalBox) {
      animateHeightChange(modalBox, rerender);
    } else {
      rerender();
    }
  }
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
