import { addCustomStation } from "@/catalog";
import { notifyState } from "@/state";

export function handleCustomStationSubmit(
  nameVal: string,
  urlVal: string,
  onError: (msg: string) => void,
  onSuccess: () => void,
): void {
  try {
    addCustomStation(nameVal, urlVal);
    notifyState();
    onSuccess();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Wystąpił błąd");
  }
}
