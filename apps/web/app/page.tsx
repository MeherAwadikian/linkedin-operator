import { redirect } from 'next/navigation';

// The hot-rod control panel is the only UI. The former classic dashboard is
// retired; the root path sends everyone to /panel.
export default function RootPage() {
  redirect('/panel');
}
