import { NotificationCenter } from "../../../components/notification-center";
import "./notifications.css";

export default function NotificationsPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader notificationHeader">
        <div>
          <p className="eyebrow">NOTIFICATIONS</p>
          <h1 className="dashboardTitle">Critical events should reach you without dashboard polling.</h1>
          <p className="dashboardIntro">Review alerts, high-severity blocks, policy changes, and integration failures are recorded in-product. Choose which events also reach your email and which projects you want to follow.</p>
        </div>
      </header>
      <NotificationCenter />
    </>
  );
}
