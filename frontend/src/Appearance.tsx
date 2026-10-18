import { useSyncExternalStore } from "react";
import { MODES, getMode, setMode, subscribe } from "./theme";
import type { Mode } from "./theme";

export default function Appearance() {
  const mode = useSyncExternalStore(subscribe, getMode);

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
    </section>
  );
}
