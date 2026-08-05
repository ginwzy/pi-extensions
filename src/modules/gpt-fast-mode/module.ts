import type { AllInOneModule } from "../../runtime/module.js";
import registerGptFastMode from "./extension.js";

export const gptFastModeModule: AllInOneModule = {
  id: "gpt-fast-mode",
  order: 100,
  defaultEnabled: true,
  register: registerGptFastMode,
};
