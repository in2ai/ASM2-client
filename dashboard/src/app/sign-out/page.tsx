import { redirect } from "next/navigation";

export default function SignOutPage() {
  // After sign out, redirect to sign-in page
  redirect("/sign-in");
}
