"use client";

import type { PortalRole } from "@/lib/demo-auth";

export interface AuthenticatedAppUser {
  id: string;
  name: string;
  role: PortalRole | "care_coordinator" | "admin";
  email?: string | null;
}

interface AuthPanelProps {
  onAuthenticated: (user: AuthenticatedAppUser) => void;
  onClose: () => void;
}

export function AuthPanel({ onClose }: AuthPanelProps) {
  return (
    <section className="auth-panel" aria-labelledby="auth-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">24Care account</p><h2 id="auth-heading">Sign in to persist care requests</h2></div>
        <button className="text-button" type="button" onClick={onClose}>Close</button>
      </div>
      <p className="subtle">Sign in with Google to create a secure 24Care account. Your care requests and recorded calls are stored under your account.</p>
      <button className="secondary-button auth-google-button" type="button" onClick={() => { window.location.href = "/api/auth/google"; }}>Continue with Google</button>
      <p className="microcopy">Google verifies your identity; 24Care manages the application session and role access.</p>
    </section>
  );
}
