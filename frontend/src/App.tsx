import HarnessTemplate from "./HarnessTemplate";
import Install from "./Install";
import Settings from "./Settings";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Settings />
      <HarnessTemplate />
      <Install />
    </>
  );
}
