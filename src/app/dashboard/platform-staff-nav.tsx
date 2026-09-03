import Link from "next/link";
import { getPlatformStaff } from "@/lib/admin/access";

export default async function PlatformStaffNav() {
  const staff = await getPlatformStaff();
  return staff ? <><Link href="/dashboard/admin">Support</Link><Link href="/dashboard/admin/operations">Reliability</Link></> : null;
}
