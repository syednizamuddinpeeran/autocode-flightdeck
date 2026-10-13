import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";
import Trends from "./Trends";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Settings />
      <Trends />
      <SessionTimelineSection />
    </>
  );
}
