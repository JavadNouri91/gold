import { redirect } from 'next/navigation';

export default function AssignmentsPage() {
  redirect('/dashboard/orders?view=review');
}
