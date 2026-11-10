import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  NotebookPen,
  Receipt,
  Users,
} from "lucide-react";
import type { NavItem } from "./shell";

/**
 * The doctor sidebar, shared by the overview page and every section page so
 * both render exactly the same items.
 */
export const DOCTOR_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: CalendarDays },
  { label: "Wards", href: "/dashboard/ward-capacity", icon: BedDouble },
  {
    label: "Today's schedule",
    href: "/dashboard/today-schedule",
    icon: CalendarDays,
  },
  { label: "Your patients", href: "/dashboard/your-patients", icon: Users },
  {
    label: "Lab assignments",
    href: "/dashboard/lab-assignments",
    icon: FlaskConical,
  },
  { label: "Recent notes", href: "/dashboard/recent-notes", icon: FileText },
  {
    label: "Write prescription",
    href: "/dashboard/write-prescription",
    icon: NotebookPen,
  },
  {
    label: "Prescription history",
    href: "/dashboard/prescription-history",
    icon: ClipboardList,
  },
  { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
];
