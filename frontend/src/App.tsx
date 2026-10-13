import Guard from "./Guard";
import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";

export default function App() {
  return (
    <>
      <h1>Flight deck</h1>
      <Guard />
      <Settings />
      <SessionTimelineSection />
    </>
  );
}
