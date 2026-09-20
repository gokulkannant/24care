export const portalRoles = ["patient", "caretaker", "clinician"] as const;

export type PortalRole = (typeof portalRoles)[number];

export interface DemoUser {
  id: string;
  name: string;
  role: PortalRole;
  patientLabel: string;
  subtitle: string;
}

export const demoUsers: DemoUser[] = [
  {
    id: "patient-meera",
    name: "Meera Krishnan",
    role: "patient",
    patientLabel: "My care plan",
    subtitle: "Patient account",
  },
  {
    id: "caretaker-arun",
    name: "Arun Krishnan",
    role: "caretaker",
    patientLabel: "Meera Krishnan’s care",
    subtitle: "Verified caretaker",
  },
  {
    id: "clinician-anjana",
    name: "Dr. Anjana R.",
    role: "clinician",
    patientLabel: "Duty clinician workspace",
    subtitle: "Clinical review account",
  },
];

export function getDemoUser(id: string | undefined): DemoUser {
  return demoUsers.find((user) => user.id === id) ?? demoUsers[2];
}

export function getDemoUserForRole(role: PortalRole): DemoUser {
  return demoUsers.find((user) => user.role === role) ?? demoUsers[2];
}
