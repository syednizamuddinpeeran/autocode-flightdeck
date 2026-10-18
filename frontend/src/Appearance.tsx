import { useSyncExternalStore } from "react";
import {
  MODES,
  PALETTES,
  getMode,
  getPalette,
  setMode,
  setPalette,
  subscribe,
} from "./theme";
import type { Mode } from "./theme";

export default function Appearance() {
  const mode = useSyncExternalStore(subscribe, getMode);
  const palette = useSyncExternalStore(subscribe, getPalette);

  return (
    <section aria-labelledby="appearance-heading">
      <h3 id="appearance-heading">Appearance</h3>
      <fieldset>
        <legend>Theme</legend>
        {MODES.map((m) => (
          <label key={m.id}>
            <input
              type="radio"
              name="theme-mode"
              value={m.id}
              checked={mode === m.id}
              onChange={() => setMode(m.id as Mode)}
            />{" "}
            {m.label}
          </label>
        ))}
      </fieldset>
      <p>
        <label>
          Palette{" "}
          <select value={palette} onChange={(e) => setPalette(e.target.value)}>
            {PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </p>
    </section>
  );
}
