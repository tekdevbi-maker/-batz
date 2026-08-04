// Holds Coach Register page 1's collected identity fields (including the
// password) in memory only, for page 2 to read -- deliberately NOT passed
// through router params, since Expo Router serializes those into the
// navigation URL/history, which is the wrong place for a plaintext
// password to live even transiently. Cleared the moment page 2 either
// completes registration or is asked for it.
export interface PendingCoachRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

let pending: PendingCoachRegistration | null = null;

export function setPendingCoachRegistration(value: PendingCoachRegistration): void {
  pending = value;
}

export function takePendingCoachRegistration(): PendingCoachRegistration | null {
  const value = pending;
  pending = null;
  return value;
}
