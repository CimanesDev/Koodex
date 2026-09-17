import type { Bridge } from "../../shared/types";
declare global {
  interface Window {
    Koodex: Bridge;
  }
}
export {};
