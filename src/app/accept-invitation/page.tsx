import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { en } from "@/strings/en";

import { AcceptInvitationForm } from "./accept-invitation-form";

// The token is in this page's URL: no request from it says where it came from.
export const metadata: Metadata = { title: en.acceptInvitation.pageTitle, referrer: "no-referrer" };

/**
 * Where the API's invitation email leads (`/accept-invitation?token=…`).
 * Not in the sketch: it is plumbing, like signing in, and looks like it.
 */
export default async function AcceptInvitationPage({ searchParams }: PageProps<"/accept-invitation">) {
  const { token } = await searchParams;
  return (
    <CenteredPage>
      <Brand />
      {typeof token === "string" && token.length > 0
        ? <AcceptInvitationForm token={token} />
        : <p role="alert" className="max-w-[420px] text-center">{en.acceptInvitation.noToken}</p>}
    </CenteredPage>
  );
}
