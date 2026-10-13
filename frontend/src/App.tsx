import Guard from "./Guard";
import Harness from "./Harness";
import HarnessTemplate from "./HarnessTemplate";
import Install from "./Install";
import Runs from "./Runs";
import Sessions from "./Sessions";
import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";
import Trends from "./Trends";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Sessions />
      <Guard />
      <Settings />
      <Harness />
      <HarnessTemplate />
      <Install />
      <Runs />
      <Trends />
      <SessionTimelineSection />
    </>
  );
}
