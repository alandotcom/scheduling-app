import { type ComponentProps, lazy, Suspense, useState } from "react";

import type { AppointmentModal as AppointmentModalComponent } from "@/components/appointment-modal";
import { useIdlePreload } from "@/hooks/use-idle-preload";

// Heavy modal (~300kB): form stack, calendar/type pickers, validation. It is
// only needed when the user opens it, so defer loading until first open and
// keep it mounted afterwards for instant reopen + close animation. The chunk is
// warmed in the background on idle (see below) so the first open is instant.
const loadAppointmentModal = () => import("@/components/appointment-modal");

const AppointmentModalLazy = lazy(() =>
  loadAppointmentModal().then((module) => ({
    default: module.AppointmentModal,
  })),
);

type AppointmentModalProps = ComponentProps<typeof AppointmentModalComponent>;

export function LazyAppointmentModal(props: AppointmentModalProps) {
  // Stays true once opened so the modal remains mounted for its close animation.
  // Guarded setState during render is React's pattern for adjusting state to props.
  const [hasMounted, setHasMounted] = useState(false);
  if (props.open && !hasMounted) {
    setHasMounted(true);
  }

  // Preload the chunk during idle time so opening the modal feels instant,
  // without paying for it on the page's critical load path.
  useIdlePreload(loadAppointmentModal, !hasMounted);

  if (!hasMounted) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <AppointmentModalLazy {...props} />
    </Suspense>
  );
}
