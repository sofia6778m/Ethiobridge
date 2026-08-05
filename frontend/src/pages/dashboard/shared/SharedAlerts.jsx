import AlertManagement from '../alerts/AlertManagement';

export default function SharedAlerts() {
  return <AlertManagement createPath="/dashboard/alerts/create" />;
}
