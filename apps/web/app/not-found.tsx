import Link from "next/link";

export default function NotFound() {
  return (
    <main className="runtimeErrorShell" id="main-content">
      <section className="runtimeErrorCard" role="status">
        <p className="eyebrow">404 · NOT FOUND</p>
        <h1>This VetoLayer page does not exist.</h1>
        <p>The link may be outdated, the resource may have moved, or your workspace context may have changed. No decision or policy action was performed.</p>
        <div className="runtimeErrorActions">
          <Link className="primaryLink" href="/dashboard">Return to control center</Link>
          <Link className="rowLink" href="/dashboard/docs">Open product docs</Link>
          <Link className="rowLink" href="/">Go to VetoLayer home</Link>
        </div>
      </section>
    </main>
  );
}
