import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { GENERIC_ERROR, readDetail } from "./detail";

export default function HarnessTemplate() {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/harness-template")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { path?: string | null }) => {
        if (active && typeof data.path === "string") {
          setPath(data.path);
          setSaved(data.path);
        }
      })
      .catch(() => {
        // not configured yet or unreachable: leave the field empty
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/settings/harness-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        setError(await readDetail(res));
        return;
      }
      const data = (await res.json()) as { path: string };
      setPath(data.path);
      setSaved(data.path);
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  return (
    <section>
      <h3>Harness template</h3>
      <form onSubmit={onSave}>
        <label>
          Harness template path
          <input value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <button type="submit">Save template</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {saved && <p>Saved: {saved}</p>}
    </section>
  );
}
