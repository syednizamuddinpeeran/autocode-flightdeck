import Guard from "./Guard";
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
      <SessionTimelineSection />
    </>
  );
}
