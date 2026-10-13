import Guard from "./Guard";
import Harness from "./Harness";
import Runs from "./Runs";
import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Guard />
      <Settings />
      <Harness />
      <Runs />
      <SessionTimelineSection />
    </>
  );
}
