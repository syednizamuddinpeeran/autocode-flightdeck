import Guard from "./Guard";
import Harness from "./Harness";
import Sessions from "./Sessions";
import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Sessions />
      <Guard />
      <Settings />
      <Harness />
      <SessionTimelineSection />
    </>
  );
}
