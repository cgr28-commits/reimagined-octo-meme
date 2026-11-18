/** Keep the original H1 wording and highlight its place or service in context. */
export default function HubHeadingText({ text, subject }: { text: string; subject: string }) {
  // For routes like “Belfast City Airport to Belfast Taxi”, the destination comes last.
  const start = text.lastIndexOf(subject);
  if (start < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, start)}
      <span data-hub-subject>{subject}</span>
      {text.slice(start + subject.length)}
    </>
  );
}
